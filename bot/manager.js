const Bot = require('../models/Bot');
const AutoTask = require('../models/AutoTask');
const { startBot, stopBot, getBotSocket } = require('./waHandler');

let io = null;
const activeBots = new Map();

function setIO(socketIO) { io = socketIO; }

function broadcast(event, data) {
  if (io) io.emit(event, data);
}

async function loadBotsFromDB() {
  try {
    const bots = await Bot.find({ status: 'online' });
    console.log(`🔁 Restoring ${bots.length} online bots...`);
    for (const bot of bots) {
      try {
        await startBot(bot, broadcast);
      } catch (e) {
        console.error(`Failed restore ${bot.name}:`, e.message);
      }
    }
  } catch (e) { console.error('Load bots error:', e.message); }
}

async function createBot({ name, owner }) {
  const botId = 'BOT_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
  const bot = await Bot.create({ botId, name, owner });
  broadcast('bots:list:refresh');
  return bot;
}

async function connectBot(botId) {
  const bot = await Bot.findOne({ botId });
  if (!bot) throw new Error('Bot not found');
  bot.status = 'connecting';
  await bot.save();
  broadcast('bots:update', bot);
  await startBot(bot, broadcast);
  return bot;
}

async function disconnectBot(botId) {
  await stopBot(botId);
  const bot = await Bot.findOne({ botId });
  if (bot) {
    bot.status = 'offline';
    await bot.save();
    broadcast('bots:update', bot);
  }
  // Remove auto tasks
  await AutoTask.deleteMany({ botId });
  return bot;
}

async function deleteBot(botId) {
  await stopBot(botId);
  await AutoTask.deleteMany({ botId });
  await Bot.deleteOne({ botId });
  broadcast('bots:list:refresh');
}

function getAllBots() { return activeBots.size; }

module.exports = {
  setIO, broadcast, loadBotsFromDB,
  createBot, connectBot, disconnectBot, deleteBot,
  getAllBots, activeBots
};
