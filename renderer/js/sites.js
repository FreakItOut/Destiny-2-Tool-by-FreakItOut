// ============================================================
// Webseiten-Katalog
// ============================================================
// Jeder Reiter ist eine Kategorie. Die Webseite innerhalb einer
// Kategorie wird über das Drop-Down gewählt. Eigene Seiten kommen
// aus der Konfiguration dazu und tauchen zusätzlich im Reiter
// "Eigene" auf.
// ============================================================

export const CATEGORIES = [
  {
    id: 'today',
    name: 'Heute',
    hint: 'Daily-Reset, Weekly-Rotationen und offizielle News',
    icon: 'sun',
    color: '#f0c66b',
    sites: [
      {
        id: 'todayindestiny',
        name: 'Today in Destiny',
        url: 'https://www.todayindestiny.com/',
        desc: 'Alle täglichen und wöchentlichen Rotationen, Händler, Nightfalls und Aktivitäten auf einen Blick.'
      },
      {
        id: 'destinychecklist',
        name: 'Destiny Checklist',
        url: 'https://destinychecklist.net/',
        desc: 'Mächtige Belohnungen, Meilensteine, Triumphs und Checklisten für alle Charaktere.'
      },
      {
        id: 'bungie-news',
        name: 'Bungie News',
        url: 'https://www.bungie.net/7/en/News',
        desc: 'Offizielle News, Patch Notes und "This Week at Bungie".'
      }
    ]
  },
  {
    id: 'gear',
    name: 'Ausrüstung',
    hint: 'Loadouts, Rüstung und Charakter-Planung',
    icon: 'bag',
    color: '#7cc7ff',
    sites: [
      {
        id: 'dim',
        name: 'Destiny Item Manager',
        url: 'https://app.destinyitemmanager.com/',
        desc: 'Der Klassiker: Items verschieben, Loadouts bauen und Waffen direkt vergleichen.'
      },
      {
        id: 'd2armorpicker',
        name: 'D2 Armor Picker',
        url: 'https://d2armorpicker.com/',
        desc: 'Findet die beste Rüstungskombination für deine gewünschten Werte und Mods.'
      },
      {
        id: 'destinyrecipes',
        name: 'Destiny Recipes',
        url: 'https://destinyrecipes.com/',
        desc: 'Wöchentliche Vorbereitung, Bounties und sinnvolle Aufgaben pro Charakter.'
      }
    ]
  },
  {
    id: 'builds',
    name: 'Builds',
    hint: 'Build-Sammlungen und Loadout-Ideen',
    icon: 'layers',
    color: '#4fd6c4',
    sites: [
      {
        id: 'mobalytics-builds',
        name: 'Mobalytics Builds',
        url: 'https://mobalytics.gg/destiny-2/builds',
        desc: 'Kuratierte Builds für jede Klasse mit Mods, Fragmenten und exakten Werten.'
      },
      {
        id: 'builders-gg',
        name: 'Builders.gg',
        url: 'https://builders.gg/',
        desc: 'Build-Datenbank mit Filtern nach Klasse, Aktivität und Playstyle.'
      }
    ]
  },
  {
    id: 'weapons',
    name: 'Waffen',
    hint: 'Perks, God Rolls und Waffen-Datenbank',
    icon: 'target',
    color: '#ff9b6a',
    sites: [
      {
        id: 'lightgg',
        name: 'Light.gg',
        url: 'https://www.light.gg/',
        desc: 'Die große Waffen- und Perk-Datenbank mit God-Roll-Bewertungen und Community-Wunschlisten.'
      },
      {
        id: 'd2foundry',
        name: 'D2 Foundry',
        url: 'https://d2foundry.gg/',
        desc: 'Waffenrechner, Perk-Vergleich und exakte Werte für Damage, Range und Stability.'
      },
      {
        id: 'bungie-armory',
        name: 'Bungie Armory',
        url: 'https://www.bungie.net/7/en/Destiny/Armory',
        desc: 'Die offizielle Waffensammlung von Bungie mit Quellen und Perks.'
      }
    ]
  },
  {
    id: 'vendors',
    name: 'Händler',
    hint: 'Xûr, wöchentliche Angebote und Vendor-Rolls',
    icon: 'store',
    color: '#c9a6ff',
    sites: [
      {
        id: 'whereisxur',
        name: 'Where is Xûr?',
        url: 'https://whereisxur.com/',
        desc: 'Standort, Angebot und Waffen-Rolls von Xûr - inklusive Countdown.'
      },
      {
        id: 'lightgg-vendors',
        name: 'Light.gg Händler',
        url: 'https://www.light.gg/db/vendors/',
        desc: 'Alle aktuellen Händler-Angebote mit Perks und Bewertung.'
      },
      {
        id: 'braytech-vendors',
        name: 'Braytech Händler',
        url: 'https://bray.tech/vendors',
        desc: 'Vendor-Inventar und wöchentliche Rotationen übersichtlich aufbereitet.'
      }
    ]
  },
  {
    id: 'lfg',
    name: 'Gruppen',
    hint: 'Fireteams, LFG und Community',
    icon: 'users',
    color: '#78e0b0',
    sites: [
      {
        id: 'fireteamfinder',
        name: 'Bungie Fireteam Finder',
        url: 'https://www.bungie.net/7/en/FireteamFinder',
        desc: 'Das offizielle LFG von Bungie - direkt mit dem eigenen Account.'
      },
      {
        id: 'the100',
        name: 'The 100',
        url: 'https://www.the100.io/',
        desc: 'Geplante Raids, Nightfalls und PvP-Sessions mit festen Gruppen.'
      },
      {
        id: 'reddit-dtg',
        name: 'r/DestinyTheGame',
        url: 'https://www.reddit.com/r/DestinyTheGame/',
        desc: 'Die größte Destiny-Community: News, Diskussionen und Guides.'
      },
      {
        id: 'reddit-fireteams',
        name: 'r/Fireteams',
        url: 'https://www.reddit.com/r/Fireteams/',
        desc: 'Schnelle Gruppensuche für Raids, Dungeons und Aktivitäten.'
      }
    ]
  },
  {
    id: 'stats',
    name: 'Statistiken',
    hint: 'Raids, Trials, Nightfalls und PvP',
    icon: 'chart',
    color: '#ff7f9c',
    sites: [
      {
        id: 'raidreport',
        name: 'Raid Report',
        url: 'https://raid.report/',
        desc: 'Raids, Clears, Bestzeiten und die komplette Raid-Historie.'
      },
      {
        id: 'trialsreport',
        name: 'Trials Report',
        url: 'https://trials.report/',
        desc: 'Trials-of-Osiris-Statistiken, Gegner-Check und Flawless-Historie.'
      },
      {
        id: 'nightfallreport',
        name: 'Nightfall Report',
        url: 'https://nightfall.report/',
        desc: 'Nightfall- und Grandmaster-Clears inklusive Score und Loadout.'
      },
      {
        id: 'cruciblereport',
        name: 'Crucible Report',
        url: 'https://crucible.report/',
        desc: 'PvP-Statistiken, Map-Historie und Performance im Schmelztiegel.'
      },
      {
        id: 'destinytracker',
        name: 'Destiny Tracker',
        url: 'https://destinytracker.com/',
        desc: 'Umfangreiche PvE- und PvP-Statistiken für jeden Guardian.'
      },
      {
        id: 'braytech',
        name: 'Braytech',
        url: 'https://bray.tech/',
        desc: 'Companion mit Profil, Sammlungen, Siegeln, Händlern und Statistiken.'
      }
    ]
  },
  {
    id: 'guides',
    name: 'Guides & Lore',
    hint: 'Wissen, Story und Hilfe',
    icon: 'book',
    color: '#8fb4ff',
    sites: [
      {
        id: 'destinypedia',
        name: 'Destinypedia',
        url: 'https://www.destinypedia.com/',
        desc: 'Das große Destiny-Wiki: Waffen, Aktivitäten, Charaktere und Lore.'
      },
      {
        id: 'ishtar',
        name: 'Ishtar Collective',
        url: 'https://www.ishtar-collective.net/',
        desc: 'Archive der Lore-Einträge, Dialoge und Grimoire-Texte.'
      },
      {
        id: 'reddit-lore',
        name: 'r/DestinyLore',
        url: 'https://www.reddit.com/r/DestinyLore/',
        desc: 'Tiefe Lore-Analysen und Diskussionen der Community.'
      },
      {
        id: 'datto',
        name: 'Datto (YouTube)',
        url: 'https://www.youtube.com/@DattoDoesDestiny',
        desc: 'Raid-Guides, Waffen-Tests und Einordnungen zu jedem Update.'
      },
      {
        id: 'bungie-help',
        name: 'Bungie Hilfe',
        url: 'https://help.bungie.net/',
        desc: 'Offizieller Support bei Login-, Code- und Verbindungsproblemen.'
      }
    ]
  },
  {
    id: 'custom',
    name: 'Eigene',
    hint: 'Deine eigenen Webseiten',
    icon: 'star',
    color: '#b9c2d0',
    sites: []
  }
];

export function buildCategories(customSites = []) {
  const categories = CATEGORIES.map((category) => ({
    ...category,
    sites: category.sites.map((site) => ({ ...site, custom: false }))
  }));

  const custom = (Array.isArray(customSites) ? customSites : [])
    .filter((site) => site && site.id && site.name && /^https?:\/\//i.test(site.url || ''))
    .map((site) => ({
      id: site.id,
      name: site.name,
      url: site.url,
      desc: site.desc || 'Eigene Webseite.',
      custom: true,
      category: site.category || 'custom'
    }));

  for (const site of custom) {
    if (site.category && site.category !== 'custom') {
      const target = categories.find((category) => category.id === site.category);
      if (target) target.sites.push(site);
    }
  }

  const own = categories.find((category) => category.id === 'custom');
  own.sites = custom;

  return categories;
}

export function totalSiteCount(categories) {
  return categories.reduce((sum, category) => sum + category.sites.length, 0);
}

export function findSite(categories, categoryId, siteId) {
  const category = categories.find((entry) => entry.id === categoryId);
  if (!category) return null;
  return category.sites.find((site) => site.id === siteId) || null;
}
