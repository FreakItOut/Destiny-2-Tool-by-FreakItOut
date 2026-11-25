'use strict';

// Synchronisiert die Standard-Edition in die Lenastheo Limited Edition.
// Aufruf: node tools/sync-le.js
// Branding bleibt erhalten; nur Quellcode, Tools, Docs und Plugin werden kopiert.

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const LE_ROOT = process.env.D2_LE_ROOT || path.resolve(ROOT, '..', 'Destiny 2 Tool Lenastheo Edition');
const BRANDING = JSON.parse(fs.readFileSync(path.join(ROOT, 'branding.json'), 'utf8'));
const STD_BRAND = BRANDING.std;
const LE_BRAND = BRANDING.le;

const EDITION_FILES = new Set([
  'renderer/brand.css',
  'renderer/pip.html',
  'renderer/postmaster.html',
  'renderer/xur.html',
  'renderer/xur.css',
  'package.json',
  'package-lock.json'
]);
// Lenastheo-Logo und daraus erzeugte Icons dürfen nicht von der
// Standard-Edition überschrieben werden.
const EDITION_ASSETS = new Set([
  'assets/icon.png',
  'assets/icon-32.png',
  'assets/icon-running.png',
  'assets/logo.png',
  'streamdeck/com.freakitout.d2tool.sdPlugin/imgs/action.png',
  'streamdeck/com.freakitout.d2tool.sdPlugin/imgs/key.png',
  'streamdeck/com.freakitout.d2tool.sdPlugin/imgs/plugin.png'
]);
const IGNORED = new Set(['node_modules', 'dist', 'Daten', '.git', 'result.json', 'verify-report.md', 'verify-run.log', 'build-run.log', 'run.log', 'LE-diff.txt', 'STD-diff.txt', 'baselines.json', 'visual']);
const BINARY_EXT = /\.(png|jpe?g|ico|exe|dll|node|woff2?|ttf)$/i;

function walk(dir, base = dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (IGNORED.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, base, out);
    else out.push(path.relative(base, full).replaceAll('\\', '/'));
  }
  return out;
}

function copyFile(relative, transform) {
  if (EDITION_FILES.has(relative)) return;
  const source = path.join(ROOT, relative);
  const target = path.join(LE_ROOT, relative);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  if (transform) {
    fs.writeFileSync(target, transform(fs.readFileSync(source, 'utf8')), 'utf8');
  } else {
    fs.copyFileSync(source, target);
  }
}

function brandMain(text) {
  return text
    .replace(`const APP_NAME = "${STD_BRAND.title}";`, `const APP_NAME = "${LE_BRAND.title}";`)
    .replace(/const APP_DATA_NAME = [^;]+;/, `const APP_DATA_NAME = "${LE_BRAND.appDataName}";`)
    .replace(`'${STD_BRAND.title} ist verbunden.'`, `'${LE_BRAND.title} ist verbunden.'`);
}

function brandTools(text) {
  return text.replace(`ctx.fillText("${STD_BRAND.title}"`, `ctx.fillText("${LE_BRAND.title}"`);
}

function brandIndex(text) {
  return text
    .replace(`<title>${STD_BRAND.title}</title>`, `<title>${LE_BRAND.title}</title>`)
    .replace(`<span class="brand-name">${STD_BRAND.title}</span>`, `<span class="brand-name">${LE_BRAND.title}</span>`);
}

function brandSettings(text) {
  return text.replace(`'Testnachricht aus ${STD_BRAND.title}.'`, `'Testnachricht aus ${LE_BRAND.title}.'`);
}

function syncPackageJson() {
  const std = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  const lePath = path.join(LE_ROOT, 'package.json');
  const le = JSON.parse(fs.readFileSync(lePath, 'utf8'));
  le.scripts = std.scripts;
  le.dependencies = std.dependencies;
  le.devDependencies = std.devDependencies;
  le.build = { ...std.build, appId: le.build && le.build.appId ? le.build.appId : LE_BRAND.appId, productName: le.build && le.build.productName ? le.build.productName : LE_BRAND.productName };
  fs.writeFileSync(lePath, `${JSON.stringify(le, null, 2)}\n`, 'utf8');
}

function main() {
  if (!fs.existsSync(LE_ROOT)) {
    console.error(`LE nicht gefunden: ${LE_ROOT}`);
    process.exit(1);
  }
  if (/lenastheo/i.test(ROOT)) {
    console.error('sync-le.js muss aus der Standard-Edition gestartet werden.');
    process.exit(1);
  }
  let count = 0;
  for (const dir of ['electron', 'renderer', 'assets', 'tools', 'docs', 'streamdeck']) {
    for (const relative of walk(path.join(ROOT, dir))) {
      const full = `${dir}/${relative}`;
      if (EDITION_FILES.has(full) || EDITION_ASSETS.has(full)) continue;
      if (BINARY_EXT.test(relative)) {
        const source = path.join(ROOT, full);
        const target = path.join(LE_ROOT, full);
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.copyFileSync(source, target);
      } else if (full === 'electron/main.js') {
        copyFile(full, brandMain);
      } else if (full === 'renderer/index.html') {
        copyFile(full, brandIndex);
      } else if (full === 'renderer/js/settings.js') {
        copyFile(full, brandSettings);
      } else if (full === 'renderer/js/tools.js') {
        copyFile(full, brandTools);
      } else {
        copyFile(full);
      }
      count += 1;
    }
  }
  syncPackageJson();
  try {
    fs.copyFileSync(path.join(ROOT, 'branding.json'), path.join(LE_ROOT, 'branding.json'));
  } catch (error) {
    console.warn('branding.json konnte nicht kopiert werden:', error.message || String(error));
  }
  try {
    const readme = fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8')
      .replace(`# ${STD_BRAND.title}`, `# ${LE_BRAND.title}`)
      .replaceAll(`%APPDATA%\\${STD_BRAND.appDataName}`, `%APPDATA%\\${LE_BRAND.appDataName}`);
    fs.writeFileSync(path.join(LE_ROOT, 'README.md'), readme, 'utf8');
  } catch (error) {
    console.warn('README konnte nicht synchronisiert werden:', error.message || String(error));
  }
  const pluginModules = path.join('streamdeck', 'com.freakitout.d2tool.sdPlugin', 'node_modules');
  if (!fs.existsSync(path.join(LE_ROOT, pluginModules)) && fs.existsSync(path.join(ROOT, pluginModules))) {
    fs.cpSync(path.join(ROOT, pluginModules), path.join(LE_ROOT, pluginModules), { recursive: true });
  }
  console.log(`LE synchronisiert: ${count} Dateien + package.json`);
  console.log('Danach: node tools/edition-parity-test.js und Tests in beiden Editionen.');
}

main();
