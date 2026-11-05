# SKYBOUND learned terrain: a detail-synthesis network trained on real elevation data.
#   !wget -q https://raw.githubusercontent.com/Eeman1113/flydome/main/tools/ml/train_terrain.py && python train_terrain.py
# Data: AWS Terrain Tiles (Terrarium PNG, public, no auth) from mountain and hill regions worldwide, resampled to
# the game's 62.5 m terrain-detail grid. The network sees a smoothed terrain (real terrain blurred to the scale the
# game's procedural noise already models) and learns to restore real erosion detail: drainage networks, ridges,
# gullies, valley floors. In the game (src/game/terrainNet.js) it runs once per world on the GPU over the
# procedural terrain. Architecture is a plain dilated conv stack so it maps 1:1 onto WebGL shader passes.
import math, os, io, json, random, time, concurrent.futures as cf, urllib.request
import numpy as np, torch, torch.nn as nn, torch.nn.functional as F
from PIL import Image

dev = 'cuda' if torch.cuda.is_available() else 'cpu'
random.seed(1); np.random.seed(1); torch.manual_seed(1)
Z = 11; CELL = 62.5; SIG_FINE = 3.0; SIG_REL = 40.0; H_SCALE = 2500.0; REL_SCALE = 400.0; OUT_SCALE = 40.0
REGIONS = [  # (lat0, lat1, lon0, lon1, weight)
    (44, 48, 5, 16, 3), (42, 43.5, -2, 3, 1), (56, 58.5, -6, -3.5, 1.5), (59, 63, 5, 10, 2), (37, 50, -122, -105, 3),
    (35, 41, -84, -76, 1.5), (36, 40, -121, -118, 1), (-40, -15, -75, -66, 2.5), (-46, -41, 167, 174, 1.5), (35, 40, 136, 141, 1.5),
    (27, 31, 80, 90, 1.5), (42, 44, 40, 46, 1), (63.5, 66, -22, -14, 1), (-43.5, -41, 145, 148.5, .7), (8, 13, 37, 40, 1),
    (45, 49, 22, 26, 1), (31, 34, -8, -3, 1), (41, 45, 17, 22, 1), (58, 61, -150, -135, 1), (42.5, 44, 10.5, 12.5, .8),
    (35.5, 37.5, -94, -91, .7), (51.5, 53.5, -4.5, -3, .6), (-35, -28, 148, 152, .8), (24, 28, 98, 104, 1)]
N_TILES = int(os.environ.get('TILES', 1800)); STEPS = int(os.environ.get('STEPS', 30000)); CROP = 160; BATCH = 24

def tile_xy(lat, lon):
    n = 2 ** Z; x = int((lon + 180) / 360 * n); r = math.radians(lat)
    y = int((1 - math.log(math.tan(r) + 1 / math.cos(r)) / math.pi) / 2 * n); return x, y
def fetch(job):
    x, y, lat = job
    url = f'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{Z}/{x}/{y}.png'
    try:
        a = np.asarray(Image.open(io.BytesIO(urllib.request.urlopen(url, timeout=20).read())).convert('RGB'), dtype=np.float32)
        h = a[..., 0] * 256 + a[..., 1] + a[..., 2] / 256 - 32768
        if (h < 1).mean() > .35 or np.ptp(h) < 60: return None          # mostly sea or flat
        # resample to the game's 62.5 m grid (z11 pixel = 76.4 m * cos(lat))
        px = 156543.03 * math.cos(math.radians(lat)) / 2 ** Z; k = px / CELL
        t = torch.from_numpy(h)[None, None]; t = F.interpolate(t, scale_factor=k, mode='bicubic', align_corners=False)[0, 0]
        return t.numpy().astype(np.float32)
    except Exception:
        return None

def gauss_blur(x, sigma):
    """Separable Gaussian on [B,1,H,W] with reflect padding (same maths as the game's box-blur approximation is close enough at these sigmas)."""
    r = int(math.ceil(sigma * 3)); g = torch.exp(-(torch.arange(-r, r + 1, device=x.device, dtype=x.dtype) ** 2) / (2 * sigma * sigma)); g = g / g.sum()
    x = F.conv2d(F.pad(x, (r, r, 0, 0), mode='reflect'), g.view(1, 1, 1, -1))
    return F.conv2d(F.pad(x, (0, 0, r, r), mode='reflect'), g.view(1, 1, -1, 1))
def box_blur3(x, sigma):
    """Three box blurs ≈ Gaussian: exactly what src/game/terrainNet.js computes on the CPU."""
    w = int(math.floor(math.sqrt(12 * sigma * sigma / 3 + 1))); w += (w % 2 == 0); r = w // 2
    for _ in range(3):
        x = F.avg_pool2d(F.pad(x, (r, r, r, r), mode='replicate'), w, stride=1)
    return x
def features(h):
    """h: [B,1,H,W] metres → (input [B,2,H,W], fine blurred [B,1,H,W])."""
    b = box_blur3(h, SIG_FINE); rel = (b - box_blur3(b, SIG_REL)) / REL_SCALE
    return torch.cat([rel, b / H_SCALE], 1), b

class Net(nn.Module):
    DIL = [1, 2, 4, 8, 16, 8, 4, 2, 1]
    def __init__(s, C=32):
        super().__init__()
        s.convs = nn.ModuleList([nn.Conv2d(2, C, 3, padding=1)] + [nn.Conv2d(C, C, 3, padding=d, dilation=d) for d in s.DIL[1:]])
        s.out = nn.Conv2d(C, 4, 1)   # 4 outputs so the last layer is one RGBA pass; channel 0 is the residual
        for c in s.convs: nn.init.kaiming_normal_(c.weight, nonlinearity='relu'); nn.init.zeros_(c.bias)
        nn.init.zeros_(s.out.weight); nn.init.zeros_(s.out.bias)
    def forward(s, x):
        for c in s.convs: x = F.relu(c(x))
        return s.out(x)[:, :1]

def lap_pyr(x, n=3):
    out = []
    for _ in range(n):
        d = F.avg_pool2d(x, 2); u = F.interpolate(d, scale_factor=2, mode='bilinear', align_corners=False)
        out.append(x - u); x = d
    return out + [x]

if __name__ == '__main__':
    t0 = time.time()
    W = np.array([r[4] for r in REGIONS]); W = W / W.sum(); jobs = set()
    while len(jobs) < N_TILES * 1.5:
        r = REGIONS[np.random.choice(len(REGIONS), p=W)]; lat = random.uniform(r[0], r[1]); lon = random.uniform(r[2], r[3])
        x, y = tile_xy(lat, lon); jobs.add((x, y, round(lat, 2)))
    jobs = list(jobs); tiles = []
    with cf.ThreadPoolExecutor(32) as ex:
        for t in ex.map(fetch, jobs):
            if t is not None and min(t.shape) > CROP + 8: tiles.append(t)
            if len(tiles) >= N_TILES: break
    print(f'{len(tiles)} tiles in {time.time()-t0:.0f}s')
    random.shuffle(tiles); val, train = tiles[:max(40, len(tiles) // 20)], tiles[max(40, len(tiles) // 20):]

    def batch(src, n=BATCH):
        out = []
        for _ in range(n):
            t = random.choice(src); i = random.randint(0, t.shape[0] - CROP); j = random.randint(0, t.shape[1] - CROP)
            p = t[i:i + CROP, j:j + CROP]; k = random.randint(0, 3); p = np.rot90(p, k)
            if random.random() < .5: p = p[:, ::-1]
            out.append(np.ascontiguousarray(p) * random.uniform(.8, 1.25))   # relief-scale augmentation
        return torch.from_numpy(np.stack(out))[:, None].to(dev)

    net = Net().to(dev); opt = torch.optim.AdamW(net.parameters(), lr=2e-3, weight_decay=1e-5)
    sched = torch.optim.lr_scheduler.OneCycleLR(opt, max_lr=2e-3, total_steps=STEPS, pct_start=.05)
    def loss_fn(pred, tgt):
        l = (pred - tgt).abs().mean()
        gx = lambda a: a[..., :, 1:] - a[..., :, :-1]; gy = lambda a: a[..., 1:, :] - a[..., :-1, :]
        l = l + .5 * ((gx(pred) - gx(tgt)).abs().mean() + (gy(pred) - gy(tgt)).abs().mean())
        for a, b in zip(lap_pyr(pred), lap_pyr(tgt)): l = l + .25 * (a - b).abs().mean()
        return l
    best = 1e9
    for step in range(1, STEPS + 1):
        h = batch(train); x, b = features(h); tgt = (h - b) / OUT_SCALE
        pred = net(x); m = 16   # ignore borders (padding artefacts)
        loss = loss_fn(pred[..., m:-m, m:-m], tgt[..., m:-m, m:-m])
        opt.zero_grad(); loss.backward(); nn.utils.clip_grad_norm_(net.parameters(), 1.0); opt.step(); sched.step()
        if step % 1000 == 0 or step == 1:
            with torch.no_grad():
                hv = batch(val, 64); xv, bv = features(hv); tv = (hv - bv) / OUT_SCALE; pv = net(xv)
                e_model = ((pv - tv)[..., m:-m, m:-m].abs().mean() * OUT_SCALE).item(); e_zero = (tv[..., m:-m, m:-m].abs().mean() * OUT_SCALE).item()
                gm = lambda a: (a[..., :, 1:] - a[..., :, :-1]).abs().mean().item() * OUT_SCALE
                print(f'step {step:6d} | train {loss.item():.4f} | val detail error {e_model:.2f} m vs {e_zero:.2f} m without the model '
                      f'({100*(1-e_model/e_zero):.1f}% better) | slope detail real {gm(tv):.2f} pred {gm(pv):.2f} | {time.time()-t0:.0f}s', flush=True)
                if e_model < best:
                    best = e_model
                    layers = [{'w': c.weight.detach().cpu().numpy().round(6).tolist(), 'b': c.bias.detach().cpu().numpy().round(6).tolist(), 'dil': d}
                              for c, d in zip(net.convs, Net.DIL)]
                    layers.append({'w': net.out.weight.detach().cpu().numpy().round(6).tolist(), 'b': net.out.bias.detach().cpu().numpy().round(6).tolist(), 'dil': 1, 'k': 1})
                    json.dump({'cell': CELL, 'sig_fine': SIG_FINE, 'sig_rel': SIG_REL, 'h_scale': H_SCALE, 'rel_scale': REL_SCALE, 'out_scale': OUT_SCALE,
                               'layers': layers, 'meta': {'step': step, 'val_err_m': e_model, 'baseline_m': e_zero, 'tiles': len(tiles)}}, open('terrain_net.json', 'w'))
    # golden test for the WebGL engine: features + expected net output on a 64×64 patch (replicate-padded like the shader)
    J = json.load(open('terrain_net.json')); ref = Net().to(dev)
    torch.backends.cudnn.allow_tf32 = False; torch.backends.cuda.matmul.allow_tf32 = False   # full fp32, as the browser runs it
    with torch.no_grad():
        for c, L in zip(ref.convs, J['layers'][:-1]): c.weight.copy_(torch.tensor(L['w'])); c.bias.copy_(torch.tensor(L['b']))
        ref.out.weight.copy_(torch.tensor(J['layers'][-1]['w'])); ref.out.bias.copy_(torch.tensor(J['layers'][-1]['b']))
        hv = batch(val, 1)[:, :, :64, :64]; xv, _ = features(hv)
        y = xv
        for c, d in zip(ref.convs, Net.DIL): y = F.relu(F.conv2d(F.pad(y, (d, d, d, d), mode='replicate'), c.weight, c.bias, dilation=d))
        y = ref.out(y)[:, :1]
        J['test'] = {'inp': xv[0].cpu().numpy().round(6).tolist(), 'out': y[0, 0].cpu().numpy().round(6).tolist()}
    json.dump(J, open('terrain_net.json', 'w'))
    print('best val detail error', best, 'm; saved terrain_net.json')
