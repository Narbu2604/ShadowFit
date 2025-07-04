const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const fs = require('fs');

// ==== Secure token from env ====
const token = process.env.BOT_TOKEN;
const bot = new TelegramBot(token, { polling: true });

// ==== Data file ====
const DATA_FILE = 'data.json';
let userData = {};

// ==== Load data on start ====
if (fs.existsSync(DATA_FILE)) {
  userData = JSON.parse(fs.readFileSync(DATA_FILE));
}

// ==== Save data to file ====
function saveData() {
  fs.writeFileSync(DATA_FILE, JSON.stringify(userData, null, 2));
}

// ==== Daily quests ====
const dailyQuests = [
  { task: 'Do 20 squats', xp: 25 },
  { task: 'Do 10 pushups', xp: 20 },
];

// ==== Get level ====
function getLevel(xp) {
  return Math.floor(xp / 200) + 1;
}

// ==== Reset quests if new day ====
function checkAndResetUser(id) {
  const today = new Date().toISOString().slice(0, 10); // yyyy-mm-dd

  if (!userData[id]) {
    userData[id] = { xp: 0, completed: [], lastActive: today };
  }

  if (userData[id].lastActive !== today) {
    userData[id].completed = [];
    userData[id].lastActive = today;
    saveData();
  }
}

// ==== /start ====
bot.onText(/\/start/, (msg) => {
  const id = msg.chat.id;
  const name = msg.from.username ? `@${msg.from.username}` : msg.from.first_name;

  checkAndResetUser(id);

  bot.sendMessage(id,
    `🛡️ Welcome, ${name} the Shadow Hunter!\n\n` +
    `Use /quests to view your daily missions.\n` +
    `Use /log [task] after completing a workout.\n` +
    `Use /stats to check your XP and level.`
  );
});

// ==== /quests ====
bot.onText(/\/quests/, (msg) => {
  const id = msg.chat.id;
  checkAndResetUser(id);

  const user = userData[id];
  const level = getLevel(user.xp);

  let response = `📅 Today's Quests (Level ${level}):\n`;
  for (const quest of dailyQuests) {
    const done = user.completed.includes(quest.task);
    response += `${done ? '✅' : '⭕'} ${quest.task} (+${quest.xp} XP)\n`;
  }

  bot.sendMessage(id, response);
});

// ==== /log [task] ====
bot.onText(/\/log (.+)/, (msg, match) => {
  const id = msg.chat.id;
  const rawInput = match[1].trim().toLowerCase();
  const normalizedInput = rawInput.replace(/^do\s+/i, '').trim();

  checkAndResetUser(id);
  const user = userData[id];

  const found = dailyQuests.find(q => {
    const normalizedTask = q.task.toLowerCase().replace(/^do\s+/i, '').trim();
    return normalizedTask === normalizedInput;
  });

  if (!found) {
    return bot.sendMessage(id, '❌ Task not recognized.');
  }

  if (user.completed.includes(found.task)) {
    return bot.sendMessage(id, '❌ Task already completed today.');
  }

  user.xp += found.xp;
  user.completed.push(found.task);
  saveData();

  bot.sendMessage(id, `✅ Task completed: "${found.task}" (+${found.xp} XP)`);
});

// ==== /stats ====
bot.onText(/\/stats/, (msg) => {
  const id = msg.chat.id;
  checkAndResetUser(id);
  const user = userData[id];

  const level = getLevel(user.xp);
  const nextXP = level * 200;
  const percent = ((user.xp / nextXP) * 100).toFixed(1);
  const name = msg.from.username ? `@${msg.from.username}` : msg.from.first_name;

  bot.sendMessage(id,
    `🧍 ${name} the Shadow Hunter\n` +
    `Level: ${level}\n` +
    `📏 XP: ${user.xp} / ${nextXP} (${percent}%)`);
});

// ==== Express server to keep bot alive on Render ====
const app = express();
const PORT = process.env.PORT || 3000;
app.get('/', (req, res) => res.send('🛡️ ShadowFit bot is running'));
app.listen(PORT, () => console.log(`✅ Web server on port ${PORT}`));
