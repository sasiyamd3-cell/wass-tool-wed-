require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const cookieParser = require('cookie-parser');
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
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

app.use(session({
  secret: process.env.SESSION_SECRET || 'default_secret_change_me',
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({ mongoUrl: MONGO_URI }),
  cookie: { maxAge: 1000 * 60 * 60 * 24 * 7 }
}));

// ============ ROUTES ============
app.use('/api/auth', require('./routes/auth'));
app.use('/api/bots', require('./routes/bots'));
app.use('/api/tools', require('./routes/tools'));
app.use('/api/admin', require('./routes/admin'));

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

// ============ BOT MANAGER ============
const botManager = require('./bot/manager');
botManager.setIO(io);

io.on('connection', (socket) => {
  console.log('🔌 Socket connected:', socket.id);
  socket.on('disconnect', () => console.log('❌ Socket disconnected:', socket.id));
});

// Restore online bots from DB on startup
(async () => {
  await new Promise(r => setTimeout(r, 2000)); // wait DB
  await botManager.loadBotsFromDB();
})();

// ============ START ============
server.listen(PORT, () => {
  console.log(`🚀 WA Tools Panel v3.0 running on port ${PORT}`);
  console.log(`🌐 http://localhost:${PORT}`);
});

process.on('uncaughtException', (err) => console.error('Uncaught:', err.message));
process.on('unhandledRejection', (err) => console.error('Unhandled:', err?.message || err));
