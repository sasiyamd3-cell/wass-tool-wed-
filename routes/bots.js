const express = require('express');
const router = express.Router();
const Bot = require('../models/Bot');
const manager = require('../bot/manager');

function auth(req, res, next) {
  if (!req.session.userId) return res.status(401).json({ error: 'Login required' });
  next();
}

router.get('/', auth, async (req, res) => {
  const bots = await Bot.find({ owner: req.session.userId });
  res.json(bots);
});

router.post('/', auth, async (req, res) => {
  try {
    const bot = await manager.createBot({
      name: req.body.name,
      owner: req.session.userId
    });
    res.json(bot);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/:botId/connect', auth, async (req, res) => {
  try {
    const bot = await Bot.findOne({ botId: req.params.botId, owner: req.session.userId });
    if (!bot) return res.status(404).json({ error: 'Not found' });

    if (req.body.phoneNumber) {
      bot.phoneNumber = String(req.body.phoneNumber).replace(/\D/g, '');
      await bot.save();
    }

    await manager.connectBot(bot.botId);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/:botId/disconnect', auth, async (req, res) => {
  try {
    await manager.disconnectBot(req.params.botId);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/:botId', auth, async (req, res) => {
  try {
    await manager.deleteBot(req.params.botId);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
