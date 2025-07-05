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

bot.onText(/\/bmi (\d+(\.\d+)?) (\d+(\.\d+)?)( \d{1,3})?/, (msg, match) => {
  const id = msg.chat.id;
  const weight = parseFloat(match[1]); // User's weight in kg
  const height = parseFloat(match[3]); // User's height in meters
  const age = match[5] ? parseInt(match[5]) : null; // Optional user age (e.g., 25)

  // Ensure valid input
  if (isNaN(weight) || isNaN(height) || weight <= 0 || height <= 0) {
    return bot.sendMessage(id, "❌ Please provide valid weight (kg) and height (meters). Example: /bmi 70 1.75 25");
  }

  // Calculate BMI using the real formula
  const bmi = weight / (height * height);

  // Determine health status based on BMI
  let healthStatus = "";
  if (bmi < 18.5) {
    healthStatus = "Underweight: You should consider gaining some weight.";
  } else if (bmi >= 18.5 && bmi < 24.9) {
    healthStatus = "Normal weight: You're in good shape!";
  } else if (bmi >= 25 && bmi < 29.9) {
    healthStatus = "Overweight: You should consider losing some weight.";
  } else {
    healthStatus = "Obese: You should consider losing weight for better health.";
  }

  // Age-based tips (optional)
  let ageTip = "";
  if (age !== null) {
    if (age < 18) {
      ageTip = "As a younger individual, your BMI might change as you grow, so it's good to monitor your health regularly.";
    } else if (age >= 18 && age < 40) {
      ageTip = "You're in the prime of your life! Focus on staying active and maintaining a healthy lifestyle.";
    } else if (age >= 40 && age < 60) {
      ageTip = "As you age, muscle mass naturally decreases, so it's important to stay active and focus on strength training.";
    } else {
      ageTip = "At your age, maintaining a healthy BMI is key to reducing health risks. Keep moving and watch your diet.";
    }
  }

  // Send the result with BMI and age context
  bot.sendMessage(id, `📊 Your BMI: ${bmi.toFixed(2)}\nHealth Status: ${healthStatus}\n${ageTip}`);
});

bot.onText(/\/reset/, msg => {
  const id = msg.chat.id;

  // Check if the user has data
  if (!data[id]) {
    return bot.sendMessage(id, "⚠️ You don't have any progress to reset.");
  }

  // Delete the user's data from memory
  delete data[id];

  // Save the updated data to data.json
  saveData();

  // Send confirmation message to the user
  bot.sendMessage(id, "🧹 Your progress has been completely reset. Use /start to begin again.");
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
  // Sort users by XP in descending order
  const leaderboard = Object.entries(data)
    .map(([id, user]) => {
      // Get username or fallback to user ID if username is unavailable
      const username = msg.chat.id === id ? msg.from.username : user.username || `ID ${id}`;
      return { id, xp: user.xp, username };
    })
    .sort((a, b) => b.xp - a.xp)
    .slice(0, 5)  // Limit to top 5
    .map((u, i) => `${i + 1}. ${u.username}: ${u.xp} XP`)
    .join('\n');
  
  bot.sendMessage(msg.chat.id, `🏆 Leaderboard:\n${leaderboard}`);
});

bot.onText(/\/timer (.+) (\d+)/, (msg, match) => {
  const id = msg.chat.id;
  const task = match[1];  // Task name (e.g., "plank")
  let duration = parseInt(match[2]);  // Duration in seconds

  if (isNaN(duration) || duration <= 0) {
    return bot.sendMessage(id, "❌ Invalid duration. Please provide a positive number of seconds.");
  }

  // Notify the user that the timer has started
  bot.sendMessage(id, `⏱️ Timer started for ${task}: ${duration} seconds`);

  let intervalId = setInterval(() => {
    if (duration > 0) {
      // Send periodic updates every second
      bot.sendMessage(id, `⏳ ${duration} seconds remaining for ${task}`);

      // Every 10 seconds, send a motivational message
      if (duration % 10 === 0) {
        const motivationalMessages = [
          "💪 Keep going, Shadow Hunter! You're doing great!",
          "🔥 Push through it, you’re getting stronger!",
          "🏋️‍♂️ Stay focused, you're almost there!",
          "⏳ Don't stop now, you're crushing it!",
          "💥 Just a bit more, you've got this!"
        ];

        // Send a random motivational message from the array
        const randomMessage = motivationalMessages[Math.floor(Math.random() * motivationalMessages.length)];
        bot.sendMessage(id, randomMessage);
      }

      duration--; // Decrease the timer by 1 second
    } else {
      clearInterval(intervalId); // Stop the interval when time is up
      bot.sendMessage(id, `✅ Time's up for: ${task}`);
    }
  }, 1000); // Update every 1 second
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
