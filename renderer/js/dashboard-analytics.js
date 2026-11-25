'use strict';

// ============================================================
// Dashboard-Analytik (reine Berechnung, kein DOM)
// ============================================================
// Bekommt die Aktivitätsliste aus `bungieActivitySummary` und liefert
// Kennzahlen, 14-Tage-Balken, eine 12-Wochen-Heatmap und die
// Kategorienverteilung. Wird als klassisches Skript geladen, damit
// der Node-Test die Datei ohne Modul-Transpiler prüfen kann.

(function (root) {
  const DAY_MS = 24 * 60 * 60 * 1000;

  const CATEGORY_DEFS = [
    { key: 'grandmaster', label: 'Großmeister' },
    { key: 'raid', label: 'Raid' },
    { key: 'dungeon', label: 'Dungeon' },
    { key: 'nightfall', label: 'Nightfall' },
    { key: 'trials', label: 'Prüfungen' },
    { key: 'pvp', label: 'PvP' },
    { key: 'gambit', label: 'Gambit' },
    { key: 'other', label: 'Sonstiges' }
  ];
  const CATEGORY_LABEL = new Map(CATEGORY_DEFS.map((entry) => [entry.key, entry.label]));
  // Rückfall, falls das Manifest keine activityModeCategory liefert:
  // bekannte PvP-Modus-Typen (Control, Clash, Rumble, Trials …).
  const PVP_MODES = new Set([
    5, 10, 12, 14, 18, 21, 22, 23, 24, 25, 26, 27, 28, 29, 31, 32, 37, 38,
    40, 41, 42, 43, 44, 45, 46, 47, 50, 52, 53, 54, 55, 56, 57, 58, 59, 60,
    61, 62, 63, 64, 65, 66, 67, 68, 69, 70, 71, 72, 73, 74, 75, 76, 77, 78,
    79, 80, 81, 83, 84
  ]);

  function text(entry) {
    return `${(entry && entry.name) || ''} ${(entry && entry.mode) || ''}`;
  }

  // Ordnet eine Aktivität genau einer Kategorie zu. Namen sind je nach
  // Manifest-Sprache deutsch oder englisch; zusätzlich werden die
  // stabilen Bungie-Typen und Modus-Kategorien genutzt.
  function classifyActivity(entry) {
    const label = text(entry);
    const modeType = Number(entry && entry.modeType) || 0;
    const modeCategory = Number(entry && entry.modeCategory) || 0;
    const activityType = String((entry && entry.activityType) || '');
    if (/grandmaster|großmeister/i.test(label)) return 'grandmaster';
    if (modeType === 4 || activityType === '608898761' || /\braid\b/i.test(label)) return 'raid';
    if (modeType === 82 || activityType === '2889152536' || /dungeon/i.test(label)) return 'dungeon';
    if (modeType === 39 || modeType === 84 || /trials|prüfungen|osiris/i.test(label)) return 'trials';
    if (modeType === 15 || modeType === 16 || /nightfall|orkus/i.test(label)) return 'nightfall';
    if (modeCategory === 3 || modeType === 48 || modeType === 49 || /gambit/i.test(label)) return 'gambit';
    if (modeCategory === 2 || PVP_MODES.has(modeType)) return 'pvp';
    return 'other';
  }

  function startOfDay(ms) {
    const date = new Date(ms);
    return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  }

  function dayKey(ms) {
    const date = new Date(ms);
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${date.getFullYear()}-${month}-${day}`;
  }

  // Kalendertage statt 24h-Schritten: bleibt über Sommer-/Winterzeit stabil.
  function shiftDays(ms, delta) {
    const date = new Date(ms);
    date.setDate(date.getDate() + delta);
    return date.getTime();
  }

  function dayLabel(ms) {
    const date = new Date(ms);
    return `${date.getDate()}.${date.getMonth() + 1}.`;
  }

  function fullDayLabel(ms) {
    const date = new Date(ms);
    return date.toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' });
  }

  function heatLevel(count) {
    if (!count) return 0;
    if (count >= 4) return 4;
    return count;
  }

  function normalize(entries, nowMs) {
    const now = Number.isFinite(nowMs) ? nowMs : Date.now();
    return (Array.isArray(entries) ? entries : [])
      .map((entry) => {
        const time = Date.parse(String((entry && entry.date) || ''));
        return {
          entry,
          time,
          duration: Math.max(0, Number(entry && entry.durationSeconds) || 0),
          category: classifyActivity(entry),
          kills: Math.max(0, Number(entry && entry.kills) || 0),
          deaths: Math.max(0, Number(entry && entry.deaths) || 0)
        };
      })
      .filter((item) => Number.isFinite(item.time) && item.time <= now + 6 * 60 * 60 * 1000);
  }

  function buildActivityAnalytics(entries, nowMs) {
    const now = Number.isFinite(nowMs) ? nowMs : Date.now();
    const today = startOfDay(now);
    const items = normalize(entries, now);
    const dayMap = new Map();
    for (const item of items) {
      const key = dayKey(item.time);
      const bucket = dayMap.get(key) || { count: 0, minutes: 0 };
      bucket.count += 1;
      bucket.minutes += Math.round(item.duration / 60);
      dayMap.set(key, bucket);
    }

    const inWindow = (days) => {
      const start = shiftDays(today, -(days - 1));
      return items.filter((item) => item.time >= start);
    };
    const last7 = inWindow(7);
    const last30 = inWindow(30);
    const sumMinutes = (list) => Math.round(list.reduce((sum, item) => sum + item.duration, 0) / 60);

    const categories = CATEGORY_DEFS.map((def) => ({ key: def.key, label: def.label, count: 0, minutes: 0 }));
    const categoryMap = new Map(categories.map((entry) => [entry.key, entry]));
    for (const item of last30) {
      const bucket = categoryMap.get(item.category);
      if (!bucket) continue;
      bucket.count += 1;
      bucket.minutes += Math.round(item.duration / 60);
    }

    const recentDays = [];
    for (let index = 13; index >= 0; index -= 1) {
      const start = shiftDays(today, -index);
      const bucket = dayMap.get(dayKey(start)) || { count: 0, minutes: 0 };
      recentDays.push({
        key: dayKey(start),
        label: dayLabel(start),
        title: `${fullDayLabel(start)} · ${bucket.count} Aktivitäten · ${bucket.minutes} Min`,
        count: bucket.count,
        minutes: bucket.minutes
      });
    }
    const recentMax = Math.max(1, ...recentDays.map((day) => day.count));

    // Heatmap: 12 volle Wochen, Montag als erste Zeile. Die letzte
    // Woche endet am Sonntag; zukünftige Tage bleiben leer.
    const weekday = (new Date(today).getDay() + 6) % 7;
    const heatStart = shiftDays(today, -(weekday + 11 * 7));
    const heatDays = [];
    let heatMax = 1;
    for (let index = 0; index < 84; index += 1) {
      const start = shiftDays(heatStart, index);
      const key = dayKey(start);
      const bucket = dayMap.get(key) || { count: 0, minutes: 0 };
      heatMax = Math.max(heatMax, bucket.count);
      heatDays.push({
        key,
        date: start,
        future: start > today,
        count: bucket.count,
        minutes: bucket.minutes,
        level: start > today ? 0 : heatLevel(bucket.count),
        title: `${fullDayLabel(start)} · ${bucket.count} Aktivitäten · ${bucket.minutes} Min`
      });
    }

    let streak = 0;
    for (let index = 0; index < 366; index += 1) {
      const count = (dayMap.get(dayKey(shiftDays(today, -index))) || {}).count || 0;
      if (count > 0) streak += 1;
      else if (index === 0) continue;
      else break;
    }

    const kills7 = last7.reduce((sum, item) => sum + item.kills, 0);
    const deaths7 = last7.reduce((sum, item) => sum + item.deaths, 0);
    const kd7 = deaths7 > 0 ? Math.round((kills7 / deaths7) * 100) / 100 : (kills7 > 0 ? kills7 : 0);

    const byName = new Map();
    for (const item of last30) {
      const name = String((item.entry && item.entry.name) || 'Aktivität');
      const bucket = byName.get(name) || { name, count: 0, minutes: 0, category: item.category };
      bucket.count += 1;
      bucket.minutes += Math.round(item.duration / 60);
      byName.set(name, bucket);
    }
    const top = [...byName.values()]
      .sort((a, b) => b.count - a.count || b.minutes - a.minutes || a.name.localeCompare(b.name, 'de'))
      .slice(0, 5);

    const categoryCount = (key) => (categoryMap.get(key) || {}).count || 0;
    return {
      hasData: items.length > 0,
      total: items.length,
      last7: last7.length,
      last30: last30.length,
      minutes7: sumMinutes(last7),
      minutes30: sumMinutes(last30),
      streak,
      kd7,
      kills7,
      deaths7,
      raidDungeon30: categoryCount('raid') + categoryCount('dungeon'),
      grandmaster30: categoryCount('grandmaster'),
      pvp30: categoryCount('pvp') + categoryCount('trials'),
      categories: categories.filter((entry) => entry.count > 0),
      allCategories: categories,
      recentDays,
      recentMax,
      heatDays,
      heatMax,
      top
    };
  }

  root.D2DashboardAnalytics = {
    DAY_MS,
    CATEGORY_DEFS,
    categoryLabel: (key) => CATEGORY_LABEL.get(key) || 'Sonstiges',
    classifyActivity,
    heatLevel,
    buildActivityAnalytics
  };
}(typeof window !== 'undefined' ? window : globalThis));
