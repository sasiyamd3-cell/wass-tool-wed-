const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Bot = require('../models/Bot');

function adminAuth(req, res, next) {
  if (req.session.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
  next();
}

router.get('/stats', adminAuth, async (req, res) => {
  const totalUsers = await User.countDocuments();
  const totalBots = await Bot.countDocuments();
  const onlineBots = await Bot.countDocuments({ status: 'online' });
  res.json({ totalUsers, totalBots, onlineBots });
});

router.get('/users', adminAuth, async (req, res) => {
  const users = await User.find().select('-password');
  res.json(users);
});

module.exports = router;
