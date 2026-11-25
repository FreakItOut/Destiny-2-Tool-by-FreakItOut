// Build-Karte als PNG: reines Canvas-Rendering, damit sich ein Loadout
// oder ein Picker-Set in Discord/Clan-Chats teilen lässt.

function roundRect(ctx, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

function fitText(ctx, text, maxWidth) {
  const value = String(text || '');
  if (ctx.measureText(value).width <= maxWidth) return value;
  let cut = value;
  while (cut.length > 1 && ctx.measureText(`${cut}…`).width > maxWidth) cut = cut.slice(0, -1);
  return `${cut}…`;
}

// card = { name, subtitle, className, accent, stats: [{label, value}], items: [{name, typeName, power, exotic}], mods: [name], perks: [name], score, footer }
export function renderBuildCard(card) {
  const width = 1200;
  const height = 675;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  // Hintergrund
  const bg = ctx.createLinearGradient(0, 0, width, height);
  bg.addColorStop(0, '#0b1018');
  bg.addColorStop(0.55, '#101826');
  bg.addColorStop(1, '#161d2b');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);

  // Dezente Radial-Akzente
  const glow = ctx.createRadialGradient(width * 0.1, 0, 40, width * 0.1, 0, 620);
  glow.addColorStop(0, 'rgba(255,70,85,0.14)');
  glow.addColorStop(1, 'rgba(255,70,85,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, width, height);
  const glow2 = ctx.createRadialGradient(width, height, 40, width, height, 520);
  glow2.addColorStop(0, 'rgba(120,90,200,0.16)');
  glow2.addColorStop(1, 'rgba(120,90,200,0)');
  ctx.fillStyle = glow2;
  ctx.fillRect(0, 0, width, height);

  const accent = card.accent || '#ff4655';
  ctx.fillStyle = accent;
  ctx.fillRect(0, 0, width, 4);

  const font = (size, weight = 400) => `${weight} ${size}px "Segoe UI", system-ui, sans-serif`;

  // Kopf
  ctx.fillStyle = '#8b9ab0';
  ctx.font = font(14, 600);
  ctx.fillText('DESTINY 2 TOOL · BUILD-KARTE', 56, 62);

  ctx.fillStyle = '#ffffff';
  ctx.font = font(38, 700);
  ctx.fillText(fitText(ctx, card.name || 'Build', width - 320), 56, 112);

  ctx.fillStyle = '#b9c6d8';
  ctx.font = font(17, 500);
  const subtitle = [card.className, card.subtitle].filter(Boolean).join(' · ');
  if (subtitle) ctx.fillText(fitText(ctx, subtitle, width - 300), 56, 142);

  // Score-Badge
  if (Number.isFinite(card.score)) {
    const score = Math.max(0, Math.min(100, Math.round(card.score)));
    const tone = score >= 85 ? '#5fe0a0' : score >= 60 ? '#f0b35a' : '#ff8f8f';
    roundRect(ctx, width - 220, 66, 164, 74, 14);
    ctx.fillStyle = 'rgba(255,255,255,0.04)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.10)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = tone;
    ctx.font = font(30, 700);
    ctx.fillText(String(score), width - 200, 112);
    ctx.fillStyle = '#8b9ab0';
    ctx.font = font(12, 600);
    ctx.fillText('GESUNDHEIT', width - 200, 130);
  }

  // Stats
  const stats = (card.stats || []).slice(0, 6);
  if (stats.length) {
    const top = 186;
    const gap = 16;
    const boxWidth = (width - 112 - gap * (stats.length - 1)) / stats.length;
    stats.forEach((stat, index) => {
      const x = 56 + index * (boxWidth + gap);
      roundRect(ctx, x, top, boxWidth, 96, 12);
      ctx.fillStyle = 'rgba(255,255,255,0.035)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.07)';
      ctx.stroke();
      ctx.fillStyle = '#8b9ab0';
      ctx.font = font(12, 600);
      ctx.fillText(String(stat.label || '').toUpperCase(), x + 14, top + 26);
      ctx.fillStyle = '#ffffff';
      ctx.font = font(28, 700);
      ctx.fillText(String(stat.value == null ? '—' : stat.value), x + 14, top + 62);
      // Balken (0–200, wie im Spiel)
      const pct = Math.max(0, Math.min(1, Number(stat.value) / 200));
      const barWidth = boxWidth - 28;
      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      roundRect(ctx, x + 14, top + 74, barWidth, 6, 3);
      ctx.fill();
      ctx.fillStyle = accent;
      roundRect(ctx, x + 14, top + 74, Math.max(3, barWidth * pct), 6, 3);
      ctx.fill();
    });
  }

  // Items (zweispaltig)
  const items = (card.items || []).slice(0, 12);
  const listTop = stats.length ? 316 : 190;
  ctx.fillStyle = '#8b9ab0';
  ctx.font = font(12, 600);
  ctx.fillText('ITEMS', 56, listTop);
  ctx.font = font(15, 500);
  const columnWidth = (width - 112) / 2;
  items.forEach((item, index) => {
    const column = index < 6 ? 0 : 1;
    const row = index % 6;
    const x = 56 + column * columnWidth;
    const y = listTop + 28 + row * 28;
    ctx.fillStyle = item.exotic ? '#f3c66a' : '#e8ecf2';
    const name = fitText(ctx, item.name || 'Item', columnWidth - 150);
    ctx.fillText(name, x, y);
    ctx.fillStyle = '#7f8ea3';
    ctx.font = font(12, 500);
    const meta = [item.typeName, item.power ? `${item.power}` : ''].filter(Boolean).join(' · ');
    ctx.fillText(fitText(ctx, meta, 130), x + columnWidth - 142, y);
    ctx.font = font(15, 500);
  });

  // Mods / Artefakt
  const bottomY = height - 118;
  ctx.fillStyle = '#8b9ab0';
  ctx.font = font(12, 600);
  ctx.fillText('MODS', 56, bottomY);
  ctx.fillStyle = '#c7d1e0';
  ctx.font = font(14, 500);
  const modText = (card.mods || []).length ? (card.mods || []).slice(0, 6).join(' · ') : 'Keine Mods gespeichert';
  ctx.fillText(fitText(ctx, modText, width / 2 - 90), 56, bottomY + 26);

  ctx.fillStyle = '#8b9ab0';
  ctx.font = font(12, 600);
  ctx.fillText('ARTEFAKT', width / 2 + 20, bottomY);
  ctx.fillStyle = '#c7d1e0';
  ctx.font = font(14, 500);
  const perkText = (card.perks || []).length ? (card.perks || []).slice(0, 5).join(' · ') : '—';
  ctx.fillText(fitText(ctx, perkText, width / 2 - 90), width / 2 + 20, bottomY + 26);

  // Fußzeile
  ctx.fillStyle = 'rgba(255,255,255,0.06)';
  ctx.fillRect(56, height - 52, width - 112, 1);
  ctx.fillStyle = '#6f7d92';
  ctx.font = font(12, 500);
  ctx.fillText(fitText(ctx, card.footer || '', width - 112), 56, height - 26);

  return canvas.toDataURL('image/png');
}

// Einfache Textkarte (z. B. Wochen-Digest): Titel, Zeilen, Fußzeile.
export function renderTextCard({ title, subtitle, lines, footer, accent }) {
  const width = 1100;
  const height = 720;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';
  const bg = ctx.createLinearGradient(0, 0, width, height);
  bg.addColorStop(0, '#0b1018');
  bg.addColorStop(0.6, '#101826');
  bg.addColorStop(1, '#151d2b');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);
  const color = accent || '#ff4655';
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, width, 4);

  const font = (size, weight = 400, mono = false) =>
    `${weight} ${size}px ${mono ? '"Cascadia Mono", Consolas, monospace' : '"Segoe UI", system-ui, sans-serif'}`;

  ctx.fillStyle = '#8b9ab0';
  ctx.font = font(13, 600);
  ctx.fillText('DESTINY 2 TOOL', 52, 56);

  ctx.fillStyle = '#ffffff';
  ctx.font = font(34, 700);
  ctx.fillText(fitText(ctx, title || 'Übersicht', width - 104), 52, 104);

  if (subtitle) {
    ctx.fillStyle = '#b9c6d8';
    ctx.font = font(16, 500);
    ctx.fillText(fitText(ctx, subtitle, width - 104), 52, 132);
  }

  ctx.font = font(16, 500, true);
  let y = 176;
  for (const line of (lines || []).slice(0, 20)) {
    const text = String(line || '');
    const isHead = /^[A-ZÄÖÜ][^:]{2,40}:$/.test(text.trim()) || /^#/.test(text);
    ctx.fillStyle = isHead ? color : '#dbe3ee';
    ctx.font = font(isHead ? 15 : 16, isHead ? 700 : 500, !isHead);
    ctx.fillText(fitText(ctx, text, width - 104), 52, y);
    y += isHead ? 30 : 26;
    if (y > height - 80) break;
  }

  ctx.fillStyle = 'rgba(255,255,255,0.06)';
  ctx.fillRect(52, height - 52, width - 104, 1);
  ctx.fillStyle = '#6f7d92';
  ctx.font = font(12, 500);
  ctx.fillText(fitText(ctx, footer || '', width - 104), 52, height - 26);
  return canvas.toDataURL('image/png');
}
