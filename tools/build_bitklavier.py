"""Builds an SF2 bank from the bitKlavier Grand (Princeton, CC BY 4.0), a Steinway D.

The library has 16 velocity layers of 30 notes, A, C, D# and F# from A0 to C8, as stereo WAVs
named like D#5v13.wav. Each note plays its key and the one either side. The layers were recorded
evenly spread, so each takes 8 velocities. As in build_bank.py, each layer is brought to its note's
loudest so the layers differ in tone and the SF2 velocity curve sets the loudness, and tails are
capped. Release resonance, hammer and pedal samples have no place in an SF2 and are left out.

usage: build_bitklavier.py <dir of WAVs> <out.sf2>
"""
import struct
import subprocess
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).parent))
import sf2lib  # noqa: E402
from build_bank import to_int16  # noqa: E402

RATE = 44100
LAYERS = 16
TAIL_CAP_S = 20.0
TAIL_FADE_S = 4.0
LEVEL_WINDOW_S = 0.3
LOW_KEY, HIGH_KEY = 21, 108
# Release, as Salamander has it: 1 s where the dampers stop the string, 5 s above E6, where there are
# none. Without it the SF2 default of 1 ms cuts each note dead when its key lifts.
GEN_RELEASE = 38
RELEASE_TC, UNDAMPED_RELEASE_TC = 0, 2786
LAST_DAMPED_KEY = 88
NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']


def note_name(key):
    return f'{NAMES[key % 12]}{key // 12 - 1}'


def decode(path):
    p = subprocess.run(['ffmpeg', '-v', 'error', '-i', str(path), '-f', 'f32le', '-ac', '2', '-ar', str(RATE), '-'],
                       capture_output=True, check=True)
    return np.frombuffer(p.stdout, dtype='<f4').reshape(-1, 2)


def cap_tail(y):
    cap = int(TAIL_CAP_S * RATE)
    if len(y) <= cap:
        return y
    y = y[:cap].copy()
    n = int(TAIL_FADE_S * RATE)
    y[-n:] *= (0.5 + 0.5 * np.cos(np.linspace(0, np.pi, n)))[:, None]
    return y


def gen_range(op, lo, hi):
    return op, bytes([lo, hi])


def main():
    root, dst = Path(sys.argv[1]), sys.argv[2]
    keys = list(range(LOW_KEY, HIGH_KEY + 1, 3))  # A0, C1, D#1 ... C8
    load = lambda key, layer: cap_tail(decode(root / f'{note_name(key)}v{layer}.wav'))  # noqa: E731

    # Each layer at its note's loudest layer's level, then one trim for the whole bank. Measured in a
    # first pass, as the whole library at once would not fit in memory.
    window = int(LEVEL_WINDOW_S * RATE)
    rms, peak = {}, {}
    for key in keys:
        for layer in range(1, LAYERS + 1):
            y = load(key, layer)
            rms[key, layer] = np.sqrt(np.mean(y[:window] ** 2))
            peak[key, layer] = np.abs(y).max()
        print('measured', note_name(key), flush=True)
    gain = {(key, layer): rms[key, LAYERS] / rms[key, layer] for key, layer in rms}
    trim = 0.95 / max(peak[k] * gain[k] for k in rms)
    print('trim', round(20 * np.log10(trim), 2), 'dB')

    rng = np.random.default_rng(1)
    samples, zones = [], []
    for key in keys:
        lo_key, hi_key = max(LOW_KEY, key - 1), min(HIGH_KEY, key + 1)
        for layer in range(1, LAYERS + 1):
            y = load(key, layer) * (gain[key, layer] * trim)
            left, right = len(samples), len(samples) + 1
            for side, index, link, stype in (('L', 0, right, 4), ('R', 1, left, 2)):
                s = sf2lib.Sample(f'{note_name(key)}v{layer}_{side}'.encode(), 0, 0, 0, 0, RATE, key, 0, link, stype)
                s.data = to_int16(y[:, index], rng)
                samples.append(s)
            lo_vel, hi_vel = (layer - 1) * 8 + 1, 127 if layer == LAYERS else layer * 8
            release = RELEASE_TC if hi_key <= LAST_DAMPED_KEY else UNDAMPED_RELEASE_TC
            for sample in (left, right):
                zones.append(sf2lib.Zone([gen_range(sf2lib.GEN_KEYRANGE, lo_key, hi_key),
                                          gen_range(sf2lib.GEN_VELRANGE, lo_vel, hi_vel),
                                          (GEN_RELEASE, struct.pack('<h', release)),
                                          (sf2lib.GEN_SAMPLEID, struct.pack('<H', sample))], []))
        print(note_name(key), f'{len(samples[-1].data) / RATE:.1f}s', flush=True)

    comment = ('The bitKlavier Grand, a Steinway D, by Princeton University: recorded by Andres Villalta, played by '
               'Matt Wang, edited by Jeff Gordon, Katie Chou, Christien Ayers, Matt Wang and Dan Trueman, produced by '
               'Dan Trueman. CC BY 4.0, converted to SF2 with capped tails. https://bitklavier.com/the-bitklavier-grand/')
    info = [(b'ifil', struct.pack('<HH', 2, 4)), (b'isng', b'EMU8000\0'),
            (b'INAM', b'bitKlavier Grand\0\0'),
            (b'ICOP', b'CC BY 4.0, Princeton University\0'),
            (b'ICMT', comment.encode() + b'\0')]
    preset = [sf2lib.Zone([gen_range(sf2lib.GEN_KEYRANGE, LOW_KEY, HIGH_KEY), (sf2lib.GEN_INSTRUMENT, struct.pack('<H', 0))], [])]
    sf2lib.write(dst, info, [(b'Grand Piano', (0, 0, 0, 0, 0, 0), preset)], [(b'bitKlavier Grand', zones)], samples)
    print('zones', len(zones), 'samples', len(samples), 'seconds', round(sum(len(s.data) for s in samples) / RATE))


if __name__ == '__main__':
    main()
