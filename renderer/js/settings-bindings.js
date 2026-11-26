// Controller-Belegung: Die App liest diese Liste für die Tasten-Legende.
// Sie liegt bewusst in einer kleinen Datei, damit settings.js erst beim
// ersten Öffnen der Einstellungen geladen werden muss.

export const BINDING_ACTIONS = [
  { key: 'click', label: 'Klicken' },
  { key: 'back', label: 'Zurück' },
  { key: 'reload', label: 'Seite neu laden' },
  { key: 'precision', label: 'Präzisionsmodus' },
  { key: 'categoryPrev', label: 'Kategorie zurück' },
  { key: 'categoryNext', label: 'Kategorie weiter' },
  { key: 'sitePrev', label: 'Webseite zurück' },
  { key: 'siteNext', label: 'Webseite weiter' },
  { key: 'settings', label: 'Einstellungen' },
  { key: 'hide', label: 'Overlay ausblenden' },
  { key: 'notes', label: 'Notizen öffnen' },
  { key: 'pip', label: 'Mini-Fenster (PiP)' },
  { key: 'unloadOthers', label: 'Andere Seiten entladen' },
  { key: 'hud', label: 'Tasten-Legende ein-/aus' }
];
