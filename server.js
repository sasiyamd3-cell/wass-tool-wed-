require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

const PORT = process.env.PORT || 3000;
const MONGO_URI = process.env.MONGO_URI;

// ============ DB CONNECT ============
mongoose.connect(MONGO_URI)
  .then(() => console.log('📦 MongoDB Connected for Sasiya MD!'))
  .catch(err => console.error('❌ MongoDB Error:', err.message));

// ============ MIDDLEWARE ============
app.use(cors());
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// ============ ROUTES (Auth අයින් කරලා) ============
app.use('/api/bots', require('./routes/bots'));
app.use('/api/tools', require('./routes/tools'));

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

// ============ BOT MANAGER ============
const botManager = require('./bot/manager');
botManager.setIO(io);

io.on('connection', (socket) => {
  console.log('🔌 Socket connected:', socket.id);
  socket.on('disconnect', () => console.log('❌ Socket disconnected:', socket.id));
});

// Restore online bots
(async () => {
  await new Promise(r => setTimeout(r, 2000));
  await botManager.loadBotsFromDB();
})();

// ============ START ============
server.listen(PORT, () => {
  console.log(`🚀 WA Tools Panel running on port ${PORT}`);
  console.log(`🌐 http://localhost:${PORT}`);
});

process.on('uncaughtException', (err) => console.error('Uncaught:', err.message));
process.on('unhandledRejection', (err) => console.error('Unhandled:', err?.message || err));
