# Destiny 2 Tool by FreakItOut

[Deutsch](README.md) · **English**

A desktop tool for Destiny 2: dashboard, inventory & loadouts, tools and an
overlay on top of the game – with global hotkeys and full controller support.
Built with Electron, without a bundler and without runtime dependencies other
than Electron itself.

![Icon](assets/icon.png)

## Download

The ready-to-run Windows builds are available under **Releases**:

- **`Destiny.2.Tool.by.FreakItOut.1.13.0.exe`** – portable version, no
  installation required.
- **`Destiny.2.Tool.by.FreakItOut.Setup.1.13.0.exe`** – installer.
- **`com.freakitout.d2tool.streamDeckPlugin`** – optional Stream Deck plugin.
- **`streamdeck-profile.json`** – matching Stream Deck profile.
- **`SHA256SUMS.txt`** – checksums for all files.

GitHub replaces spaces in release file names with dots; the checksums in
`SHA256SUMS.txt` refer to the original names.

More documents: [German README](README.md) · [Changelog](CHANGELOG.en.md) ·
[German changelog](CHANGELOG.md).

The packages contain **no API keys, OAuth tokens, passwords or account
data**. You use your own Bungie API key and your own Bungie login. All
credentials are stored locally on your PC (see
[Privacy & credentials](#privacy--credentials)).

The executables are not code-signed. Windows SmartScreen may therefore show
a warning on first start; the builds are created directly from this
repository.

## Features

- **Native views instead of websites** – dashboard, inventory/loadouts and
  the tool centre are native views; the former web bar has been removed
  entirely.
- **Offline outbox** – transfers and equips that fail offline or on a rate
  limit are buffered and sent automatically on the next connection.
- **HUD editor in the overlay** – reorder/hide chips, choose S/M/L/XL and save
  profiles for All/PvP/Raid; optionally switch automatically by activity.
- **Cards to measure** – dashboard cards in S/M/L, live search across all
  cards and a PNG export for the activity analytics.
- **Focus dashboard** – only the most important cards by default; “Show all”
  reveals the rest and the choice is saved.
- **Simple settings** – everyday options first, expert areas (Steam Input,
  security, diagnostics) behind “Advanced”.
- **Loadout queue** – apply multiple loadouts in sequence with conflict
  detection (exotics, class, missing items).
- **90-day history** – activity analytics stores daily aggregates locally and
  shows the longer trend.
- **Overlay on top of the game** – borderless, always-on-top window; size,
  position, monitor and opacity are configurable.
- **Global hotkeys** – work even while Destiny 2 has focus. Defaults:
  `Alt+D` for the overlay, `Alt+Shift+D` for mouse pass-through, `Alt+P` for
  the postmaster counter, `Alt+I` for the inventory (all configurable).
- **Controller support** – virtual cursor, clicking, scrolling and view
  switching. A freely recordable button pair (default `L3 + R3`) shows and
  hides the overlay.
- **Mouse pass-through** – clicks go through to the game while the overlay
  stays visible.
- **Reset and Xûr display** – countdown to the daily reset (17:00 UTC) and
  Xûr status in the header.
- **Tray** – the tool keeps running in the background; the overlay stays
  reachable via hotkey.
- **Champion planner** – shows per Guardian which Champions are covered by
  weapons, perks, mods and active artifact perks, including swap suggestions
  from the inventory.
- **Build gap analysis** – compares a saved target with a loadout: missing
  stats, items, mods and Champion coverage.
- **Crafting material plan** – sums all marked crafting targets and compares
  the material requirement with the current stock.
- **Vendor watch** – watched offers with price history, price-change hint and
  a direct detail link.
- **Post-game & auto-recap** – compact card after an activity with loot,
  goals and Champion check; optional automatic reminder.
- **Snapshot diff** – new, removed, moved and changed items since the last
  inventory fetch.
- **Active search chips** – remove individual filter terms.
- **Action queue** – retry or remove pending actions individually; Bungie
  requests are serialized.
- **Release pipeline** – `npm run release:all` verifies, builds and versions
  the app; `npm run preflight` closes running app processes and checks locked
  build files.

## Requirements

- Windows 10 or 11 (the overlay is designed for Windows).
- Destiny 2 in **borderless windowed mode**. Exclusive fullscreen sits above
  every other window; Windows cannot show an overlay there. This is a
  limitation of the game mode, not of the tool.
- For development: Node.js 20 or newer and npm.

## Installation and start

```powershell
npm install
npm start
```

On first start the configuration is created at

```
%APPDATA%\FreakItOut's Destiny 2 Tool\config.json
```

All changes are saved immediately.

Further commands:

```powershell
npm run dev         # with developer tools open
npm run check       # check syntax, files, imports and HTML IDs
npm run smoke       # automatic start test incl. overlay state changes
npm run test:oauth  # OAuth tests against a local fake Bungie server
npm run test:config # check persistence of loadouts/favourites/searches
npm run e2e         # inventory/loadout E2E in Electron
npm run test:full   # checks, OAuth, config, smoke and E2E
npm run icons       # regenerate icon files
npm run dist        # build Windows installer and portable version
```

## Using the overlay

1. In Destiny 2 open **Settings → Video** and select the **Borderless /
   Windowed** mode.
2. Press `Alt+D` in the tool (or use the controller combination).
3. The overlay appears centred over the game. The same hotkey hides it
   again.
4. `Alt+Shift+D` lets the mouse pass through the overlay to the game. Press
   it again to take the mouse back.
5. The **Window** button in the overlay bar returns to the normal window.

When hidden, the overlay stays alive in the background (invisible and
click-through). This is required so controller polling and global hotkeys
keep working while you play.

### Postmaster counter

Under **Settings → Overlay** (or in the tray menu) the **postmaster counter**
can be shown permanently: a small always-on-top window with the number of
items in the postmaster — per character, with a capacity of 21. It turns
yellow at 15 and red at 19 so you can visit the Tower in time. The window can
be moved freely (position is saved) and refreshes every 90 seconds; the
**Refresh now** button fetches a new state immediately.

Options: **compact** (number + bar only), **lock position**, **opacity** and
**only show while Destiny 2 is running**. Clicking the number opens the
inventory at the postmaster; right-click opens a menu (inventory, refresh,
settings, hide). The header shows the countdown to the daily reset. At 20/21
a one-time warning appears; when the postmaster is full the counter pulses
red.

### Overlay layouts

Overlay size, position, opacity, chip order and visible bar elements can be
saved as a **layout profile** (Settings → Overlay or Tray → “Overlay layout”).
Up to 8 profiles.

### Inventory & loadouts

- **Search with operators:** `is:godroll`, `is:dupe`, `is:equipped`,
  `is:locked`, `is:masterworked`, `perk:"Vorpal Weapon"`,
  `stat:health:>=20`, `power:>1990`, `slot:helmet`, `class:titan` – can be
  combined with free text. The old stat names (`resilience`, `discipline`,
  …) are still accepted and mapped to the Armor 3.0 stats
  (Health/Melee/Grenade/Super/Class/Weapons). Searches can be **saved as
  chips** (☆ save, right-click removes). Non-matching items are **dimmed**
  instead of removed – the tiles stay in place. The **✓ Godrolls** toggle
  highlights matches; **Wishlist** discards the 24 h cache and reloads
  immediately.
- **Multi-select:** Ctrl/Cmd- or Shift-click on tiles → bulk actions
  **→ Vault**, **Tag**, **Compare**.
- **Duplicates → vault:** moves duplicate items from the backpack, keeps the
  strongest copy on the character; failures can be retried.
- **Create loadout** first shows an in-app modal (missing items, mods,
  subclass plugs), saves the previous state including **armor mods** and
  offers **Undo** afterwards (result box and toast, up to 3 steps).
- **Loadout exchange:** **Export** copies all loadouts as JSON to the
  clipboard; **Import file…** reads a JSON file; **DIM link…** imports
  `dim.gg/…` links or loadout URLs with `?loadout=…` (DIM, d2armorpicker,
  guardian.report). Mods and subclass plugs are included.
- **Optimizer:** stat priorities plus **minimum values** per stat;
  combinations below them are discarded.
- **Armor:** stat total on the tile and in the tooltip. In the popup the stat
  bar runs on the **Armor 3.0 scale 0–200** with a marker at 100 and shows
  the current character total; the number on the right is the contribution
  of the armor piece. Character values in the inventory header and in the
  builds use the same scale (the bonus effect starts at 101); the stat
  optimizer includes the five possible stat mods (+10 per mod).
- **Armor 3.0 metadata:** tile badge for gear tier (T1–T5) and archetype;
  popup rows for archetype (primary/secondary), tertiary stat, tuning stat
  and armor set including the active 2-piece/4-piece bonus.
- **Search:** `basestat:`, `stat:total`, `basestat:total`, `tier:5`,
  `is:tier5`, `is:armor3.0`, `archetype:`, `tertiary:`, `tunedstat:`,
  `set:`, `note:`/`is:noted`, `dupe:stats`, `is:statlower`; sorting by power,
  name, rarity, **stat total**, **gear tier** and **archetype**.
- **Compare & clean up:** armor can now be compared with weapons; base stats
  with best/worse markers, warning for identical stats. Multi-select can
  **tag**, **favourite** and select “all non-favourites”.
- **Item notes:** a private note per item in the popup; appears as ✎ on the
  tile and is searchable via `note:`.
- **Unpack mods:** multi-select → “Unpack mods” removes armor/artifact mods
  from sockets via a Bungie action (mods stay in the inventory).
- **Tools:** set bonus check per character, optimizer with fragments, set
  bonuses, missing points up to 100/200 and real stat mod hashes; weekly
  overview with Xûr status and copy function; data status with snapshot age
  and manifest version.
- **Stat HUD:** small always-visible overlay with the six stats of the active
  character (0–200, 100 marker), character switch via ‹ ›.
- **Xûr:** godroll/near-godroll badges, “better than your best copy” and
  missing currencies directly on the offer.
- **Accessibility:** colour mode for red/green deficiency, visible keyboard
  focus rings; UI zoom remains adjustable.
- **Language:** **German/English** switch for the interface (Settings →
  Appearance). Item names and descriptions stay in the game language.
- **Breakpoint solver & build card:** targets 100/200 per stat, missing
  points, prefer set bonuses; share the build as a PNG card or text.
- **Masterwork/tuning planner:** shows masterwork bonus, tuning stat and
  alternative tuning mods per armor piece.
- **Armor wishlist:** rules for archetype, tertiary, tuning, set and minimum
  stats; matches via `is:armorwish` and W badge.
- **Vault cleanup:** strictly worse pieces, stat duplicates, pieces without a
  set, below T5; select “all matches” and undo actions.
- **Crafting:** open patterns, “still X red borders” and “only open” filter.
- **Vendor alerts:** Ada-1/Banshee mods incl. ownership and missing
  currencies; Xûr history with “new”/“no longer offered”.
- **Weekly dashboard:** grouping by GM/Nightfall, raid, dungeon, Trials, Iron
  Banner, season; reminder per activity.
- **Activity analytics:** 7/30-day KPIs (activities, raids/dungeons, GM, PvP,
  K/D, streak, play time), 14-day bars, 12-week heatmap, categories and top
  activities. Shares its fetch with “Last activities”.
- **Overlay:** stat HUD optionally shows the current activity and Champion
  abilities.
- **Security:** encrypted config backup (password, AES-256-GCM), API status
  (requests/429/queue), automatic renderer restart.
- **Accessibility:** high contrast, status symbols (✓/≈/▼/⧉) in addition to
  colour.
- **API key and client secret** are stored encrypted; the diagnostic export
  and the copy package redact all credentials.
- **Stream Deck:** local HTTP API with token, read-only/named tokens, short
  URLs, live keys, SVG badges, SSE, jobs and an optional plugin; **30
  actions**, including a connection check, encoders for loadouts/vendors/
  checklist and routine recipes; docs under `docs/stream-deck.md`.
- **Command palette:** `Ctrl+K` searches commands, tool pages, settings and
  quick actions without a mouse.
- **Data status:** header chip shows snapshot age, offline state and Bungie
  queue; Bungie errors are shown with concrete solution hints.
- **Auto checklist:** empty postmaster, vault below 1100 and no open godrolls
  can be watched as automatic weekly goals.
- **Multi-build targets & snapshots:** save and compare several stat target
  profiles and snapshot the current build state.
- **Security:** optional auto-lock after inactivity, PIN lockout and cleaned
  old backups; DPI/monitor changes are healed automatically.

## Keyboard

| Shortcut | Function |
| --- | --- |
| `Alt+D` | Show/hide overlay (configurable) |
| `Alt+Shift+D` | Mouse pass-through (configurable) |
| `Ctrl+K` | Open command palette |
| `Ctrl+Alt+D` | Toggle dashboard (global) |
| `Ctrl+Alt+I` | Open inventory |
| `Ctrl+Alt+1` … `5` | Open a tool view |
| `Esc` | Close dialog or hide overlay |

## Controller

Overlay mapping:

| Button | Function |
| --- | --- |
| Left/right stick | Move cursor (tooltips/perk explanations also appear with the controller) |
| A | Click / select |
| B | Back: closes item popup/loadout editor first, then dialog |
| X | Refresh (in inventory: refresh inventory) |
| Y | Precision mode |
| LB / RB | Switch tab / view |
| D-pad | Navigate and scroll |
| LT / RT | Fast scroll |
| View | Settings |
| Menu | Hide overlay |
| L3 + R3 | Show/hide overlay (recordable) |

In the **inventory, dashboard and dialogs** the D-pad navigates between
buttons and items; the focused element is highlighted and automatically
scrolled into view. **LB/RB** switches between inventory and loadout editor
there, **X** refreshes the Bungie data.

The **second analog stick** scrolls through the inventory and dialogs
(by default the right stick when the left one controls the cursor).
**A on the search field** or the **⌨ Keyboard** button opens a
controller-operated on-screen keyboard for the inventory search.

### Does the game respond too? (anti-cheat)

The tool **reads** the controller exclusively via XInput and sends **no input
to Destiny 2** (no hooks, no injection, no macros). However, an external
overlay app technically cannot stop the game from also reading the same
controller. A truly separate control setup is easiest and anti-cheat
compliant with a **second controller**: in **Settings → Controller → Overlay
controller** choose e.g. “Controller 2”; the game uses controller 1. The tool
deliberately bundles **no** kernel filter drivers (HidHide/ViGEm) or input
hooks in order not to violate Bungie's policies.

### Quick controls & extras

- **Item popup:** `LB` = vault, `RB` = move to character, `X` = favourite,
  `Y` = equip – without the cursor.
- **R3** opens a **quick menu** (vault/store/equip/favourite or
  loadouts/keyboard/refresh).
- **Virtual keyboard** with suggestions from recent searches and item names;
  `Enter`/“Done” jumps to the first match.
- **Second stick** scrolls; speed, direction and custom deadzone under
  **Settings → Controller**.
- **Bell** in the status bar: notification history with manual removal/clear.
- **Postmaster counter:** appearance (light/dark), refresh interval and
  “only while inventory is open”.

Under **Settings → Controller** the combination can be recorded: press two to
three buttons simultaneously. The live display shows all detected buttons.
PlayStation controllers are shown as `A = ✕`, `B = ○`, `X = □`, `Y = △`.

### Reading the controller directly under Windows (XInput)

Chromium only delivers gamepad input to the window that currently has focus.
For an overlay on top of the game that is too unreliable — therefore the tool
also reads the controller directly via the Windows XInput interface (its own
helper process, independent of window focus).

- On first start a small helper program is compiled with the Windows C#
  compiler (`.NET Framework`) and stored in
  `%APPDATA%\FreakItOut's Destiny 2 Tool\bin`.
- If the compiler is missing, the tool uses a **precompiled version from the
  app package** (the file name contains the source fingerprint; outdated
  copies are ignored). Only if that is missing too does the browser gamepad
  API act as a fallback.
- If the helper process crashes, the tool restarts it automatically (up to
  three attempts with increasing delay).
- Can be disabled under **Settings → Controller → Read controller directly
  under Windows (XInput)**.

Side note: **the overlay takes window focus** (setting “Overlay takes window
focus when opened”). This is required for mouse clicks in the overlay. Thanks
to the XInput bridge the controller works without focus.

### Guide button (Xbox logo) and single/combination button

The public XInput interface does not know the Guide button (the small Xbox
logo in the middle) — it only provides 16 bits for buttons, and those are
taken. The helper therefore reads the button via **two paths**:

1. **XInputGetStateEx** (undocumented function, ordinal 100): Windows itself
   uses it to read the Guide button for the Xbox Game Bar. It reports the
   button as bit 0x0400 — reliable for every XInput controller, including the
   GameSir Nova Lite.
2. **Raw Input** (additional path): the helper registers for gamepad and
   joystick devices and reads their HID reports directly in case the first
   path is unavailable.

If the Guide button still does not work, any button can be selected as the
trigger under **Settings → Controller → Single button** (Guide, View, Menu,
LB, RB, L3, R3). The tool shows which buttons the system actually reports.
The button combination (default L3 + R3) is always available independently,
and in an emergency the **View** button takes over automatically.

### Noise filter for the analog sticks

Some controllers (cheap Xbox 360 clones) deliver strongly fluctuating axis
values — the stick sporadically jumps to full deflection and back, and the
cursor flies around wildly. The helper filters such outliers (deadzone,
stability check and smoothing). Under **Settings → Controller → Noise
filter** the strength can be selected: *Off*, *Normal* or *Strong* (for very
unstable controllers).

### Triggers (L2 / R2)

Some controllers do not report 0 at idle for the triggers — the GameSir Nova
Lite, for example, permanently reports 255 / 127. The tool measures the idle
value automatically and evaluates the triggers only as movement relative to
it. This way the triggers do not fire by themselves just because the stick is
moved.

### Stick calibration

Under **Settings → Controller → Calibrate analog sticks** you can see live
which values the controller reports (four bars). **“Start calibration”**
teaches the tool in five steps:

1. Release the stick in the centre (rest position)
2. Fully left
3. Fully up
4. Fully right
5. Fully down

Afterwards the stick travel is normalized to −1 to +1 — direction and travel
are correct regardless of the controller. **Reset** restores the defaults.

Additionally, **swap axes** and **invert the X or Y axis** if the controller
reports them mirrored.

### Button mapping

Under **Settings → Controller → Map buttons** every function (click, back,
switch view, precision mode, settings, hide overlay) can be assigned any
button. “Not assigned” disables the function.

The Guide/Xbox button and the button combination are configured separately
(see above).

## Structure

```
electron/
  main.js       windows, overlay state, tray, global hotkeys, IPC, smoke test
  config.js     defaults, validation, atomic saving
  preload.js    secure bridge (contextBridge) for the UI
  gamepad.js    bridge to the XInput helper process (controller without focus)
  gamepad-helper/
    GamepadHelper.cs  C# helper, reads XInput and reports the state
renderer/
  index.html    UI, settings, help
  styles.css    Destiny-inspired dark design incl. overlay mode
  js/
    app.js        start, views, overlay events
    dashboard.js  command centre, priorities and analytics
    inventory.js  inventory, loadouts and tools
    controller.js gamepad polling, cursor, click/scroll
    settings.js   settings dialog and recording
    clock.js      reset and Xûr countdown
    ui.js         helpers (toast, debounce, escaping)
    icons.js      inline SVG icons
tools/
  make-icons.js PNG/ICO generator without external dependencies
  check.js      project check
```

All views run locally in the renderer. No third-party websites are embedded
any more; external links (e.g. Bungie portal or Discord) open in the default
browser.

## Troubleshooting

- **Overlay is invisible:** check that Destiny 2 runs in borderless windowed
  mode. In exclusive fullscreen the overlay is covered.
- **Hotkey does not react:** another program occupies the combination. Record
  a different hotkey in the settings; the tool reports occupied combinations.
- **Controller is not detected:** press a button so Chromium reports the
  controller. With Steam Input, test the controller emulation mode if
  necessary.
- **Controller does not react in the overlay:** the tool reads the controller
  directly via Windows XInput (see above). If that does not work, the
  `Gamepad bridge` entry in the log file
  (`%APPDATA%\FreakItOut's Destiny 2 Tool\logs\app.log`) helps. On
  “No C# compiler found”, check the XInput option in the settings.
- **Game also reacts to the controller:** Windows passes XInput input to all
  programs. Destiny 2 polls the controller directly and ignores it only while
  the game is not in the foreground. That is why the overlay takes focus; in
  mouse pass-through mode the controller stays with the game.
- **Data is stale:** press “Refresh” in the inventory or reload the dashboard.
  Check the Bungie login and API key.

## Privacy & credentials

- This repository contains **no API keys, OAuth tokens, client secrets,
  passwords, account names or configuration files**.
- API key, client secret and OAuth tokens are stored **encrypted** on your PC
  using Windows DPAPI (`safeStorage`).
- The configuration lives in
  `%APPDATA%\FreakItOut's Destiny 2 Tool\config.json` (portable version:
  `Daten\config.json` next to the EXE) and is **not** part of this
  repository.
- Diagnostic exports and copy packages redact all credentials.
- The `.gitignore` excludes `config.json`, `Daten/`, `dist/`, logs, build
  reports and local backups.
- Never commit your own `config.json`, encrypted backups or log files. If you
  find a leaked secret, rotate it immediately in the Bungie Developer Portal
  and revoke the OAuth token.

## Contributing

Issues and pull requests are welcome. Please run at least

```powershell
npm run check
npm run lint
npm run test:types
npm run test:fixtures
npm run e2e
```

before opening a pull request. Keep changes focused and do not include
personal data, real API keys, tokens or local configuration files.

## Legal

This tool is an unofficial community project and is not affiliated with
Bungie. Destiny 2 and all related content are property of Bungie, Inc.

## License

MIT – see [LICENSE](LICENSE).
