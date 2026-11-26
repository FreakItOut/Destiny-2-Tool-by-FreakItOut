'use strict';

// Einmalige Übernahme von Daten aus dem Programmordner einer älteren
// Installationsversion nach %APPDATA%.

const fs = require('node:fs');
const path = require('node:path');

function migrateInstalledDataToAppData(options = {}) {
  const userDataDir = String(options.userDataDir || '');
  const exeDir = options.exeDir || path.dirname(process.execPath);
  if (!userDataDir) return { ok: false, copied: false, reason: 'Kein Zielordner.' };
  const oldData = path.join(exeDir, 'Daten');
  const oldConfig = path.join(oldData, 'config.json');
  if (!fs.existsSync(oldConfig)) return { ok: true, copied: false, reason: 'Keine alten Daten.' };
  const targetConfig = path.join(userDataDir, 'config.json');
  if (fs.existsSync(targetConfig)) return { ok: true, copied: false, reason: 'Ziel bereits vorhanden.' };
  try {
    fs.mkdirSync(userDataDir, { recursive: true });
    fs.copyFileSync(oldConfig, targetConfig);
    try {
      if (!fs.existsSync(`${targetConfig}.bak`)) fs.copyFileSync(oldConfig, `${targetConfig}.bak`);
    } catch (error) {
      // Backup ist optional.
    }
    try {
      const oldBackups = path.join(oldData, 'backups');
      const targetBackups = path.join(userDataDir, 'backups');
      if (fs.existsSync(oldBackups) && !fs.existsSync(targetBackups)) {
        fs.cpSync(oldBackups, targetBackups, { recursive: true });
      }
    } catch (error) {
      // Backups sind optional; die Konfiguration ist übernommen.
    }
    return { ok: true, copied: true, target: targetConfig };
  } catch (error) {
    return { ok: false, copied: false, reason: error.message || String(error) };
  }
}

module.exports = { migrateInstalledDataToAppData };
