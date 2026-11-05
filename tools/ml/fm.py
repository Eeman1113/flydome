# SKYBOUND flight model, batched on the GPU (PyTorch). A line-for-line port of
# src/game/flightModel.js (itself a pure copy of src/game/physics.js), so policies trained here
# fly identically in the game. Every tensor has shape [N] (one entry per simulated aircraft).
import math, torch

DEG = math.pi / 180
MASS, AREA, THRUST = 1250.0, 16.2, 3850.0

def smooth(a, b, x):
    t = ((x - a) / (b - a)).clamp(0, 1)
    return t * t * (3 - 2 * t)

def wrap(a):
    return torch.remainder(a + math.pi, 2 * math.pi) - math.pi

class Params:
    """Per-aircraft parameters as tensors (so a batch can mix Skylane / Caravan / F-16)."""
    def __init__(self, n, dev, rollRate=62., pitchRate=31., thrust=1., cdMul=1., ab=0., jet=False, stall=True, forgiving=False, mass=MASS):
        f = lambda v: torch.full((n,), float(v), device=dev)
        self.rollRate, self.pitchRate, self.thrust, self.cdMul, self.ab = f(rollRate), f(pitchRate), f(thrust), f(cdMul), f(ab)
        self.jet = torch.full((n,), bool(jet), device=dev)
        self.stall = torch.full((n,), bool(stall), device=dev)
        self.forgiving = torch.full((n,), bool(forgiving), device=dev)
        self.mass = f(mass)
        self.rollStability, self.response = 0.22, 1.0

class State:
    KEYS = ['x', 'y', 'z', 'vx', 'vy', 'vz', 'pitch', 'yaw', 'roll', 'pr', 'rr', 'yr', 'cp', 'cr', 'cy', 'power', 'ab']
    def __init__(self, n, dev):
        for k in self.KEYS: setattr(self, k, torch.zeros(n, device=dev))
        self.crashed = torch.zeros(n, dtype=torch.bool, device=dev)
        self.stalled = torch.zeros(n, dtype=torch.bool, device=dev)
        self.touch = torch.zeros(n, device=dev)      # sink rate at the moment of ground contact this step
        self.airspeed = torch.zeros(n, device=dev); self.alt = torch.zeros(n, device=dev)
        self.onGround = torch.ones(n, dtype=torch.bool, device=dev)

def basis(p, y, r):
    ca, sa, cb, sb, cg, sg = torch.cos(p), torch.sin(p), torch.cos(y), torch.sin(y), torch.cos(-r), torch.sin(-r)
    f = (-sb * ca, sa, -cb * ca)
    u = (-cb * sg + sb * sa * cg, ca * cg, sb * sg + cb * sa * cg)
    rt = (cb * cg + sb * sa * sg, ca * sg, -sb * cg + cb * sa * sg)
    return f, u, rt

def step(s, c, P, ground, paved_fn, wind, contact, dt):
    """c: dict of tensors pitch/roll/yaw in [-1,1], throttle in [0,1]. ground: tensor [N] (flat ground height
    per aircraft). paved_fn(x,z)->bool tensor. wind: (wx, wz) tensors. contact: scalar gear height."""
    live = ~s.crashed
    jet, forgiving = P.jet, P.forgiving
    wf = torch.where(forgiving, 0.5, 1.0); wx, wz = wind[0] * wf, wind[1] * wf
    g0 = ground; wasG = s.y <= g0 + contact + .35
    blend = 1 - math.exp(-dt / (.105 / max(.45, P.response)))
    s.cp = s.cp + (c['pitch'] - s.cp) * blend; s.cr = s.cr + (c['roll'] - s.cr) * blend; s.cy = s.cy + (c['yaw'] - s.cy) * blend
    (fx, fy, fz), (ux, uy, uz), (rx, ry, rz) = basis(s.pitch, s.yaw, s.roll)
    ax, ay, az = s.vx - wx, s.vy, s.vz - wz
    airspeed = torch.sqrt(ax * ax + ay * ay + az * az).clamp(min=.05)
    authority = (.28 + airspeed / 34).clamp(.28, 1.12) * torch.where(wasG, .62, 1.0)
    preSlip = torch.atan2(ax * rx + ay * ry + az * rz, airspeed.clamp(min=.1))
    pitchRateT = s.cp * (P.pitchRate * DEG) * authority
    bank = 65 * DEG
    rollRateT = s.cr * (P.rollRate * DEG) * authority - torch.where(wasG, 0.0, torch.sin(s.roll) * P.rollStability * .34)
    coord = torch.where((~wasG) & (airspeed > 7), -9.81 * torch.tan(s.roll.clamp(-bank, bank)) * torch.cos(s.roll).clamp(min=0) / airspeed.clamp(min=12), torch.zeros_like(airspeed))
    rud = torch.where(wasG, (airspeed / 10).clamp(0, 1), (airspeed / 24).clamp(.25, 1.15))
    slipD = torch.where(wasG, 0.0, (-preSlip * .9).clamp(-.18, .18))
    yawRateT = torch.where(wasG, s.cy * .16 * rud, coord + s.cy * (22 * DEG) * rud + slipD)
    s.pr = s.pr + (pitchRateT - s.pr) * (1 - math.exp(-dt * 6.2 * max(.65, P.response)))
    s.rr = s.rr + (rollRateT - s.rr) * (1 - math.exp(-dt * 7.2 * max(.65, P.response)))
    s.yr = s.yr + (yawRateT - s.yr) * (1 - math.exp(-dt * 4.8))
    pMax = torch.where(jet, 80 * DEG, .40); pMin = torch.where(jet, -80 * DEG, -.38)
    hi = torch.where(wasG, torch.full_like(pMax, 11 * DEG), pMax)
    s.pitch = torch.maximum(torch.minimum(s.pitch + s.pr * dt, hi), pMin)
    s.pr = torch.where(wasG & (s.pitch >= 11 * DEG) & (s.pr > 0), 0.0, s.pr)
    s.roll = torch.where(wasG, (s.roll + s.rr * dt).clamp(-bank, bank), wrap(s.roll + s.rr * dt))
    s.yaw = wrap(s.yaw + s.yr * dt)
    (fx, fy, fz), (ux, uy, uz), (rx, ry, rz) = basis(s.pitch, s.yaw, s.roll)
    ax, ay, az = s.vx - wx, s.vy, s.vz - wz
    asNow = torch.sqrt(ax * ax + ay * ay + az * az).clamp(min=.05); dx, dy, dz = ax / asNow, ay / asNow, az / asNow
    alpha = -torch.asin((dx * ux + dy * uy + dz * uz).clamp(-1, 1))
    rho = 1.225 * torch.exp(-s.y.clamp(min=0) / 8500); qbar = .5 * rho * asNow * asNow
    clLin = (.22 + 5.25 * alpha).clamp(-.55, 1.52)
    vs = torch.sqrt((2 * MASS * 9.81) / (rho * AREA * 1.62))
    sb_ = torch.maximum(smooth(14 * DEG, 22 * DEG, alpha), 1 - smooth(vs * .82, vs * 1.06, asNow))
    stallBlend = torch.where(wasG | (~P.stall), 0.0, sb_)
    cl = clLin + (.62 - clLin) * stallBlend
    hAGL = (s.y - g0).clamp(min=0); gEff = 1 + (1 - smooth(1, 14, hAGL)) * .12
    lift = qbar * AREA * cl * gEff
    s.stalled = (~wasG) & (stallBlend > .24)
    mach = asNow / 340
    cd = (.024 + .075 * cl * cl) * P.cdMul + stallBlend * .42 + torch.where(jet, .003 * smooth(.92, 1.08, mach) + .0015 * (mach - 1.08).clamp(min=0), 0.0)
    drag = qbar * AREA * cd; lat = ax * rx + ay * ry + az * rz; side = .5 * rho * asNow * lat.abs() * AREA * .72
    thr = c['throttle'].clamp(0, 1)
    tau = torch.where(jet, torch.where(thr > s.power, 2.1, 1.4), torch.where(thr > s.power, 1.15, .72))
    s.power = s.power + (thr - s.power) * (1 - torch.exp(-dt / tau))
    lapse = torch.where(jet, 1.0, (1 - .0048 * asNow).clamp(.35, 1))
    abOn = jet & (thr > .92) & (s.power > .86)
    s.ab = s.ab + (abOn.float() - s.ab) * (1 - torch.exp(-dt * torch.where(abOn, 6.0, 3.0)))
    thrust = (s.power + torch.where(jet, s.ab * P.ab, 0.0)) * THRUST * lapse * P.thrust * (MASS / P.mass) * (rho / 1.225) ** .7
    ud = ux * dx + uy * dy + uz * dz; lx, ly, lz = ux - dx * ud, uy - dy * ud, uz - dz * ud
    ll = torch.sqrt(lx * lx + ly * ly + lz * lz); small = ll < 1e-3; llc = ll.clamp(min=1e-3)
    lx = torch.where(small, ux, lx / llc); ly = torch.where(small, uy, ly / llc); lz = torch.where(small, uz, lz / llc)
    sg = -torch.sign(lat) * side
    Fx = fx * thrust + lx * lift - dx * drag + rx * sg
    Fy = fy * thrust + ly * lift - dy * drag + ry * sg - 9.81 * MASS
    Fz = fz * thrust + lz * lift - dz * drag + rz * sg
    k = dt / MASS; damp = math.exp(-.002 * dt)
    vx, vy, vz = (s.vx + Fx * k) * damp, (s.vy + Fy * k) * damp, (s.vz + Fz * k) * damp
    help_ = torch.where(forgiving & (~wasG), smooth(3, 22, hAGL) * (torch.cos(s.roll) * 1.4).clamp(0, 1), 0.0)
    hs = torch.sqrt(vx * vx + vz * vz); tgt = (hs * torch.tan(s.pitch) * .9).clamp(max=0)
    vy = torch.where((help_ > 0) & (vy < tgt), vy + (tgt - vy) * (1 - math.exp(-dt * 30)) * help_, vy)
    kk = torch.where((help_ > 0) & (asNow < 23), (23 - asNow) * dt * .9 * help_, 0.0)
    vx, vy, vz = vx + fx * kk, vy + fy * kk, vz + fz * kk
    x, y, z = s.x + vx * dt, s.y + vy * dt, s.z + vz * dt
    vy = torch.where(s.stalled & (~wasG), vy - (2.4 + stallBlend * 4).clamp(2.4, 6.4) * dt, vy)
    s.pr = torch.where(s.stalled & (~wasG), s.pr - .1 * stallBlend * dt, s.pr)
    cyH = ground + contact; hit = y < cyH
    impact = vy.abs()
    s.touch = torch.where(hit & (vy < 0), -vy, torch.zeros_like(vy))
    y = torch.where(hit, cyH, y); vy = torch.where(hit & (vy < 0), 0.0, vy)
    gfx, gfz, grx, grz = -torch.sin(s.yaw), -torch.cos(s.yaw), torch.cos(s.yaw), -torch.sin(s.yaw)
    fv, lv = vx * gfx + vz * gfz, vx * grx + vz * grz
    pv = paved_fn(x, z)
    rollV = fv * torch.exp(-torch.where(pv, .028, .05) * dt); la = lv * math.exp(-14 * dt)
    vx = torch.where(hit, gfx * rollV + grx * la, vx); vz = torch.where(hit, gfz * rollV + grz * la, vz)
    s.pr = torch.where(hit, s.pr * math.exp(-dt * 1.1), s.pr); s.rr = torch.where(hit, s.rr * math.exp(-dt * 2.4), s.rr)
    crash = hit & ((impact > 13) | (s.roll.abs() > .82) | ((~pv) & (fv.abs() > 42)))
    # frozen aircraft stay put
    for name, v in (('x', x), ('y', y), ('z', z), ('vx', vx), ('vy', vy), ('vz', vz)):
        setattr(s, name, torch.where(live, v, getattr(s, name)))
    s.crashed = s.crashed | crash
    ax2, az2 = s.vx - wx, s.vz - wz
    s.airspeed = torch.sqrt(ax2 * ax2 + s.vy * s.vy + az2 * az2); s.alt = (s.y - ground).clamp(min=0)
    s.onGround = s.y <= ground + contact + .35
    return s
