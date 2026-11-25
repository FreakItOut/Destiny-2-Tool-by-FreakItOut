// In-App-Changelog: kurze Liste der letzten Änderungen.
const ENTRIES = [
  ['Dashboard & Werkzeuge entlastet', 'Weniger sichtbare Karten, aufklappbare Bereiche, Kartenfilter und Fokusmodus.'],
  ['Session-Ziele & Wochenrückblick', 'Ziele setzen, Fortschritt verfolgen und die Woche zusammenfassen.'],
  ['Backup-Diff & Teil-Restore', 'Backups vergleichen und einzelne Bereiche zurückspielen.'],
  ['Clipboard-Import & Teilen-Code', 'DIM-Links und geteilte Loadouts direkt aus der Zwischenablage.'],
  ['Händler-Historie & Drift-Wächter', 'Neue Angebote und abweichende Loadouts sofort sehen.']
];

export function openChangelog() {
  let modal = document.querySelector('#changelogModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'changelogModal';
    modal.className = 'onboarding-backdrop hidden';
    modal.innerHTML = `<div class="onboarding-card"><header class="onboarding-head"><div><span class="onboarding-kicker">Updates</span><h2>Was ist neu?</h2></div><button type="button" class="icon-btn" data-changelog-close aria-label="Schließen">✕</button></header><div class="onboarding-steps">` +
      ENTRIES.map(([title, text]) => `<div><b>${title}</b><span>${text}</span></div>`).join('') +
      `</div><footer class="onboarding-actions"><button type="button" class="btn primary" data-changelog-close>Schließen</button></footer></div>`;
    document.body.appendChild(modal);
    modal.addEventListener('click', (event) => {
      if (event.target === modal || event.target.closest('[data-changelog-close]')) modal.classList.add('hidden');
    });
  }
  modal.classList.remove('hidden');
}
