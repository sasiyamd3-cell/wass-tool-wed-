
const express = require('express');
const router = express.Router();
const Bot = require('../models/Bot');
const manager = require('../bot/manager');

// Get all bots
router.get('/', async (req, res) => {
  const bots = await Bot.find();
  res.json(bots);
});

// Create bot
router.post('/', async (req, res) => {
  try {
    const bot = await manager.createBot({ name: req.body.name });
    res.json(bot);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Connect bot
router.post('/:botId/connect', async (req, res) => {
  try {
    const bot = await Bot.findOne({ botId: req.params.botId });
    if (!bot) return res.status(404).json({ error: 'Not found' });

    if (req.body.phoneNumber) {
      bot.phoneNumber = String(req.body.phoneNumber).replace(/\D/g, '');
      await bot.save();
    }

    await manager.connectBot(bot.botId);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Disconnect
router.post('/:botId/disconnect', async (req, res) => {
  try {
    await manager.disconnectBot(req.params.botId);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Delete
router.delete('/:botId', async (req, res) => {
  try {
    await manager.deleteBot(req.params.botId);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
