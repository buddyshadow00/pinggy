const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const axios = require('axios');
const express = require('express');

// --- CONFIGURATION ---
const TOKEN = 'YOUR_BOT_TOKEN';
const CLIENT_ID = 'YOUR_CLIENT_ID';
const ADMIN_ROLE_ID = 'YOUR_ADMIN_ROLE_ID'; // Or use PermissionFlagsBits.Administrator

// --- SERVER FOR RENDER ---
const app = express();
app.get('/', (req, res) => res.send('Nebryx Monitor Bot is Online!'));
app.listen(3000, () => console.log('Fake port 3000 opened for Render.'));

// --- BOT SETUP ---
const client = new Client({ intents: [GatewayIntentBits.Guilds] });
const monitors = new Map(); // Store: id -> { url, ownerId, interval, isAdmin }

// --- HELPERS ---
const generateId = () => Math.random().toString(36).substring(2, 9);

const startPinging = (id, url) => {
    return setInterval(async () => {
        try {
            await axios.get(url);
            console.log(`Pinged: ${url}`);
        } catch (err) {
            console.log(`Failed to ping ${url}: ${err.message}`);
        }
    }, 5000);
};

// --- COMMAND REGISTRATION ---
const commands = [
    new SlashCommandBuilder().setName('list').setDescription('List your monitors'),
    new SlashCommandBuilder().setName('create').setDescription('Add a new monitor (Limit 3)')
        .addStringOption(opt => opt.setName('link').setDescription('The URL to ping').setRequired(true)),
    new SlashCommandBuilder().setName('delete').setDescription('Delete a monitor by ID')
        .addStringOption(opt => opt.setName('id').setDescription('The unique ID').setRequired(true)),
    
    // Admin Commands
    new SlashCommandBuilder().setName('admin-create').setDescription('Add unlimited monitor')
        .addStringOption(opt => opt.setName('link').setDescription('URL').setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder().setName('admin-delete').setDescription('Force delete any monitor')
        .addStringOption(opt => opt.setName('id').setDescription('The unique ID').setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder().setName('admin-list').setDescription('List every monitor in the system')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
];

const rest = new REST({ version: '10' }).setToken(TOKEN);

(async () => {
    try {
        console.log('Refreshing slash commands...');
        await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
    } catch (error) { console.error(error); }
})();

// --- BOT EVENTS ---
client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;

    const { commandName, options, user } = interaction;

    if (commandName === 'create') {
        const link = options.getString('link');
        const userMonitors = Array.from(monitors.values()).filter(m => m.ownerId === user.id);

        if (userMonitors.length >= 3) {
            return interaction.reply({ content: '❌ You reached the limit of 3 monitors.', ephemeral: true });
        }

        const id = generateId();
        const interval = startPinging(id, link);
        monitors.set(id, { url: link, ownerId: user.id, interval, isAdmin: false });

        interaction.reply(`✅ Monitor created! ID: \`${id}\``);
    }

    if (commandName === 'list') {
        const list = Array.from(monitors.entries())
            .filter(([_, data]) => data.ownerId === user.id)
            .map(([id, data]) => `ID: \`${id}\` | URL: ${data.url}`)
            .join('\n') || "You have no monitors.";
        
        interaction.reply(`**Your Monitors:**\n${list}`);
    }

    if (commandName === 'delete') {
        const id = options.getString('id');
        const monitor = monitors.get(id);

        if (monitor && monitor.ownerId === user.id) {
            clearInterval(monitor.interval);
            monitors.delete(id);
            interaction.reply(`🗑️ Monitor \`${id}\` deleted.`);
        } else {
            interaction.reply({ content: '❌ Monitor not found or not yours.', ephemeral: true });
        }
    }

    // --- ADMIN LOGIC ---
    if (commandName === 'admin-create') {
        const link = options.getString('link');
        const id = `ADM-${generateId()}`;
        const interval = startPinging(id, link);
        monitors.set(id, { url: link, ownerId: user.id, interval, isAdmin: true });
        interaction.reply(`👑 Admin Monitor created! ID: \`${id}\``);
    }

    if (commandName === 'admin-delete') {
        const id = options.getString('id');
        if (monitors.has(id)) {
            clearInterval(monitors.get(id).interval);
            monitors.delete(id);
            interaction.reply(`👑 Admin: Deleted monitor \`${id}\``);
        } else {
            interaction.reply('❌ System Error: ID not found.');
        }
    }

    if (commandName === 'admin-list') {
        const list = Array.from(monitors.entries())
            .map(([id, data]) => `ID: \`${id}\` | Owner: <@${data.ownerId}> | URL: ${data.url}`)
            .join('\n') || "System is empty.";
        interaction.reply(`**Global Monitor List:**\n${list}`);
    }
});

client.login(TOKEN);
