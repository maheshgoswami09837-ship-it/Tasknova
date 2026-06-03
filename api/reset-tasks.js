// ============================================================
//  TaskNova — Daily Task Reset
//  Runs every day at 12:00 PM IST (6:00 AM UTC)
//  Vercel Cron: "0 6 * * *"
//
//  Kya reset hoga:
//  - har user ka tasksDone = 0
//  - har user ka dailyTasksClaimed = false
//  - postback_log/cpx_daily clear (agar daily limit lagani ho)
// ============================================================

const FIREBASE_URL    = 'https://tasknova-66d0f-default-rtdb.firebaseio.com';
const FIREBASE_SECRET = process.env.FIREBASE_SECRET;
const CRON_SECRET     = process.env.CRON_SECRET; // optional security

export default async function handler(req, res) {

  // Security check — sirf Vercel Cron ya authorized request allow karo
  const authHeader = req.headers['authorization'];
  if (CRON_SECRET && authHeader !== 'Bearer ' + CRON_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const authParam = FIREBASE_SECRET ? ('?auth=' + FIREBASE_SECRET) : '';

  try {
    console.log('[Reset] Daily task reset started:', new Date().toISOString());

    // ── Step 1: Saare users fetch karo ───────────────────────
    const usersRes  = await fetch(`${FIREBASE_URL}/users.json${authParam}`);
    const usersData = await usersRes.json();

    if (!usersData) {
      console.log('[Reset] No users found');
      return res.status(200).json({ success: true, message: 'No users found' });
    }

    const userIds = Object.keys(usersData);
    console.log(`[Reset] Total users to reset: ${userIds.length}`);

    // ── Step 2: Har user ka task reset karo ──────────────────
    const resetPromises = userIds.map(uid => {
      return fetch(`${FIREBASE_URL}/users/${uid}.json${authParam}`, {
        method : 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body   : JSON.stringify({
          tasksDone         : 0,
          dailyTasksClaimed : false,
          lastResetDate     : new Date().toDateString(),
        })
      });
    });

    // Batch mein karo — 50-50 users
    const batchSize = 50;
    let resetCount  = 0;

    for (let i = 0; i < resetPromises.length; i += batchSize) {
      const batch = resetPromises.slice(i, i + batchSize);
      await Promise.all(batch);
      resetCount += batch.length;
      console.log(`[Reset] Progress: ${resetCount}/${userIds.length}`);
    }

    // ── Step 3: Reset log save karo ──────────────────────────
    await fetch(`${FIREBASE_URL}/system/lastReset.json${authParam}`, {
      method : 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body   : JSON.stringify({
        timestamp  : Date.now(),
        date       : new Date().toISOString(),
        usersReset : userIds.length,
      })
    });

    console.log(`[Reset] ✅ Done! ${userIds.length} users reset`);
    return res.status(200).json({
      success    : true,
      usersReset : userIds.length,
      time       : new Date().toISOString(),
    });

  } catch (err) {
    console.error('[Reset] Error:', err.message);
    return res.status(500).json({ error: err.message });
  }
}
