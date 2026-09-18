const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion
} = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const pino = require('pino');
const fs = require('fs');
const path = require('path');
const Bot = require('../models/Bot');
const AutoTask = require('../models/AutoTask');

const SESSION_DIR = path.join(__dirname, '..', 'sessions');
if (!fs.existsSync(SESSION_DIR)) fs.mkdirSync(SESSION_DIR, { recursive: true });

const sockets = new Map(); // botId -> sock

// ============================================================
// 🔥 START BOT
// ============================================================
async function startBot(bot, broadcast) {
  const sessionPath = path.join(SESSION_DIR, bot.botId);
  const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    logger: pino({ level: 'silent' }),
    printQRInTerminal: false,
    auth: state,
    browser: ['Sasiya MD', 'Chrome', '1.0.0'],
    generateHighQualityLinkPreview: true,
    syncFullHistory: false,
    markOnlineOnConnect: true,
    getMessage: async () => ({ conversation: '' })
  });

  sockets.set(bot.botId, sock);

  // ========== PAIRING CODE ==========
  if (!sock.authState.creds.registered && bot.phoneNumber) {
    setTimeout(async () => {
      try {
        const code = await sock.requestPairingCode(bot.phoneNumber);
        console.log(`🔐 Pairing code for ${bot.name}: ${code}`);
        broadcast('bot:pairing', { botId: bot.botId, code });
      } catch (e) {
        console.error('Pairing error:', e.message);
      }
    }, 3000);
  }

  // ========== CONNECTION ==========
  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      console.log(`📱 QR for ${bot.name}`);
      broadcast('bot:qr', { botId: bot.botId, qr });
    }

    if (connection === 'open') {
      bot.status = 'online';
      bot.phoneNumber = sock.user.id.split(':')[0];
      await bot.save();
      broadcast('bots:update', bot);
      console.log(`✅ Bot ${bot.name} ONLINE (${bot.phoneNumber})`);

      // Restore auto-react tasks
      await restoreAutoTasks(bot.botId, sock);

      // Stats updater
      if (!global[`stats_${bot.botId}`]) {
        global[`stats_${bot.botId}`] = setInterval(async () => {
          try {
            const fresh = await Bot.findOne({ botId: bot.botId });
            if (!fresh || fresh.status !== 'online') return;
            const mem = process.memoryUsage();
            fresh.stats.rss = (mem.rss / 1024 / 1024).toFixed(1) + 'M';
            fresh.stats.heap = `${(mem.heapUsed / 1024 / 1024).toFixed(1)}M/${(mem.heapTotal / 1024 / 1024).toFixed(1)}M`;
            fresh.stats.uptime = formatUptime(process.uptime());
            await fresh.save();
            broadcast('bots:update', fresh);
          } catch (e) {}
        }, 10000);
      }
    }

    if (connection === 'close') {
      const code = new Boom(lastDisconnect?.error)?.output?.statusCode;
      console.log(`❌ Bot ${bot.name} closed. Code: ${code}`);

      if (code === DisconnectReason.loggedOut) {
        bot.status = 'offline';
        await bot.save();
        broadcast('bots:update', bot);
        // clear session
        const sessPath = path.join(SESSION_DIR, bot.botId);
        if (fs.existsSync(sessPath)) fs.rmSync(sessPath, { recursive: true, force: true });
      } else {
        console.log(`🔁 Reconnecting ${bot.name}...`);
        setTimeout(() => startBot(bot, broadcast), 3000);
      }
    }
  });

  sock.ev.on('creds.update', saveCreds);

  // ============================================================
  // 🔥 AUTO REACT TO NEW CHANNEL POSTS
  // ============================================================
  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;

    for (const msg of messages) {
      const jid = msg.key.remoteJid;
      if (!jid) continue;

      // New channel post
      if (jid.endsWith('@newsletter') && !msg.key.fromMe) {
        try {
          const tasks = await AutoTask.find({
            botId: bot.botId,
            channelJid: jid,
            active: true
          });

          for (const task of tasks) {
            try {
              await sock.sendMessage(jid, {
                react: { text: task.emoji, key: msg.key }
              });
              task.reactedCount = (task.reactedCount || 0) + 1;
              await task.save();
              console.log(`⚡ [${bot.name}] Auto-reacted ${task.emoji} on new post in ${jid}`);
            } catch (e) {
              console.error(`Auto-react fail: ${e.message}`);
            }
          }
        } catch (e) {}
      }

      // Auto view status
      if (jid === 'status@broadcast') {
        try { await sock.readMessages([msg.key]); } catch (e) {}
      }
    }
  });

  return sock;
}

// ============================================================
// 🎯 MAIN: FOLLOW + REACT (Called from API)
// ============================================================
async function performReactFollow({ botId, channelUrl, emoji, broadcast, owner }) {
  const bot = await Bot.findOne({ botId });
  if (!bot) throw new Error('Bot not found');
  if (bot.status !== 'online') throw new Error('Bot is not online');

  const sock = sockets.get(botId);
  if (!sock) throw new Error('Socket not found for this bot');

  const parsed = parseChannelUrl(channelUrl);
  if (!parsed) throw new Error('Invalid WhatsApp channel URL');

  const result = {
    bot: bot.name,
    botId: bot.botId,
    followed: false,
    reacted: false,
    autoEnabled: false,
    channelJid: null,
    error: null
  };

  // Step 1: Resolve real channel JID from invite code
  let channelJid = null;
  try {
    const meta = await sock.newsletterMetadata('invite', parsed.inviteCode);
    if (meta && meta.id) {
      channelJid = meta.id;
      console.log(`🔍 Resolved channel JID: ${channelJid}`);
    }
  } catch (e) {
    console.log('Metadata lookup failed:', e.message);
  }

  if (!channelJid) {
    // Fallback attempt
    channelJid = parsed.inviteCode + '@newsletter';
    console.log(`⚠️ Using fallback JID: ${channelJid}`);
  }
  result.channelJid = channelJid;

  // Step 2: Follow channel
  try {
    await sock.newsletterFollow(parsed.inviteCode);
    result.followed = true;
    bot.stats.followsDone = (bot.stats.followsDone || 0) + 1;
    console.log(`✅ [${bot.name}] Followed channel ${parsed.inviteCode}`);
  } catch (e) {
    // Often "already following" — treat as success
    result.followed = true;
    console.log(`ℹ️ [${bot.name}] Follow (already followed?): ${e.message}`);
  }

  // Step 3: React to specific post if post ID exists
  if (parsed.serverId) {
    try {
      await sock.sendMessage(channelJid, {
        react: {
          text: emoji,
          key: {
            remoteJid: channelJid,
            id: parsed.serverId,
            fromMe: false
          }
        }
      });
      result.reacted = true;
      bot.stats.reactionsSent = (bot.stats.reactionsSent || 0) + 1;
      console.log(`⚡ [${bot.name}] Reacted ${emoji} to ${parsed.serverId}`);
    } catch (e) {
      result.error = 'React failed: ' + e.message;
      console.error(`React failed [${bot.name}]:`, e.message);
    }
  } else {
    result.error = 'No post ID in URL (follow only)';
  }

  // Step 4: Save AutoTask for future posts
  try {
    let task = await AutoTask.findOne({ botId, channelJid });
    if (task) {
      task.emoji = emoji;
      task.channelUrl = channelUrl;
      task.active = true;
      await task.save();
    } else {
      await AutoTask.create({
        botId,
        owner,
        type: 'react',
        channelJid,
        channelUrl,
        emoji,
        active: true
      });
    }
    result.autoEnabled = true;
    console.log(`📌 [${bot.name}] Auto-react ACTIVE for ${channelJid}`);
  } catch (e) {
    console.error('Save AutoTask error:', e.message);
  }

  await bot.save();
  if (broadcast) broadcast('bots:update', bot);

  return result;
}

// ============================================================
// 🔁 RESTORE AUTO TASKS ON RECONNECT
// ============================================================
async function restoreAutoTasks(botId, sock) {
  try {
    const tasks = await AutoTask.find({ botId, active: true });
    if (!tasks.length) return;
    console.log(`🔁 [${botId}] Restored ${tasks.length} auto-task(s)`);
  } catch (e) { console.error('Restore error:', e.message); }
}

// ============================================================
// 🧩 PARSE URL
// ============================================================
function parseChannelUrl(url) {
  if (!url) return null;
  try {
    const clean = url.split('?')[0].replace(/\/+$/, '');
    const parts = clean.split('/').filter(Boolean);
    const idx = parts.indexOf('channel');
    if (idx === -1 || !parts[idx + 1]) return null;

    return {
      inviteCode: parts[idx + 1],          // 0029VbXXXX
      serverId: parts[idx + 2] || null,    // 1234
      fullUrl: url
    };
  } catch (e) { return null; }
}

// ============================================================
// 🛑 STOP BOT
// ============================================================
async function stopBot(botId) {
  const sock = sockets.get(botId);
  if (sock) {
    try { sock.end(undefined); } catch (e) {}
    sockets.delete(botId);
  }
  if (global[`stats_${botId}`]) {
    clearInterval(global[`stats_${botId}`]);
    delete global[`stats_${botId}`];
  }
  const sessPath = path.join(SESSION_DIR, botId);
  if (fs.existsSync(sessPath)) {
    try { fs.rmSync(sessPath, { recursive: true, force: true }); } catch (e) {}
  }
}

function getBotSocket(botId) { return sockets.get(botId); }

function formatUptime(sec) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  return `${h}h ${m}m ${s}s`;
}

module.exports = {
  startBot,
  stopBot,
  getBotSocket,
  sockets,
  performReactFollow,
  parseChannelUrl,
  restoreAutoTasks
};
