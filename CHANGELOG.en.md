# Changelog

[Deutsche Version](CHANGELOG.md)

All notable changes to this project. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the versioning
follows [Semantic Versioning](https://semver.org/).

## [1.10.0] – 2026-11-26

### Added

- **OR search** – `Testgewehr OR Granaten-Arme` matches both terms; quotes
  and operators still work.
- **Data migration as a module** – the adoption of old installation data is
  tested in isolation (copy, `.bak`, no overwrite, empty source).
- **Local API/Stream Deck** – new actions `/action/outbox/open`,
  `/action/outbox/send`, `/action/loadout/queue` and
  `/action/champion-audit`.
- **Full-shell smoke** – the smoke test also checks the offline outbox,
  loadout queue and champion audit panels.

### Changed

- **Release workflow** verifies the built checksums and runs the portable
  smoke since 1.9.0; data migration is now a separate CI step.
- E2E expanded to **517** steps, app features to **101** checks.

## [1.9.0] – 2026-11-26

### Added

- **Config recovery** – the last valid `config.json` is kept as `.bak` before
  every save; a broken file is restored from it first. The installer also
  writes a `.bak` when migrating.
- **Persistent loadout queue** – pending entries survive a restart and are
  resumed deliberately with “Resume”.
- **Offline outbox expanded** – conflict preview per action, exponential
  backoff with a next-attempt time, plus lock/unlock and mod-socket actions.
- **Search 2.0** – matches are highlighted in the item popup and perk names;
  saved searches can be renamed, deleted individually or all at once.
- **Champion audit with undo** – corrections can be reverted in one click.
- **HUD editor** – chips can be dragged directly in the overlay bar; each chip
  can be set to “Always / PvE / PvP”.
- **Dashboard** – per-card size (Alt+right-click), a “Today” layout and a PNG
  export of the visible dashboard.
- **Command palette** – commands for sending/opening the outbox, the loadout
  queue and the champion audit.

### Changed

- **English dictionary loads on demand** – German startup no longer loads the
  356 KB file.
- **Release workflow** also verifies the built checksums and runs a portable
  smoke test on the real build artifacts.
- HUD panel focus, `aria-modal` and reduced-motion rules added.

### Technical

- E2E expanded to **516** steps, app features to **98** checks.
- Config test covers recovery from `config.json.bak`.

## [1.8.1] – 2026-11-26

### Fixed

- **Setup updates keep user data and the Bungie login** – the installed
  version now always stores its data in
  `%APPDATA%\FreakItOut's Destiny 2 Tool`, never in the installation folder.
  Setup updates therefore no longer replace the configuration or encrypted
  tokens.
- **Automatic migration of old installation data** – existing
  `Daten\config.json` and backups from older installs are copied once to
  `%APPDATA%` during setup or on first start; an existing newer configuration
  is never overwritten.
- **Uninstall keeps the data** – `deleteAppDataOnUninstall` is explicitly
  disabled; delete the data folder manually to remove everything.
- **Portable detection unchanged** – the portable EXE still uses the `Daten`
  folder next to the EXE.
- Version **1.8.1**.

## [1.8.0] – 2026-11-26

### Added

- **Offline outbox with detail panel** – pending transfers and equips can be
  retried, removed and reordered individually. Before sending, the app checks
  whether the action is still needed (item already at the target, no longer
  present).
- **Loadout queue panel** – pause/resume, reorder entries, retry failures,
  remove single entries and clear finished ones.
- **HUD editor expanded** – drag & drop or ↑/↓ reordering, per-chip size and
  colour, profiles per monitor/DPI, JSON export/import.
- **Champion audit** – a single view of all weapons without a detected
  breaker with bulk assignment plus override import/export.
- **Search 2.0** – matches are highlighted in the tooltip; the filter menu
  explains all operators and examples.
- **Release workflow** – `v*` tags build portable, setup, plugin, SBOM and
  checksums automatically and attach them to the GitHub release.

### Changed

- **Settings load only when opened** (dynamic import); the key bindings live
  in a small dedicated file.
- **HUD code moved** to `renderer/js/overlay-hud.js`.
- **Smoke test** now checks the full navigation
  dashboard → inventory → tools and the HUD editor.
- **Visual baselines** extended with dashboard and settings.

### Removed

- The hidden settings pages **“Websites”** and **“Custom sites”** including
  their UI wiring. The app only shows its own views.

### Technical

- App feature test expanded to **91** checks, E2E to **512** steps.

## [1.7.0] – 2026-11-26

### Added

- **Offline outbox** – failed transfers and equips are buffered locally and
  retried on the next connection, on refresh, or via button. A visible bar
  shows the count and last error, with “Send now” and “Discard” actions.
- **HUD editor in the overlay** – reorder chips with ↑/↓, hide them
  individually, choose Small/Normal/Large/XL, save profiles (All/PvP/Raid),
  apply them, and optionally switch automatically by detected activity.
  “Reset” restores the default layout.
- **Dashboard cards** – size S/M/L, a live filter across all cards with a
  match count, and a **PNG export** for the activity analytics.
- Version **1.7.0**.

### Changed

- The overlay chip order now covers every chip: reset, weekly, stopwatch,
  session, status, champion, battery, vault, mini dashboard and focus.
- The chip order in settings lists the same elements.

### Removed

- The invisible legacy web bar (`#legacyBrowser`) and its event wiring, web
  error buttons and tray page opening. The app starts without a web container;
  the smoke test no longer expects tabs.
- Dead web focus/page paths in the startup flow.

### Technical

- Portable and setup builds now use **maximum compression** and active ASAR.
- App feature test expanded to **83** checks, E2E to **495** steps.

## [1.6.0] – 2026-11-26

### Added

- **Champion audit** – the new `is:nochamp` search and “No Champion” quick
  filter show weapons without a detected breaker. Tooltip/popup now name the
  source (item data, frame, manual, none).
- **Sticky character headers** – Guardian and vault headers stay visible while
  scrolling.
- **Back-to-top button** in the inventory after 400 px of scrolling.
- **Loadout queue bar** – visible status with the current loadout, progress and
  skipped entries.
- **CSV export** for the 90-day activity history in the analytics section.
- Version **1.6.0**.

## [1.5.6] – 2026-11-26

### Changed

- **More compact inventory header** – title, subtitle and header buttons are
  flatter (smaller type, removed default margins, 26 px buttons). This gains
  an extra content row without hurting TV readability.
- Version **1.5.6**.

## [1.5.5] – 2026-11-26

### Removed

- **Empty info boxes in the inventory** – the never-filled
  `inventoryDetail` bar is removed; empty result, status and loadout bars are
  hidden instead of taking up space as empty frames.
- Version **1.5.5**.

## [1.5.4] – 2026-11-26

### Fixed

- **Champion display on all weapons** – weapons without a detected intrinsic
  breaker now show a neutral “–” with the tooltip “No Champion breaker”
  instead of no indicator at all.
- **Search filters by default** – the new “Matches only” switch hides
  non-matching tiles and empty rows; vault lists expand automatically during
  a search. The switch can restore dim-only behaviour.
- **E2E** checks the match filtering and still requires real Champion badges
  (not the neutral “–”).
- Version **1.5.4**.

## [1.5.3] – 2026-11-26

### Fixed

- **Controller could not reach all inventory elements** – focus navigation was
  limited to `#inventoryView`; title bar, app bar and overlay bar were outside.
  The D-pad now navigates the entire visible interface while hidden panels stay
  filtered out.
- **E2E** additionally checks that off-screen tiles remain focusable in
  controller mode.
- Version **1.5.3**.

## [1.5.2] – 2026-11-26

### Fixed

- **Overlay inventory was unusable** – in the overlay the inventory is now
  opaque, without duplicate title/status/legend rows and with a compact
  header. The overlay bar shrinks to the necessary actions while the
  inventory is open.
- **More items at once** – overlay tiles are 64 px and use the full cell width
  (`auto-fill`); the postmaster only shows occupied slots plus a buffer.
- **E2E** checks overlay columns, tile size and hidden bars.
- Version **1.5.2**.

## [1.5.1] – 2026-11-26

### Fixed

- **TV inventory showed too little** – tile rows now use the full cell width
  (`auto-fill` instead of three fixed columns), the postmaster renders only
  occupied slots plus a small buffer instead of 21 empty ones, and the header,
  filters and tabs are more compact in TV mode. Many more items are visible at
  once.
- **E2E** now checks the TV column count and larger TV tiles.
- Version **1.5.1**.

## [1.5.0] – 2026-11-25

### Added

- **Dashboard focus mode** – by default only Guardian, priorities, analytics
  and the weekly checklist; “Show all” reveals the remaining cards. The
  choice is saved.
- **Simple/advanced settings** – Steam Input, security and diagnostics only
  appear in advanced mode; the overlay bar stays available by default.
- **Loadout queue** – apply multiple loadouts in sequence, with progress and
  skipping of blocking conflicts.
- **Conflict detection before applying** – multiple exotics, wrong class and
  missing items are reported before applying.
- **90-day activity history** – daily aggregates are stored locally and shown
  as a trend in the analytics section.
- **SBOM** – CycloneDX file (`dist/sbom.cdx.json`) and checksum entry.
- **Tools button** in the app bar.
- **Smoke test** now checks focus mode and the slim shell.

### Fixed

- **Calendar days across daylight saving** – activity streaks and the heatmap
  use calendar days instead of 24-hour steps.

### Changed

- **More compact app bar** without a label and with reduced height.
- **CSP** only allows connections to Bungie instead of all HTTPS targets.
- Version **1.5.0**; app features **77**, E2E **482**, verify **48**.

## [1.4.0] – 2026-11-25

### Removed

- **All embedded websites** – tabs, favourites, categories, page picker,
  address bar, find-in-page, webview area and the site navigation in the
  overlay are gone. The app starts directly on the dashboard.
- **Website settings** – “Websites” and “Custom pages” are removed from the
  settings navigation; their panels are no longer shown.
- **Mini mode, split view, PiP and page zoom**, including their shortcuts and
  palette commands.
- **Webview support in the main process** (`webviewTag` disabled, frame
  sources limited to `none`) and the `/action/mini` endpoint.

### Changed

- **Slim app bar** with only inventory, checklist, overlay, notes, key legend,
  settings and help.
- **Reset/Xûr chips** open the dashboard or vendor view instead of a website;
  DIM links open in the default browser.
- Version **1.4.0**; E2E **482**, app features **73**, verify **48**.

## [1.3.0] – 2026-11-25

### Added

- **Dashboard analytics** – new “Activity analytics” card with 7/30-day KPIs
  (activities, raids/dungeons, Grandmaster, PvP incl. Trials, K/D, streak,
  play time), a 14-day bar chart, a 12-week heatmap, category distribution
  and top activities.
- **Longer activity history** – Bungie history is now loaded for all
  characters with up to 100 entries each (deduplicated, sorted by date) and
  enriched with mode type, activity type and mode category. “Last activities”
  still shows the six most recent.
- **Shared fetch** – analytics and the activity list share cache and request;
  “Reload” refreshes both cards.
- **Tests** – new analytics test (27 checks) and five E2E checks for KPIs,
  bars, heatmap and categories.

### Changed

- Version **1.3.0**; E2E now has **482 steps**, app features **73**.

## [1.2.0] – 2026-11-25

### Added

- **Inventory virtualization** – tiles have a fixed height and are only
  painted in the visible area (`content-visibility`). Building stays fast and
  the scroll height stays stable even with 1,700+ items.
- **Chunked loading** – fully expanded vault lists render 120 tiles first;
  “load 120 more” and scrolling append the next chunk. The DOM stays small and
  the scroll position is preserved.
- E2E checks for the chunk plan, the first 120-tile block and paint
  virtualization.

### Fixed

- **Scroll jump on re-render** – `overflow-anchor: none` stops growing
  off-screen rows from moving the position.
- **TV mode** – tile and grid width (76 px) match again; the fixed tile height
  is 104 px.

### Changed

- Version **1.2.0**; app feature test now has **72 checks**, E2E **477**.

## [1.1.0] – 2026-11-25

### Added

- **Stream Deck: connection action** – checks API, token and app version,
  shows status as icon/title and opens diagnostics on failure.
- **Stream Deck: encoders for loadouts, vendors and checklist** – rotate to
  select, press to apply/open/tick.
- **Stream Deck: routine recipes** – standard, postmaster, week, vendor and
  raid prep selectable in the property inspector.
- **Stream Deck: profile mode** – automatic profile switching by exact
  activity or category (PvE/PvP/Gambit).
- **Stream Deck: toggle icons** – overlay and read-only show their state as a
  coloured icon instead of text only.
- **Stream Deck: connection test** shows app and plugin version.
- **Vendor page** explains why vendors are missing (Xûr Fri–Tue, Iron Banner/
  Trials only in their week).

### Fixed

- **Umlauts/mojibake** in the Stream Deck manifest, property inspector and
  plugin labels (“Händler”, “Aktivität”, “Xûr”, “Öffnet”, “Schließt” …).
- **Mojibake in app strings** (e.g. “Größe”, “regelmäßig”, “öffentlich”)
  caused by a faulty string repair.
- **Version parity** between app and Stream Deck plugin is now checked.

### Changed

- Version **1.1.0**; Stream Deck now includes **30 actions**.

## [1.0.0] – 2026-11-25

First public release.

### Added

- **Tool center** with overview, builds, collection/cleanup, week and vendors.
- **Inventory & loadout editor** in DIM style: tiles, operator search, filter
  chips, multi-select, duplicates to vault, loadout import/export (JSON, DIM,
  d2armorpicker, guardian.report), optimizer and undo.
- **Armor 3.0** with 0–200 stat scale, gear tier, archetype, tertiary/tuning
  stat, set bonuses, masterwork planner and armor wishlist.
- **Build tools**: Champion planner, build gap analysis, breakpoint solver,
  build card as PNG/text, stat HUD.
- **Crafting and collection tools**: open patterns, red-border progress,
  material plan, triumph and collection overview, snapshot diff.
- **Vendors & Xûr**: offers and rolls, categories, sub-vendors, shopping
  optimizer, price history, watchlist and deep links.
- **Dashboard** with Guardian overview, power/infusion, Champion check,
  triumphs, collection/vault, Bungie and data status, season goals and recent
  activities.
- **Overlay** on top of the game incl. postmaster counter, overlay layouts,
  stat HUD, post-game card and auto-recap.
- **Controller support** via XInput (also without window focus), virtual
  cursor, quick menu, on-screen keyboard, calibration, noise filter and freely
  mappable buttons.
- **Stream Deck & local API** with tokens, short URLs, live keys, SVG badges,
  SSE, jobs and an optional plugin.
- **Security**: encrypted credentials (Windows DPAPI), encrypted config
  backups (AES-256-GCM), read-only mode, PIN lock and secret redaction in
  diagnostic exports.
- **Accessibility**: colour modes, high contrast, focus rings, UI zoom and
  reduced motion.

### Fixed

- **Scrolling**: the view no longer jumps to the top. Search/filter fields,
  background renders and nested renders keep the position reliably.
- **Scroll glitches**: incorrect lazy-paint heights (`content-visibility`) and
  a blurred sticky bar caused jumping layout; both were removed.
- **Small jumps after scrolling**: open disclosure panels (“Jump to …”, area
  selector) stay open after a render.
- **Controller scrolling** now works in the tool center as well.
- **Vendor images**: internal sub-shelves without icon/name are hidden;
  missing icons get a placeholder instead of a broken image.
- **Recent activities on the dashboard**: the Bungie endpoint is called via
  `/Account/`; instance ID, K/D/A and mode names are read. Activity
  definitions are cached on disk per manifest version.
- **Xûr/vendor data** loads more robustly; unavailable vendors no longer
  create empty cards.
- **Stream Deck API**: action paths, jobs and token management were unified.

### Removed

- **“Quit Destiny 2”** from the main window, overlay, settings, command
  palette and IPC. Windows denies terminating the protected game process, so
  the function was unusable. “Start Destiny 2” remains.

### Security

- The repository contains **no** API keys, OAuth tokens, client secrets,
  passwords or configuration files.
- Credentials are stored locally and encrypted only.
- `.gitignore` excludes `config.json`, `Daten/`, `dist/`, logs and local
  backups.
