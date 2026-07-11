const nodemailer = require('nodemailer');

const FIREBASE_DB = 'https://tasknova-66d0f-default-rtdb.firebaseio.com';
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

module.exports = async function handler(req, res) {
  try {
    const response = await fetch(`${FIREBASE_DB}/users.json`);
    const users = await response.json();

    if (!users) return res.status(200).json({ sent: 0 });

    const now = Date.now();
    let sentCount = 0;

    for (const uid in users) {
      const user = users[uid];
      const lastActive = user.lastActive || 0;
      const isInactive = (now - lastActive) >= SEVEN_DAYS_MS;
      const alreadySent = user.inactiveEmailSent &&
                           (now - user.inactiveEmailSent) < SEVEN_DAYS_MS;

      if (isInactive && user.email && !alreadySent) {
        await transporter.sendMail({
          from: `"TaskNova" <${process.env.EMAIL_USER}>`,
          to: user.email,
          subject: 'Tumhe miss kar rahe hai! 😢',
          html: `
            <div style="font-family:Arial;padding:20px;">
              <h2>Hi ${user.name || 'Dost'} 👋</h2>
              <p>7 din ho gaye tumne TaskNova pe koi task nahi kiya!</p>
              <p>Wapas aao, tasks complete karo aur <b>free coins</b> kamao 💰</p>
              <a href="https://tasknovaofficial.vercel.app"
                 style="background:#2563eb;color:#fff;padding:12px 24px;
                        border-radius:8px;text-decoration:none;display:inline-block;margin-top:12px;">
                Abhi Login Karo →
              </a>
            </div>
          `
        });

        await fetch(`${FIREBASE_DB}/users/${uid}.json`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ inactiveEmailSent: now })
        });

        sentCount++;
      }
    }

    res.status(200).json({ sent: sentCount });
  } catch (error) {
    console.error('[send-inactive-emails] Error:', error);
    res.status(500).json({ error: error.message });
  }
};
