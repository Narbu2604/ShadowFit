require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const fs = require('fs');

const TOKEN = process.env.BOT_TOKEN;
const bot = new TelegramBot(TOKEN, { polling: true });

const app = express();
app.get('/', (req, res) => res.send('🛡️ ShadowFit bot is running'));
app.listen(3000, () => console.log('Web server running on port 3000'));

let data = {};
if (fs.existsSync('data.json')) {
  data = JSON.parse(fs.readFileSync('data.json'));
}

function saveData() {
  fs.writeFileSync('data.json', JSON.stringify(data, null, 2));
}

function getLevel(xp) {
  return Math.floor(xp / 100) + 1;
}

function getToday() {
  return new Date().toISOString().split('T')[0];
}

function getQuestsForLevel(level) {
  const exercises = [
    { name: 'Pushups', unit: 'reps', base: 10, xp: 20 },
    { name: 'Squats', unit: 'reps', base: 20, xp: 25 },
    { name: 'Crunches', unit: 'reps', base: 20, xp: 25 },
    { name: 'Russian Twists', unit: 'reps', base: 30, xp: 25 },
    { name: 'Sit-ups', unit: 'reps', base: 15, xp: 20 },
    { name: 'Jumping Jacks', unit: 'reps', base: 30, xp: 20 },
    { name: 'Skipping', unit: 'times', base: 50, xp: 20 },
    { name: 'Running', unit: 'meters', base: 200, xp: 30 },
    { name: 'Plank', unit: 'seconds', base: 30, xp: 30 }
  ];

  return exercises.map(ex => {
    const amount = ex.base + level * 5;
    const xp = ex.xp + level * 3;
    return {
      task: `${ex.name} ${amount} ${ex.unit}`,
      xp: xp
    };
  });
}

function checkAndResetUser(id) {
  const today = getToday();
  if (!data[id]) {
    data[id] = { xp: 0, completed: [], lastActive: today, quests: [] };
  }
  if (data[id].lastActive !== today) {
    const level = getLevel(data[id].xp);
    data[id].quests = getQuestsForLevel(level);
    data[id].completed = [];
    data[id].lastActive = today;
    saveData();
  }
}

// /start
bot.onText(/\/start/, (msg) => {
  const id = msg.chat.id;
  const name = msg.from.username || msg.from.first_name || 'Hunter';
  checkAndResetUser(id);
  bot.sendMessage(id, `Welcome ${name} the Shadow Hunter 🛡️\nUse /quests to view today's challenges.`);
});

// /quests
bot.onText(/\/quests/, (msg) => {
  const id = msg.chat.id;
  checkAndResetUser(id);
  const user = data[id];
  const level = getLevel(user.xp);

  let completed = '';
  let remaining = '';

  for (const quest of user.quests) {
    const isDone = user.completed.includes(quest.task);
    const line = `${quest.task} (+${quest.xp} XP)\n`;

    if (isDone) completed += `✅ ${line}`;
    else remaining += `🔘 ${line}`;
  }

  let response = `📅 Today's Quests (Level ${level}):\n\n`;
  if (remaining) response += `🕒 Remaining:\n${remaining}\n`;
  if (completed) response += `🏁 Completed:\n${completed}`;
  bot.sendMessage(id, response.trim());
});

// /log
bot.onText(/\/log (.+)/, (msg, match) => {
  const id = msg.chat.id;
  const rawInput = match[1].trim().toLowerCase();
  checkAndResetUser(id);
  const user = data[id];

  const found = user.quests.find(q => q.task.toLowerCase() === rawInput);
  if (!found) return bot.sendMessage(id, '❌ Task not recognized.');
  if (user.completed.includes(found.task)) {
    return bot.sendMessage(id, `❌ You’ve already completed "${found.task}" today.`);
  }

  user.xp += found.xp;
  user.completed.push(found.task);
  saveData();
  bot.sendMessage(id, `✅ Task completed: "${found.task}" (+${found.xp} XP)`);
});

// /stats
bot.onText(/\/stats/, (msg) => {
  const id = msg.chat.id;
  checkAndResetUser(id);
  const user = data[id];
  const level = getLevel(user.xp);
  bot.sendMessage(id, `📊 Stats:\nLevel: ${level}\nTotal XP: ${user.xp}`);
});
