const mongoose = require('mongoose');

const botSchema = new mongoose.Schema({
  botId: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  phoneNumber: { type: String, default: null },
  status: { type: String, default: 'offline' }, // offline | connecting | online
  stats: {
    rss: { type: String, default: '0M' },
    heap: { type: String, default: '0M/0M' },
    uptime: { type: String, default: '0s' },
    reactionsSent: { type: Number, default: 0 },
    followsDone: { type: Number, default: 0 }
  },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Bot', botSchema);
