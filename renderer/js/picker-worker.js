'use strict';

// Rüstungs-Picker: rechenintensive Beam-Search außerhalb des UI-Threads.
// Erwartet pro Slot eine Liste von Kandidaten mit vorberechneten Stats.

const STAT_MAX = 200;
const BEAM_WIDTH = 240;
const MAX_SETS = 6;

self.onmessage = (event) => {
  const data = event.data || {};
  const id = data.id;
  const goals = (Array.isArray(data.goals) ? data.goals : []).map((value) => Number(value) || 0);
  const mods = (Array.isArray(data.mods) ? data.mods : []).map((value) => Number(value) || 0);
  const fragments = (Array.isArray(data.fragments) ? data.fragments : []).map((value) => Number(value) || 0);
  const weights = (Array.isArray(data.weights) ? data.weights : []).map((value) => (value == null ? null : Math.max(0, Number(value) || 0)));
  const masterwork = data.masterwork === true;
  const sort = ['goals', 'total', 'missing'].includes(data.sort) ? data.sort : 'goals';
  const wantedSet = String(data.set || '');
  const wantedSetCount = Math.max(0, Number(data.setCount) || 0);
  const exoticMode = ['forbid', 'only'].includes(data.exoticMode) ? data.exoticMode : 'allow';
  const slots = Array.isArray(data.slots) ? data.slots : [];
  const statCount = goals.length;

  const effective = (stats, index) => Math.min(
    STAT_MAX,
    (Number(stats[index]) || 0) + (mods[index] || 0) * 10 + (masterwork ? 10 : 0) + (fragments[index] || 0)
  );

  const score = (stats) => {
    let met = 0;
    let missing = 0;
    let progress = 0;
    let total = 0;
    for (let index = 0; index < statCount; index += 1) {
      const value = effective(stats, index);
      const goal = goals[index] || 0;
      const weight = weights.length && weights[index] != null ? weights[index] : (goal ? 1 : 0.1);
      total += value;
      if (weight <= 0) continue;
      if (goal) {
        if (value >= goal) met += weight;
        else missing += (goal - value) * weight;
        progress += Math.min(value, goal) * weight;
      } else {
        progress += value * weight;
      }
    }
    if (sort === 'total') return total * 1000 + progress;
    if (sort === 'missing') return -missing * 1000000 + met * 10000 + total;
    return met * 1000000 - missing * 1000 + progress * 10 + total;
  };

  const search = (maxExotic, requireExotic) => {
    let beam = [{
      stats: new Array(statCount).fill(0),
      keys: [],
      setCount: 0,
      exoticCount: 0,
      score: score(new Array(statCount).fill(0))
    }];
    for (const list of slots) {
      // Der Renderer sortiert vor und schickt die besten 50; die harte
      // Grenze hier schützt vor Ausreißern und hält die Laufzeit stabil.
      const items = (Array.isArray(list) ? list : []).slice(0, 60);
      const next = [];
      for (const partial of beam) {
        for (const item of items) {
          if (!item || typeof item !== 'object') continue;
          // Das Spiel erlaubt höchstens ein exotisches Rüstungsteil.
          const exoticCount = partial.exoticCount + (item.exotic ? 1 : 0);
          if (exoticCount > maxExotic) continue;
          const itemStats = Array.isArray(item.stats) ? item.stats : [];
          const stats = partial.stats.slice();
          for (let index = 0; index < statCount; index += 1) stats[index] += Math.max(0, Number(itemStats[index]) || 0);
          const setCount = partial.setCount + (wantedSet && item.set === wantedSet ? 1 : 0);
          next.push({ stats, keys: partial.keys.concat(item.key), setCount, exoticCount, score: score(stats) });
        }
      }
      next.sort((a, b) => b.score - a.score);
      beam = next.slice(0, BEAM_WIDTH);
    }
    if (wantedSet && wantedSetCount > 0) {
      beam = beam.filter((set) => set.setCount >= wantedSetCount);
    }
    if (requireExotic) beam = beam.filter((set) => set.exoticCount >= 1);
    beam.sort((a, b) => b.score - a.score);
    return beam;
  };

  const maxExotic = exoticMode === 'forbid' ? 0 : 1;
  const requireExotic = exoticMode === 'only';
  const best = search(maxExotic, requireExotic);
  const sets = best.slice(0, MAX_SETS);

  // Vergleichswert: bestes Set ohne Exot, wenn das beste Set eines enthält.
  let withoutExotic = null;
  if (!requireExotic && best.length && best[0].exoticCount > 0) {
    const plain = search(0, false);
    if (plain.length) withoutExotic = { keys: plain[0].keys, stats: plain[0].stats };
  }

  self.postMessage({
    id,
    sets: sets.map((set) => ({ keys: set.keys, stats: set.stats, exoticCount: set.exoticCount })),
    withoutExotic,
    pool: slots.reduce((sum, items) => sum + items.length, 0)
  });
};
