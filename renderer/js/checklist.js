// ============================================================
// Wöchentliche Challenge-Checkliste (Phase 3: aus app.js extrahiert)
// ============================================================
// Eigene Einträge, die jeden Dienstag-Reset (17:00) automatisch
// zurückgesetzt werden. Rein lokal, kein Server-Bedarf. Bekommt die
// App-Abhängigkeiten per Kontext (ctx).

export function createChecklist(ctx) {
  const { qs, toast, escapeHtml, getCfg, setConfig, notes, getInventoryData } = ctx;

  const checklistPanel = qs('#checklistPanel');
  const checklistBtn = qs('#checklistBtn');
  const checklistList = qs('#checklistList');
  const checklistInput = qs('#checklistInput');
  const checklistAddBtn = qs('#checklistAddBtn');
  const checklistWeekEl = qs('#checklistWeek');
  const checklistCloseBtn = qs('#checklistCloseBtn');
  const checklistResetBtn = qs('#checklistResetBtn');
  const checklistAuto = qs('#checklistAuto');
  let checklistFilter = 'all';

  const AUTO_CHECK_KEYS = new Set(['postmaster-empty', 'vault-below-1100', 'godrolls-zero']);

  function autoChecklistDone(item) {
    if (!item || !AUTO_CHECK_KEYS.has(item.autoKey)) return item && item.done === true;
    const data = typeof getInventoryData === 'function' ? getInventoryData() : null;
    if (!data) return item.done === true;
    if (item.autoKey === 'postmaster-empty') {
      return Object.values(data.postmaster || {}).reduce((sum, list) => sum + (Array.isArray(list) ? list.length : 0), 0) === 0;
    }
    if (item.autoKey === 'vault-below-1100') return (data.vault || []).length < 1100;
    if (item.autoKey === 'godrolls-zero') return (Number(data.godrolls) || 0) === 0;
    return item.done === true;
  }

  // Woche = Datum des zuletzt vergangenen Dienstag-Resets (17:00
  // Ortszeit-Näherung über 17:00 lokal - gängig für Mitteleuropa).
  function checklistWeekKey() {
    const now = new Date();
    const candidate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 17, 0, 0);
    const daysSinceTuesday = (now.getDay() + 7 - 2) % 7;
    candidate.setDate(candidate.getDate() - daysSinceTuesday);
    if (candidate.getTime() > now.getTime()) candidate.setDate(candidate.getDate() - 7);
    return `${candidate.getFullYear()}-${String(candidate.getMonth() + 1).padStart(2, '0')}-${String(candidate.getDate()).padStart(2, '0')}`;
  }

  function checkChecklistReset() {
    const key = checklistWeekKey();
    const stored = (getCfg().checklist && getCfg().checklist.week) || '';
    if (stored === key) return false;
    const items = ((getCfg().checklist && getCfg().checklist.items) || []).map((item) => ({ ...item, done: false }));
    setConfig({ checklist: { items, week: key } });
    if (checklistWeekEl) checklistWeekEl.textContent = `Woche vom ${key.slice(8)}.${key.slice(5, 7)}.`;
    return true;
  }

  function renderChecklist() {
    if (!checklistList) return;
    const allItems = (getCfg().checklist && getCfg().checklist.items) || [];
    const items = checklistFilter === 'open'
      ? allItems.filter((item) => !item.done)
      : checklistFilter === 'done'
        ? allItems.filter((item) => item.done)
        : allItems;
    checklistList.innerHTML = items.length
      ? items
          .map(
            (item) => {
              const done = autoChecklistDone(item);
              return `<div class="check-item ${done ? 'done' : ''}">` +
              `<input type="checkbox" data-check-toggle="${escapeHtml(item.id)}" ${done ? 'checked' : ''} ${AUTO_CHECK_KEYS.has(item.autoKey) ? 'disabled' : ''}>` +
              `<span class="check-text">${escapeHtml(item.text)}${AUTO_CHECK_KEYS.has(item.autoKey) ? ' <span class="inv-tool-chip on">Auto</span>' : ''}</span>` +
              `<button class="icon-btn check-remove" data-check-remove="${escapeHtml(item.id)}" title="Entfernen" aria-label="Entfernen">×</button>` +
              `</div>`;
            }
          )
          .join('')
      : '<div class="check-empty">Noch keine Einträge – z. B. „Wochenchallenges“ oder „Raid-Loot“ hinzufügen.</div>';
    if (checklistWeekEl) {
      const key = checklistWeekKey();
      checklistWeekEl.textContent = `Woche vom ${key.slice(8)}.${key.slice(5, 7)}.`;
    }
  }

  function openChecklistPanel(filter = 'all') {
    if (!checklistPanel) return;
    checklistFilter = ['all', 'open', 'done'].includes(filter) ? filter : 'all';
    checkChecklistReset();
    renderChecklist();
    checklistPanel.classList.remove('hidden');
  }

  function toggleChecklistPanel() {
    if (!checklistPanel) return;
    if (checklistPanel.classList.contains('hidden')) openChecklistPanel('all');
    else checklistPanel.classList.add('hidden');
  }

  if (checklistBtn) checklistBtn.addEventListener('click', toggleChecklistPanel);
  if (checklistCloseBtn) checklistCloseBtn.addEventListener('click', () => checklistPanel && checklistPanel.classList.add('hidden'));
  if (checklistAddBtn) {
    checklistAddBtn.addEventListener('click', () => {
      const text = String(checklistInput.value || '').trim();
      if (!text) return;
      const autoKey = String(checklistAuto && checklistAuto.value || '');
      const items = ((getCfg().checklist && getCfg().checklist.items) || []).concat([
        { id: 'c-' + Date.now().toString(36), text, done: false, ...(autoKey ? { auto: true, autoKey } : {}) }
      ]);
      setConfig({ checklist: { items } });
      checklistInput.value = '';
      if (checklistAuto) checklistAuto.value = '';
      renderChecklist();
    });
    checklistInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        checklistAddBtn.click();
      }
    });
  }
  if (checklistList) {
    checklistList.addEventListener('click', (event) => {
      const toggle = event.target.closest('[data-check-toggle]');
      if (toggle) {
        const items = ((getCfg().checklist && getCfg().checklist.items) || []).map((item) =>
          item.id === toggle.dataset.checkToggle ? { ...item, done: toggle.checked } : item
        );
        setConfig({ checklist: { items } });
        toggle.closest('.check-item').classList.toggle('done', toggle.checked);
        return;
      }
      const remove = event.target.closest('[data-check-remove]');
      if (remove) {
        const items = ((getCfg().checklist && getCfg().checklist.items) || []).filter((item) => item.id !== remove.dataset.checkRemove);
        setConfig({ checklist: { items } });
        renderChecklist();
      }
    });
  }
  if (checklistResetBtn) {
    checklistResetBtn.addEventListener('click', () => {
      const items = ((getCfg().checklist && getCfg().checklist.items) || []).map((item) => ({ ...item, done: false }));
      setConfig({ checklist: { items, week: checklistWeekKey() } });
      renderChecklist();
      toast('Checkliste zurückgesetzt.', 'info', 1600);
    });
  }

  // Offene Checklisten-Punkte als Markdown-Liste in die aktive Notiz.
  const checklistToNoteBtn = qs('#checklistToNoteBtn');
  if (checklistToNoteBtn) {
    checklistToNoteBtn.addEventListener('click', () => {
      const items = ((getCfg().checklist && getCfg().checklist.items) || []).filter((item) => !item.done);
      if (!items.length) {
        toast('Keine offenen Punkte.', 'info', 1600);
        return;
      }
      const lines = items.map((item) => `- [ ] ${item.text}`);
      const open = notes.appendText(`## Checkliste\n${lines.join('\n')}`, '\n\n');
      toast(`${items.length} offene Punkte in Notiz ${open ? 'übertragen' : 'gespeichert'}.`, 'success', 2200);
    });
  }

  return {
    toggle: toggleChecklistPanel,
    open: openChecklistPanel,
    checkReset: checkChecklistReset,
    render: renderChecklist,
    weekKey: checklistWeekKey
  };
}
