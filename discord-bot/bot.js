const { Client, GatewayIntentBits, EmbedBuilder, REST, Routes, SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { spawn } = require('child_process');
const path = require('path');
require('dotenv').config();

// ─── Config ───
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const CHANNEL_ID = process.env.CHANNEL_ID;
const MC_SERVER_DIR = process.env.MC_SERVER_DIR || path.resolve(__dirname, '..');

// ─── State ───
let mcProcess = null;
let ngrokUrl = null;
let serverStatus = 'offline'; // offline, starting, online, stopping

// ─── Discord Client ───
const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

// ─── Slash Commands ───
const commands = [
  new SlashCommandBuilder().setName('start').setDescription('🟢 Start the Minecraft server'),
  new SlashCommandBuilder().setName('stop').setDescription('🔴 Stop the Minecraft server'),
  new SlashCommandBuilder().setName('status').setDescription('📊 Show server status'),
  new SlashCommandBuilder().setName('ip').setDescription('🌐 Show server IP address'),
];

// ─── Register Commands ───
async function registerCommands() {
  const rest = new REST().setToken(DISCORD_TOKEN);
  try {
    console.log('[Bot] Registering slash commands...');
    await rest.put(Routes.applicationCommands(client.user.id), {
      body: commands.map(c => c.toJSON()),
    });
    console.log('[Bot] Slash commands registered.');
  } catch (err) {
    console.error('[Bot] Failed to register commands:', err);
  }
}

// ─── Ngrok (read from existing ngrok process managed by pm2) ───
async function fetchNgrokUrl() {
  const maxRetries = 5;
  for (let i = 0; i < maxRetries; i++) {
    try {
      const response = await fetch('http://127.0.0.1:4040/api/tunnels');
      const data = await response.json();
      if (data.tunnels && data.tunnels.length > 0) {
        ngrokUrl = data.tunnels[0].public_url.replace('tcp://', '');
        console.log('[Ngrok] Tunnel URL:', ngrokUrl);
        return ngrokUrl;
      }
    } catch {}
    console.log(`[Ngrok] Waiting for ngrok... (${i + 1}/${maxRetries})`);
    await new Promise(resolve => setTimeout(resolve, 3000));
  }
  console.error('[Ngrok] Could not get tunnel URL. Is ngrok running? (pm2 status ngrok)');
  ngrokUrl = null;
  return null;
}

// ─── Minecraft Server ───
function startMinecraftServer() {
  return new Promise((resolve, reject) => {
    if (mcProcess) {
      reject(new Error('Server is already running'));
      return;
    }

    serverStatus = 'starting';
    console.log('[MC] Starting Minecraft server in', MC_SERVER_DIR);

    mcProcess = spawn('cmd', ['/c', 'start.bat'], {
      cwd: MC_SERVER_DIR,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, WAIT_FOR_USER_INPUT: 'false' },
    });

    let serverReady = false;

    mcProcess.stdout.on('data', (data) => {
      const line = data.toString();
      process.stdout.write(`[MC] ${line}`);

      // Detect when server is ready
      if (!serverReady && (line.includes('Done (') || line.includes('For help, type "help"'))) {
        serverReady = true;
        serverStatus = 'online';
        console.log('[MC] Server is ONLINE!');
        resolve();
      }
    });

    mcProcess.stderr.on('data', (data) => {
      const line = data.toString();
      process.stderr.write(`[MC-ERR] ${line}`);
    });

    mcProcess.on('close', (code) => {
      console.log(`[MC] Server process exited with code ${code}`);
      mcProcess = null;
      serverStatus = 'offline';
      ngrokUrl = null;

      // Notify Discord that server went offline
      notifyServerOffline(code);
    });

    mcProcess.on('error', (err) => {
      console.error('[MC] Failed to start:', err);
      mcProcess = null;
      serverStatus = 'offline';
      reject(err);
    });

    // Timeout - if server doesn't start in 5 minutes
    setTimeout(() => {
      if (!serverReady) {
        serverReady = true;
        serverStatus = 'online';
        console.log('[MC] Server start timeout - assuming online.');
        resolve();
      }
    }, 300000);
  });
}

function stopMinecraftServer() {
  return new Promise((resolve) => {
    if (!mcProcess) {
      resolve();
      return;
    }

    serverStatus = 'stopping';
    console.log('[MC] Stopping server...');

    // Send 'stop' command to Minecraft server
    mcProcess.stdin.write('stop\n');

    const timeout = setTimeout(() => {
      if (mcProcess) {
        console.log('[MC] Force killing server...');
        spawn('taskkill', ['/pid', mcProcess.pid.toString(), '/f', '/t']);
      }
    }, 30000);

    mcProcess.on('close', () => {
      clearTimeout(timeout);
      mcProcess = null;
      serverStatus = 'offline';
      resolve();
    });
  });
}

// ─── Discord Notifications ───
async function sendServerOnline(url) {
  try {
    const channel = await client.channels.fetch(CHANNEL_ID);
    const embed = new EmbedBuilder()
      .setColor(0x00ff00)
      .setTitle('🟢 Minecraft Server Online!')
      .setDescription('เซิร์ฟเวอร์พร้อมเล่นแล้ว!')
      .addFields(
        { name: '🌐 Server IP', value: `\`${url}\``, inline: false },
        { name: '🎮 Version', value: 'Forge 1.20.1', inline: true },
        { name: '👥 Max Players', value: '10', inline: true },
        { name: '📦 Modpack', value: 'Biohazard: Project Genesis', inline: true },
      )
      .setFooter({ text: 'CatBot Minecraft' })
      .setTimestamp();

    await channel.send({ content: '||@everyone||', embeds: [embed], components: [getServerButtons()] });
    console.log('[Bot] Server online message sent.');
  } catch (err) {
    console.error('[Bot] Failed to send online message:', err);
  }
}

async function notifyServerOffline(exitCode) {
  try {
    const channel = await client.channels.fetch(CHANNEL_ID);
    const embed = new EmbedBuilder()
      .setColor(0xff0000)
      .setTitle('🔴 Minecraft Server Offline')
      .setDescription(exitCode === 0 ? 'เซิร์ฟเวอร์ปิดตัวปกติ' : `เซิร์ฟเวอร์หยุดทำงาน (exit code: ${exitCode})`)
      .setFooter({ text: 'CatBot Minecraft' })
      .setTimestamp();

    await channel.send({ embeds: [embed], components: [getServerButtons()] });
  } catch (err) {
    console.error('[Bot] Failed to send offline message:', err);
  }
}

// ─── Buttons ───
function getServerButtons() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('btn_start').setLabel('Start').setStyle(ButtonStyle.Success).setEmoji('🟢'),
    new ButtonBuilder().setCustomId('btn_stop').setLabel('Stop').setStyle(ButtonStyle.Danger).setEmoji('🔴'),
    new ButtonBuilder().setCustomId('btn_status').setLabel('Status').setStyle(ButtonStyle.Primary).setEmoji('📊'),
    new ButtonBuilder().setCustomId('btn_ip').setLabel('IP').setStyle(ButtonStyle.Secondary).setEmoji('🌐'),
  );
}

// ─── Command Handlers ───
client.on('interactionCreate', async (interaction) => {
  // Handle button clicks
  if (interaction.isButton()) {
    const buttonMap = {
      btn_start: 'start',
      btn_stop: 'stop',
      btn_status: 'status',
      btn_ip: 'ip',
    };
    const commandName = buttonMap[interaction.customId];
    if (!commandName) return;
    // Re-route to command logic below
    interaction._buttonCommand = commandName;
  }

  const commandName = interaction._buttonCommand || (interaction.isChatInputCommand() ? interaction.commandName : null);
  if (!commandName) return;

  if (commandName === 'start') {
    if (serverStatus === 'online' || serverStatus === 'starting') {
      const embed = new EmbedBuilder()
        .setColor(0xffaa00)
        .setTitle('⚠️ Server Already Running')
        .setDescription(serverStatus === 'starting' ? 'เซิร์ฟเวอร์กำลังเปิดอยู่ รอสักครู่...' : 'เซิร์ฟเวอร์เปิดอยู่แล้ว!');
      if (ngrokUrl) embed.addFields({ name: '🌐 IP', value: `\`${ngrokUrl}\`` });
      await interaction.reply({ embeds: [embed], components: [getServerButtons()] });
      return;
    }

    await interaction.deferReply();

    try {
      // Start Minecraft server
      const startEmbed = new EmbedBuilder()
        .setColor(0xffaa00)
        .setTitle('🔄 Starting Server...')
        .setDescription('กำลังเปิดเซิร์ฟเวอร์ Minecraft... อาจใช้เวลา 2-5 นาที');
      await interaction.editReply({ embeds: [startEmbed] });

      await startMinecraftServer();

      // Start ngrok tunnel
      const url = await fetchNgrokUrl();

      if (url) {
        await sendServerOnline(url);
        const successEmbed = new EmbedBuilder()
          .setColor(0x00ff00)
          .setTitle('✅ Server Started!')
          .addFields({ name: '🌐 IP', value: `\`${url}\`` });
        await interaction.editReply({ embeds: [successEmbed], components: [getServerButtons()] });
      } else {
        const warnEmbed = new EmbedBuilder()
          .setColor(0xffaa00)
          .setTitle('⚠️ Server Started (No Ngrok)')
          .setDescription('เซิร์ฟเวอร์เปิดแล้ว แต่ไม่สามารถสร้าง ngrok tunnel ได้');
        await interaction.editReply({ embeds: [warnEmbed], components: [getServerButtons()] });
      }
    } catch (err) {
      const errorEmbed = new EmbedBuilder()
        .setColor(0xff0000)
        .setTitle('❌ Start Failed')
        .setDescription(`เกิดข้อผิดพลาด: ${err.message}`);
      await interaction.editReply({ embeds: [errorEmbed], components: [getServerButtons()] });
    }
  }

  else if (commandName === 'stop') {
    if (serverStatus === 'offline') {
      await interaction.reply({ embeds: [
        new EmbedBuilder().setColor(0xffaa00).setTitle('⚠️ Server Not Running').setDescription('เซิร์ฟเวอร์ไม่ได้เปิดอยู่')
      ], components: [getServerButtons()] });
      return;
    }

    await interaction.deferReply();

    try {
      await stopMinecraftServer();
      ngrokUrl = null;

      await interaction.editReply({ embeds: [
        new EmbedBuilder().setColor(0xff0000).setTitle('🔴 Server Stopped').setDescription('เซิร์ฟเวอร์ปิดแล้ว')
      ], components: [getServerButtons()] });
    } catch (err) {
      await interaction.editReply({ embeds: [
        new EmbedBuilder().setColor(0xff0000).setTitle('❌ Stop Failed').setDescription(`เกิดข้อผิดพลาด: ${err.message}`)
      ], components: [getServerButtons()] });
    }
  }

  else if (commandName === 'status') {
    // ดึง IP ล่าสุดจาก ngrok ทุกครั้ง
    await fetchNgrokUrl();

    const statusMap = {
      offline: { color: 0xff0000, emoji: '🔴', text: 'Offline' },
      starting: { color: 0xffaa00, emoji: '🟡', text: 'Starting...' },
      online: { color: 0x00ff00, emoji: '🟢', text: 'Online' },
      stopping: { color: 0xffaa00, emoji: '🟡', text: 'Stopping...' },
    };
    const s = statusMap[serverStatus];
    const embed = new EmbedBuilder()
      .setColor(s.color)
      .setTitle(`${s.emoji} Server Status: ${s.text}`)
      .addFields(
        { name: '🎮 Modpack', value: 'Biohazard: Project Genesis', inline: true },
        { name: '📦 Version', value: 'Forge 1.20.1', inline: true },
      );

    if (ngrokUrl) embed.addFields({ name: '🌐 IP', value: `\`${ngrokUrl}\``, inline: false });

    await interaction.reply({ embeds: [embed], components: [getServerButtons()] });
  }

  else if (commandName === 'ip') {
    // ดึง IP ล่าสุดจาก ngrok ทุกครั้ง
    await fetchNgrokUrl();

    if (ngrokUrl) {
      await interaction.reply({ embeds: [
        new EmbedBuilder()
          .setColor(0x00ff00)
          .setTitle('🌐 Server IP')
          .setDescription(`\`${ngrokUrl}\``)
          .setFooter({ text: 'คัดลอก IP ด้านบนไปวางใน Minecraft' })
      ], components: [getServerButtons()] });
    } else {
      await interaction.reply({ embeds: [
        new EmbedBuilder()
          .setColor(0xff0000)
          .setTitle('🌐 Server IP')
          .setDescription('เซิร์ฟเวอร์ยังไม่ได้เปิด หรือ ngrok ยังไม่พร้อม')
      ], components: [getServerButtons()] });
    }
  }
});

// ─── Bot Ready ───
client.once('ready', async () => {
  console.log(`[Bot] Logged in as ${client.user.tag}`);
  await registerCommands();
  console.log('[Bot] Ready! Waiting for commands...');
});

// ─── Auto-start on boot (optional) ───
if (process.env.AUTO_START === 'true') {
  client.once('ready', async () => {
    console.log('[Bot] AUTO_START enabled. Starting server...');
    try {
      await startMinecraftServer();
      const url = await fetchNgrokUrl();
      if (url) await sendServerOnline(url);
    } catch (err) {
      console.error('[Bot] Auto-start failed:', err);
    }
  });
}

// ─── Graceful Shutdown ───
async function gracefulShutdown(signal) {
  console.log(`\n[Bot] Received ${signal}. Shutting down...`);
  if (mcProcess) {
    await stopMinecraftServer();
  }
  client.destroy();
  process.exit(0);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// ─── Login ───
client.login(DISCORD_TOKEN);
