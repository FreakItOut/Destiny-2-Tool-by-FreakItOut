// ============================================================
// Rüstungs-Picker: Meta-Vorlagen
// ============================================================
// Reine Daten, bewusst ohne DOM. Die Stat-Hashes kommen aus
// armor-math.js, damit Vorlagen und Scoring dieselbe Quelle nutzen.

import { ARMOR_STAT_DEFS } from '../armor-math.js';

export const PICKER_META_STAND = 'Armor 3.0 · Update 9.7';

export function pickerBuiltinPresets() {
  const stat = Object.fromEntries(ARMOR_STAT_DEFS.map(({ h, label }) => [label, h]));
  return [
    { id: 'pve', name: 'PvE · Waffen + Granate', goals: { [stat.Waffen]: 100, [stat.Granate]: 70 }, masterwork: true, exoticMode: 'allow' },
    { id: 'pvp', name: 'PvP · Waffen + Klasse', goals: { [stat.Waffen]: 100, [stat.Klasse]: 100 }, masterwork: true, exoticMode: 'allow' },
    { id: 'gm', name: 'GM · Granate + Super', goals: { [stat.Granate]: 100, [stat.Super]: 80 }, masterwork: true, exoticMode: 'forbid' },
    { id: 'raid', name: 'Raid · Waffen + Super', goals: { [stat.Waffen]: 100, [stat.Super]: 100 }, masterwork: true, exoticMode: 'allow' },
    { id: 'dungeon', name: 'Dungeon · Waffen + Granate', goals: { [stat.Waffen]: 100, [stat.Granate]: 70 }, masterwork: true, exoticMode: 'allow' },
    { id: 'addclear', name: 'Add-Clear · Granate + Super', goals: { [stat.Granate]: 100, [stat.Super]: 90 }, masterwork: true, exoticMode: 'allow' },
    { id: 'support', name: 'Support · Klasse + Super', goals: { [stat.Klasse]: 100, [stat.Super]: 90 }, masterwork: true, exoticMode: 'allow' },
    { id: 'melee', name: 'Nahkampf · Nahkampf + Waffen', goals: { [stat.Nahkampf]: 100, [stat.Waffen]: 70 }, masterwork: true, exoticMode: 'allow' },
    { id: 'solo', name: 'Solo · Waffen + Klasse', goals: { [stat.Waffen]: 100, [stat.Klasse]: 100 }, masterwork: true, exoticMode: 'allow' }
  ];
}
