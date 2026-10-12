"""Builds an SF2 bank from the Amethyst Imperial Grand SFZ library (MBMS).

The samples are only converted (48 kHz stereo FLAC to 16-bit PCM); their content is unchanged,
as their CC BY-ND 4.0 license requires. The SFZ settings are mapped to SF2 generators:
- velocity: a low-pass cutoff and attack time per velocity, grouped into velocity bands
- per key: filter key tracking, pan and release time
- an attenuation that matches the level of the other pianos

usage: build_amethyst.py <library dir> <studio|hall> <out.sf2>
"""
import math
import re
import struct
import subprocess
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).parent))
import sf2lib  # noqa: E402
from build_bank import to_int16  # noqa: E402

RATE = 48000
LOW_KEY, HIGH_KEY = 21, 108
FILTER_KEYTRACK = 16  # cents per key above LOW_KEY
ATTACK_START = 0.37  # the SFZ envelope starts at 37%, so the same slope needs 63% of the time
BAND_CENTS = 100  # widest cutoff spread within one velocity band
ATTENUATION_CB = 72  # matches the level of the Salamander banks
VARIANTS = {
    'studio': ('Studio', 'STD', 'KeysReleaseStudio'),
    'hall': ('ImperialHall', 'HALL', 'KeysReleaseImperialHall'),
}

GEN_FILTER_FC = 8
GEN_PAN = 17
GEN_ATTACK = 34
GEN_RELEASE = 38
GEN_ATTENUATION = 48


def defines(path, prefix):
    """Reads `#define $<prefix>NNN value` lines into {NNN: value}."""
    text = Path(path).read_text()
    return {int(n): float(v) for n, v in re.findall(rf'#define \${prefix}(\d+) (\S+)', text)}


def cents(hz):
    return min(13500, round(1200 * math.log2(hz / 8.176)))


def timecents(seconds):
    return max(-12000, round(1200 * math.log2(seconds)))


def velocity_bands(cutoff):
    """Splits velocities 1-127 into bands whose cutoffs stay within BAND_CENTS."""
    bands, lo = [], 1
    for v in range(2, 129):
        if v == 128 or cents(cutoff[v]) - cents(cutoff[lo]) > BAND_CENTS:
            bands.append((lo, v - 1))
            lo = v
    return bands


def gen(op, value):
    return op, struct.pack('<h', value)


def gen_range(op, lo, hi):
    return op, bytes([lo, hi])


def decode(path):
    p = subprocess.run(['ffmpeg', '-v', 'error', '-i', str(path), '-f', 'f32le', '-ac', '2', '-ar', str(RATE), '-'],
                       capture_output=True, check=True)
    return np.frombuffer(p.stdout, dtype='<f4').reshape(-1, 2)


def main():
    root, variant, dst = Path(sys.argv[1]), sys.argv[2], sys.argv[3]
    room, ctx, release_file = VARIANTS[variant]
    values = root / '.Assets' / 'Include' / 'ValueDefs'
    cutoff = defines(values / 'PianoFilterCurve.sfzh', 'FIL')
    attack = defines(values / 'PianoAttackCurve.sfzh', 'ATC')
    pan = defines(values / 'KeysPanCurve.sfzh', 'PAN')
    release = defines(values / f'{release_file}.sfzh', 'REL')
    bands = velocity_bands(cutoff)
    print('velocity bands', len(bands), flush=True)

    rng = np.random.default_rng(1)
    samples, instruments, preset_zones = [], [], []
    for key in range(LOW_KEY, HIGH_KEY + 1):
        audio = decode(root / '.Assets' / 'Samples' / 'Piano' / room / f'AIG-{ctx}-{key:03d}.flac')
        left, right = len(samples), len(samples) + 1
        for side, index, link, stype in (('L', 0, right, 4), ('R', 1, left, 2)):
            s = sf2lib.Sample(f'AIG-{ctx}-{key:03d}{side}'.encode(), 0, 0, 0, 0, RATE, key, 0, link, stype)
            s.data = to_int16(audio[:, index], rng)
            samples.append(s)

        global_zone = sf2lib.Zone([gen(GEN_ATTENUATION, ATTENUATION_CB), gen(GEN_RELEASE, timecents(release[key]))], [])
        zones = [global_zone]
        track = 2 ** ((key - LOW_KEY) * FILTER_KEYTRACK / 1200)
        for lo, hi in bands:
            vels = range(lo, hi + 1)
            fc = round(np.mean([cents(cutoff[v] * track) for v in vels]))
            atk = timecents(np.mean([attack[v] for v in vels]) * (1 - ATTACK_START))
            for sample, side_pan in ((left, -500), (right, 500)):
                zones.append(sf2lib.Zone([
                    gen_range(sf2lib.GEN_VELRANGE, lo, hi),
                    gen(GEN_FILTER_FC, fc),
                    gen(GEN_ATTACK, atk),
                    gen(GEN_PAN, max(-500, min(500, side_pan + round(5 * pan[key])))),
                    gen(sf2lib.GEN_SAMPLEID, sample),
                ], []))
        instruments.append((f'AIG {key}'.encode(), zones))
        lo_key = 0 if key == LOW_KEY else key
        hi_key = 127 if key == HIGH_KEY else key
        preset_zones.append(sf2lib.Zone([gen_range(sf2lib.GEN_KEYRANGE, lo_key, hi_key),
                                         gen(sf2lib.GEN_INSTRUMENT, key - LOW_KEY)], []))
        print(key, f'{len(audio) / RATE:.1f}s', flush=True)

    name = f'Amethyst Imperial Grand ({room})'
    comment = ('Samples by MBMS, CC BY-ND 4.0, converted to SF2 without changes. SFZ settings by MBMS, '
               'GPL-2.0, mapped to SF2 generators. https://github.com/MyBlackMIDIScore/AmethystImperialGrand')
    info = [(b'ifil', struct.pack('<HH', 2, 4)), (b'isng', b'EMU8000\0'),
            (b'INAM', name.encode() + b'\0'),
            (b'ICOP', b'Copyright 2023 MBMS\0'),
            (b'ICMT', comment.encode() + b'\0')]
    sf2lib.write(dst, info, [(b'Grand Piano', (0, 0, 0, 0, 0, 0), preset_zones)], instruments, samples)
    gens = sum(len(z.gens) for _, zones in instruments for z in zones)
    print('instruments', len(instruments), 'generators', gens, 'samples', len(samples))


if __name__ == '__main__':
    main()
