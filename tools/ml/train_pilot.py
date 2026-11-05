# SKYBOUND AI pilot: PPO on the game's own flight model (fm.py), thousands of aircraft in parallel on the GPU.
#   !wget -q https://raw.githubusercontent.com/Eeman1113/flydome/main/tools/ml/fm.py
#   !wget -q https://raw.githubusercontent.com/Eeman1113/flydome/main/tools/ml/train_pilot.py && python train_pilot.py
# One policy flies all three aircraft (Skylane, Caravan, F-16) and three tasks: navigate to heading/altitude/
# speed targets, approach + land on a runway or grass strip, and take off. Output: pilot.json (actor weights +
# observation normaliser), run in the browser by src/game/aipilot.js with plain JS inference.
import math, json, os, time, urllib.request, torch, torch.nn as nn
import fm

dev = 'cuda' if torch.cuda.is_available() else 'cpu'
torch.manual_seed(0)
N = int(os.environ.get('ENVS', 8192)); T = 64; UPDATES = int(os.environ.get('UPDATES', 500))
SUB, DT = 3, 1 / 30            # policy at 10 Hz, AI physics at 30 Hz (traffic.js steps AI aircraft at the same rate)
DEG = math.pi / 180

# ---------------------------------------------------------------- parity check against the JS flight model
def parity():
    ref = json.loads(urllib.request.urlopen('https://raw.githubusercontent.com/Eeman1113/flydome/main/tools/ml/fm_ref.json').read())
    worst = 0
    for C in ref:
        p = C['P']; P = fm.Params(1, dev, p['rollRate'], p['pitchRate'], p['thrust'], p['cdMul'], p['ab'], p['jet'], p['stall'], p['forgiving'])
        s = fm.State(1, dev); s.y[:] = 1.35
        wind = (torch.tensor([C['wind'][0]], device=dev, dtype=torch.float64).float(), torch.tensor([C['wind'][1]], device=dev).float())
        paved = lambda x, z: (x.abs() < 22) & (z.abs() < 650)
        g = torch.zeros(1, device=dev); k = 0
        for i in range(2400):
            t = i / 60
            pit = 0.0 if t < 12 else ((.5 if s.pitch.item() < .12 else 0) * (1 if t < 25 else 0) + (max(-1, min(1, (.1 + .06 * math.sin(t * .6) - s.pitch.item()) * 5)) if t >= 25 else 0))
            rol = 0.0 if t < 25 else .45 * math.sin(t * .31) - s.roll.item() * .6
            c = {'pitch': torch.tensor([pit], device=dev), 'roll': torch.tensor([rol], device=dev), 'yaw': torch.tensor([.15 * math.sin(t * 1.3)], device=dev),
                 'throttle': torch.tensor([1.0 if t < 35 else .7 + .25 * math.sin(t * .21)], device=dev)}
            fm.step(s, c, P, g, paved, wind, 1.35, 1 / 60)
            if i % 30 == 29:
                r = C['rec'][k]; k += 1
                mine = [s.x.item(), s.y.item(), s.z.item()]
                worst = max(worst, max(abs(a - b) for a, b in zip(mine, r[:3])))
        print(f"parity {C['name']}: final pos err {max(abs(a-b) for a,b in zip(mine, C['rec'][-1][:3])):.3f} m")
    print('parity worst position error', round(worst, 3), 'm over 40 s')
    return worst
if os.environ.get('SKIP_PARITY') != '1':
    torch.set_default_dtype(torch.float32); parity()

if os.environ.get('COMPILE', '1') == '1' and dev == 'cuda':
    try:
        fm.step = torch.compile(fm.step, dynamic=False)
        print('torch.compile enabled for the flight model')
    except Exception as e:
        print('compile unavailable:', e)

# ---------------------------------------------------------------- environment
VAR = torch.tensor([[62, 31, 1.0, 1.0, 0.0, 0, 1.35], [62, 31, 1.3, 1.0, 0.0, 0, 2.8], [220, 50, 4.0, .7, 1.6, 1, 1.9]], device=dev)
SPD = torch.tensor([[38., 62.], [36., 60.], [90., 220.]], device=dev)   # cruise speed band per variant (m/s)
APP = torch.tensor([[33., 40.], [33., 40.], [62., 78.]], device=dev)    # approach speed band
OBS = 32

class Env:
    def __init__(s, n):
        s.n = n; s.t = torch.zeros(n, device=dev); s.task = torch.zeros(n, dtype=torch.long, device=dev)
        s.var = torch.zeros(n, dtype=torch.long, device=dev); s.st = fm.State(n, dev)
        z = lambda: torch.zeros(n, device=dev)
        s.hdgT, s.altT, s.spdT, s.retarget = z(), z(), z(), z()
        s.wx, s.wz, s.ground = z(), z(), z()
        s.halfL, s.halfW, s.pavedRwy = z(), z(), torch.zeros(n, dtype=torch.bool, device=dev)
        s.touched = torch.zeros(n, dtype=torch.bool, device=dev); s.prevAlong = z(); s.prevA = torch.zeros(n, 4, device=dev)
        s.landDist = 3000.0
        s.reset(torch.ones(n, dtype=torch.bool, device=dev))

    def params(s):
        v = VAR[s.var]
        P = fm.Params(s.n, dev); P.rollRate, P.pitchRate, P.thrust, P.cdMul, P.ab = v[:, 0], v[:, 1], v[:, 2], v[:, 3], v[:, 4]
        P.jet = v[:, 5] > .5; P.stall = torch.ones(s.n, dtype=torch.bool, device=dev); P.forgiving = torch.zeros(s.n, dtype=torch.bool, device=dev)
        return P, v[:, 6]

    def reset(s, m):
        k = int(m.sum());
        if k == 0: return
        R = lambda lo, hi: lo + (hi - lo) * torch.rand(k, device=dev)
        st = s.st
        s.t[m] = 0; s.task[m] = torch.multinomial(torch.tensor([.38, .44, .18], device=dev), k, replacement=True)
        s.var[m] = torch.multinomial(torch.tensor([.45, .2, .35], device=dev), k, replacement=True)
        s.ground[m] = R(0, 700); ws = R(0, 9) * (torch.rand(k, device=dev) < .8); wd = R(-math.pi, math.pi)
        s.wx[m], s.wz[m] = ws * torch.sin(wd), ws * torch.cos(wd)
        paved = torch.rand(k, device=dev) < .5
        s.pavedRwy[m] = paved; s.halfL[m] = torch.where(paved, 650.0, 320.0); s.halfW[m] = torch.where(paved, 22.0, 13.0)
        task, var = s.task[m], s.var[m]
        for name in fm.State.KEYS: getattr(st, name)[m] = 0
        st.crashed[m] = False; s.touched[m] = False; s.prevA[m] = 0
        contact = VAR[var, 6]; g = s.ground[m]
        # navigation: airborne, random targets
        nav = task == 0; land = task == 1; tko = task == 2
        spd = SPD[var]; aspd = APP[var]
        yaw = R(-math.pi, math.pi); alt = R(150, 1200); v0 = spd[:, 0] + (spd[:, 1] - spd[:, 0]) * torch.rand(k, device=dev)
        x = R(-3000, 3000); z = R(-3000, 3000)
        # landing: on the extended centreline (runway along z, landing toward -z), aim point 150 m past the threshold
        D = R(800, s.landDist); off = R(-1, 1) * (60 + .12 * D); aim = s.halfL[m] - 150
        lz = aim + D; lx = off; lalt = (D * math.tan(3 * DEG) + R(-50, 70)).clamp(min=35); lyaw = R(-35, 35) * DEG
        lv = aspd[:, 0] + (aspd[:, 1] - aspd[:, 0]) * torch.rand(k, device=dev) + 4
        # takeoff: stopped at the runway start
        tz = s.halfL[m] - 25
        X = torch.where(nav, x, torch.where(land, lx, R(-2, 2))); Z = torch.where(nav, z, torch.where(land, lz, tz))
        Y = g + torch.where(nav, alt, torch.where(land, lalt, torch.zeros(k, device=dev))) + contact
        YAW = torch.where(nav, yaw, torch.where(land, lyaw, R(-3, 3) * DEG)); V = torch.where(nav, v0, torch.where(land, lv, torch.zeros(k, device=dev)))
        st.x[m], st.y[m], st.z[m], st.yaw[m] = X, Y, Z, YAW
        st.vx[m], st.vz[m] = -torch.sin(YAW) * V, -torch.cos(YAW) * V
        st.power[m] = torch.where(nav, .7, torch.where(land, .35, 0.0)); st.cp[m] = 0
        st.airspeed[m] = V; st.alt[m] = Y - g; st.onGround[m] = tko
        s.hdgT[m] = yaw + R(-1.5, 1.5); s.altT[m] = R(150, 1400); s.spdT[m] = spd[:, 0] + (spd[:, 1] - spd[:, 0]) * torch.rand(k, device=dev)
        s.retarget[m] = R(12, 40)
        s.prevAlong[m] = torch.where(land, D, 0.0)

    def rwy(s):
        st = s.st; aim = s.halfL - 150
        along = st.z - aim                      # distance still to fly to the aim point (positive on approach)
        cross = st.x
        gs = (st.y - s.ground - VAR[s.var, 6]) - along.clamp(min=0) * math.tan(3 * DEG)
        hdgErr = fm.wrap(st.yaw - 0)            # runway heading: yaw 0 (toward -z)
        onRwy = (st.x.abs() < s.halfW) & (st.z.abs() < s.halfL)
        return along, cross, gs, hdgErr, onRwy

    def obs(s):
        st = s.st; v = s.var; task = s.task
        along, cross, gsd, rh, onRwy = s.rwy()
        hw = -(s.wx * -torch.sin(st.yaw) + s.wz * -torch.cos(st.yaw)); xw = s.wx * torch.cos(st.yaw) - s.wz * torch.sin(st.yaw)
        he = fm.wrap(s.hdgT - st.yaw); ae = ((s.altT - (st.y - s.ground)) / 200).clamp(-3, 3); se = ((s.spdT - st.airspeed) / 20).clamp(-3, 3)
        isNav = (task == 0).float(); isLand = (task == 1).float(); isTko = (task == 2).float()
        guide = isLand + isTko
        o = torch.stack([
            st.airspeed / 50, st.vy / 10, st.pitch * 2, torch.sin(st.roll), torch.cos(st.roll), st.pr, st.rr, st.yr, st.power, st.ab, st.onGround.float(),
            ((st.y - s.ground) / 300).clamp(0, 4), (v == 0).float(), (v == 1).float(), (v == 2).float(), hw / 10, xw / 10,
            isNav, isLand, isTko,
            torch.sin(he) * isNav, torch.cos(he) * isNav, ae * isNav, se * isNav,
            (along / 2000).clamp(-1, 4) * guide, (cross / 200).clamp(-3, 3) * guide, (gsd / 50).clamp(-3, 3) * isLand, torch.sin(rh) * guide, torch.cos(rh) * guide,
            onRwy.float() * guide, s.touched.float(), (s.halfW / 22) * guide], 1)
        return o

    def step(s, a):
        st = s.st; P, contact = s.params()
        a = a.clamp(-1, 1)
        c = {'pitch': a[:, 0], 'roll': a[:, 1], 'yaw': a[:, 2], 'throttle': (a[:, 3] + 1) / 2}
        paved = lambda x, z: s.pavedRwy & (x.abs() < s.halfW) & (z.abs() < s.halfL)
        sink = torch.zeros(s.n, device=dev); firstTouch = torch.zeros(s.n, dtype=torch.bool, device=dev)
        wasAir = ~st.onGround
        for _ in range(SUB):
            fm.step(st, c, P, s.ground, paved, (s.wx, s.wz), contact, DT)
            ft = (st.touch > 0) & (~s.touched) & (s.task == 1)
            sink = torch.where(ft, st.touch, sink); firstTouch |= ft
            s.touched |= (st.touch > 0) & (s.task == 1)
        s.t += SUB * DT
        task = s.task; nav, land, tko = task == 0, task == 1, task == 2
        along, cross, gsd, rh, onRwy = s.rwy()
        alt = st.y - s.ground - contact
        r = torch.zeros(s.n, device=dev); done = torch.zeros(s.n, dtype=torch.bool, device=dev); succ = torch.zeros(s.n, dtype=torch.bool, device=dev)
        # smoothness and attitude sanity for everyone
        r -= .03 * (a - s.prevA).abs().sum(1); s.prevA = a.clone()
        r -= .4 * (st.roll.abs() > 75 * DEG).float() + .5 * st.stalled.float()
        # navigation
        he = fm.wrap(s.hdgT - st.yaw).abs(); ae = (s.altT - alt).abs(); se = (s.spdT - st.airspeed).abs()
        rn = .4 * (1 - he / math.pi) + .3 * torch.exp(-ae / 90) + .3 * torch.exp(-se / 7)
        r += torch.where(nav, rn, 0.0)
        s.retarget -= SUB * DT; rt = nav & (s.retarget < 0); k = int(rt.sum())
        if k:
            spd = SPD[s.var[rt]]
            s.hdgT[rt] = st.yaw[rt] + (torch.rand(k, device=dev) * 2 - 1) * 2.0
            s.altT[rt] = 150 + 1250 * torch.rand(k, device=dev)
            s.spdT[rt] = spd[:, 0] + (spd[:, 1] - spd[:, 0]) * torch.rand(k, device=dev)
            s.retarget[rt] = 12 + 28 * torch.rand(k, device=dev)
        done |= nav & ((st.onGround & (alt < 3)) | (s.t > 120))
        r += torch.where(nav & (st.crashed | (st.onGround & (alt < 3))), -20.0, 0.0)
        # approach & landing
        prog = (s.prevAlong - along).clamp(-20, 60) / 50; s.prevAlong = along
        air = ~s.touched
        rl = torch.where(air, .25 * torch.exp(-cross.abs() / 35) + .3 * torch.exp(-gsd.abs() / 18) + .2 * torch.exp(-rh.abs() / .15) + prog
                         - .1 * ((st.airspeed - APP[s.var].mean(1)).abs() / 10).clamp(max=2) * (along < 2500).float(),
                         .3 * torch.exp(-cross.abs() / 6) + .2 * (1 - st.airspeed / 45).clamp(0, 1) - .3 * ((a[:, 3] + 1) / 2))
        td_ok = onRwy & (along > -s.halfL * 1.1)
        bonus = 12 - 5 * (sink - 1.0).clamp(min=0) - .12 * cross.abs() - .25 * (rh.abs() / DEG)
        rl = rl + torch.where(firstTouch, torch.where(td_ok, bonus, -12.0), 0.0)
        offRwyAfter = s.touched & (~onRwy) & st.onGround
        stopped = s.touched & onRwy & (st.airspeed < 15) & st.onGround
        rl = rl + torch.where(stopped, 30.0, 0.0) + torch.where(offRwyAfter, -12.0, 0.0) + torch.where(st.crashed, -30.0, 0.0)
        r += torch.where(land, rl, 0.0)
        done |= land & (stopped | offRwyAfter | (s.t > 220) | ((~s.touched) & (along < -s.halfL)))
        succ |= land & stopped
        # takeoff
        rt_ = .4 * torch.exp(-cross.abs() / 8) + .3 * torch.exp(-rh.abs() / .1) + .3 * (alt / 150).clamp(0, 1) - .2 * (st.onGround & (st.airspeed > 45)).float()
        climbed = tko & (alt > 150)
        r += torch.where(tko, rt_ + torch.where(climbed, 20.0, 0.0) + torch.where(st.crashed, -30.0, 0.0) - torch.where(st.onGround & (~onRwy) & (s.t > 2), 1.0, 0.0), 0.0)
        done |= tko & (climbed | (s.t > 90) | (st.onGround & (~onRwy) & (st.airspeed > 5)))
        succ |= climbed
        done |= st.crashed
        info = {'succ': succ, 'land_done': land & done, 'sink': sink, 'first': firstTouch & td_ok, 'tko_done': tko & done}
        return r, done, info

# ---------------------------------------------------------------- PPO
class RunningNorm:
    def __init__(s, d): s.mean = torch.zeros(d, device=dev); s.var = torch.ones(d, device=dev); s.count = 1e-4
    def update(s, x):
        bm, bv, bc = x.mean(0), x.var(0), x.shape[0]; d = bm - s.mean; tot = s.count + bc
        s.mean = s.mean + d * bc / tot; s.var = (s.var * s.count + bv * bc + d * d * s.count * bc / tot) / tot; s.count = tot
    def __call__(s, x): return ((x - s.mean) / torch.sqrt(s.var + 1e-8)).clamp(-8, 8)

H = 128
actor = nn.Sequential(nn.Linear(OBS, H), nn.Tanh(), nn.Linear(H, H), nn.Tanh(), nn.Linear(H, 4)).to(dev)
critic = nn.Sequential(nn.Linear(OBS, 256), nn.Tanh(), nn.Linear(256, 256), nn.Tanh(), nn.Linear(256, 1)).to(dev)
with torch.no_grad(): actor[-1].weight.mul_(.01); actor[-1].bias.zero_()
logstd = nn.Parameter(torch.full((4,), -.6, device=dev))
opt = torch.optim.Adam(list(actor.parameters()) + list(critic.parameters()) + [logstd], lr=3e-4, eps=1e-5)
norm = RunningNorm(OBS); retStd = RunningNorm(1); retAcc = torch.zeros(N, device=dev)
env = Env(N)
GAMMA, LAM, CLIP, EPOCHS, MB = .99, .95, .2, 5, 4
best, hist = -1e9, []
o = env.obs()
t0 = time.time()
for upd in range(1, UPDATES + 1):
    frac = 1 - (upd - 1) / UPDATES
    for g in opt.param_groups: g['lr'] = 3e-4 * max(frac, .1)
    env.landDist = 1500 + 6000 * min(1, upd / (UPDATES * .45))   # curriculum: approaches start further out over time
    bo, ba, blp, br, bd, bv = [], [], [], [], [], []
    stats = {'succ': 0., 'land': 0., 'tko': 0., 'tkos': 0., 'sink': [], 'r': 0.}
    for t in range(T):
        with torch.no_grad():
            norm.update(o); on = norm(o)
            mu = actor(on); std = logstd.exp(); a = mu + std * torch.randn_like(mu)
            lp = (-((a - mu) ** 2) / (2 * std ** 2) - logstd - .5 * math.log(2 * math.pi)).sum(1)
            v = critic(on).squeeze(1)
        r, d, info = env.step(a)
        retAcc = retAcc * GAMMA + r; retStd.update(retAcc[:, None]); retAcc = torch.where(d, 0.0, retAcc)
        bo.append(on); ba.append(a); blp.append(lp); br.append(r / torch.sqrt(retStd.var + 1e-8)); bd.append(d.float()); bv.append(v)
        stats['succ'] += float((info['succ'] & (env.task == 1)).sum()); stats['land'] += float(info['land_done'].sum())
        stats['tkos'] += float((info['succ'] & (env.task == 2)).sum()); stats['tko'] += float(info['tko_done'].sum())
        if info['first'].any(): stats['sink'].append(info['sink'][info['first']].mean().item())
        stats['r'] += float(r.mean())
        env.reset(d); o = env.obs()
    with torch.no_grad():
        nv = critic(norm(o)).squeeze(1)
        adv = torch.zeros(T, N, device=dev); last = torch.zeros(N, device=dev)
        for t in reversed(range(T)):
            nxt = nv if t == T - 1 else bv[t + 1]
            delta = br[t] + GAMMA * nxt * (1 - bd[t]) - bv[t]
            last = delta + GAMMA * LAM * (1 - bd[t]) * last; adv[t] = last
        ret = adv + torch.stack(bv)
    O, A, LP, ADV, RET = torch.cat(bo), torch.cat(ba), torch.cat(blp), adv.reshape(-1), ret.reshape(-1)
    ADV = (ADV - ADV.mean()) / (ADV.std() + 1e-8)
    idx = torch.arange(O.shape[0], device=dev)
    for ep in range(EPOCHS):
        perm = idx[torch.randperm(len(idx), device=dev)]
        for mb in perm.chunk(MB):
            mu = actor(O[mb]); std = logstd.exp()
            nlp = (-((A[mb] - mu) ** 2) / (2 * std ** 2) - logstd - .5 * math.log(2 * math.pi)).sum(1)
            ratio = torch.exp(nlp - LP[mb])
            pl = -torch.min(ratio * ADV[mb], ratio.clamp(1 - CLIP, 1 + CLIP) * ADV[mb]).mean()
            vl = .5 * ((critic(O[mb]).squeeze(1) - RET[mb]) ** 2).mean()
            ent = (logstd + .5 * math.log(2 * math.pi * math.e)).sum()
            loss = pl + .5 * vl - .002 * ent
            opt.zero_grad(); loss.backward(); nn.utils.clip_grad_norm_(list(actor.parameters()) + list(critic.parameters()) + [logstd], .5); opt.step()
        with torch.no_grad(): logstd.clamp_(-2.5, 0)
    ls = stats['succ'] / max(stats['land'], 1); ts = stats['tkos'] / max(stats['tko'], 1)
    sink = sum(stats['sink']) / max(len(stats['sink']), 1)
    score = ls * (env.landDist / 7500) + .3 * ts
    hist.append((upd, ls, ts, sink))
    if upd % 10 == 0 or upd == 1:
        print(f"upd {upd:4d} | land {ls*100:5.1f}% (dist≤{env.landDist:.0f}m) | takeoff {ts*100:5.1f}% | touchdown sink {sink:.2f} m/s | r {stats['r']/T:+.3f} | std {logstd.exp().mean():.2f} | {time.time()-t0:.0f}s", flush=True)
    if score > best and upd > UPDATES * .45:
        best = score
        W = {'obs_mean': norm.mean.tolist(), 'obs_std': torch.sqrt(norm.var + 1e-8).tolist(),
             'layers': [{'w': l.weight.detach().cpu().tolist(), 'b': l.bias.detach().cpu().tolist()} for l in actor if isinstance(l, nn.Linear)],
             'act': 'tanh', 'obs': OBS, 'hz': 10, 'dt': DT, 'meta': {'update': upd, 'land_success': ls, 'takeoff_success': ts, 'sink': sink}}
        json.dump(W, open('pilot.json', 'w'))
print('best score', best, 'saved pilot.json')
