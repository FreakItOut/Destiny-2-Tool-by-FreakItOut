# Changelog

[Deutsche Version](CHANGELOG.md)

All notable changes to this project. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the versioning
follows [Semantic Versioning](https://semver.org/).

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
