'use strict';

// Vertragstest: Jeder im Preload benutzte IPC-Kanal muss im Main-Prozess
// registriert sein. Aufruf: node tools/preload-contract-test.js

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const preload = fs.readFileSync(path.join(ROOT, 'electron', 'preload.js'), 'utf8');
const main = fs.readFileSync(path.join(ROOT, 'electron', 'main.js'), 'utf8');

const channels = new Set();
const collect = (regex) => {
  let match;
  while ((match = regex.exec(preload))) channels.add(match[1]);
};
collect(/ipcRenderer\.invoke\(\s*['"]([^'"]+)['"]/g);
collect(/ipcRenderer\.send\(\s*['"]([^'"]+)['"]/g);
collect(/ipcRenderer\.sendSync\(\s*['"]([^'"]+)['"]/g);

const handlers = new Set();
const collectHandlers = (regex) => {
  let match;
  while ((match = regex.exec(main))) handlers.add(match[1]);
};
collectHandlers(/ipcMain\.handle\(\s*['"]([^'"]+)['"]/g);
collectHandlers(/ipcMain\.on\(\s*['"]([^'"]+)['"]/g);

const missing = [...channels].filter((channel) => !handlers.has(channel)).sort();
if (missing.length) {
  console.error(`Fehlende IPC-Handler (${missing.length}):`);
  for (const channel of missing) console.error(`  ${channel}`);
  process.exit(1);
}

console.log(`Preload-Vertrag OK: ${channels.size} Kanäle, alle im Main registriert.`);
