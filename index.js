const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');

// BOT TOKEN HERE
const token = 'YOUR_TELEGRAM_BOT_TOKEN';
const bot = new TelegramBot(token, { polling: true });

let data = {};
if (fs.existsSync('data.json')) {
  data = JSON.parse(fs.readFileSync('data.json'));
}

function saveData() {
  fs.writeFileSync('data.json', JSON.stringify(data, null, 2));
}

function initUser(id) {
  if (!data[id]) {
    data[id] = {
      xp: 0,
      level: 1,
      lastQuestDate: '',
      quests: [],
      completed: []
    };
  }
}

function xpForLevel(level) {
  return level * 100 + 100;
}

function generateQuests(level) {
  const easy = [
    { task: "Do 10 pushups", xp: 20 },
    { task: "Do 20 squats", xp: 25 },
    { task: "Walk 3000 steps", xp: 30 },
    { task: "Hold a 15s plank", xp: 20 }
  ];
  const medium = [
    { task: "Do 30 pushups", xp: 40 },
    { task: "Do 50 squats", xp: 45 },
    { task: "Run 1 km", xp: 50 },
    { task: "Hold a 1-minute plank", xp: 35 }
  ];
  const hard = [
    { task: "Do 50 pushups", xp: 60 },
    { task: "Do 100 squats", xp: 70 },
    { task: "Run 2 km", xp: 75 },
    { task: "Hold a 2-minute plank", xp: 50 }
  ];

  if (level <= 3) return easy.sort(() => 0.5 - Math.random()).slice(0, 2);
  if (level <= 6) return medium.sort(() => 0.5 - Math.random()).slice(0, 2);
  return hard.sort(() => 0.5 - Math.random()).slice(0, 2);
}

bot.onText(/\/start/, (msg) => {
  const id = msg.chat.id;
  initUser(id);
  bot.sendMessage(id, "🗡️ Welcome, Narbu the Shadow Hunter!
Use /quests to get your daily missions.
Use /log [task] after completing a workout.
Use /stats to see your current level.");
});

bot.onText(/\/quests/, (msg) => {
  const id = msg.chat.id;
  initUser(id);

  const today = new Date().toISOString().split('T')[0];
  if (data[id].lastQuestDate !== today) {
    data[id].quests = generateQuests(data[id].level);
    data[id].completed = [];
    data[id].lastQuestDate = today;
    saveData();
  }

  let text = `🗓️ Today's Quests (Level ${data[id].level}):\n`;
  data[id].quests.forEach((q, i) => {
    const done = data[id].completed.includes(i) ? "✅" : "🔘";
    text += `${done} ${q.task} (+${q.xp} XP)\n`;
  });
  bot.sendMessage(id, text);
});

bot.onText(/\/log (.+)/, (msg, match) => {
  const id = msg.chat.id;
  initUser(id);
  const input = match[1].toLowerCase();

  const quests = data[id].quests;
  let found = false;
  quests.forEach((q, i) => {
    if (!data[id].completed.includes(i) && input.includes(q.task.toLowerCase())) {
      data[id].xp += q.xp;
      data[id].completed.push(i);
      found = true;

      while (data[id].xp >= xpForLevel(data[id].level)) {
        data[id].xp -= xpForLevel(data[id].level);
        data[id].level++;
        bot.sendMessage(id, `🆙 LEVEL UP! You are now Level ${data[id].level} 🔥`);
      }

      bot.sendMessage(id, `✅ Task completed: "${q.task}" (+${q.xp} XP)`);
    }
  });

  if (!found) {
    bot.sendMessage(id, `❌ Task not recognized or already completed today.`);
  }

  saveData();
});

bot.onText(/\/stats/, (msg) => {
  const id = msg.chat.id;
  initUser(id);
  const level = data[id].level;
  const xp = data[id].xp;
  const xpNeeded = xpForLevel(level);
  const percent = ((xp / xpNeeded) * 100).toFixed(1);
  bot.sendMessage(id,
    `🧍 Narbu the Shadow Hunter
🔢 Level: ${level}
🧪 XP: ${xp} / ${xpNeeded} (${percent}%)`);
});

bot.onText(/\/reset/, (msg) => {
  const id = msg.chat.id;
  delete data[id];
  saveData();
  bot.sendMessage(id, "🧹 Your progress has been reset.");
});