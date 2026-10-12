"""Minimal SF2 reader and writer for 16-bit sound banks."""
import struct

import numpy as np

GEN_INSTRUMENT, GEN_KEYRANGE, GEN_VELRANGE, GEN_SAMPLEID = 41, 43, 44, 53
SAMPLE_FORMAT = '<IIIIIBbHH'
PRESET_FORMAT = '<HHHIII'


def _chunks(f, start, end):
    pos = start
    while pos < end:
        f.seek(pos)
        cid, size = struct.unpack('<4sI', f.read(8))
        yield cid, size, pos + 8
        pos += 8 + size + (size & 1)


class Sample:
    def __init__(self, name, start, end, loop_start, loop_end, rate, pitch, corr, link, stype):
        self.name, self.start, self.end = name, start, end
        self.ls, self.le = loop_start, loop_end
        self.rate, self.pitch, self.corr = rate, pitch, corr
        self.link, self.stype = link, stype
        self.data = None  # int16 array, set when writing


class Zone:
    def __init__(self, gens, mods):
        self.gens = gens  # [(op, amount as 2 bytes)]
        self.mods = mods  # [10-byte records]

    def get(self, op):
        for o, amount in self.gens:
            if o == op:
                return amount
        return None


def read(path):
    """Returns the sample data (memory-mapped), presets, instruments, samples and INFO chunks."""
    raw = {}
    smpl = None
    with open(path, 'rb') as f:
        f.seek(0, 2)
        total = f.tell()
        for _, size, pos in _chunks(f, 12, total):
            f.seek(pos)
            kind = f.read(4)
            for sid, ssize, spos in _chunks(f, pos + 4, pos + size):
                if kind == b'sdta' and sid == b'smpl':
                    smpl = np.memmap(path, dtype='<i2', mode='r', offset=spos, shape=(ssize // 2,))
                else:
                    f.seek(spos)
                    raw[(kind, sid)] = f.read(ssize)

    def records(sid, size):
        data = raw[(b'pdta', sid)]
        return [data[i:i + size] for i in range(0, len(data), size)]

    def zones(bag, gen, mod, first_bags):
        bags = [struct.unpack('<HH', r) for r in records(bag, 4)]
        gens = [(struct.unpack('<H', r[:2])[0], r[2:4]) for r in records(gen, 4)]
        mods = records(mod, 10)
        return [[Zone(gens[bags[b][0]:bags[b + 1][0]], mods[bags[b][1]:bags[b + 1][1]])
                 for b in range(first_bags[i], first_bags[i + 1])]
                for i in range(len(first_bags) - 1)]

    phdr = [(r[:20], struct.unpack(PRESET_FORMAT, r[20:38])) for r in records(b'phdr', 38)]
    preset_zones = zones(b'pbag', b'pgen', b'pmod', [hdr[2] for _, hdr in phdr])
    inst = records(b'inst', 22)
    inst_zones = zones(b'ibag', b'igen', b'imod', [struct.unpack('<H', r[20:22])[0] for r in inst])
    return {
        'smpl': smpl,
        'info': {sid: v for (kind, sid), v in raw.items() if kind == b'INFO'},
        'presets': [(name, hdr, preset_zones[i]) for i, (name, hdr) in enumerate(phdr[:-1])],
        'instruments': [(inst[i][:20], inst_zones[i]) for i in range(len(inst) - 1)],
        'samples': [Sample(r[:20], *struct.unpack(SAMPLE_FORMAT, r[20:46])) for r in records(b'shdr', 46)[:-1]],
    }


def _chunk(cid, data):
    return struct.pack('<4sI', cid, len(data)) + data + (b'\0' if len(data) & 1 else b'')


def _list(kind, body):
    return _chunk(b'LIST', kind + body)


def _name(name):
    return name.ljust(20, b'\0')[:20]


def _zone_chunks(groups):
    bag, gen, mod = bytearray(), bytearray(), bytearray()
    firsts = []
    gen_count = mod_count = 0
    for zones in groups:
        firsts.append(len(bag) // 4)
        for z in zones:
            bag += struct.pack('<HH', gen_count, mod_count)
            for op, amount in z.gens:
                gen += struct.pack('<H', op) + amount
                gen_count += 1
            for m in z.mods:
                mod += m
                mod_count += 1
    firsts.append(len(bag) // 4)
    bag += struct.pack('<HH', gen_count, mod_count)
    gen += b'\0' * 4
    mod += b'\0' * 10
    return bag, gen, mod, firsts


def write(path, info, presets, instruments, samples):
    """presets: [(name, header, zones)], instruments: [(name, zones)], samples: [Sample] whose
    link is an index into samples."""
    smpl, shdr = bytearray(), bytearray()
    for s in samples:
        start = len(smpl) // 2
        smpl += s.data.astype('<i2').tobytes() + b'\0' * 92  # 46 zero points, as the spec requires
        end = start + len(s.data)
        ls, le = (start + s.ls, start + s.le) if s.le > s.ls else (start, end)
        shdr += _name(s.name) + struct.pack(SAMPLE_FORMAT, start, end, ls, le, s.rate, s.pitch, s.corr, s.link, s.stype)
    shdr += _name(b'EOS') + b'\0' * 26

    pbag, pgen, pmod, pfirsts = _zone_chunks([zones for _, _, zones in presets])
    phdr = bytearray()
    for i, (name, hdr, _) in enumerate(presets):
        phdr += _name(name) + struct.pack(PRESET_FORMAT, hdr[0], hdr[1], pfirsts[i], hdr[3], hdr[4], hdr[5])
    phdr += _name(b'EOP') + struct.pack(PRESET_FORMAT, 0, 0, pfirsts[-1], 0, 0, 0)

    ibag, igen, imod, ifirsts = _zone_chunks([zones for _, zones in instruments])
    inst = bytearray()
    for i, (name, _) in enumerate(instruments):
        inst += _name(name) + struct.pack('<H', ifirsts[i])
    inst += _name(b'EOI') + struct.pack('<H', ifirsts[-1])

    pdta = b''.join(_chunk(k, v) for k, v in [
        (b'phdr', phdr), (b'pbag', pbag), (b'pmod', pmod), (b'pgen', pgen),
        (b'inst', inst), (b'ibag', ibag), (b'imod', imod), (b'igen', igen), (b'shdr', shdr)])
    body = (b'sfbk' + _list(b'INFO', b''.join(_chunk(k, v) for k, v in info))
            + _list(b'sdta', _chunk(b'smpl', bytes(smpl))) + _list(b'pdta', pdta))
    with open(path, 'wb') as f:
        f.write(b'RIFF' + struct.pack('<I', len(body)) + body)
