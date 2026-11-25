# Discord-Bot-Bridge (Beispiel)

Die lokale API kann von einem kleinen Bot oder Webhook-Skript gelesen werden.
Das Tool selbst verschickt den Weekly-Digest an einen Discord-Webhook
(Einstellungen → Verhalten → Discord-Webhook).

## Minimaler Node-Bot (nur lesen)

Voraussetzungen: Node 18+, Bot-Token, lokale API aktiviert.

```js
const TOKEN = process.env.DISCORD_TOKEN;
const API = process.env.D2_API; // z. B. http://127.0.0.1:7331
const API_TOKEN = process.env.D2_TOKEN;

const headers = { Authorization: `Bot ${TOKEN}`, 'Content-Type': 'application/json' };

async function d2(path) {
  const response = await fetch(`${API}${path}?token=${API_TOKEN}`);
  return response.json();
}

// Beispiel: Slash-Command /destiny status
const status = await d2('/summary');
console.log(`Poststelle: ${status.postmaster} · Godrolls: ${status.godrolls}`);
```

## Sinnvolle Befehle
- `/destiny status` → `/summary`
- `/destiny priorities` → `/priorities`
- `/destiny weekly` → `/weekly`
- `/destiny xur` → `/xur`

## Hinweis
Aktionen (Transfer/Ausrüsten) sind bewusst **nicht** Teil der lokalen API.
Dafür bleibt das Tool mit Bestätigung und Read-only-Modus zuständig.
