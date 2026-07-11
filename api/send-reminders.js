const admin = require('firebase-admin');

const FIREBASE_DB_URL = 'https://tasknova-66d0f-default-rtdb.firebaseio.com';
const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;

// Alag-alag messages — har baar random ek use hoga taaki users bore na ho
const MESSAGES = [
  {
    title: 'Tumhe miss kar rahe hai! 😢',
    body: '3 din ho gaye! Wapas aao aur tasks complete karke free coins kamao 💰'
  },
  {
    title: '₹50 tumhara wait kar raha hai! 🎁',
    body: 'Aaj complete karo apne pending tasks aur coins pao!'
  },
  {
    title: 'Free me paise kamao abhi! 💸',
    body: 'Sirf 2 min me task complete karo aur turant coins pao. Login karo!'
  },
  {
    title: 'Tumhara balance ready hai! 🪙',
    body: 'Login karo, tasks karo, aur withdraw ke kareeb pahucho!'
  }
];

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_ADMIN_KEY)),
    databaseURL: FIREBASE_DB_URL
  });
}

module.exports = async function handler(req, res) {
  try {
    const db = admin.database();
    const snapshot = await db.ref('users').once('value');
    const users = snapshot.val();

    if (!users) return res.status(200).json({ sent: 0 });

    const now = Date.now();
    let sentCount = 0;
    let skippedNoToken = 0;

    for (const uid in users) {
      const user = users[uid];
      // lastTaskDate agar nahi hai to lastActive ko fallback maano
      const lastTask = user.lastTaskDate || user.lastActive || 0;
      const isInactive = (now - lastTask) >= THREE_DAYS_MS;

      if (!isInactive) continue;
      if (!user.fcmToken) { skippedNoToken++; continue; }

      const msg = MESSAGES[Math.floor(Math.random() * MESSAGES.length)];

      try {
        await admin.messaging().send({
          token: user.fcmToken,
          notification: {
            title: msg.title,
            body: msg.body
          }
        });
        sentCount++;
      } catch (err) {
        // Token invalid/expired ho sakta hai — usko clear kar do taaki dobara try na ho
        console.warn(`[FCM] Failed for ${uid}:`, err.message);
        if (err.code === 'messaging/registration-token-not-registered') {
          await db.ref('users/' + uid + '/fcmToken').remove();
        }
      }
    }

    res.status(200).json({ sent: sentCount, skippedNoToken });
  } catch (error) {
    console.error('[send-reminders] Error:', error);
    res.status(500).json({ error: error.message });
  }
};
