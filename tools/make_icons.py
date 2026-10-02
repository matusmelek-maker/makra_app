"""Vygeneruje PNG ikony (bez externých knižníc)."""
import math, struct, zlib, os

def png(path, size):
    S = 4  # supersampling
    bg, fg = (14, 124, 102), (255, 255, 255)
    rows = []
    for y in range(size):
        row = bytearray([0])
        for x in range(size):
            acc = [0, 0, 0]
            for sy in range(S):
                for sx in range(S):
                    px = (x + (sx + .5) / S) / size * 512
                    py = (y + (sy + .5) / S) / size * 512
                    dx, dy = px - 256, py - 256
                    r = math.hypot(dx, dy)
                    ang = (math.degrees(math.atan2(dx, -dy)) + 360) % 360  # 0 = hore, v smere hodín
                    c = bg
                    if abs(r - 150) <= 22:
                        c = fg if ang <= 290 else tuple(int(b + (f - b) * .25) for b, f in zip(bg, fg))
                    if r <= 42:
                        c = fg
                    for i in range(3): acc[i] += c[i]
            row += bytes(int(v / (S * S)) for v in acc)
        rows.append(bytes(row))
    raw = zlib.compress(b''.join(rows), 9)
    def chunk(t, d): return struct.pack('>I', len(d)) + t + d + struct.pack('>I', zlib.crc32(t + d) & 0xffffffff)
    with open(path, 'wb') as f:
        f.write(b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', size, size, 8, 2, 0, 0, 0)) + chunk(b'IDAT', raw) + chunk(b'IEND', b''))

here = os.path.join(os.path.dirname(__file__), '..', 'icons')
for s in (180, 192, 512):
    png(os.path.join(here, f'icon-{s}.png'), s)
print('ok')
