require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const fs = require('fs');

const TOKEN = process.env.BOT_TOKEN;
const bot = new TelegramBot(TOKEN);
const app = express();

// ✅ Set webhook to your Render URL
bot.setWebHook(`https://shadowfit.onrender.com/${TOKEN}`);

// ✅ Telegram will send updates here
app.use(express.json());
app.post(`/${TOKEN}`, (req, res) => {
  bot.processUpdate(req.body);
  res.sendStatus(200);
});

// ✅ Optional homepage route
app.get("/", (req, res) => {
  res.send("🛡️ ShadowFit Webhook is running!");
});

// ✅ Server listens on port 3000 for Render
app.listen(3000, () => {
  console.log("🌐 Server running on port 3000");
});

// 📁 Load or initialize user data
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

// 🎯 Generate quests for a level
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

// 🛡️ Reset quests daily or when needed
function checkAndResetUser(id) {
  const today = getToday();
  if (!data[id]) {
    data[id] = { xp: 0, completed: [], lastActive: '', quests: [] };
  }

  const user = data[id];
  const level = getLevel(user.xp);

  if (user.lastActive !== today || !user.quests || user.quests.length === 0) {
    user.quests = getQuestsForLevel(level);
    user.completed = [];
    user.lastActive = today;
    saveData();
  }
}

// 🔁 /start
bot.onText(/\/start/, (msg) => {
  const id = msg.chat.id;
  const name = msg.from.username || msg.from.first_name || 'Hunter';
  checkAndResetUser(id);
  bot.sendMessage(id, `Welcome ${name} the Shadow Hunter 🛡️\nUse /quests to view today's missions.`);
});

// 📅 /quests
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

// 📝 /log <task>
bot.onText(/\/log (.+)/, (msg, match) => {
  const id = msg.chat.id;
  const input = match[1].trim().toLowerCase();
  checkAndResetUser(id);
  const user = data[id];

  const quest = user.quests.find(q => q.task.toLowerCase() === input);
  if (!quest) return bot.sendMessage(id, '❌ Task not recognized.');

  if (user.completed.includes(quest.task)) {
    return bot.sendMessage(id, `❌ You’ve already completed "${quest.task}" today.`);
  }

  user.xp += quest.xp;
  user.completed.push(quest.task);
  saveData();
  bot.sendMessage(id, `✅ Task completed: "${quest.task}" (+${quest.xp} XP)`);
});

// 📊 /stats
bot.onText(/\/stats/, (msg) => {
  const id = msg.chat.id;
  checkAndResetUser(id);
  const user = data[id];
  const level = getLevel(user.xp);
  bot.sendMessage(id, `📊 Stats:\nLevel: ${level}\nTotal XP: ${user.xp}`);
});

// ⚠️ /reset
bot.onText(/\/reset/, (msg) => {
  const id = msg.chat.id;
  data[id] = { xp: 0, completed: [], lastActive: '', quests: [] };
  saveData();
  bot.sendMessage(id, `🔄 Progress reset. Start fresh with /start`);
});
