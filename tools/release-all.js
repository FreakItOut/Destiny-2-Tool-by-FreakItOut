'use strict';

// Komplette Release-Kette für beide Editionen:
// Sync → optionale Baselines → Verify STD/LE → Build STD/LE →
// Portable-Smoke → Testversion → Hashes.
// Aufruf: npm run release:all
//         npm run release:all -- --skip-verify
//         npm run release:all -- --skip-build
//         npm run release:all -- --baselines

const { spawnSync } = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const IS_LE = /lenastheo/i.test(path.basename(ROOT));
const STD_ROOT = IS_LE ? path.resolve(ROOT, '..', 'Destiny 2 Tool') : ROOT;
const LE_ROOT = process.env.D2_LE_ROOT || (IS_LE ? ROOT : path.resolve(ROOT, '..', 'Destiny 2 Tool Lenastheo Edition'));
const TEST_ROOT = path.resolve(STD_ROOT, '..', 'Destiny 2 Tool Lenastheo Testversion');
const args = process.argv.slice(2);
const skipVerify = args.includes('--skip-verify');
const skipBuild = args.includes('--skip-build');
const updateBaselines = args.includes('--baselines');
const report = [];
const startedAll = Date.now();

function run(step, cwd, script, timeout = 1800000) {
  const started = Date.now();
  console.log(`\n=== ${step} …`);
  const result = spawnSync('cmd.exe', ['/c', script], {
    cwd,
    encoding: 'utf8',
    timeout,
    windowsHide: true,
    env: { ...process.env, FORCE_COLOR: '0', D2_TEST_MONITOR: process.env.D2_TEST_MONITOR || 'right' }
  });
  const ms = Date.now() - started;
  const output = `${result.stdout || ''}${result.stderr || ''}`.trim();
  const ok = result.status === 0;
  report.push({ step, ok, ms, output });
  console.log(`    ${ok ? 'OK' : 'FEHLER'} · ${(ms / 1000).toFixed(1)} s`);
  if (!ok) {
    console.error(output.split(/\r?\n/).slice(-30).join('\n'));
    throw new Error(step);
  }
  return output;
}

function sha(file) {
  try { return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'); } catch (error) { return ''; }
}

try {
  if (updateBaselines) run('Baselines aktualisieren', STD_ROOT, 'npm run baselines:update');
  run('LE synchronisieren', STD_ROOT, 'node tools/sync-le.js', 300000);
  if (!skipVerify) {
    run('Verifikation STD', STD_ROOT, 'npm run verify');
    if (fs.existsSync(LE_ROOT)) run('Verifikation LE', LE_ROOT, 'npm run verify');
  }
  if (!skipBuild) {
    run('Build STD', STD_ROOT, 'npm run dist');
    run('Portable-Smoke STD', STD_ROOT, 'node tools/portable-smoke-test.js', 300000);
    if (fs.existsSync(LE_ROOT)) {
      run('Build LE', LE_ROOT, 'npm run dist');
      run('Portable-Smoke LE', LE_ROOT, 'node tools/portable-smoke-test.js', 300000);
    }
    run('Testversion aktualisieren', STD_ROOT, 'node tools/update-testversion.js', 300000);
  }
  run('SBOM erzeugen', STD_ROOT, 'node tools/make-sbom.js', 60000);
  run('Prüfsummen aktualisieren', STD_ROOT, 'node tools/make-checksums.js', 60000);
  run('Release-Check', STD_ROOT, 'node tools/release-check.js', 120000);

  const appVersion = JSON.parse(fs.readFileSync(path.join(STD_ROOT, 'package.json'), 'utf8')).version;
  const stdExe = path.join(STD_ROOT, 'dist', `Destiny 2 Tool by FreakItOut ${appVersion}.exe`);
  const leExe = path.join(LE_ROOT, 'dist', `Destiny 2 Tool by FreakItOut Lenastheo Limited Edition ${appVersion}.exe`);
  const testExe = path.join(TEST_ROOT, 'Lenastheo Testversion.exe');
  const plugin = path.join(STD_ROOT, 'dist', 'com.freakitout.d2tool.streamDeckPlugin');
  const hashes = {
    std: sha(stdExe),
    le: sha(leExe),
    test: sha(testExe),
    plugin: sha(plugin)
  };
  console.log('\n=== Hashes ===');
  console.log(`STD  ${hashes.std}`);
  console.log(`LE   ${hashes.le}`);
  console.log(`TEST ${hashes.test}`);
  console.log(`PLUG ${hashes.plugin}`);

  const lines = [
    '# Release-Bericht',
    '',
    `Stand: ${new Date().toLocaleString('de-DE')}  `,
    `Dauer: ${((Date.now() - startedAll) / 1000).toFixed(1)} s  `,
    '',
    '| Schritt | Status | Dauer |',
    '|---|---|---|',
    ...report.map((entry) => `| ${entry.step} | ${entry.ok ? '✅' : '❌'} | ${(entry.ms / 1000).toFixed(1)} s |`),
    '',
    '## Hashes',
    '',
    '```',
    `STD  ${hashes.std}`,
    `LE   ${hashes.le}`,
    `TEST ${hashes.test}`,
    `PLUG ${hashes.plugin}`,
    '```',
    ''
  ];
  fs.writeFileSync(path.join(STD_ROOT, 'release-report.md'), lines.join('\n'), 'utf8');
  console.log(`\nBericht: ${path.relative(STD_ROOT, path.join(STD_ROOT, 'release-report.md'))}`);
  console.log(`RELEASE OK in ${((Date.now() - startedAll) / 1000).toFixed(1)} s.`);
} catch (error) {
  console.error(`\nRELEASE ABGEBROCHEN: ${error.message || String(error)}`);
  process.exit(1);
}
