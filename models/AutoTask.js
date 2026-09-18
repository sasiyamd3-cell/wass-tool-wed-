const mongoose = require('mongoose');

const autoTaskSchema = new mongoose.Schema({
  botId: { type: String, required: true },
  owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  type: { type: String, enum: ['react'], default: 'react' },
  channelJid: { type: String, required: true },
  channelUrl: String,
  emoji: { type: String, default: '❤️' },
  active: { type: Boolean, default: true },
  reactedCount: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now }
});

autoTaskSchema.index({ botId: 1, channelJid: 1 });

module.exports = mongoose.model('AutoTask', autoTaskSchema);
