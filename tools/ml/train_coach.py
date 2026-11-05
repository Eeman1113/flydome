# SKYBOUND landing coach: learns, from the player's point of view on final approach, (a) what landing grade they
# are heading for and (b) which single correction would improve it most.
#   needs fm.py, train_pilot.py and the trained pilot.json in the working directory
#   !python train_coach.py
# Data: the trained AI pilot flies approaches with human-like errors (power / pitch / steering biases, lazy
# flares, noise) in both the realistic and forgiving flight models. At a random point on final every approach is
# branched into 7 futures: hold, more power, less power, nose up, nose down, steer left, steer right. Each branch
# is flown to touchdown and graded with the game's own rules. The model predicts the outcome of every branch.
import os, math, json, time, torch, torch.nn as nn
os.environ.setdefault('SKIP_PARITY', '1'); os.environ.setdefault('COMPILE', '0')
import fm, train_pilot as tp
dev = tp.dev; DEG = math.pi / 180
ROUNDS = int(os.environ.get('ROUNDS', 70)); M = int(os.environ.get('M', 3072)); K = 7
CORR = ['hold', 'power_up', 'power_down', 'nose_up', 'nose_down', 'left', 'right']
FEAT = 21

# ---- the trained pilot
J = json.load(open('pilot.json'))
pilot = nn.Sequential(*sum([[nn.Linear(len(l['w'][0]), len(l['w'])), nn.Tanh()] for l in J['layers']], [])[:-1]).to(dev)
with torch.no_grad():
    for lin, l in zip([m for m in pilot if isinstance(m, nn.Linear)], J['layers']): lin.weight.copy_(torch.tensor(l['w'])); lin.bias.copy_(torch.tensor(l['b']))
pmean, pstd = torch.tensor(J['obs_mean'], device=dev), torch.tensor(J['obs_std'], device=dev)
def policy(o):
    with torch.no_grad(): return pilot(((o - pmean) / pstd).clamp(-8, 8)).clamp(-1, 1)

def coach_features(env):
    st = env.st; along, cross, gsd, rh, onRwy = env.rwy(); v = env.var
    hw = -(env.wx * -torch.sin(st.yaw) + env.wz * -torch.cos(st.yaw)); xw = env.wx * torch.cos(st.yaw) - env.wz * torch.sin(st.yaw)
    alt = st.y - env.ground - tp.VAR[v, 6]
    return torch.stack([st.airspeed / 50, st.vy / 10, st.pitch * 2, torch.sin(st.roll), torch.cos(st.roll), st.power,
                        (alt / 100).clamp(0, 4), (along / 2000).clamp(-1, 2), (cross / 50).clamp(-4, 4), (gsd / 30).clamp(-4, 4),
                        torch.sin(rh), torch.cos(rh), hw / 10, xw / 10, (v == 0).float(), (v == 1).float(), (v == 2).float(),
                        env.halfW / 22, env.forgiving.float(), st.pr, st.rr], 1)

def grade(sink, off_frac, hdg_deg, bounces, on_rwy, crashed):
    """The game's gradeLanding(): S=0 … D=4, plus 5 = off the runway, 6 = crash."""
    i = torch.where(sink <= .9, 0, torch.where(sink <= 1.6, 1, torch.where(sink <= 2.6, 2, torch.where(sink <= 4, 3, 4)))).float()
    i = i + (off_frac > .55).float() + (hdg_deg > 10).float() + bounces.clamp(max=2)
    i = i.clamp(max=4)
    return torch.where(crashed, 6.0, torch.where(~on_rwy, 5.0, i))

class Noisy:
    """Human-like pilot errors on top of the trained policy (fixed per approach)."""
    def __init__(s, n):
        R = lambda a: (torch.rand(n, device=dev) * 2 - 1) * a
        # error sizes chosen so outcomes span the whole S…D range, like real players (not mostly crashes)
        s.thr, s.pit, s.rol = R(.2), R(.11), R(.05); s.lazy = torch.rand(n, device=dev) < .2; s.noise = .02 + .06 * torch.rand(n, device=dev)
    def __call__(s, a, env, extra=None):
        a = a.clone(); alt = env.st.y - env.ground - tp.VAR[env.var, 6]
        a[:, 3] += s.thr * 2; a[:, 0] += s.pit; a[:, 1] += s.rol
        a[:, 0] -= torch.where(s.lazy & (alt < 9), .35, 0.0)
        a += torch.randn_like(a) * s.noise[:, None]
        if extra is not None: a += extra
        return a.clamp(-1, 1)

def make_env(n):
    e = tp.Env(n); e.landDist = 6000.0; e.force_task = 1
    return e
def force_landing(env, m):
    env.task[m] = 1
def run_round():
    env = make_env(M); env.forgiving[:] = torch.rand(M, device=dev) < .5
    # reset everything as landings
    env.task[:] = 1; all_ = torch.ones(M, dtype=torch.bool, device=dev)
    _reset_landing(env, all_)
    noisy = Noisy(M); trigger = 80 + 1500 * torch.rand(M, device=dev)   # decision point: distance to the aim point
    snap = torch.zeros(M, dtype=torch.bool, device=dev); feats = torch.zeros(M, FEAT, device=dev); saved = {}
    for step in range(1600):
        a = noisy(policy(env.obs()), env); _, d, _ = env.step(a)
        along = env.rwy()[0]; alt = env.st.y - env.ground - tp.VAR[env.var, 6]
        hit = (~snap) & (~d) & (along < trigger) & (alt > 4) & (~env.touched)
        if hit.any():
            feats[hit] = coach_features(env)[hit]
            for k in fm.State.KEYS + ['crashed']: saved.setdefault(k, torch.zeros_like(getattr(env.st, k)))[hit] = getattr(env.st, k)[hit]
            snap |= hit
        if snap.all() or step > 1500: break
        dead = d & ~snap
        if dead.any(): env.st.crashed[dead] = True   # these approaches ended before the decision point: drop them
    keep = snap.nonzero().squeeze(1); n = keep.numel()
    if n == 0: return None
    # ---- branch: K futures per snapshot
    B = make_env(n * K); B.forgiving[:] = env.forgiving[keep].repeat_interleave(K)
    for name in ['var', 'ground', 'wx', 'wz', 'halfL', 'halfW', 'pavedRwy', 'hdgT', 'altT', 'spdT']:
        getattr(B, name)[:] = getattr(env, name)[keep].repeat_interleave(K)
    B.task[:] = 1; B.touched[:] = False; B.t[:] = 0
    for k in fm.State.KEYS: getattr(B.st, k)[:] = saved[k][keep].repeat_interleave(K)
    B.st.crashed[:] = False; B.prevAlong[:] = B.rwy()[0]
    nz = Noisy(n * K)
    for attr in ['thr', 'pit', 'rol', 'lazy', 'noise']: setattr(nz, attr, getattr(noisy, attr)[keep].repeat_interleave(K))
    corr = torch.arange(K, device=dev).repeat(n)
    extra = torch.zeros(n * K, 4, device=dev)
    extra[corr == 1, 3] = .6; extra[corr == 2, 3] = -.6; extra[corr == 3, 0] = .22; extra[corr == 4, 0] = -.22
    cross0 = B.rwy()[1]; side = torch.sign(cross0)   # left/right relative to the runway: + = right of centreline
    extra[corr == 5, 1] = -.25; extra[corr == 6, 1] = .25
    dur = torch.where(corr <= 2, 4.0, torch.where(corr <= 4, 3.0, 2.5))
    out_sink = torch.zeros(n * K, device=dev); out_off = torch.zeros(n * K, device=dev); out_hdg = torch.zeros(n * K, device=dev)
    bounces = torch.zeros(n * K, device=dev); touched_t = torch.full((n * K,), -1.0, device=dev)
    on_rwy = torch.ones(n * K, dtype=torch.bool, device=dev); finished = torch.zeros(n * K, dtype=torch.bool, device=dev)
    airborne_again = torch.zeros(n * K, dtype=torch.bool, device=dev)
    for step in range(900):
        live = ~finished
        ex = torch.where((B.t < dur)[:, None], extra, torch.zeros_like(extra))
        a = nz(policy(B.obs()), B, ex)
        _, d, info = B.step(a)
        along, cross, gsd, rh, onR = B.rwy(); first = info['sink'] > 0
        newtd = first & (touched_t < 0) & live
        out_sink = torch.where(newtd, info['sink'], out_sink); out_off = torch.where(newtd, cross.abs() / B.halfW, out_off)
        out_hdg = torch.where(newtd, rh.abs() / DEG, out_hdg); on_rwy = torch.where(newtd, onR, on_rwy)
        touched_t = torch.where(newtd, B.t, touched_t)
        alt = B.st.y - B.ground - tp.VAR[B.var, 6]
        # bounce: airborne again (>1.2 m) within 4 s of the first touchdown, then down again
        up = (touched_t >= 0) & (B.t - touched_t < 4) & (alt > 1.2) & live
        airborne_again |= up
        down_again = airborne_again & (B.st.touch > 0) & live
        bounces = bounces + down_again.float(); airborne_again &= ~down_again
        finished |= ((touched_t >= 0) & (B.t - touched_t > 4)) | B.st.crashed | (d & (touched_t < 0))
        if finished.all(): break
    crashed = B.st.crashed | (touched_t < 0)
    g = grade(out_sink, out_off, out_hdg, bounces, on_rwy, crashed)
    y = torch.stack([g, out_sink.clamp(max=8), out_off.clamp(max=4), out_hdg.clamp(max=45), bounces.clamp(max=3), (~on_rwy | crashed).float()], 1).view(n, K, 6)
    return feats[keep], y

def _reset_landing(env, m):
    env.force_task = 1; env.reset(m)

if __name__ == '__main__':
    t0 = time.time(); X, Y = [], []
    for r in range(ROUNDS):
        res = run_round()
        if res is None: continue
        x, y = res; X.append(x); Y.append(y)
        if r % 5 == 0:
            yy = torch.cat(Y); best = yy[:, :, 0].min(1).values; hold = yy[:, 0, 0]
            print(f'round {r:3d} | samples {sum(len(a) for a in X):6d} | mean grade if held {hold.mean():.2f} | best-correction grade {best.mean():.2f} | crash/off {yy[:,0,5].mean()*100:.1f}% | {time.time()-t0:.0f}s', flush=True)
    X, Y = torch.cat(X), torch.cat(Y)
    n = len(X); perm = torch.randperm(n, device=dev); X, Y = X[perm], Y[perm]; nv = n // 10
    Xv, Yv, Xt, Yt = X[:nv], Y[:nv], X[nv:], Y[nv:]
    mean, std = Xt.mean(0), Xt.std(0) + 1e-6
    net = nn.Sequential(nn.Linear(FEAT, 128), nn.Tanh(), nn.Linear(128, 128), nn.Tanh(), nn.Linear(128, K * 6)).to(dev)
    opt = torch.optim.AdamW(net.parameters(), 2e-3, weight_decay=1e-4); E = 120; sched = torch.optim.lr_scheduler.CosineAnnealingLR(opt, E)
    w = torch.tensor([1.0, .5, .5, .02, .5, 2.0], device=dev)
    def lossf(p, y):
        p = p.view(-1, K, 6); reg = ((p[..., :5] - y[..., :5]) ** 2 * w[:5]).mean()
        cls = nn.functional.binary_cross_entropy_with_logits(p[..., 5], y[..., 5]) * w[5]
        return reg + cls
    for ep in range(E):
        for idx in torch.randperm(len(Xt), device=dev).split(4096):
            loss = lossf(net((Xt[idx] - mean) / std), Yt[idx]); opt.zero_grad(); loss.backward(); opt.step()
        sched.step()
        if ep % 20 == 0 or ep == E - 1:
            with torch.no_grad():
                pv = net((Xv - mean) / std).view(-1, K, 6)
                mae = (pv[..., 0] - Yv[..., 0]).abs().mean().item()
                hit = (pv[..., 0].argmin(1) == Yv[..., 0].argmin(1)).float().mean().item()
                regret = (Yv[..., 0].gather(1, pv[..., 0].argmin(1, keepdim=True)).squeeze(1) - Yv[..., 0].min(1).values).mean().item()
                gain = (Yv[:, 0, 0] - Yv[..., 0].gather(1, pv[..., 0].argmin(1, keepdim=True)).squeeze(1)).mean().item()
            print(f'epoch {ep:3d} | val grade MAE {mae:.3f} | best-correction picked {hit*100:.1f}% | regret {regret:.3f} grades | following advice improves the grade by {gain:.2f} on average', flush=True)
    J = {'feat': FEAT, 'corr': CORR, 'outputs': ['grade', 'sink', 'offset_frac', 'hdg_deg', 'bounces', 'logit_off_or_crash'],
         'mean': mean.tolist(), 'std': std.tolist(),
         'layers': [{'w': l.weight.detach().cpu().tolist(), 'b': l.bias.detach().cpu().tolist()} for l in net if isinstance(l, nn.Linear)],
         'meta': {'samples': n, 'val_grade_mae': mae, 'best_pick': hit, 'gain': gain}}
    json.dump(J, open('coach.json', 'w')); print('saved coach.json')
