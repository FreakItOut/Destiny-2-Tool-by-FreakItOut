// Kleine Onboarding-Tour mit visuellen Schritten (ohne externe Bilder).
const STEPS = [
  { icon: '🏠', image: 'assets/tour-dashboard.png', title: 'Dashboard', text: 'Hier siehst du Prioritäten, Reset und Xûr. „Mehr anzeigen“ öffnet Wochen-, Sammlungs- und Statuskarten.' },
  { icon: '🎒', image: 'assets/tour-inventory.png', title: 'Inventar', text: 'Suche, Filter und Kartenansicht. Rechtsklick auf ein Item öffnet direkt die Details.' },
  { icon: '🧭', image: 'assets/tour-tools.png', title: 'Werkzeuge', text: 'Builds, Sammlung, Woche und Händler. Die Bereiche sind bewusst aufklappbar, damit nichts überladen wirkt.' },
  { icon: '⌨️', image: '', title: 'Schnellzugriff', text: 'Strg+K öffnet die Befehlspalette. Strg+Alt+1–5 springt direkt in die Werkzeuge-Ansichten.' },
  { icon: '⚙️', image: '', title: 'Anpassen', text: 'Unter Einstellungen kannst du einfache Ansicht, Schriftgröße, Startansicht und Benachrichtigungen ändern.' }
];

export function openTour() {
  let modal = document.querySelector('#tourModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'tourModal';
    modal.className = 'onboarding-backdrop hidden';
    document.body.appendChild(modal);
  }
  let index = 0;
  const render = () => {
    const step = STEPS[index];
    modal.innerHTML = `<div class="onboarding-card"><header class="onboarding-head"><div><span class="onboarding-kicker">Tour ${index + 1}/${STEPS.length}</span><h2>${step.title}</h2></div><button type="button" class="icon-btn" data-tour-close aria-label="Schließen">✕</button></header>` +
      `<div class="tour-visual">${step.image ? `<img class="tour-shot" src="${step.image}" alt="${step.title}">` : step.icon}</div><p class="onboarding-intro">${step.text}</p>` +
      `<footer class="onboarding-actions"><button type="button" class="btn ghost small" data-tour-prev ${index === 0 ? 'disabled' : ''}>Zurück</button><button type="button" class="btn primary" data-tour-next>${index === STEPS.length - 1 ? 'Fertig' : 'Weiter'}</button></footer></div>`;
  };
  render();
  modal.classList.remove('hidden');
  modal.onclick = (event) => {
    if (event.target === modal || event.target.closest('[data-tour-close]')) {
      modal.classList.add('hidden');
      return;
    }
    if (event.target.closest('[data-tour-next]')) {
      if (index >= STEPS.length - 1) { modal.classList.add('hidden'); return; }
      index += 1;
      render();
    }
    if (event.target.closest('[data-tour-prev]') && index > 0) {
      index -= 1;
      render();
    }
  };
}
