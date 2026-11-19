import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
  }
  return (c ^ 0xffffffff) >>> 0;
}

function makeChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  const combined = Buffer.concat([typeBuf, data]);
  crcBuf.writeUInt32BE(crc32(combined), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function encodePNG(width, height, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([
    sig,
    makeChunk('IHDR', ihdr),
    makeChunk('IDAT', idat),
    makeChunk('IEND', Buffer.alloc(0)),
  ]);
}

function drawIcon(size, { maskable = false } = {}) {
  const rgba = Buffer.alloc(size * size * 4);
  const bg = [15, 110, 82, 255]; // #0F6E52
  const white = [255, 255, 255, 255];
  const mint = [167, 243, 208, 255];

  const setPx = (x, y, col) => {
    if (x < 0 || y < 0 || x >= size || y >= size) return;
    const idx = (y * size + x) * 4;
    rgba[idx] = col[0];
    rgba[idx + 1] = col[1];
    rgba[idx + 2] = col[2];
    rgba[idx + 3] = col[3];
  };

  const radius = maskable ? 0 : size * 0.22;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let inside = true;
      if (radius > 0) {
        const cx = x < radius ? radius : x > size - radius ? size - radius : x;
        const cy = y < radius ? radius : y > size - radius ? size - radius : y;
        const dx = x - cx;
        const dy = y - cy;
        if (dx * dx + dy * dy > radius * radius) inside = false;
      }
      if (inside) {
        setPx(x, y, bg);
      }
    }
  }

  // Scale symbol safely inside 70% if maskable, 84% if standard
  const scale = maskable ? 0.64 : 0.78;
  const cx = size / 2;
  const cy = size / 2;
  const outerR = (size * scale) / 2;
  const innerR = outerR * 0.78;
  const dotR = outerR * 0.14;

  // Draw crisp ring + clock hands
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x - cx;
      const dy = y - cy;
      const dist = Math.hypot(dx, dy);

      // Outer ring
      if (dist <= outerR && dist >= innerR) {
        setPx(x, y, white);
      }

      // Center hub
      if (dist <= dotR) {
        setPx(x, y, white);
      }

      // 12 o'clock hand (vertical upward)
      if (Math.abs(dx) <= outerR * 0.08 && dy <= 0 && dy >= -innerR * 0.72) {
        setPx(x, y, white);
      }

      // 4 o'clock hand (mint accent)
      const angle = Math.atan2(dy, dx);
      const targetAngle = Math.PI / 5;
      if (
        dist >= dotR * 0.8 &&
        dist <= innerR * 0.64 &&
        Math.abs(angle - targetAngle) < 0.13
      ) {
        setPx(x, y, mint);
      }
    }
  }

  return encodePNG(size, size, rgba);
}

const outDir = path.resolve(process.cwd(), 'public');
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'pwa-192x192.png'), drawIcon(192));
fs.writeFileSync(path.join(outDir, 'pwa-512x512.png'), drawIcon(512));
fs.writeFileSync(path.join(outDir, 'pwa-maskable-512x512.png'), drawIcon(512, { maskable: true }));
fs.writeFileSync(path.join(outDir, 'apple-touch-icon.png'), drawIcon(180));
console.log('Generated PWA PNG icons in public/');
