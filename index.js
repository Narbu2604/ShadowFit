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

// 🎯 XP Level logic
function getLevel(xp) {
  const levels = [
    0, 1000, 3500, 7000, 12000,
    18000, 25000, 33000, 42000, 52000
  ];

  for (let i = levels.length - 1; i >= 0; i--) {
    if (xp >= levels[i]) return i + 1;
  }
  return 1;
}

// 🕓 Return date with 4 AM IST logic
function getToday() {
  const now = new Date();
  const istOffset = 5.5 * 60 * 60 * 1000; // IST offset
  const istTime = new Date(now.getTime() + istOffset);
  istTime.setHours(istTime.getHours() - 4);
  return istTime.toISOString().split('T')[0];
}

// 💪 Generate level-based & streak-based quests
function getQuestsForLevel(level, streak = 1) {
  const exercises = [
    { name: 'Pushups', unit: 'reps', base: 10, xp: 5 },
    { name: 'Squats', unit: 'reps', base: 20, xp: 10 },
    { name: 'Crunches', unit: 'reps', base: 20, xp: 10 },
    { name: 'Russian Twists', unit: 'reps', base: 30, xp: 15 },
    { name: 'Sit-ups', unit: 'reps', base: 20, xp: 10 },
    { name: 'Jumping Jacks', unit: 'reps', base: 40, xp: 20 },
    { name: 'Skipping', unit: 'times', base: 50, xp: 20 },
    { name: 'Running', unit: 'meters', base: 200, xp: 20 },
    { name: 'Plank', unit: 'seconds', base: 30, xp: 10 }
  ];

  return exercises.map(ex => {
    let amount;

    if (ex.name === 'Running') {
      amount = Math.round(ex.base * Math.pow(1.5, streak - 1));
    } else {
      amount = ex.base + (level * 5) + (streak * 2);
    }

    const xp = ex.xp + level * 3;
    return {
      task: `${ex.name} ${amount} ${ex.unit}`,
      xp: xp
    };
  });
}

// 🔁 Generate new quests if date changed
function checkAndResetUser(id) {
  const today = getToday();

  if (!data[id]) {
    data[id] = {
      xp: 0,
      completed: [],
      lastActive: '',
      quests: [],
      streak: 1
    };
  }

  const user = data[id];
  const level = getLevel(user.xp);

  if (user.lastActive !== today || !user.quests || user.quests.length === 0) {
    if (user.lastActive !== today) {
      user.streak = (user.streak || 1) + 1;
    }

    user.quests = getQuestsForLevel(level, user.streak);
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
  bot.sendMessage(id, `📊 Stats:\nLevel: ${level}\nTotal XP: ${user.xp}\n🔥 Streak: ${user.streak} day(s)`);
});

// ⚠️ /reset
bot.onText(/\/reset/, (msg) => {
  const id = msg.chat.id;
  data[id] = { xp: 0, completed: [], lastActive: '', quests: [], streak: 1 };
  saveData();
  bot.sendMessage(id, `🔄 Progress reset. Start fresh with /start`);
});

// 📈 /levels
bot.onText(/\/levels/, (msg) => {
  const id = msg.chat.id;

  const levels = [
    { level: 1, min: 0, max: 999 },
    { level: 2, min: 1000, max: 3499 },
    { level: 3, min: 3500, max: 6999 },
    { level: 4, min: 7000, max: 11999 },
    { level: 5, min: 12000, max: 17999 },
    { level: 6, min: 18000, max: 24999 },
    { level: 7, min: 25000, max: 32999 },
    { level: 8, min: 33000, max: 41999 },
    { level: 9, min: 42000, max: 51999 },
    { level: 10, min: 52000, max: null },
  ];

  let message = "📈 Level Ranges:\n";
  for (const lvl of levels) {
    if (lvl.max) {
      message += `Level ${lvl.level}: ${lvl.min} – ${lvl.max} XP\n`;
    } else {
      message += `Level ${lvl.level}: ${lvl.min}+ XP\n`;
    }
  }

  bot.sendMessage(id, message.trim());
});
