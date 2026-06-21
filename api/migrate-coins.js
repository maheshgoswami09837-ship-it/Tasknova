// ============================================================
//  TaskNova — One-Time Coin Migration Script
//  Purana system: 100 coins = ₹1   →   Naya system: 1 coin = ₹1
//  Sabke existing coins ko 100 se divide karta hai, balance bhi update karta hai
//
//  SETUP:
//  1. Is file ko apne Vercel project mein /api/migrate-coins.js naam se daalo
//  2. Vercel dashboard mein ek naya Environment Variable banao:
//       Name: MIGRATION_KEY
//       Value: koi bhi random secret (jaise: tasknova_fix_2026_xyz)
//  3. Deploy karo
//
//  CHALANE KA TARIKA:
//  Browser mein ye URL kholo (apna MIGRATION_KEY use karo):
//  https://tasknovaofficial.vercel.app/api/migrate-coins?key=YOUR_SECRET_KEY
//
//  ⚠️ SIRF EK BAAR CHALAO. Script khud-ba-khud track karta hai ki kisko
//     migrate kar diya (coinsMigrated: true), isliye dobara chalane se
//     already-migrated users dobara divide nahi honge — safe hai.
//
//  ⚠️ Migration ke baad ye file Vercel project se DELETE kar do (ya
//     environment variable hata do), taaki ye URL future mein koi
//     accidentally use na kar sake.
// ============================================================

const FIREBASE_URL    = 'https://tasknova-66d0f-default-rtdb.firebaseio.com';
const FIREBASE_SECRET = process.env.FIREBASE_SECRET;
const MIGRATION_KEY   = process.env.MIGRATION_KEY;

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).send('Method Not Allowed');
  }

  // ── Safety check — sirf sahi secret key se hi chalega ─────────
  if (!MIGRATION_KEY || req.query.key !== MIGRATION_KEY) {
    return res.status(403).json({ success: false, reason: 'Invalid or missing key' });
  }

  const authParam = FIREBASE_SECRET ? ('?auth=' + FIREBASE_SECRET) : '';

  try {
    // ── Sab users fetch karo ────────────────────────────────────
    const usersUrl  = `${FIREBASE_URL}/users.json${authParam}`;
    const usersData = await (await fetch(usersUrl)).json();

    if (!usersData) {
      return res.status(200).json({ success: false, reason: 'No users found' });
    }

    const userIds = Object.keys(usersData);
    let updated = 0;
    let skipped = 0;
    const results = [];

    for (const uid of userIds) {
      const user = usersData[uid];

      // Agar pehle hi migrate ho chuka hai to skip karo (double-divide se bachne ke liye)
      if (user.coinsMigrated === true) {
        skipped++;
        continue;
      }

      const oldCoins   = user.coins || 0;
      const newCoins   = Math.round((oldCoins / 100) * 100) / 100; // 2 decimal tak
      const newBalance = newCoins;

      const userUrl = `${FIREBASE_URL}/users/${uid}.json${authParam}`;
      await fetch(userUrl, {
        method : 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body   : JSON.stringify({
          coins         : newCoins,
          balance       : newBalance,
          coinsMigrated : true
        })
      });

      updated++;
      results.push({ uid, oldCoins, newCoins });
    }

    return res.status(200).json({
      success    : true,
      totalUsers : userIds.length,
      updated,
      skipped,
      results
    });

  } catch (e) {
    console.error('[Migration] Error:', e.message);
    return res.status(500).json({ success: false, error: e.message });
  }
}
