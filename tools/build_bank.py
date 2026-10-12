"""Builds a piano bank from FreePats' Salamander SF2 (16 layers, 48 kHz).

usage: build_bank.py <in.sf2> <out.sf2> [8|16]
"""
import re
import struct
import subprocess
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).parent))
import sf2lib  # noqa: E402

RATE = 44100
TAIL_CAP_S = 10.0
TAIL_FADE_S = 3.0
LEVEL_WINDOW_S = 0.3
EIGHT_LAYER_LOWS = [1, 37, 47, 57, 73, 89, 105, 121]


def layer_lows(zones, layers):
    """Low velocity of each kept layer."""
    if layers == 8:
        return EIGHT_LAYER_LOWS
    return sorted({z.get(sf2lib.GEN_VELRANGE)[0] for z in zones})


def keep_zones(zones, lows):
    """Keeps the zones of the chosen layers, widening each to reach the next. Returns the zones
    and a map from old to new sample index."""
    kept, used = [], {}
    for z in zones:
        lo, _ = z.get(sf2lib.GEN_VELRANGE)
        if lo not in lows:
            continue
        i = lows.index(lo)
        hi = lows[i + 1] - 1 if i + 1 < len(lows) else 127
        gens = []
        for op, amt in z.gens:
            if op == sf2lib.GEN_VELRANGE:
                amt = bytes([lo, hi])
            elif op == sf2lib.GEN_SAMPLEID:
                sid = struct.unpack('<H', amt)[0]
                used.setdefault(sid, len(used))
                amt = struct.pack('<H', used[sid])
            gens.append((op, amt))
        kept.append(sf2lib.Zone(gens, z.mods))
    return kept, used


def resample(x):
    p = subprocess.run(['ffmpeg', '-v', 'error', '-f', 's16le', '-ar', '48000', '-ac', '1', '-i', '-',
                        '-af', f'aresample={RATE}:resampler=soxr:precision=28', '-f', 'f32le', '-'],
                       input=x.astype('<i2').tobytes(), capture_output=True, check=True)
    return np.frombuffer(p.stdout, dtype='<f4')


def cap_tail(y):
    cap = int(TAIL_CAP_S * RATE)
    if len(y) <= cap:
        return y
    y = y[:cap].copy()
    n = int(TAIL_FADE_S * RATE)
    y[-n:] *= 0.5 + 0.5 * np.cos(np.linspace(0, np.pi, n))
    return y


def note_and_layer(sample):
    m = re.match(rb'(\w#?\d)v(\d+)_([LR])', sample.name)
    return m.group(1), int(m.group(2))


def level_gains(samples, audio):
    """Gain that brings each layer to its note's loudest layer, so layers differ in tone only and
    the SF2 velocity curve sets the loudness."""
    power = {}
    for sid, y in audio.items():
        power.setdefault(note_and_layer(samples[sid]), []).append(np.mean(y[:int(LEVEL_WINDOW_S * RATE)] ** 2))
    rms = {k: np.sqrt(np.mean(v)) for k, v in power.items()}
    return {sid: rms[(note_and_layer(samples[sid])[0], 16)] / rms[note_and_layer(samples[sid])] for sid in audio}


def to_int16(y, rng):
    dither = rng.random(len(y)) - rng.random(len(y))
    return np.clip(np.round(y * 32768 + dither), -32768, 32767).astype(np.int16)


def main():
    src, dst = sys.argv[1], sys.argv[2]
    layers = int(sys.argv[3]) if len(sys.argv) > 3 else 8
    bank = sf2lib.read(src)
    _, zones = bank['instruments'][0]
    lows = layer_lows(zones, layers)
    assert len(lows) == layers, lows
    kept, used = keep_zones(zones, lows)
    for sid in list(used):  # keep each stereo partner
        used.setdefault(bank['samples'][sid].link, len(used))
    order = sorted(used, key=used.get)

    audio = {}
    for sid in order:
        s = bank['samples'][sid]
        audio[sid] = cap_tail(resample(np.asarray(bank['smpl'][s.start:s.end])))
        print(s.name.split(b'\0')[0].decode(), f'{len(audio[sid]) / RATE:.1f}s', flush=True)

    gain = level_gains(bank['samples'], audio)
    trim = 0.95 / max(np.abs(audio[sid]).max() * gain[sid] for sid in order)
    print('trim', round(20 * np.log10(trim), 2), 'dB')

    rng = np.random.default_rng(1)
    samples = []
    for sid in order:
        s = bank['samples'][sid]
        out = sf2lib.Sample(s.name, 0, 0, 0, 0, RATE, s.pitch, s.corr, used[s.link], s.stype)
        out.data = to_int16(audio[sid] * (gain[sid] * trim), rng)
        samples.append(out)

    comment = f'Yamaha C5 by Alexander Holm. SF2 by FreePats (zenvoid.org). {layers} of 16 velocity layers, 44.1 kHz.'
    info = [(b'ifil', struct.pack('<HH', 2, 4)), (b'isng', b'EMU8000\0'),
            (b'INAM', b'Salamander Grand Piano\0\0'),
            (b'ICOP', b'CC BY 3.0, Alexander Holm\0'),
            (b'ICMT', comment.encode() + b'\0')]
    sf2lib.write(dst, info, [(b'Grand Piano', (0, 0, 0, 0, 0, 0), bank['presets'][0][2])],
                 [(b'Salamander Grand', kept)], samples)
    print('zones', len(kept), 'samples', len(samples), 'seconds', round(sum(len(s.data) for s in samples) / RATE))


if __name__ == '__main__':
    main()
