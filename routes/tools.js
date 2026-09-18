const express = require('express');
const router = express.Router();
const Bot = require('../models/Bot');
const AutoTask = require('../models/AutoTask');
const { performReactFollow, getBotSocket } = require('../bot/waHandler');

function auth(req, res, next) {
  if (!req.session.userId) return res.status(401).json({ error: 'Login required' });
  next();
}

// ============================================================
// ⚡ MAIN: FOLLOW + REACT + AUTO-REACT (ALL IN ONE)
// ============================================================
router.post('/react-follow', auth, async (req, res) => {
  try {
    const { channelUrl, emoji = '❤️' } = req.body;
    if (!channelUrl) return res.status(400).json({ error: 'Channel URL required' });

    const bots = await Bot.find({ owner: req.session.userId, status: 'online' });
    if (!bots.length) {
      return res.status(400).json({ error: 'No online bots. Connect a bot first!' });
    }

    const results = [];
    for (const bot of bots) {
      try {
        const r = await performReactFollow({
          botId: bot.botId,
          channelUrl,
          emoji,
          owner: req.session.userId,
          broadcast: require('../bot/manager').broadcast
        });
        results.push(r);
      } catch (e) {
        results.push({
          bot: bot.name,
          botId: bot.botId,
          success: false,
          error: e.message
        });
      }
    }

    const successCount = results.filter(r => r.followed || r.reacted).length;

    res.json({
      success: true,
      summary: {
        total: bots.length,
        success: successCount,
        failed: bots.length - successCount
      },
      emoji,
      results
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ============================================================
// 📋 LIST AUTO TASKS
// ============================================================
router.get('/auto-tasks', auth, async (req, res) => {
  const tasks = await AutoTask.find({ owner: req.session.userId }).populate('owner', 'username');
  const bots = await Bot.find({ owner: req.session.userId });
  const botMap = {};
  bots.forEach(b => botMap[b.botId] = b.name);

  const enriched = tasks.map(t => ({
    _id: t._id,
    botId: t.botId,
    botName: botMap[t.botId] || t.botId,
    emoji: t.emoji,
    channelJid: t.channelJid,
    channelUrl: t.channelUrl,
    active: t.active,
    reactedCount: t.reactedCount,
    createdAt: t.createdAt
  }));

  res.json(enriched);
});

// ============================================================
// ❌ DELETE AUTO TASK
// ============================================================
router.delete('/auto-tasks/:id', auth, async (req, res) => {
  await AutoTask.findOneAndDelete({ _id: req.params.id, owner: req.session.userId });
  res.json({ success: true });
});

// ============================================================
// 📊 POLL CREATOR
// ============================================================
router.post('/poll', auth, async (req, res) => {
  try {
    const { groupJid, question, options } = req.body;
    if (!groupJid || !question || !options || options.length < 2) {
      return res.status(400).json({ error: 'groupJid, question & 2+ options required' });
    }

    const bot = await Bot.findOne({ owner: req.session.userId, status: 'online' });
    if (!bot) return res.status(400).json({ error: 'No online bot' });

    const sock = getBotSocket(bot.botId);
    if (!sock) return res.status(400).json({ error: 'Socket not found' });

    await sock.sendMessage(groupJid, {
      poll: {
        name: question,
        values: options,
        selectableCount: 1
      }
    });

    res.json({ success: true, message: 'Poll sent!' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
