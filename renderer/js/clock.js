import { formatDuration, qs } from './ui.js';
import { icon } from './icons.js';

// Destiny 2 Reset: täglich 17:00 UTC (18:00 bzw. 19:00 deutsche Zeit).
// Xûr erscheint Freitag 17:00 UTC und verschwindet Dienstag 17:00 UTC.

const HOUR_UTC = 17;
let formatterLocale = '';
let dateFormatter = null;
function formatter() {
  const locale = window.i18n ? window.i18n.locale() : 'de-DE';
  if (!dateFormatter || formatterLocale !== locale) {
    formatterLocale = locale;
    dateFormatter = new Intl.DateTimeFormat(locale, {
      weekday: 'short',
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  }
  return dateFormatter;
}
function tr(text) {
  if (!window.i18n || typeof window.i18n.translate !== 'function') return text;
  return window.i18n.translate(text) || text;
}

export function nextDailyReset(now) {
  const target = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), HOUR_UTC, 0, 0, 0)
  );
  if (target.getTime() <= now.getTime()) target.setUTCDate(target.getUTCDate() + 1);
  return target;
}

export function nextWeeklyReset(now) {
  const target = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), HOUR_UTC, 0, 0, 0)
  );
  const daysUntilTuesday = (2 - now.getUTCDay() + 7) % 7;
  target.setUTCDate(target.getUTCDate() + daysUntilTuesday);
  if (target.getTime() <= now.getTime()) target.setUTCDate(target.getUTCDate() + 7);
  return target;
}

function nextXurArrival(now) {
  const target = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), HOUR_UTC, 0, 0, 0)
  );
  const daysUntilFriday = (5 - now.getUTCDay() + 7) % 7;
  target.setUTCDate(target.getUTCDate() + daysUntilFriday);
  if (target.getTime() <= now.getTime()) target.setUTCDate(target.getUTCDate() + 7);
  return target;
}

export function xurEnd(now) {
  const target = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), HOUR_UTC, 0, 0, 0)
  );
  const daysUntilTuesday = (2 - now.getUTCDay() + 7) % 7;
  target.setUTCDate(target.getUTCDate() + daysUntilTuesday);
  if (target.getTime() <= now.getTime()) target.setUTCDate(target.getUTCDate() + 7);
  return target;
}

export function xurActive(now) {
  const day = now.getUTCDay();
  const hour = now.getUTCHours();
  if (day === 5) return hour >= HOUR_UTC;
  return day === 6 || day === 0 || day === 1 || (day === 2 && hour < HOUR_UTC);
}

/**
 * @param {{ onToday?: Function, onXur?: Function, onReset?: Function }} [options]
 */
export function initClock({ onToday, onXur, onReset } = {}) {
  const resetChip = qs('#resetChip');
  const xurChip = qs('#xurChip');

  if (resetChip) {
    resetChip.innerHTML = `${icon('clock')}<span class="chip-label">Reset</span><strong id="resetValue">—</strong>`;
    resetChip.addEventListener('click', () => onToday && onToday());
  }
  if (xurChip) {
    xurChip.innerHTML = `${icon('star')}<span class="chip-label">Xûr</span><strong id="xurValue">—</strong>`;
    xurChip.addEventListener('click', () => onXur && onXur());
  }

  const resetValue = qs('#resetValue');
  const xurValue = qs('#xurValue');
  const overlayReset = qs('#overlayReset');
  const overlayWeekly = qs('#overlayWeekly');
  const overlayWeeklyReset = qs('#overlayWeeklyReset');

  let lastResetTime = nextDailyReset(new Date()).getTime();

  function update() {
    const now = new Date();
    const reset = nextDailyReset(now);
    const weekly = reset.getUTCDay() === 2;
    if (resetValue) {
      const next = formatDuration(reset.getTime() - now.getTime());
      if (resetValue.textContent !== next) resetValue.textContent = next;
    }
    const resetBar = overlayReset && overlayReset.closest('.overlay-bar');
    if (overlayReset && resetBar && !resetBar.classList.contains('hidden')) {
      const next = formatDuration(reset.getTime() - now.getTime());
      if (overlayReset.textContent !== next) overlayReset.textContent = next;
      const title = `${weekly ? tr('Wöchentlicher Reset') : tr('Daily Reset')}: ${formatter().format(reset)}`;
      if (overlayReset.title !== title) overlayReset.title = title;
    }
    if (resetChip) {
      const title = `${weekly ? tr('Wöchentlicher Reset') : tr('Daily Reset')}: ${formatter().format(reset)} (${tr('Ortszeit')})`;
      if (resetChip.title !== title) resetChip.title = title;
      resetChip.classList.toggle('is-weekly', weekly);
    }

    // Mini-Countdown: Wöchentlicher Reset anzeigen, wenn der tägliche
    // Reset nicht bereits der wöchentliche ist.
    if (overlayWeekly && overlayWeeklyReset) {
      const weeklyReset = nextWeeklyReset(now);
      const isWeeklyNow = reset.getTime() === weeklyReset.getTime();
      if (isWeeklyNow) {
        overlayWeekly.hidden = true;
      } else {
        overlayWeekly.hidden = false;
        const next = formatDuration(weeklyReset.getTime() - now.getTime());
        if (overlayWeeklyReset.textContent !== next) overlayWeeklyReset.textContent = next;
        const title = `${tr('Wöchentlicher Reset')}: ${formatter().format(weeklyReset)} (${tr('Ortszeit')})`;
        if (overlayWeekly.title !== title) overlayWeekly.title = title;
      }
    }

    // Auto-Refresh bei Reset.
    if (reset.getTime() !== lastResetTime) {
      if (lastResetTime < now.getTime() && onReset) onReset();
      lastResetTime = reset.getTime();
    }

    const active = xurActive(now);
    if (xurValue) {
      if (active) {
        const remaining = xurEnd(now).getTime() - now.getTime();
        const next = `${tr('da')} · ${formatDuration(remaining)}`;
        if (xurValue.textContent !== next) xurValue.textContent = next;
        if (xurChip) {
          const title = `${tr('Xûr ist da')}. ${tr('Verschwindet am Dienstag-Reset')} (${formatter().format(xurEnd(now))}).`;
          if (xurChip.title !== title) xurChip.title = title;
        }
      } else {
        const arrival = nextXurArrival(now);
        const next = formatDuration(arrival.getTime() - now.getTime());
        if (xurValue.textContent !== next) xurValue.textContent = next;
        if (xurChip) {
          const title = `${tr('Xûr kommt am Freitag')}: ${formatter().format(arrival)} (${tr('Ortszeit')}).`;
          if (xurChip.title !== title) xurChip.title = title;
        }
      }
      if (xurChip) xurChip.classList.toggle('is-active', active);
    }
  }

  update();
  const timer = setInterval(update, 1000);
  return {
    update,
    stop: () => clearInterval(timer)
  };
}