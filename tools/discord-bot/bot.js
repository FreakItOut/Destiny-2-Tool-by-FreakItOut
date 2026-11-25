// Fertiger Discord-Bot für die lokale Destiny-2-Tool-API.
// Voraussetzungen: Node 18+, `npm install`, Bot-Token in DISCORD_TOKEN,
// lokale API aktiviert, D2_API/D2_TOKEN gesetzt.
import { Client, GatewayIntentBits, SlashCommandBuilder } from 'discord.js';

const TOKEN = process.env.DISCORD_TOKEN;
const API = process.env.D2_API || 'http://127.0.0.1:7331';
const API_TOKEN = process.env.D2_TOKEN || '';

if (!TOKEN || !API_TOKEN) {
  console.error('DISCORD_TOKEN und D2_TOKEN müssen gesetzt sein.');
  process.exit(1);
}

async function d2(path) {
  const response = await fetch(`${API}${path}?token=${encodeURIComponent(API_TOKEN)}`);
  if (!response.ok) throw new Error(`API ${response.status}`);
  return response.json();
}

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once('ready', async () => {
  const commands = [
    new SlashCommandBuilder().setName('destiny-status').setDescription('Poststelle, Godrolls und Resets'),
    new SlashCommandBuilder().setName('destiny-priorities').setDescription('Aktuelle Aufgaben'),
    new SlashCommandBuilder().setName('destiny-weekly').setDescription('Weekly-Reset und Xûr'),
    new SlashCommandBuilder().setName('destiny-xur').setDescription('Letzte Xûr-Daten'),
    new SlashCommandBuilder().setName('destiny-digest').setDescription('Weekly-Digest jetzt senden'),
    new SlashCommandBuilder().setName('destiny-collect').setDescription('Poststelle einsammeln (nur nach Bestätigung)').addBooleanOption((option) => option.setName('bestaetigen').setDescription('Wirklich einsammeln?').setRequired(true))
  ].map((command) => command.toJSON());
  await client.application.commands.set(commands);
  console.log(`Bot bereit: ${client.user.tag}`);
});

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  try {
    if (interaction.commandName === 'destiny-digest' || interaction.commandName === 'destiny-collect') {
      if (interaction.commandName === 'destiny-collect' && !interaction.options.getBoolean('bestaetigen')) {
        await interaction.reply({ content: 'Abgebrochen – bitte mit Bestätigung erneut ausführen.', ephemeral: true });
        return;
      }
      const action = interaction.commandName === 'destiny-digest' ? 'digest' : 'collect-postmaster';
      const response = await fetch(`${API}/action/${action}?token=${encodeURIComponent(API_TOKEN)}`, { method: 'POST' });
      const data = await response.json();
      await interaction.reply({ content: data.ok ? 'Aktion ausgeführt.' : `Fehler: ${data.error || response.status}`, ephemeral: true });
      return;
    }
    const map = {
      'destiny-status': '/summary',
      'destiny-priorities': '/priorities',
      'destiny-weekly': '/weekly',
      'destiny-xur': '/xur'
    };
    const data = await d2(map[interaction.commandName] || '/summary');
    const text = JSON.stringify(data, null, 2).slice(0, 1900);
    await interaction.reply({ content: `\`\`\`json\n${text}\n\`\`\`` });
  } catch (error) {
    await interaction.reply({ content: `Fehler: ${error.message}`, ephemeral: true });
  }
});

client.login(TOKEN);
