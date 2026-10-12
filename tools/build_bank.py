"""Salamander SF2 (FreePats, 16 layers, 48 kHz) -> 8 or 16 layers, 44.1 kHz, tails capped with a fade.
usage: build_bank.py <in.sf2> <out.sf2> [8|16] [velocity attenuation cB]"""
import struct, subprocess, sys
import numpy as np
sys.path.insert(0, __file__.replace('\\', '/').rsplit('/', 1)[0])
import sf2lib

RATE = 44100
CAP, FADE = 10.0, 3.0
src, dst = sys.argv[1], sys.argv[2]
layers = int(sys.argv[3]) if len(sys.argv) > 3 else 8
vel_atten = int(sys.argv[4]) if len(sys.argv) > 4 else None
bank = sf2lib.read(src)
smpl = bank['smpl']
name, zones = bank['instruments'][0]

# kept layers, by the low end of their velocity range; each now covers up to the next one's
KEEP_LOWS = {8: [1, 37, 47, 57, 73, 89, 105, 121],
             16: sorted({z.get(sf2lib.GEN_VELRANGE)[0] for z in zones if z.get(sf2lib.GEN_VELRANGE)})}[layers]
assert len(KEEP_LOWS) == layers, KEEP_LOWS

kept_zones, used = [], {}
for z in zones:
    lo, hi = z.get(sf2lib.GEN_VELRANGE)
    if lo not in KEEP_LOWS:
        continue
    i = KEEP_LOWS.index(lo)
    new_hi = KEEP_LOWS[i + 1] - 1 if i + 1 < len(KEEP_LOWS) else 127
    gens = []
    for op, amt in z.gens:
        if op == sf2lib.GEN_VELRANGE:
            amt = bytes([lo, new_hi])
        elif op == sf2lib.GEN_SAMPLEID:
            sid = struct.unpack('<H', amt)[0]
            used.setdefault(sid, len(used))
            amt = struct.pack('<H', used[sid])
        gens.append((op, amt))
    kept_zones.append(sf2lib.Zone(gens, z.mods))

# a left sample's partner must be kept too
for sid in list(used):
    used.setdefault(bank['samples'][sid].link, len(used))
order = sorted(used, key=used.get)


def resample(x):
    p = subprocess.run(['ffmpeg', '-v', 'error', '-f', 's16le', '-ar', '48000', '-ac', '1', '-i', '-',
                        '-af', f'aresample={RATE}:resampler=soxr:precision=28', '-f', 'f32le', '-'],
                       input=x.astype('<i2').tobytes(), capture_output=True, check=True)
    return np.frombuffer(p.stdout, dtype='<f4')


import re
audio = {}
for sid in order:
    s = bank['samples'][sid]
    y = resample(np.asarray(smpl[s.start:s.end]))
    cap = int(CAP * RATE)
    if len(y) > cap:
        y = y[:cap].copy()
        n = int(FADE * RATE)
        y[-n:] *= 0.5 + 0.5 * np.cos(np.linspace(0, np.pi, n))
    audio[sid] = y
    print(s.name.split(b'\0')[0].decode(), f'{len(y) / RATE:.1f}s', flush=True)

# Level every layer to its note's loudest layer (RMS of the first 300 ms, both channels), so the
# layers carry the timbre and the SF2 default velocity curve alone carries the loudness.
def key(sid):
    m = re.match(rb'(\w#?\d)v(\d+)_([LR])', bank['samples'][sid].name)
    return m.group(1), int(m.group(2))
rms = {}
for sid in order:
    rms.setdefault(key(sid), []).append(np.mean(audio[sid][:int(0.3 * RATE)] ** 2))
rms = {k: np.sqrt(np.mean(v)) for k, v in rms.items()}
gain = {sid: rms[(key(sid)[0], 16)] / rms[key(sid)] for sid in order}
trim = 0.95 / max(np.abs(audio[sid]).max() * gain[sid] for sid in order)
print('trim', round(20 * np.log10(trim), 2), 'dB; layer gains dB',
      {k[1]: round(20 * np.log10(rms[(k[0], 16)] / v), 1) for k, v in rms.items() if k[0] == b'C4'})

rng = np.random.default_rng(1)
samples = []
for sid in order:
    s = bank['samples'][sid]
    y = audio[sid] * (gain[sid] * trim)
    tpdf = (rng.random(len(y)) - rng.random(len(y)))
    q = np.clip(np.round(y * 32768 + tpdf), -32768, 32767).astype(np.int16)
    out = sf2lib.Sample(s.name, 0, 0, 0, 0, RATE, s.pitch, s.corr, used[s.link], s.stype)
    out.data = q
    samples.append(out)

if vel_atten is not None:
    # overrides the SF2 default velocity -> initial attenuation modulator (960 cB)
    mod = struct.pack('<HHhHH', 0x0502, 48, vel_atten, 0, 0)
    kept_zones.insert(0, sf2lib.Zone([], [mod]))  # global zone: no sample id

info = [(b'ifil', struct.pack('<HH', 2, 4)), (b'isng', b'EMU8000\0'),
        (b'INAM', b'Salamander Grand Piano\0\0'),
        (b'ICOP', b'CC BY 3.0, Alexander Holm\0'),
        (b'ICMT', b'Yamaha C5 by Alexander Holm. SF2 by FreePats (zenvoid.org). ' + f'{layers} of 16 velocity layers, 44.1 kHz.\0'.encode())]
sf2lib.write(dst, info, [(b'Grand Piano', (0, 0, 0, 0, 0, 0), bank['presets'][0][2])],
             [(b'Salamander Grand', kept_zones)], samples)
print('zones', len(kept_zones), 'samples', len(samples), 'seconds', round(sum(len(s.data) for s in samples) / RATE))
