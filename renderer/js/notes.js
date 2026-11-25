// ============================================================
// Notizen (Phase 3: aus app.js extrahiert)
// ============================================================
// In-App-Notizen / Raid-Callouts mit mehreren Blättern, optional
// Ordner-Modus (.md-Dateien über den Hauptprozess), Suche mit
// Trefferliste, Auto-Save, Doppelklick-Rename, Markdown-Vorschau
// und Export. Bekommt die App-Abhängigkeiten per Kontext (ctx).

export function createNotes(ctx) {
  const { api, qs, toast, escapeHtml, getCfg, setConfig } = ctx;

  const notesPanel = qs('#notesPanel');
  const notesText = qs('#notesText');
  const notesPreview = qs('#notesPreview');
  const notesPreviewBtn = qs('#notesPreviewBtn');
  const notesSaveBtn = qs('#notesSaveBtn');
  const notesCloseBtn = qs('#notesCloseBtn');
  const notesExportBtn = qs('#notesExportBtn');
  const notesTabs = qs('#notesTabs');
  const overlayNotesBtn = qs('#overlayNotesBtn');
  const toolbarNotesBtn = qs('#toolbarNotesBtn');
  const notesSearch = qs('#notesSearch');
  const notesResults = qs('#notesResults');

  let notesDirty = false;
  let notesAutosaveTimer = null;

  function overlayCfg() {
    return (getCfg().overlay || {});
  }

  function noteSheets() {
    const overlay = overlayCfg();
    return Array.isArray(overlay.notesList) ? overlay.notesList : [];
  }

  function activeNoteId() {
    const list = noteSheets();
    const wanted = String(overlayCfg().notesActive || '');
    if (list.some((note) => note.id === wanted)) return wanted;
    return list[0] ? list[0].id : '';
  }

  // Ordner-Modus: Notizen liegen als .md-Dateien in einem gewählten
  // Ordner (z. B. in Dropbox/OneDrive). Dann ersetzen die Dateien die
  // Config-Blätter - Laden/Speichern läuft über den Hauptprozess.
  const notesFolderMode = () => Boolean(overlayCfg().notesFolder);
  let folderNotes = [];
  let folderActive = '';

  function folderTabName(file) {
    return String(file || '').replace(/\.md$/i, '');
  }

  async function loadFolderNote(name) {
    if (!notesText) return;
    if (!name) {
      notesText.value = '';
      return;
    }
    const result = await api.notesFolderRead(name);
    notesText.value = result && result.ok ? String(result.content || '') : '';
    if (result && !result.ok) toast(result.error || 'Notiz konnte nicht gelesen werden.', 'error');
  }

  async function saveActiveFolderNote() {
    if (!folderActive) return;
    const result = await api.notesFolderWrite(folderActive, notesText ? notesText.value : '');
    if (!result || !result.ok) toast((result && result.error) || 'Notiz konnte nicht gespeichert werden.', 'error');
  }

  async function refreshFolderNotes(selectName) {
    try {
      const result = await api.notesFolderList();
      folderNotes = result && result.ok ? result.files || [] : [];
      if (!folderNotes.length) {
        // Erstes Blatt automatisch anlegen.
        await api.notesFolderWrite('Notizen.md', '');
        const again = await api.notesFolderList();
        folderNotes = again && again.ok ? again.files || [] : [];
      }
      folderActive =
        (selectName && folderNotes.includes(selectName) && selectName) ||
        (folderNotes.includes(folderActive) && folderActive) ||
        folderNotes[0] ||
        '';
      await loadFolderNote(folderActive);
    } catch (error) {
      folderNotes = [];
      folderActive = '';
    }
  }

  function saveActiveNoteText() {
    // Den aktuell im Editor stehenden Text ins Modell übernehmen
    // (beim Blattwechsel, bevor gewechselt wird).
    const id = activeNoteId();
    if (!id || !notesText) return;
    const list = noteSheets();
    const index = list.findIndex((note) => note.id === id);
    if (index < 0) return;
    if (list[index].text === notesText.value) return;
    const next = list.map((note) => (note.id === id ? { ...note, text: notesText.value } : note));
    setConfig({ overlay: { notesList: next } });
  }

  function renderNotesTabs() {
    if (!notesTabs) return;
    if (notesFolderMode()) {
      notesTabs.innerHTML =
        folderNotes
          .map(
            (file) =>
              `<div class="notes-tab ${file === folderActive ? 'active' : ''}" data-note-id="${escapeHtml(file)}" title="${escapeHtml(file)}">` +
              `<button class="notes-tab-name" data-note-select="${escapeHtml(file)}">${escapeHtml(folderTabName(file))}</button>` +
              (folderNotes.length > 1
                ? `<button class="notes-tab-close" data-note-delete="${escapeHtml(file)}" title="Datei löschen" aria-label="Datei löschen">×</button>`
                : '') +
              `</div>`
          )
          .join('') +
        (folderNotes.length < 30 ? '<button class="notes-tab-add" data-note-add title="Neue Notiz-Datei">+</button>' : '');
      return;
    }
    const list = noteSheets();
    const active = activeNoteId();
    notesTabs.innerHTML =
      list
        .map(
          (note) =>
            `<div class="notes-tab ${note.id === active ? 'active' : ''}" data-note-id="${escapeHtml(note.id)}" title="${escapeHtml(note.name)}">` +
            `<button class="notes-tab-name" data-note-select="${escapeHtml(note.id)}">${escapeHtml(note.name)}</button>` +
            (list.length > 1
              ? `<button class="notes-tab-close" data-note-delete="${escapeHtml(note.id)}" title="Blatt löschen" aria-label="Blatt löschen">×</button>`
              : '') +
            `</div>`
        )
        .join('') +
      (list.length < 12 ? '<button class="notes-tab-add" data-note-add title="Neues Notiz-Blatt">+</button>' : '');
  }

  function loadActiveNote() {
    const list = noteSheets();
    const note = list.find((entry) => entry.id === activeNoteId());
    if (notesText) notesText.value = note ? note.text : '';
  }

  function openNotes() {
    if (!notesPanel || !notesText) return;
    notesPanel.classList.remove('hidden');
    // Vorschau zurücksetzen.
    if (notesPreview) notesPreview.classList.add('hidden');
    if (notesText) notesText.classList.remove('hidden');
    if (notesPreviewBtn) notesPreviewBtn.textContent = 'Vorschau';
    notesDirty = false;
    if (notesFolderMode()) {
      refreshFolderNotes().then(() => {
        notesDirty = false;
        renderNotesTabs();
        notesText.focus();
      });
    } else {
      loadActiveNote();
      renderNotesTabs();
      notesText.focus();
    }
    // Auto-Save: alle 5 Sekunden geänderten Text sichern (kein Toast).
    if (notesAutosaveTimer) clearInterval(notesAutosaveTimer);
    notesAutosaveTimer = setInterval(() => {
      if (notesPanel.classList.contains('hidden') || !notesDirty) return;
      notesDirty = false;
      if (notesFolderMode()) saveActiveFolderNote();
      else {
        const id = activeNoteId();
        const list = noteSheets();
        const next = list.map((note) => (note.id === id ? { ...note, text: notesText ? notesText.value : '' } : note));
        setConfig({ overlay: { notesList: next } });
      }
    }, 5000);
    if (notesAutosaveTimer.unref) notesAutosaveTimer.unref();
  }

  // Einfacher Markdown-Renderer für Notizen.
  function renderMarkdown(text) {
    if (!text) return '<p style="color:var(--muted-2)">Keine Notizen.</p>';
    // HTML escapen, damit keine Skripte injiziert werden koennen (XSS).
    const escape = (str) => String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
    const lines = String(text).split('\n');
    const html = [];
    let inList = false;
    for (const raw of lines) {
      const line = raw.trim();
      if (!line) {
        if (inList) { html.push('</ul>'); inList = false; }
        continue;
      }
      // Erst escapen, dann Markdown-Formatierung anwenden.
      const escaped = escape(line);
      const formatted = escaped
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.+?)\*/g, '<em>$1</em>');
      if (escaped.startsWith('## ')) {
        if (inList) { html.push('</ul>'); inList = false; }
        html.push(`<h4>${formatted.slice(3)}</h4>`);
      } else if (escaped.startsWith('# ')) {
        if (inList) { html.push('</ul>'); inList = false; }
        html.push(`<h3>${formatted.slice(2)}</h3>`);
      } else if (escaped.startsWith('- ') || escaped.startsWith('* ')) {
        if (!inList) { html.push('<ul>'); inList = true; }
        html.push(`<li>${formatted.slice(2)}</li>`);
      } else {
        if (inList) { html.push('</ul>'); inList = false; }
        html.push(`<p>${formatted}</p>`);
      }
    }
    if (inList) html.push('</ul>');
    return html.join('\n');
  }

  function closeNotes() {
    if (notesPanel) notesPanel.classList.add('hidden');
    // Offene Änderungen beim Schließen sichern (Auto-Save-Nachläufer).
    if (notesDirty && notesText) {
      notesDirty = false;
      if (notesFolderMode()) saveActiveFolderNote();
      else {
        const id = activeNoteId();
        const list = noteSheets();
        const next = list.map((note) => (note.id === id ? { ...note, text: notesText.value } : note));
        setConfig({ overlay: { notesList: next } });
      }
    }
    if (notesAutosaveTimer) { clearInterval(notesAutosaveTimer); notesAutosaveTimer = null; }
  }

  function isHidden() {
    return !notesPanel || notesPanel.classList.contains('hidden');
  }

  function isOpen() {
    return Boolean(notesPanel && !notesPanel.classList.contains('hidden'));
  }

  // Text in die Notizen schreiben: in den offenen Editor (mit
  // Auto-Save-Markierung) oder, falls das Panel zu ist, in das aktive
  // Blatt. Rückgabe: true = Editor offen, false = ins Blatt gesichert.
  function appendText(text, joiner) {
    const sep = String(joiner || '\n');
    if (isOpen() && notesText) {
      notesText.value = `${notesText.value}${notesText.value ? sep : ''}${text}`;
      notesDirty = true;
      return true;
    }
    const id = activeNoteId();
    const list = noteSheets();
    const next = list.map((note) => (note.id === id ? { ...note, text: `${note.text || ''}${note.text ? sep : ''}${text}` } : note));
    setConfig({ overlay: { notesList: next } });
    return false;
  }

  if (overlayNotesBtn) {
    overlayNotesBtn.addEventListener('click', () => {
      if (isHidden()) openNotes();
      else closeNotes();
    });
  }
  if (toolbarNotesBtn) {
    toolbarNotesBtn.addEventListener('click', () => {
      if (isHidden()) openNotes();
      else closeNotes();
    });
  }
  if (notesCloseBtn) {
    notesCloseBtn.addEventListener('click', closeNotes);
  }
  if (notesText) {
    notesText.addEventListener('input', () => { notesDirty = true; });
  }
  if (notesSaveBtn) {
    notesSaveBtn.addEventListener('click', async () => {
      if (notesFolderMode()) {
        await saveActiveFolderNote();
        toast('Notiz gespeichert', 'success', 1500);
        closeNotes();
        return;
      }
      const id = activeNoteId();
      const list = noteSheets();
      const next = list.map((note) => (note.id === id ? { ...note, text: notesText ? notesText.value : '' } : note));
      setConfig({ overlay: { notesList: next } });
      toast('Notizen gespeichert', 'success', 1500);
      closeNotes();
    });
  }

  // Notiz-Blatt umbenennen (Doppelklick auf den Reiternamen):
  // Config-Modus schreibt den Namen in die Blattliste, Ordner-Modus
  // benennt die Datei um.
  function startNoteRename(tabElement) {
    if (!tabElement || !notesTabs) return;
    const nameButton = tabElement.querySelector('.notes-tab-name');
    if (!nameButton || tabElement.querySelector('.notes-rename')) return;
    const selectId = nameButton.dataset.noteSelect;
    const currentName = notesFolderMode() ? String(selectId || '').replace(/\.md$/i, '') : nameButton.textContent;
    nameButton.outerHTML = `<input class="notes-rename" data-note-rename-id="${escapeHtml(selectId)}" value="${escapeHtml(currentName)}" maxlength="${notesFolderMode() ? 60 : 30}">`;
    const input = qs('.notes-rename', tabElement);
    if (!input) return;
    input.focus();
    input.select();
    const commit = async () => {
      const newName = String(input.value || '').trim();
      if (!newName || newName === currentName) { renderNotesTabs(); return; }
      if (notesFolderMode()) {
        const oldFile = selectId;
        const newFile = `${newName}.md`;
        const result = await api.notesFolderRename(oldFile, newFile);
        if (!result || !result.ok) {
          toast((result && result.error) || 'Umbenennen fehlgeschlagen.', 'error', 2200);
          renderNotesTabs();
          return;
        }
        folderActive = newFile;
        await refreshFolderNotes(newFile);
        renderNotesTabs();
        toast('Notiz umbenannt.', 'success', 1600);
        return;
      }
      const list = noteSheets();
      const next = list.map((note) => (note.id === selectId ? { ...note, name: newName.slice(0, 30) } : note));
      setConfig({ overlay: { notesList: next } });
      renderNotesTabs();
      toast('Notiz umbenannt.', 'success', 1600);
    };
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        commit();
      } else if (event.key === 'Escape') {
        event.preventDefault();
        renderNotesTabs();
      }
    });
    input.addEventListener('blur', () => commit());
  }

  if (notesTabs) {
    notesTabs.addEventListener('dblclick', (event) => {
      const tab = event.target.closest('.notes-tab');
      if (tab) startNoteRename(tab);
    });
  }

  // Notiz-Blatt-Wechsel, neues Blatt, Blatt löschen (sowohl im Config-
  // als auch im Ordner-Modus).
  if (notesTabs) {
    notesTabs.addEventListener('click', async (event) => {
      if (notesFolderMode()) {
        const folderSelect = event.target.closest('[data-note-select]');
        if (folderSelect) {
          const target = folderSelect.dataset.noteSelect;
          if (target === folderActive) return;
          await saveActiveFolderNote();
          folderActive = target;
          await loadFolderNote(target);
          renderNotesTabs();
          if (notesPreview && !notesPreview.classList.contains('hidden') && notesText) {
            notesPreview.innerHTML = renderMarkdown(notesText.value);
          }
          return;
        }
        const folderAdd = event.target.closest('[data-note-add]');
        if (folderAdd) {
          await saveActiveFolderNote();
          let counter = 1;
          while (folderNotes.includes(`Notiz-${counter}.md`)) counter += 1;
          const name = `Notiz-${counter}.md`;
          const result = await api.notesFolderWrite(name, '');
          if (!result || !result.ok) {
            toast((result && result.error) || 'Datei konnte nicht angelegt werden.', 'error');
            return;
          }
          await refreshFolderNotes(name);
          renderNotesTabs();
          toast(`Notiz-Datei ${folderTabName(name)} angelegt.`, 'success', 1600);
          return;
        }
        const folderDelete = event.target.closest('[data-note-delete]');
        if (folderDelete) {
          const name = folderDelete.dataset.noteDelete;
          if (folderNotes.length <= 1) return;
          if (!window.confirm(`Notiz-Datei "${folderTabName(name)}" wirklich löschen?`)) return;
          const result = await api.notesFolderDelete(name);
          if (!result || !result.ok) {
            toast((result && result.error) || 'Datei konnte nicht gelöscht werden.', 'error');
            return;
          }
          await refreshFolderNotes();
          renderNotesTabs();
          toast('Notiz-Datei gelöscht.', 'info', 1500);
        }
        return;
      }
      const selectButton = event.target.closest('[data-note-select]');
      if (selectButton) {
        const targetId = selectButton.dataset.noteSelect;
        if (targetId === activeNoteId()) return;
        saveActiveNoteText();
        // cfg sofort synchron setzen (setConfig uebernimmt sofort nur
        // das Speichern).
        setConfig({ overlay: { notesActive: targetId } });
        loadActiveNote();
        renderNotesTabs();
        if (notesPreview && !notesPreview.classList.contains('hidden')) {
          notesPreview.innerHTML = renderMarkdown(notesText.value);
        }
        return;
      }
      const addNoteButton = event.target.closest('[data-note-add]');
      if (addNoteButton) {
        saveActiveNoteText();
        const list = noteSheets();
        const id = 'n-' + Date.now().toString(36);
        const next = list.concat([{ id, name: `Notiz ${list.length + 1}`, text: '' }]);
        setConfig({ overlay: { notesList: next, notesActive: id } });
        setConfig({ overlay: { notesList: next, notesActive: id } });
        loadActiveNote();
        renderNotesTabs();
        if (notesPreview) notesPreview.classList.add('hidden');
        if (notesText) notesText.classList.remove('hidden');
        if (notesPreviewBtn) notesPreviewBtn.textContent = 'Vorschau';
        notesText.focus();
        toast('Neues Notiz-Blatt angelegt.', 'success', 1500);
        return;
      }
      const deleteButton = event.target.closest('[data-note-delete]');
      if (deleteButton) {
        const id = deleteButton.dataset.noteDelete;
        const list = noteSheets();
        if (list.length <= 1) return;
        const note = list.find((entry) => entry.id === id);
        if (!window.confirm(`Notiz-Blatt "${note ? note.name : id}" wirklich löschen?`)) return;
        const next = list.filter((entry) => entry.id !== id);
        const nextActive = id === activeNoteId() ? (next[0] ? next[0].id : '') : activeNoteId();
        setConfig({ overlay: { notesList: next, notesActive: nextActive } });
        setConfig({ overlay: { notesList: next, notesActive: nextActive } });
        loadActiveNote();
        renderNotesTabs();
        toast('Notiz-Blatt gelöscht.', 'info', 1500);
      }
    });
  }

  // Notiz-Durchsuchen: alle Blätter (bzw. .md-Dateien im Ordner-
  // Modus) nach einem Begriff durchsuchen, Treffer anklickbar.
  if (notesSearch) {
    notesSearch.addEventListener('input', async () => {
      if (!notesResults) return;
      const query = String(notesSearch.value || '').trim().toLowerCase();
      if (!query) {
        notesResults.innerHTML = '';
        return;
      }
      const hits = [];
      if (notesFolderMode()) {
        for (const file of folderNotes) {
          if (hits.length >= 20) break;
          try {
            const result = await api.notesFolderRead(file);
            if (!result || !result.ok) continue;
            String(result.content || '').split('\n').forEach((line, index) => {
              if (line.toLowerCase().includes(query)) {
                hits.push({ id: file, title: folderTabName(file), line: index + 1, text: line.trim().slice(0, 90) });
              }
            });
          } catch (error) {
            // Datei überspringen.
          }
        }
      } else {
        for (const note of noteSheets()) {
          String(note.text || '').split('\n').forEach((line, index) => {
            if (line.toLowerCase().includes(query)) {
              hits.push({ id: note.id, title: note.name, line: index + 1, text: line.trim().slice(0, 90) });
            }
          });
        }
      }
      const sliced = hits.slice(0, 20);
      notesResults.innerHTML = sliced.length
        ? sliced
            .map(
              (hit) =>
                `<button class="notes-hit" data-notes-hit="${escapeHtml(hit.id)}" title="Blatt öffnen">` +
                `<strong>${escapeHtml(hit.title)}</strong> · Zeile ${hit.line}<span>${escapeHtml(hit.text)}</span></button>`
            )
            .join('')
        : '<div class="check-empty">Keine Treffer.</div>';
    });
  }
  if (notesResults) {
    notesResults.addEventListener('click', async (event) => {
      const hit = event.target.closest('[data-notes-hit]');
      if (!hit) return;
      if (notesFolderMode()) {
        folderActive = hit.dataset.notesHit;
        await loadFolderNote(folderActive);
        renderNotesTabs();
        if (notesPreview && !notesPreview.classList.contains('hidden') && notesText) {
          notesPreview.innerHTML = renderMarkdown(notesText.value);
        }
        return;
      }
      const targetId = hit.dataset.notesHit;
      saveActiveNoteText();
      setConfig({ overlay: { notesActive: targetId } });
      loadActiveNote();
      renderNotesTabs();
      if (notesSearch && notesSearch.value.trim() && notesText) {
        // Treffer im Editor selektieren (Hervorhebung).
        const found = notesText.value.toLowerCase().indexOf(String(notesSearch.value).trim().toLowerCase());
        if (found >= 0) {
          notesText.focus();
          notesText.setSelectionRange(found, found + String(notesSearch.value).trim().length);
        }
      }
      if (notesPreview && !notesPreview.classList.contains('hidden')) {
        notesPreview.innerHTML = renderMarkdown(notesText.value);
      }
    });
  }

  // Notizen als Markdown-Datei exportieren (das aktive Blatt).
  if (notesExportBtn) {
    notesExportBtn.addEventListener('click', async () => {
      const value = notesText ? String(notesText.value || '') : '';
      if (!value.trim()) {
        toast('Keine Notizen zum Exportieren.', 'warning', 1600);
        return;
      }
      const list = noteSheets();
      const note = list.find((entry) => entry.id === activeNoteId());
      const name = note ? note.name : 'Notizen';
      const header = `# ${name}\n\n_Exportiert am ${new Date().toLocaleString(window.i18n ? window.i18n.locale() : 'de-DE')}_\n\n`;
      const result = await api.exportNotes(header + value);
      if (result && result.ok) toast(`Notizen exportiert: ${result.path}`, 'success');
      else if (result && !result.canceled) toast((result && result.error) || 'Export fehlgeschlagen.', 'error');
    });
  }
  if (notesPreviewBtn && notesPreview && notesText) {
    notesPreviewBtn.addEventListener('click', () => {
      const isPreview = !notesPreview.classList.contains('hidden');
      if (isPreview) {
        // Zurück zur Bearbeitung.
        notesPreview.classList.add('hidden');
        notesText.classList.remove('hidden');
        notesPreviewBtn.textContent = 'Vorschau';
      } else {
        // Vorschau anzeigen.
        notesPreview.innerHTML = renderMarkdown(notesText.value);
        notesPreview.classList.remove('hidden');
        notesText.classList.add('hidden');
        notesPreviewBtn.textContent = 'Bearbeiten';
      }
    });
  }

  return {
    isHidden,
    isOpen,
    open: openNotes,
    close: closeNotes,
    openNotes,
    closeNotes,
    appendText,
    noteSheets,
    activeNoteId
  };
}
