"""Minimal SF2 reader/writer for 16-bit sound banks (no sm24)."""
import struct

GEN_KEYRANGE, GEN_VELRANGE, GEN_SAMPLEID, GEN_INSTRUMENT = 43, 44, 53, 41


def _chunks(f, start, end):
    pos = start
    while pos < end:
        f.seek(pos)
        cid, size = struct.unpack('<4sI', f.read(8))
        yield cid, size, pos + 8
        pos += 8 + size + (size & 1)


class Sample:
    def __init__(self, name, start, end, ls, le, rate, pitch, corr, link, stype):
        self.name, self.start, self.end = name, start, end
        self.ls, self.le, self.rate, self.pitch, self.corr = ls, le, rate, pitch, corr
        self.link, self.stype = link, stype
        self.data = None  # numpy int16


class Zone:
    def __init__(self, gens, mods):
        self.gens, self.mods = gens, mods  # gens: list of (op, amount_bytes)

    def get(self, op):
        for o, a in self.gens:
            if o == op:
                return a
        return None


def read(path):
    import numpy as np
    bank = {}
    with open(path, 'rb') as f:
        f.seek(0, 2); total = f.tell()
        for cid, size, pos in _chunks(f, 12, total):
            f.seek(pos); kind = f.read(4)
            for sid, ssize, spos in _chunks(f, pos + 4, pos + size):
                if kind == b'sdta' and sid == b'smpl':
                    bank['smpl'] = np.memmap(path, dtype='<i2', mode='r', offset=spos, shape=(ssize // 2,))
                else:
                    f.seek(spos); bank[(kind, sid)] = f.read(ssize)
    p = lambda sid: bank[(b'pdta', sid)]
    bank['info'] = {k[1]: v for k, v in bank.items() if isinstance(k, tuple) and k[0] == b'INFO'}

    def recs(sid, size):
        d = p(sid)
        return [d[i:i + size] for i in range(0, len(d), size)]

    def zones(bag, gen, mod, first_bags):
        bags = [struct.unpack('<HH', r) for r in recs(bag, 4)]
        gens = [(struct.unpack('<H', r[:2])[0], r[2:4]) for r in recs(gen, 4)]
        mods = recs(mod, 10)
        out = []
        for i in range(len(first_bags) - 1):
            zs = []
            for b in range(first_bags[i], first_bags[i + 1]):
                zs.append(Zone(gens[bags[b][0]:bags[b + 1][0]], mods[bags[b][1]:bags[b + 1][1]]))
            out.append(zs)
        return out

    phdr = recs(b'phdr', 38)
    presets = [(r[:20], struct.unpack('<HHHIII', r[20:38])) for r in phdr]
    pz = zones(b'pbag', b'pgen', b'pmod', [x[1][2] for x in presets])
    bank['presets'] = [(presets[i][0], presets[i][1], pz[i]) for i in range(len(presets) - 1)]
    inst = recs(b'inst', 22)
    iz = zones(b'ibag', b'igen', b'imod', [struct.unpack('<H', r[20:22])[0] for r in inst])
    bank['instruments'] = [(inst[i][:20], iz[i]) for i in range(len(inst) - 1)]
    bank['samples'] = [Sample(r[:20], *struct.unpack('<IIIIIBbHH', r[20:46])) for r in recs(b'shdr', 46)[:-1]]
    return bank


def _chunk(cid, data):
    return struct.pack('<4sI', cid, len(data)) + data + (b'\0' if len(data) & 1 else b'')


def _list(kind, body):
    return _chunk(b'LIST', kind + body)


def write(path, info, presets, instruments, samples):
    """presets: [(name20, (preset, bank, _, lib, genre, morph), zones)]; instruments: [(name20, zones)];
    samples: [Sample with .data int16 numpy] (link = index into samples)."""
    smpl = bytearray(); shdr = bytearray()
    for s in samples:
        start = len(smpl) // 2
        smpl += s.data.astype('<i2').tobytes() + b'\0' * 92  # 46 zero points after each sample
        end = start + len(s.data)
        ls, le = (start + s.ls, start + s.le) if s.le > s.ls else (start, end)
        shdr += s.name.ljust(20, b'\0')[:20] + struct.pack('<IIIIIBbHH', start, end, ls, le, s.rate, s.pitch, s.corr, s.link, s.stype)
    shdr += b'EOS'.ljust(20, b'\0') + b'\0' * 26

    def zone_chunks(groups):
        bag, gen, mod = bytearray(), bytearray(), bytearray()
        firsts = []
        ng = nm = 0
        for zs in groups:
            firsts.append(len(bag) // 4)
            for z in zs:
                bag += struct.pack('<HH', ng, nm)
                for op, amt in z.gens:
                    gen += struct.pack('<H', op) + amt; ng += 1
                for m in z.mods:
                    mod += m; nm += 1
        firsts.append(len(bag) // 4)
        bag += struct.pack('<HH', ng, nm)
        gen += b'\0' * 4
        mod += b'\0' * 10
        return bag, gen, mod, firsts

    pbag, pgen, pmod, pf = zone_chunks([z for _, _, z in presets])
    phdr = bytearray()
    for i, (name, hdr, _) in enumerate(presets):
        phdr += name.ljust(20, b'\0')[:20] + struct.pack('<HHHIII', hdr[0], hdr[1], pf[i], hdr[3], hdr[4], hdr[5])
    phdr += b'EOP'.ljust(20, b'\0') + struct.pack('<HHHIII', 0, 0, pf[-1], 0, 0, 0)
    ibag, igen, imod, ifs = zone_chunks([z for _, z in instruments])
    inst = bytearray()
    for i, (name, _) in enumerate(instruments):
        inst += name.ljust(20, b'\0')[:20] + struct.pack('<H', ifs[i])
    inst += b'EOI'.ljust(20, b'\0') + struct.pack('<H', ifs[-1])

    info_body = b''.join(_chunk(k, v) for k, v in info)
    pdta = b''.join(_chunk(k, v) for k, v in [(b'phdr', phdr), (b'pbag', pbag), (b'pmod', pmod), (b'pgen', pgen),
                                                (b'inst', inst), (b'ibag', ibag), (b'imod', imod), (b'igen', igen), (b'shdr', shdr)])
    body = b'sfbk' + _list(b'INFO', info_body) + _list(b'sdta', _chunk(b'smpl', bytes(smpl))) + _list(b'pdta', pdta)
    with open(path, 'wb') as f:
        f.write(b'RIFF' + struct.pack('<I', len(body)) + body)
