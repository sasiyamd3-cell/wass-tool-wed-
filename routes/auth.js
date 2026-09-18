const express = require('express');
const router = express.Router();
const User = require('../models/User');

// Seed admin on first run
(async () => {
  try {
    const admin = await User.findOne({ username: process.env.ADMIN_USERNAME });
    if (!admin) {
      await User.create({
        username: process.env.ADMIN_USERNAME,
        password: process.env.ADMIN_PASSWORD,
        role: 'admin'
      });
      console.log('👑 Admin created:', process.env.ADMIN_USERNAME);
    }
  } catch (e) { console.error('Seed error:', e.message); }
})();

router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = await User.findOne({ username });
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });
    const ok = await user.comparePassword(password);
    if (!ok) return res.status(401).json({ error: 'Invalid credentials' });
    req.session.userId = user._id;
    req.session.username = user.username;
    req.session.role = user.role;
    res.json({ success: true, user: { username: user.username, role: user.role } });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/register', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Username & password required' });
    const exists = await User.findOne({ username });
    if (exists) return res.status(400).json({ error: 'User already exists' });
    const user = await User.create({ username, password });
    res.json({ success: true, user: { username: user.username } });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/logout', (req, res) => {
  req.session.destroy();
  res.json({ success: true });
});

router.get('/me', (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Not logged in' });
  res.json({ username: req.session.username, role: req.session.role });
});

module.exports = router;
