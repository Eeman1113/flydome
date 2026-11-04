# SKYBOUND radio voice generator: run on a GPU (Colab A100).
#   !wget -q https://raw.githubusercontent.com/Eeman1113/flydome/main/tools/radio/gen.py && python gen.py
# Orpheus 3B (Apache-2.0 code, Llama 3.2 community licence weights) renders every line in lines.json
# TAKES times; Whisper large-v3-turbo transcribes each take and the closest match to the script wins.
# Output: radio.zip with one mono Opus .ogg per clip plus manifest.json.
import os, sys, json, re, subprocess, difflib, shutil, urllib.request
subprocess.run([sys.executable, '-m', 'pip', 'install', '-q', 'snac', 'pyloudnorm', 'soundfile', 'accelerate'], check=True)
import torch, numpy as np, soundfile as sf, pyloudnorm as pyln
from transformers import AutoTokenizer, AutoModelForCausalLM, pipeline
from snac import SNAC

TAKES = int(os.environ.get('TAKES', 4))
BATCH = int(os.environ.get('BATCH', 48))
SR = 24000
LINES_URL = 'https://raw.githubusercontent.com/Eeman1113/flydome/main/tools/radio/lines.json'
lines = json.loads(urllib.request.urlopen(LINES_URL).read())
only = os.environ.get('ONLY')
if only: lines = [l for l in lines if re.match(only, l['id'])]
print(len(lines), 'lines ×', TAKES, 'takes')

dev = 'cuda'
MODEL = os.environ.get('MODEL', 'unsloth/orpheus-3b-0.1-ft')
tok = AutoTokenizer.from_pretrained(MODEL)
lm = AutoModelForCausalLM.from_pretrained(MODEL, torch_dtype=torch.bfloat16).to(dev).eval()
snac = SNAC.from_pretrained('hubertsiuzdak/snac_24khz').to(dev).eval()

SOH, EOT, EOH, PAD, SOS_AUDIO, EOS_AUDIO = 128259, 128009, 128260, 128263, 128257, 128258

def prompts(batch):
    seqs = [[SOH] + tok(f"{l['voice']}: {l['text']}", add_special_tokens=True).input_ids + [EOT, EOH] for l in batch]
    n = max(map(len, seqs))
    ids = torch.tensor([[PAD] * (n - len(s)) + s for s in seqs], device=dev)
    mask = torch.tensor([[0] * (n - len(s)) + [1] * len(s) for s in seqs], device=dev)
    return ids, mask

def decode(row):
    row = row.tolist()
    if SOS_AUDIO in row: row = row[len(row) - 1 - row[::-1].index(SOS_AUDIO) + 1:]
    codes = [t - 128266 for t in row if t not in (EOS_AUDIO, PAD) and t >= 128266]
    codes = codes[:len(codes) // 7 * 7]
    if len(codes) < 14: return None
    l1, l2, l3 = [], [], []
    for i in range(len(codes) // 7):
        c = codes[7 * i:7 * i + 7]
        l1.append(c[0]); l2.append(c[1] - 4096); l3.append(c[2] - 2 * 4096); l3.append(c[3] - 3 * 4096)
        l2.append(c[4] - 4 * 4096); l3.append(c[5] - 5 * 4096); l3.append(c[6] - 6 * 4096)
    if min(l1 + l2 + l3) < 0 or max(l1 + l2 + l3) > 4095: return None
    with torch.no_grad():
        a = snac.decode([torch.tensor(x, device=dev).unsqueeze(0) for x in (l1, l2, l3)])
    return a.squeeze().float().cpu().numpy()

def render(batch, seed):
    torch.manual_seed(seed)
    ids, mask = prompts(batch)
    with torch.no_grad():
        out = lm.generate(input_ids=ids, attention_mask=mask, max_new_tokens=1400, do_sample=True, temperature=.6,
                          top_p=.95, repetition_penalty=1.1, eos_token_id=EOS_AUDIO, pad_token_id=PAD)
    return [decode(r[ids.shape[1]:]) for r in out]

takes = {l['id']: [] for l in lines}
for t in range(TAKES):
    for i in range(0, len(lines), BATCH):
        b = lines[i:i + BATCH]
        for l, a in zip(b, render(b, 1000 * t + i)):
            if a is not None: takes[l['id']].append(a)
        print(f'take {t + 1}/{TAKES} · {min(i + BATCH, len(lines))}/{len(lines)}', flush=True)

# ---- pick the best take with Whisper
asr = pipeline('automatic-speech-recognition', model='openai/whisper-large-v3-turbo', torch_dtype=torch.float16, device=dev)
W = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine']
def norm(s):
    s = re.sub(r'<[^>]+>', '', s.lower()).replace('niner', 'nine').replace('-', ' ')
    s = re.sub(r'\d', lambda m: ' ' + W[int(m.group())] + ' ', s)  # Whisper writes "36" for "three six"
    return re.sub(r'[^a-z ]', '', s).split()
meter = pyln.Meter(SR)

def trim(a):
    env = np.convolve(np.abs(a), np.ones(240) / 240, mode='same'); on = np.where(env > .012)[0]
    if not len(on): return a
    a = a[max(0, on[0] - 1200):min(len(a), on[-1] + 2400)]
    f = min(240, len(a) // 4); a[:f] *= np.linspace(0, 1, f); a[-f:] *= np.linspace(1, 0, f)
    return a

shutil.rmtree('radio', ignore_errors=True); os.makedirs('radio')
manifest, report = {}, []
for l in lines:
    best = None
    for a in takes[l['id']]:
        a = trim(a)
        dur = len(a) / SR
        words = len(norm(l['text']))
        tags = len(re.findall(r'<[^>]+>', l['text']))
        if dur > .8 + words * .75 + tags * 2.5 or dur < .12 + words * .12: continue  # runaway or truncated take
        hyp = asr({'raw': a, 'sampling_rate': SR}, generate_kwargs={'language': 'en'})['text']
        score = difflib.SequenceMatcher(None, norm(l['text']), norm(hyp)).ratio()
        if not best or score > best[0]: best = (score, a, hyp)
    if not best:
        print('NO TAKE', l['id']); report.append((l['id'], 0, '')); continue
    score, a, hyp = best
    try: a = pyln.normalize.loudness(a, meter.integrated_loudness(a), -18.0)
    except Exception: pass
    pk = np.abs(a).max()
    if pk > .89: a = a * (.89 / pk)  # peak-limit instead of clipping
    sf.write('tmp.wav', a, SR)
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', 'tmp.wav', '-ac', '1', '-c:a', 'libopus', '-b:a', '32k',
                    '-application', 'voip', f"radio/{l['id']}.ogg"], check=True)
    manifest[l['id']] = {'g': l['group'], 'v': l['voice'], 't': re.sub(r'<[^>]+>\s*', '', l['text']), 'd': round(len(a) / SR, 2)}
    report.append((l['id'], round(score, 3), hyp))
json.dump(manifest, open('radio/manifest.json', 'w'), indent=0)
json.dump(report, open('radio/report.json', 'w'), indent=0)
bad = [r for r in report if r[1] < .8]
print('done', len(manifest), 'clips; low-confidence:', len(bad))
for r in bad: print('  ', r)
shutil.make_archive('radio', 'zip', 'radio')
print('radio.zip', os.path.getsize('radio.zip') // 1024, 'KB')
