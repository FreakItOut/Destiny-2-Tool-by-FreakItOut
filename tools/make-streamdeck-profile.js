'use strict';

// Erzeugt eine Beispielbelegung für das Stream-Deck-Plugin.
// Die Datei ist eine dokumentierte Blueprint-JSON, die beim Einrichten
// hilft; sie enthält absichtlich keinen Token.

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const TARGET = path.join(DIST, 'streamdeck-profile.json');

const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));

const profile = {
  name: 'Destiny 2 Tool – Beispielbelegung',
  version: pkg.version,
  plugin: 'com.freakitout.d2tool',
  global: {
    apiUrl: 'http://127.0.0.1:7331',
    token: '',
    lang: 'de',
    theme: 'dark'
  },
  keys: [
    { position: 0, action: 'com.freakitout.d2tool.status', settings: { key: 'postmaster' } },
    { position: 1, action: 'com.freakitout.d2tool.status', settings: { key: 'vault' } },
    { position: 2, action: 'com.freakitout.d2tool.status', settings: { key: 'week' } },
    { position: 3, action: 'com.freakitout.d2tool.status', settings: { key: 'xur' } },
    { position: 4, action: 'com.freakitout.d2tool.status', settings: { key: 'focus' } },
    { position: 5, action: 'com.freakitout.d2tool.status', settings: { key: 'controller' } },
    { position: 6, action: 'com.freakitout.d2tool.view', settings: { view: 'vendor' } },
    { position: 7, action: 'com.freakitout.d2tool.loadout', settings: { loadout: 'PvE' } },
    { position: 8, action: 'com.freakitout.d2tool.overlay', settings: { longPath: '/action/click-through' } },
    { position: 9, action: 'com.freakitout.d2tool.postmaster', settings: {} },
    { position: 10, action: 'com.freakitout.d2tool.xur', settings: {} },
    { position: 11, action: 'com.freakitout.d2tool.status.encoder', settings: { key: 'postmaster' } },
    { position: 12, action: 'com.freakitout.d2tool.health', settings: {} },
    { position: 13, action: 'com.freakitout.d2tool.routine', settings: { recipe: 'standard' } },
    { position: 14, action: 'com.freakitout.d2tool.postmaster.safe', settings: {} }
  ],
  notes: [
    'Token in den globalen Plugin-Einstellungen eintragen.',
    'Status-Keys können per Langdruck aktualisiert werden.',
    'Encoder: Status, Loadout, Händler und Checkliste.',
    'Diese Datei ist eine Belegungsvorlage, kein installierbares Stream-Deck-Profil.'
  ]
};

fs.mkdirSync(DIST, { recursive: true });
fs.writeFileSync(TARGET, `${JSON.stringify(profile, null, 2)}\n`, 'utf8');
console.log(`Stream-Deck-Belegung geschrieben: ${path.relative(ROOT, TARGET)}`);
