// ============================================================
// App-Icon aus dem FreakItOut-Logo erzeugen.
// ============================================================
// Aufruf:  electron tools/make-icon.js
//
// Quelle:  build/icon-source.jpg (quadratisch, mind. 512 px)
// Ziele:   build/icon.ico, assets/icon.png,
//          assets/icon-32.png, assets/icon-running.png
//
// Das Skript läuft absichtlich unter Electron, damit ohne zusätzliche
// Bild-Bibliotheken skaliert werden kann (nativeImage). Die ICO-Datei
// wird als Container mit PNG-Einträgen geschrieben; Windows 10/11
// unterstützt das für alle Größen.

const fs = require('node:fs');
const path = require('node:path');
const { app, nativeImage } = require('electron');

const root = path.join(__dirname, '..');
const source = path.join(root, 'build', 'icon-source.jpg');
const icoSizes = [16, 24, 32, 48, 64, 128, 256];
const output = {
  ico: path.join(root, 'build', 'icon.ico'),
  png: path.join(root, 'assets', 'icon.png'),
  png32: path.join(root, 'assets', 'icon-32.png'),
  running32: path.join(root, 'assets', 'icon-running.png')
};

function clamp(value, min, max) {
  return value < min ? min : value > max ? max : value;
}

// Abgerundete Ecken mit weicher Kante (Radius ~18 %).
function roundCorners(image, size) {
  const bitmap = image.toBitmap();
  const radius = Math.max(1, size * 0.18);
  const stride = size * 4;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const dx = x < radius ? radius - x : x >= size - radius ? x - (size - radius - 1) : 0;
      const dy = y < radius ? radius - y : y >= size - radius ? y - (size - radius - 1) : 0;
      let alpha = 1;
      if (dx > 0 && dy > 0) {
        const distance = Math.hypot(dx, dy);
        alpha = clamp(radius - distance + 0.5, 0, 1);
      }
      if (alpha >= 1) continue;
      const offset = y * stride + x * 4;
      if (alpha <= 0) {
        bitmap[offset] = 0;
        bitmap[offset + 1] = 0;
        bitmap[offset + 2] = 0;
        bitmap[offset + 3] = 0;
      } else {
        bitmap[offset] = Math.round(bitmap[offset] * alpha);
        bitmap[offset + 1] = Math.round(bitmap[offset + 1] * alpha);
        bitmap[offset + 2] = Math.round(bitmap[offset + 2] * alpha);
        bitmap[offset + 3] = Math.round(alpha * 255);
      }
    }
  }
  return nativeImage.createFromBitmap(bitmap, { width: size, height: size });
}

// Grüner Status-Punkt unten rechts für das laufende Spiel.
function addRunningDot(image, size) {
  const bitmap = image.toBitmap();
  const cx = size * 0.78;
  const cy = size * 0.78;
  const radius = size * 0.21;
  const ring = Math.max(1, size * 0.035);
  const stride = size * 4;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const distance = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
      if (distance > radius + ring) continue;
      let r;
      let g;
      let b;
      if (distance > radius) {
        r = 7; g = 12; b = 20;
      } else {
        r = 46; g = 227; b = 106;
      }
      const edge = distance > radius ? clamp(radius + ring - distance, 0, 1) : clamp(radius - distance + 0.5, 0, 1);
      const offset = y * stride + x * 4;
      const a = Math.round(edge * 255);
      const blend = edge;
      bitmap[offset] = Math.round(bitmap[offset] * (1 - blend) + b * blend);
      bitmap[offset + 1] = Math.round(bitmap[offset + 1] * (1 - blend) + g * blend);
      bitmap[offset + 2] = Math.round(bitmap[offset + 2] * (1 - blend) + r * blend);
      bitmap[offset + 3] = Math.max(bitmap[offset + 3], a);
    }
  }
  return nativeImage.createFromBitmap(bitmap, { width: size, height: size });
}

function buildIco(entries) {
  const count = entries.length;
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(count, 4);
  const directory = Buffer.alloc(count * 16);
  let offset = 6 + count * 16;
  entries.forEach((entry, index) => {
    const at = index * 16;
    directory.writeUInt8(entry.size >= 256 ? 0 : entry.size, at);
    directory.writeUInt8(entry.size >= 256 ? 0 : entry.size, at + 1);
    directory.writeUInt8(0, at + 2);
    directory.writeUInt8(0, at + 3);
    directory.writeUInt16LE(1, at + 4);
    directory.writeUInt16LE(32, at + 6);
    directory.writeUInt32LE(entry.png.length, at + 8);
    directory.writeUInt32LE(offset, at + 12);
    offset += entry.png.length;
  });
  return Buffer.concat([header, directory, ...entries.map((entry) => entry.png)]);
}

app.whenReady().then(() => {
  try {
    if (!fs.existsSync(source)) throw new Error(`Quelle fehlt: ${source}`);
    const base = nativeImage.createFromPath(source);
    if (base.isEmpty()) throw new Error('Quelle konnte nicht gelesen werden.');
    const size = base.getSize();
    if (size.width !== size.height) throw new Error('Quelle muss quadratisch sein.');

    const make = (pixels, running) => {
      let image = base.resize({ width: pixels, height: pixels, quality: 'best' });
      image = roundCorners(image, pixels);
      if (running) image = addRunningDot(image, pixels);
      return image;
    };

    const entries = icoSizes.map((pixels) => ({ size: pixels, png: make(pixels, false).toPNG() }));
    fs.writeFileSync(output.ico, buildIco(entries));
    fs.writeFileSync(output.png, make(512, false).toPNG());
    fs.writeFileSync(output.png32, make(32, false).toPNG());
    fs.writeFileSync(output.running32, make(32, true).toPNG());

    console.log(`Icon geschrieben: ${output.ico} (${icoSizes.join(', ')} px)`);
    console.log(`Icon geschrieben: ${output.png}, ${output.png32}, ${output.running32}`);
    app.exit(0);
  } catch (error) {
    console.error(`Icon konnte nicht erzeugt werden: ${error.message}`);
    app.exit(1);
  }
});
