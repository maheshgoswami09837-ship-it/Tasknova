const admin = require('firebase-admin');

const FIREBASE_DB_URL = 'https://tasknova-66d0f-default-rtdb.firebaseio.com';

// ── Case 1: User ne aaj app hi nahi khola (login nahi kiya) ──
const LOGIN_MESSAGES = [
  {
    title: 'Kaha ho tum? 👀',
    body: 'Bahot din ho gaye TaskNova pe aaye hue! Wapas login karo, coins tumhara wait kar rahe hai 🪙'
  },
  {
    title: 'Tumhe miss kar rahe hai! 😢',
    body: 'Login karo aur dekho tumhare liye kya-kya naya hai TaskNova pe!'
  },
  {
    title: 'Account inactive ho raha hai! ⚠️',
    body: 'Login karke apna balance check karo aur earning shuru karo 💰'
  }
];

// ── Case 2: User login karta hai, lekin aaj task nahi kiya ──
const TASK_MESSAGES = [
  {
    title: 'Aaj task nahi kiya! 😢',
    body: 'Abhi 2 min me task complete karo aur free coins kamao 💰'
  },
  {
    title: '₹50 tumhara wait kar raha hai! 🎁',
    body: 'Aaj complete karo apne pending tasks aur coins pao!'
  },
  {
    title: 'Free me paise kamao abhi! 💸',
    body: 'Sirf 2 min me task complete karo aur turant coins pao!'
  },
  {
    title: 'Tumhara balance ready hai! 🪙',
    body: 'Tasks karo aur withdraw ke kareeb pahucho!'
  }
];

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_ADMIN_KEY)),
    databaseURL: FIREBASE_DB_URL
  });
}

// Aaj ki date IST me (YYYY-MM-DD)
function getTodayIST() {
  const istOffset = 5.5 * 60 * 60 * 1000;
  const istNow = new Date(Date.now() + istOffset);
  return istNow.toISOString().split('T')[0];
}

// Kisi bhi timestamp (ms) ko IST date string me convert karo
function toISTDateString(ms) {
  const istOffset = 5.5 * 60 * 60 * 1000;
  return new Date(ms + istOffset).toISOString().split('T')[0];
}

async function sendNotification(db, uid, fcmToken, msg, todayIST) {
  await admin.messaging().send({
    token: fcmToken,
    notification: {
      title: msg.title,
      body: msg.body
    },
    webpush: {
      notification: {
        icon: 'https://tasknovaofficial.vercel.app/images/logo.png'
      },
      fcmOptions: {
        link: 'https://tasknovaofficial.vercel.app/'
      }
    }
  });
  await db.ref('users/' + uid + '/dailyReminderSentDate').set(todayIST);
}

module.exports = async function handler(req, res) {
  try {
    const db = admin.database();
    const snapshot = await db.ref('users').once('value');
    const users = snapshot.val();

    if (!users) return res.status(200).json({ sent: 0 });

    const todayIST = getTodayIST();
    let sentLogin = 0;
    let sentTask = 0;
    let skippedDidTask = 0;
    let skippedNoToken = 0;
    let skippedAlreadySentToday = 0;

    for (const uid in users) {
      const user = users[uid];

      // Aaj already reminder bhej chuke hain kya? (double-send rokne ke liye)
      if (user.dailyReminderSentDate === todayIST) { skippedAlreadySentToday++; continue; }
      if (!user.fcmToken) { skippedNoToken++; continue; }

      const lastActiveMs = user.lastActive || 0;
      const lastTaskMs    = user.lastTaskDate || 0;

      const openedAppToday = lastActiveMs && toISTDateString(lastActiveMs) === todayIST;
      const didTaskToday   = lastTaskMs && toISTDateString(lastTaskMs) === todayIST;

      // Case: aaj task kiya hai — sab theek hai, koi notification nahi
      if (didTaskToday) { skippedDidTask++; continue; }

      try {
        if (!openedAppToday) {
          // Case: aaj app hi nahi khola — login wala message
          const msg = LOGIN_MESSAGES[Math.floor(Math.random() * LOGIN_MESSAGES.length)];
          await sendNotification(db, uid, user.fcmToken, msg, todayIST);
          sentLogin++;
        } else {
          // Case: app khola lekin task nahi kiya — task wala message
          const msg = TASK_MESSAGES[Math.floor(Math.random() * TASK_MESSAGES.length)];
          await sendNotification(db, uid, user.fcmToken, msg, todayIST);
          sentTask++;
        }
      } catch (err) {
        console.warn(`[FCM] Failed for ${uid}:`, err.message);
        if (err.code === 'messaging/registration-token-not-registered') {
          await db.ref('users/' + uid + '/fcmToken').remove();
        }
      }
    }

    res.status(200).json({
      sentLoginReminders: sentLogin,
      sentTaskReminders: sentTask,
      skippedDidTaskToday: skippedDidTask,
      skippedAlreadySentToday,
      skippedNoToken
    });
  } catch (error) {
    console.error('[send-reminders] Error:', error);
    res.status(500).json({ error: error.message });
  }
};
