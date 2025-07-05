require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const fs = require('fs');
const app = express();

const TOKEN = process.env.BOT_TOKEN;
const bot = new TelegramBot(TOKEN);
bot.setWebHook(`https://shadowfit.onrender.com/${TOKEN}`);

app.use(express.json());
app.post(`/${TOKEN}`, (req, res) => {
  bot.processUpdate(req.body);
  res.sendStatus(200);
});

app.get('/', (req, res) => res.send('🛡️ ShadowFit Webhook is running!'));
app.listen(3000, () => console.log('🌐 Server on port 3000'));

let data = {};
if (fs.existsSync('data.json')) data = JSON.parse(fs.readFileSync('data.json'));
function saveData() { fs.writeFileSync('data.json', JSON.stringify(data, null, 2)); }

function getToday() {
  const now = new Date();
  const istOffset = 5.5 * 60 * 60 * 1000;
  const istTime = new Date(now.getTime() + istOffset);
  istTime.setHours(istTime.getHours() - 4);
  return istTime.toISOString().split('T')[0];
}

function getLevel(xp) {
  const levels = [0, 1000, 3500, 7000, 12000, 18000, 25000, 33000, 42000, 52000];
  for (let i = levels.length - 1; i >= 0; i--) {
    if (xp >= levels[i]) return i + 1;
  }
  return 1;
}

function getTitle(level) {
  const titles = ["Novice", "Trainee", "Fighter", "Warrior", "Beast", "Elite", "Shadow Knight", "Overlord", "Ascendant", "God Hunter"];
  return titles[Math.min(level - 1, titles.length - 1)];
}

function getMotivation() {
  const quotes = [
    "Push yourself, because no one else is going to do it for you.",
    "One more rep, one step closer.",
    "Consistency is more important than intensity.",
    "You don’t have to be great to start, but you have to start to be great.",
    "Every drop of sweat is a step to your stronger self."
  ];
  return quotes[Math.floor(Math.random() * quotes.length)];
}

function getQuestsForLevel(level, day) {
  const exercises = [
    { name: 'Pushups', unit: 'reps', base: 10, xp: 5 },
    { name: 'Squats', unit: 'reps', base: 20, xp: 10 },
    { name: 'Crunches', unit: 'reps', base: 20, xp: 10 },
    { name: 'Russian Twists', unit: 'reps', base: 30, xp: 15 },
    { name: 'Sit-ups', unit: 'reps', base: 20, xp: 10 },
    { name: 'Jumping Jacks', unit: 'reps', base: 40, xp: 20 },
    { name: 'Skipping', unit: 'times', base: 50, xp: 20 },
    { name: 'Running', unit: 'meters', base: 200, xp: 20, multiplier: 1.5 },
    { name: 'Plank', unit: 'seconds', base: 30, xp: 10 }
  ];

  return exercises.map(ex => {
    const isRunning = ex.name === 'Running';
    const amount = isRunning
      ? Math.round(ex.base * Math.pow(ex.multiplier || 1, day))
      : ex.base + level * 5 + day * 2;
    const xp = ex.xp + level * 3;
    return { task: `${ex.name} ${amount} ${ex.unit}`, xp: xp };
  });
}

function checkAndResetUser(id) {
  const today = getToday();
  if (!data[id]) {
    data[id] = {
      xp: 0, weight: [], targetWeight: null, streak: 0, completed: [], lastActive: '', quests: [], joinDate: today,
      badges: [], challenges: {}, restDays: [], history: [], motivational: getMotivation(), timers: {}
    };
  }
  const user = data[id];
  const level = getLevel(user.xp);

  if (user.lastActive !== today) {
    const day = Math.floor((new Date(today) - new Date(user.joinDate)) / 86400000);
    user.history.push({ date: user.lastActive, xp: user.xp });
    user.quests = getQuestsForLevel(level, day);
    user.completed = [];
    user.lastActive = today;
    user.streak += 1;
    user.motivational = getMotivation();
    saveData();
  }
}

bot.onText(/\/starttimer (.+)/, (msg, match) => {
  const id = msg.chat.id;
  const input = match[1];
  const minutes = parseInt(input);
  if (!isNaN(minutes) && minutes > 0) {
    bot.sendMessage(id, `⏱️ Timer started for ${minutes} minutes.`);
    setTimeout(() => {
      bot.sendMessage(id, `⏰ Time's up! ${minutes} minutes passed.`);
    }, minutes * 60000);
  } else {
    bot.sendMessage(id, '⚠️ Invalid time. Use /starttimer <minutes>.');
  }
});
