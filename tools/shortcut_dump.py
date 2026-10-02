"""Rozbalí podpísaný .shortcut súbor z iPhonu (AEA1 -> LZFSE -> Apple Archive -> plist) a vypíše akcie.

Použitie: python tools/shortcut_dump.py "Makrá zo Zdravia.shortcut"
Čistý Python (bez knižníc), podľa referenčnej implementácie LZFSE od Apple.
"""
import json
import plistlib
import struct
import sys

# ---------------- LZFSE ----------------
L_SYM, M_SYM, D_SYM, LIT_SYM = 20, 20, 64, 256
L_STATES, M_STATES, D_STATES, LIT_STATES = 64, 64, 256, 1024
L_EXTRA = [0] * 16 + [2, 3, 5, 8]
L_BASE = list(range(16)) + [16, 20, 28, 60]
M_EXTRA = [0] * 16 + [3, 5, 8, 11]
M_BASE = list(range(16)) + [16, 24, 56, 312]
D_EXTRA = [0, 0, 0, 0] + [((i - 4) // 4) + 1 for i in range(4, 64)]
D_BASE = [0, 1, 2, 3, 4, 6, 8, 10, 12, 16, 20, 24, 28, 36, 44, 52, 60, 76, 92, 108, 124, 156, 188, 220,
          252, 316, 380, 444, 508, 636, 764, 892, 1020, 1276, 1532, 1788, 2044, 2556, 3068, 3580, 4092,
          5116, 6140, 7164, 8188, 10236, 12284, 14332, 16380, 20476, 24572, 28668, 32764, 40956, 49148,
          57340, 65532, 81916, 98300, 114684, 131068, 163836, 196604, 229372]

FREQ_NBITS = [2, 3, 2, 5, 2, 3, 2, 8, 2, 3, 2, 5, 2, 3, 2, 14] * 2
FREQ_VALUE = [0, 2, 1, 4, 0, 3, 1, -1, 0, 2, 1, 5, 0, 3, 1, -1, 0, 2, 1, 6, 0, 3, 1, -1, 0, 2, 1, 7, 0, 3, 1, -1]


def clz32(x):
    return 32 - x.bit_length()


def field(v, off, n):
    return (v >> off) & ((1 << n) - 1)


def freq_value(bits):
    b = bits & 31
    n = FREQ_NBITS[b]
    if n == 8:
        return 8 + ((bits >> 4) & 0xF), n
    if n == 14:
        return 24 + ((bits >> 4) & 0x3FF), n
    return FREQ_VALUE[b], n


def decoder_table(nstates, freq):
    t = []
    nclz = clz32(nstates)
    for sym, f in enumerate(freq):
        if not f:
            continue
        k = clz32(f) - nclz
        j0 = ((2 * nstates) >> k) - f
        for j in range(f):
            if j < j0:
                t.append((k, sym, ((f + j) << k) - nstates))
            else:
                t.append((k - 1, sym, (j - j0) << (k - 1)))
    return t


def value_table(nstates, freq, vbits, vbase):
    t = []
    nclz = clz32(nstates)
    for sym, f in enumerate(freq):
        if not f:
            continue
        k = clz32(f) - nclz
        j0 = ((2 * nstates) >> k) - f
        for j in range(f):
            if j < j0:
                t.append((k + vbits[sym], vbits[sym], ((f + j) << k) - nstates, vbase[sym]))
            else:
                t.append((k - 1 + vbits[sym], vbits[sym], (j - j0) << (k - 1), vbase[sym]))
    return t


class BackStream:
    """FSE bitový prúd čítaný odzadu (64-bit verzia)."""

    def __init__(self, buf, start, end, n):
        self.buf, self.start = buf, start
        if n:
            self.pos = end - 8
            self.accum = int.from_bytes(buf[self.pos:end], 'little')
            self.nbits = n + 64
        else:
            self.pos = end - 7
            self.accum = int.from_bytes(buf[self.pos:end], 'little')
            self.nbits = n + 56
        if self.pos < start or not (56 <= self.nbits < 64) or (self.accum >> self.nbits):
            raise ValueError('zlý FSE prúd')

    def flush(self):
        nb = (63 - self.nbits) & -8
        p = self.pos - (nb >> 3)
        if p < self.start:
            raise ValueError('FSE mimo rozsah')
        self.pos = p
        incoming = int.from_bytes(self.buf[p:p + 8], 'little') & ((1 << nb) - 1)
        self.accum = ((self.accum << nb) | incoming) & ((1 << 64) - 1)
        self.nbits += nb

    def pull(self, n):
        self.nbits -= n
        r = self.accum >> self.nbits
        self.accum &= (1 << self.nbits) - 1
        return r


def lzfse_decode(src):
    out = bytearray()
    i = 0
    while True:
        magic = src[i:i + 4]
        if magic == b'bvx$':
            return bytes(out)
        if magic == b'bvx-':
            n = struct.unpack_from('<I', src, i + 4)[0]
            out += src[i + 8:i + 8 + n]
            i += 8 + n
            continue
        if magic != b'bvx2':
            raise ValueError(f'nepodporovaný blok {magic!r}')
        n_raw = struct.unpack_from('<I', src, i + 4)[0]
        v0, v1, v2 = struct.unpack_from('<QQQ', src, i + 8)
        n_literals = field(v0, 0, 20)
        n_lit_payload = field(v0, 20, 20)
        n_matches = field(v0, 40, 20)
        literal_bits = field(v0, 60, 3) - 7
        lit_states = [field(v1, k * 10, 10) for k in range(4)]
        n_lmd_payload = field(v1, 40, 20)
        lmd_bits = field(v1, 60, 3) - 7
        header_size = field(v2, 0, 32)
        l_state, m_state, d_state = field(v2, 32, 10), field(v2, 42, 10), field(v2, 52, 10)

        # frekvenčné tabuľky
        freqs = []
        p, end = i + 32, i + header_size
        accum = nacc = 0
        for _ in range(L_SYM + M_SYM + D_SYM + LIT_SYM):
            while p < end and nacc + 8 <= 32:
                accum |= src[p] << nacc
                nacc += 8
                p += 1
            v, nb = freq_value(accum)
            freqs.append(v)
            accum >>= nb
            nacc -= nb
        lf, mf, df, litf = freqs[:20], freqs[20:40], freqs[40:104], freqs[104:]

        lit_t = decoder_table(LIT_STATES, litf)
        l_t = value_table(L_STATES, lf, L_EXTRA, L_BASE)
        m_t = value_table(M_STATES, mf, M_EXTRA, M_BASE)
        d_t = value_table(D_STATES, df, D_EXTRA, D_BASE)

        # literály
        pay = i + header_size
        s = BackStream(src, 0, pay + n_lit_payload, literal_bits)  # ako v referencii: hranica = začiatok vstupu
        lits = bytearray()
        st = lit_states[:]
        for _ in range(0, n_literals, 4):
            s.flush()
            for k in range(4):
                nb, sym, delta = lit_t[st[k]]
                st[k] = delta + s.pull(nb)
                lits.append(sym)

        # L, M, D
        lmd0 = pay + n_lit_payload
        s = BackStream(src, 0, lmd0 + n_lmd_payload, lmd_bits)
        lp = 0
        D = -1
        for _ in range(n_matches):
            s.flush()
            vals = []
            for tbl, state_name in ((l_t, 'l'), (m_t, 'm'), (d_t, 'd')):
                state = {'l': l_state, 'm': m_state, 'd': d_state}[state_name]
                tot, vb, delta, vbase = tbl[state]
                x = s.pull(tot)
                new_state = delta + (x >> vb)
                if state_name == 'l':
                    l_state = new_state
                elif state_name == 'm':
                    m_state = new_state
                else:
                    d_state = new_state
                vals.append(vbase + (x & ((1 << vb) - 1)))
            L, M, nd = vals
            D = nd if nd else D
            out += lits[lp:lp + L]
            lp += L
            for _ in range(M):
                out.append(out[-D])
        i = lmd0 + n_lmd_payload
        _ = n_raw


# ---------------- Apple Archive ----------------
def apple_archive(data):
    files = {}
    i = 0
    while i < len(data) and data[i:i + 4] == b'AA01':
        hsize = struct.unpack_from('<H', data, i + 4)[0]
        p, end = i + 6, i + hsize
        path, blob = None, 0
        while p < end:
            key, t = data[p:p + 3].decode(), chr(data[p + 3])
            p += 4
            if t in '1248':
                n = int(t)
                p += n
            elif t == 'P':
                n = struct.unpack_from('<H', data, p)[0]
                val = data[p + 2:p + 2 + n].decode('utf-8', 'replace')
                if key == 'PAT':
                    path = val
                p += 2 + n
            elif t in 'ABC':
                n = {'A': 2, 'B': 4, 'C': 8}[t]
                size = int.from_bytes(data[p:p + n], 'little')
                if key == 'DAT':
                    blob = size
                p += n
            elif t == 'T':
                p += 12
            elif t == 'S':
                p += 8
            elif t == 'F':
                pass
            else:
                raise ValueError(f'neznámy typ poľa {key}{t}')
        files[path] = data[end:end + blob]
        i = end + blob
    return files


def main(path):
    b = open(path, 'rb').read()
    if b[:4] == b'AEA1':
        off = struct.unpack_from('<I', b, 8)[0] + 0x495C
        aa = apple_archive(lzfse_decode(b[off:]))
        wf = next(v for k, v in aa.items() if k and k.endswith('.wflow'))
    else:
        wf = b
    plist = plistlib.loads(wf)
    print(json.dumps(plist, ensure_ascii=False, indent=1, default=lambda o: o.hex() if isinstance(o, bytes) else str(o)))


if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8')
    main(sys.argv[1])
