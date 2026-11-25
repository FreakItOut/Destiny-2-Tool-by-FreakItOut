'use strict';

// ============================================================
// Icon-Generator
// ============================================================
// Erzeugt ohne externe Abhängigkeiten ein PNG-Icon (256 px und
// 32 px) sowie eine Windows-ICO-Datei mit mehreren Größen.
// Aufruf: npm run icons
// ============================================================

const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const ROOT = path.join(__dirname, '..');
const ASSETS = path.join(ROOT, 'assets');
const BUILD = path.join(ROOT, 'build');

// ------------------------------------------------------------
// PNG
// ------------------------------------------------------------

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buffer) {
  let crc = 0xffffffff;
  for (let i = 0; i < buffer.length; i += 1) crc = CRC_TABLE[(crc ^ buffer[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuffer = Buffer.from(type, 'ascii');
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);
  return Buffer.concat([length, typeBuffer, data, crc]);
}

function encodePng(size, pixels) {
  const stride = size * 4;
  const raw = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y += 1) {
    raw[y * (stride + 1)] = 0; // Filter: keiner
    pixels.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // 8 Bit pro Kanal
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

// ------------------------------------------------------------
// Zeichnen
// ------------------------------------------------------------

function clamp01(value) {
  return Math.min(1, Math.max(0, value));
}

function mix(a, b, t) {
  const k = clamp01(t);
  return a + (b - a) * k;
}

function sdRoundRect(px, py, half, radius) {
  const qx = Math.abs(px - 0.5) - (half - radius);
  const qy = Math.abs(py - 0.5) - (half - radius);
  const outside = Math.hypot(Math.max(qx, 0), Math.max(qy, 0));
  return outside + Math.min(Math.max(qx, qy), 0) - radius;
}

function inDisc(px, py, cx, cy, radius) {
  return Math.hypot(px - cx, py - cy) <= radius;
}

function inRect(px, py, x0, y0, x1, y1) {
  return px >= x0 && px <= x1 && py >= y0 && py <= y1;
}

function starAmount(px, py, cx, cy, size) {
  // Vierstrahliger Stern mit konkaven Kanten.
  const dx = Math.abs(px - cx) / size;
  const dy = Math.abs(py - cy) / size;
  if (dx > 1 || dy > 1) return 0;
  const value = Math.sqrt(dx) + Math.sqrt(dy);
  if (value > 1) return 0;
  return clamp01((1 - value) * 2.4);
}

function shade(px, py) {
  // Hintergrund: dunkles Blau mit weichem Licht oben links.
  let r = mix(7, 19, py);
  let g = mix(10, 28, py);
  let b = mix(17, 51, py);

  const glow = clamp01(1 - Math.hypot(px - 0.28, py - 0.2) / 0.8);
  r += 12 * glow;
  g += 34 * glow;
  b += 66 * glow;

  const purple = clamp01(1 - Math.hypot(px - 0.96, py - 0.04) / 0.7);
  r += 26 * purple;
  g += 10 * purple;
  b += 38 * purple;

  const edge = sdRoundRect(px, py, 0.5, 0.225);
  if (edge > -0.014) {
    r += 40;
    g += 44;
    b += 50;
  }

  // D aus zwei Rechtecken und zwei Kreisen (außen minus innen).
  const outer =
    inRect(px, py, 0.285, 0.215, 0.585, 0.785) || inDisc(px, py, 0.585, 0.5, 0.285);
  const inner =
    inRect(px, py, 0.392, 0.338, 0.585, 0.662) || inDisc(px, py, 0.585, 0.5, 0.162);
  if (outer && !inner) {
    const t = clamp01((py - 0.215) / 0.57);
    let dr = mix(170, 63, t);
    let dg = mix(225, 145, t);
    let db = mix(255, 224, t);
    const shine = clamp01(1 - Math.hypot(px - 0.35, py - 0.33) / 0.42);
    dr = mix(dr, 232, shine * 0.5);
    dg = mix(dg, 248, shine * 0.5);
    db = mix(db, 255, shine * 0.5);
    r = dr;
    g = dg;
    b = db;
  }

  // Goldener Stern als Akzent.
  const star = starAmount(px, py, 0.757, 0.287, 0.064);
  if (star > 0) {
    const halo = starAmount(px, py, 0.757, 0.287, 0.15) * 0.35;
    r = mix(r, 240, star) + 60 * halo;
    g = mix(g, 198, star) + 42 * halo;
    b = mix(b, 107, star) + 8 * halo;
  }

  // Vignette
  const distance = Math.hypot(px - 0.5, py - 0.5) / 0.72;
  const vignette = 1 - 0.22 * clamp01(distance) * clamp01(distance);
  return [r * vignette, g * vignette, b * vignette];
}

function render(size) {
  const SS = size <= 64 ? 4 : 2;
  const W = size * SS;
  const pixels = Buffer.alloc(size * size * 4);

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let aSum = 0;
      let rSum = 0;
      let gSum = 0;
      let bSum = 0;
      for (let sy = 0; sy < SS; sy += 1) {
        for (let sx = 0; sx < SS; sx += 1) {
          const px = (x * SS + sx + 0.5) / W;
          const py = (y * SS + sy + 0.5) / W;
          const d = sdRoundRect(px, py, 0.5, 0.225);
          // 1 Pixel weiche Kante für glättende Rundungen.
          const alpha = clamp01(-d * W * 0.9 + 0.5);
          if (alpha <= 0) continue;
          const [r, g, b] = shade(px, py);
          aSum += alpha;
          rSum += r * alpha;
          gSum += g * alpha;
          bSum += b * alpha;
        }
      }
      const index = (y * size + x) * 4;
      if (aSum <= 0) {
        pixels[index] = 0;
        pixels[index + 1] = 0;
        pixels[index + 2] = 0;
        pixels[index + 3] = 0;
      } else {
        pixels[index] = Math.round(clamp01(rSum / aSum / 255) * 255);
        pixels[index + 1] = Math.round(clamp01(gSum / aSum / 255) * 255);
        pixels[index + 2] = Math.round(clamp01(bSum / aSum / 255) * 255);
        pixels[index + 3] = Math.round(clamp01(aSum / (SS * SS)) * 255);
      }
    }
  }
  return pixels;
}

// ------------------------------------------------------------
// ICO
// ------------------------------------------------------------

function encodeIco(sizes) {
  const images = sizes.map((size) => encodePng(size, render(size)));
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);

  const entries = [];
  let offset = 6 + images.length * 16;
  for (let i = 0; i < images.length; i += 1) {
    const size = sizes[i];
    const data = images[i];
    const entry = Buffer.alloc(16);
    entry[0] = size >= 256 ? 0 : size;
    entry[1] = size >= 256 ? 0 : size;
    entry[2] = 0;
    entry[3] = 0;
    entry.writeUInt16LE(1, 4);
    entry.writeUInt16LE(32, 6);
    entry.writeUInt32LE(data.length, 8);
    entry.writeUInt32LE(offset, 12);
    entries.push(entry);
    offset += data.length;
  }
  return Buffer.concat([header, ...entries, ...images]);
}

// ------------------------------------------------------------
// Schreiben
// ------------------------------------------------------------

function main() {
  fs.mkdirSync(ASSETS, { recursive: true });
  fs.mkdirSync(BUILD, { recursive: true });

  const large = encodePng(256, render(256));
  const small = encodePng(32, render(32));
  fs.writeFileSync(path.join(ASSETS, 'icon.png'), large);
  fs.writeFileSync(path.join(ASSETS, 'icon-32.png'), small);
  fs.writeFileSync(path.join(BUILD, 'icon.ico'), encodeIco([16, 24, 32, 48, 64, 128, 256]));

  console.log(`assets/icon.png      ${large.length} Bytes`);
  console.log(`assets/icon-32.png   ${small.length} Bytes`);
  console.log('build/icon.ico       erstellt');
}

main();
