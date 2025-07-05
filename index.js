// index.js

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
app.get("/", (req, res) => res.send("🛡️ ShadowFit Webhook is running!"));
app.listen(3000, () => console.log("🌐 Server on 3000"));

let data = {};
if (fs.existsSync('data.json')) data = JSON.parse(fs.readFileSync('data.json'));
function saveData() { fs.writeFileSync('data.json', JSON.stringify(data, null, 2)); }

function getToday() {
  const now = new Date();
  now.setHours(now.getHours() + 5, now.getMinutes() + 30); // IST
  now.setHours(now.getHours() - 4); // Daily reset at 4 AM IST
  return now.toISOString().split('T')[0];
}

function getLevel(xp) {
  const thresholds = [0, 1000, 3500, 7000, 12000, 18000, 25000, 33000, 42000, 52000];
  for (let i = thresholds.length - 1; i >= 0; i--) {
    if (xp >= thresholds[i]) return i + 1;
  }
  return 1;
}

function getQuestsForUser(user) {
  const level = getLevel(user.xp);
  const dayCount = (user.weightLog?.length || 1);

  const exercises = [
    { name: 'Pushups', unit: 'reps', base: 10, xp: 5 },
    { name: 'Squats', unit: 'reps', base: 20, xp: 10 },
    { name: 'Crunches', unit: 'reps', base: 20, xp: 10 },
    { name: 'Russian Twists', unit: 'reps', base: 30, xp: 15 },
    { name: 'Sit-ups', unit: 'reps', base: 20, xp: 10 },
    { name: 'Jumping Jacks', unit: 'reps', base: 40, xp: 20 },
    { name: 'Skipping', unit: 'times', base: 50, xp: 20 },
    { name: 'Running', unit: 'meters', base: Math.round(200 * (1.5 ** (dayCount - 1))), xp: 20 + (level * 2) },
    { name: 'Plank', unit: 'seconds', base: 30 + dayCount * 3, xp: 10 + level }
  ];

  return exercises.map(ex => ({
    task: `${ex.name} ${ex.base + level * 5} ${ex.unit}`,
    xp: ex.xp + level * 2
  }));
}

function checkUser(id) {
  const today = getToday();
  if (!data[id]) {
    data[id] = {
      xp: 0,
      completed: [],
      lastActive: '',
      quests: [],
      streak: 0,
      weightLog: [],
      goalWeight: null,
      titles: [],
      checkins: [],
      restUsed: false,
      history: {}
    };
  }
  const user = data[id];

  if (user.lastActive !== today) {
    if (user.lastActive === getYesterday()) user.streak += 1;
    else user.streak = 1;

    user.quests = getQuestsForUser(user);
    user.completed = [];
    user.lastActive = today;
    user.restUsed = false;
  }

  saveData();
}

function getYesterday() {
  const now = new Date();
  now.setHours(now.getHours() + 5.5 * 60 - 4); // 4AM reset
  now.setDate(now.getDate() - 1);
  return now.toISOString().split('T')[0];
}

// === BOT COMMANDS ===

bot.onText(/\/start/, msg => {
  const id = msg.chat.id;
  const name = msg.from.username || msg.from.first_name || 'Hunter';
  checkUser(id);
  bot.sendMessage(id, `Welcome ${name} the Shadow Hunter 🛡️\nUse /quests to begin your transformation.`);
});

bot.onText(/\/quests/, msg => {
  const id = msg.chat.id;
  checkUser(id);
  const user = data[id];
  const level = getLevel(user.xp);

  const completed = user.completed;
  const quests = user.quests;

  let response = `📅 Today's Quests (Level ${level}):\n\n`;
  const remaining = quests.filter(q => !completed.includes(q.task));
  const done = quests.filter(q => completed.includes(q.task));

  if (remaining.length > 0) {
    response += '🕒 Remaining:\n' + remaining.map(q => `🔘 ${q.task} (+${q.xp} XP)`).join('\n') + '\n\n';
  }
  if (done.length > 0) {
    response += '🏁 Completed:\n' + done.map(q => `✅ ${q.task} (+${q.xp} XP)`).join('\n');
  }

  bot.sendMessage(id, response.trim());
});

bot.onText(/\/log (.+)/, (msg, match) => {
  const id = msg.chat.id;
  const input = match[1].trim().toLowerCase();
  checkUser(id);
  const user = data[id];

  const quest = user.quests.find(q => q.task.toLowerCase() === input);
  if (!quest) return bot.sendMessage(id, `❌ Not recognized task: "${input}"`);
  if (user.completed.includes(quest.task)) return bot.sendMessage(id, `❌ Already completed.`);

  user.completed.push(quest.task);
  user.xp += quest.xp;
  saveData();

  bot.sendMessage(id, `✅ "${quest.task}" logged! (+${quest.xp} XP)`);
});

bot.onText(/\/stats/, msg => {
  const id = msg.chat.id;
  checkUser(id);
  const user = data[id];
  bot.sendMessage(id, `📊 Stats:\nLevel: ${getLevel(user.xp)}\nXP: ${user.xp}\n🔥 Streak: ${user.streak} days`);
});

bot.onText(/\/weight (\d+(\.\d+)?)/, (msg, match) => {
  const id = msg.chat.id;
  const weight = parseFloat(match[1]);
  checkUser(id);
  const user = data[id];
  const today = getToday();
  user.weightLog = user.weightLog || [];
  user.weightLog.push({ date: today, weight });
  saveData();
  bot.sendMessage(id, `✅ Weight logged: ${weight} kg`);
});

bot.onText(/\/weightlog/, msg => {
  const id = msg.chat.id;
  checkUser(id);
  const logs = (data[id].weightLog || []).slice(-7);
  if (logs.length === 0) return bot.sendMessage(id, "📉 No weight logs yet.");
  const msgText = logs.map(w => `${w.date}: ${w.weight} kg`).join('\n');
  bot.sendMessage(id, `📆 Last 7 Days:\n${msgText}`);
});

bot.onText(/\/targetweight (\d+(\.\d+)?)/, (msg, match) => {
  const id = msg.chat.id;
  checkUser(id);
  data[id].goalWeight = parseFloat(match[1]);
  saveData();
  bot.sendMessage(id, `🎯 Goal set: ${data[id].goalWeight} kg`);
});

bot.onText(/\/progress/, msg => {
  const id = msg.chat.id;
  checkUser(id);
  const user = data[id];
  const start = user.weightLog?.[0]?.weight;
  const current = user.weightLog?.[user.weightLog.length - 1]?.weight;
  const goal = user.goalWeight;

  if (!start || !current || !goal) return bot.sendMessage(id, "ℹ️ Missing weight logs or goal.");

  const lost = (start - current).toFixed(1);
  const remaining = (current - goal).toFixed(1);
  bot.sendMessage(id, `📉 Progress:\nStart: ${start}kg\nNow: ${current}kg\nLost: ${lost}kg\nTo Goal: ${remaining}kg`);
});

bot.onText(/\/rest/, msg => {
  const id = msg.chat.id;
  checkUser(id);
  const user = data[id];
  if (user.restUsed) return bot.sendMessage(id, "❌ You already used your rest day.");
  user.restUsed = true;
  user.streak += 1;
  saveData();
  bot.sendMessage(id, "🛌 Rest day used. Streak preserved.");
});

bot.onText(/\/levels/, msg => {
  const levels = [0, 1000, 3500, 7000, 12000, 18000, 25000, 33000, 42000, 52000];
  const message = levels.map((v, i) =>
    i === levels.length - 1
      ? `Level ${i + 1}: ${v}+ XP`
      : `Level ${i + 1}: ${v}–${levels[i + 1] - 1} XP`
  ).join('\n');
  bot.sendMessage(msg.chat.id, `📈 Levels:\n${message}`);
});

bot.onText(/\/leaderboard/, msg => {
  const leaderboard = Object.entries(data)
    .map(([id, user]) => ({ id, xp: user.xp }))
    .sort((a, b) => b.xp - a.xp)
    .slice(0, 5)
    .map((u, i) => `${i + 1}. 🧍‍♂️ ID ${u.id.slice(-5)}: ${u.xp} XP`)
    .join('\n');
  bot.sendMessage(msg.chat.id, `🏆 Leaderboard:\n${leaderboard}`);
});

bot.onText(/\/timer (.+) (\d+)/, (msg, match) => {
  const id = msg.chat.id;
  const task = match[1];
  const secs = parseInt(match[2]);
  bot.sendMessage(id, `⏱️ Timer started for ${task}: ${secs}s`);
  setTimeout(() => {
    bot.sendMessage(id, `✅ Time's up for: ${task}`);
  }, secs * 1000);
});

bot.on('photo', msg => {
  const id = msg.chat.id;
  checkUser(id);
  const fileId = msg.photo[msg.photo.length - 1].file_id;
  data[id].checkins.push({ date: getToday(), fileId });
  saveData();
  bot.sendMessage(id, "📸 Check-in saved!");
});

bot.onText(/\/weekly/, msg => {
  const id = msg.chat.id;
  checkUser(id);
  const user = data[id];
  const weekXp = user.completed.length * 10; // Approx.
  bot.sendMessage(id, `📅 Weekly Summary:\nStreak: ${user.streak}\nXP earned: ~${weekXp} XP`);
});

bot.onText(/\/monthly/, msg => {
  const id = msg.chat.id;
  checkUser(id);
  const user = data[id];
  const monthXp = user.xp;
  const logs = user.weightLog || [];
  const start = logs[0]?.weight;
  const current = logs[logs.length - 1]?.weight;
  bot.sendMessage(id, `📆 Monthly Summary:\nXP: ${monthXp}\nWeight Change: ${start}kg → ${current}kg`);
});
