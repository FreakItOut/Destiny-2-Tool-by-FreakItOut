// Such-Worker für das Inventar: übernimmt die reine Namens-/Typ-Suche
// (inklusive Tippfehler-Toleranz) außerhalb des UI-Threads. Die
// Operatoren-Suche (is:, stat:, perk: …) bleibt im Renderer, weil sie
// Zugriff auf Config, Duplikate und Wunschregeln braucht.

function foldSearch(text) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ß/g, 'ss')
    .replace(/æ/g, 'ae')
    .replace(/ø/g, 'o');
}

function editDistance(a, b) {
  const left = String(a || '');
  const right = String(b || '');
  if (!left.length) return right.length;
  if (!right.length) return left.length;
  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let i = 1; i <= left.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= right.length; j += 1) {
      const cost = left[i - 1] === right[j - 1] ? 0 : 1;
      current[j] = Math.min(current[j - 1] + 1, previous[j] + 1, previous[j - 1] + cost);
    }
    previous = current;
  }
  return previous[right.length];
}

function fuzzyWordMatch(haystack, needle) {
  const query = String(needle || '').trim();
  if (query.length < 4) return false;
  const words = String(haystack || '').split(/[^a-z0-9äöüß]+/).filter((word) => word.length > 2);
  const limit = query.length <= 6 ? 1 : 2;
  return words.some((word) => Math.abs(word.length - query.length) <= limit && editDistance(word, query) <= limit);
}

self.onmessage = (event) => {
  const payload = event.data || {};
  const job = Number(payload.id) || 0;
  const query = foldSearch(payload.query || '').trim();
  const items = Array.isArray(payload.items) ? payload.items : [];
  const keys = [];
  let fuzzy = 0;
  if (query) {
    for (const item of items) {
      if (!item || !item.key) continue;
      const haystack = foldSearch(`${item.name || ''} ${item.typeName || ''}`);
      if (haystack.includes(query)) {
        keys.push(item.key);
      } else if (fuzzyWordMatch(haystack, payload.query)) {
        keys.push(item.key);
        fuzzy += 1;
      }
    }
  }
  self.postMessage({ id: job, query: String(payload.query || ''), dataVersion: payload.dataVersion, keys, fuzzy });
};
