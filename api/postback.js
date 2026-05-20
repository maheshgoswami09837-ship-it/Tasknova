import fetch from 'node-fetch';

const FIREBASE_URL = 'https://tasknova-66d0f-default-rtdb.firebaseio.com';

export default async function handler(req, res) {
  const { status, trans_id, amount_local, amount_usd, user_id } = req.query;

  console.log('CPX Postback received:', { status, trans_id, amount_local, user_id });

  // CPX ko 200 OK dena zaroori hai
  if (!status || !user_id) {
    return res.status(200).json({ success: false, reason: 'Missing params' });
  }

  const statusNum = parseInt(status);

  if (statusNum === 1) {
    // SUCCESS — Firebase mein coins credit karo
    try {
      const processedKey = cpx_${trans_id};

      // User data fetch karo
      const userRes = await fetch(${FIREBASE_URL}/users/${user_id}.json);
      const userData = await userRes.json();

      if (!userData) {
        return res.status(200).json({ success: false, reason: 'User not found' });
      }

      // Duplicate check
      if (userData[cpx_done_${trans_id}]) {
        return res.status(200).json({ success: false, reason: 'Already processed' });
      }

      const coinsToAdd = amount_local ? Math.max(1, Math.round(parseFloat(amount_local))) : 500;
      const newCoins = (userData.coins || 0) + coinsToAdd;
      const newBalance = parseFloat((newCoins / 100).toFixed(2));
      const newTasksDone = (userData.tasksDone || 0) + 1;

      // Firebase update
      await fetch(${FIREBASE_URL}/users/${user_id}.json, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          coins: newCoins,
          balance: newBalance,
          tasksDone: newTasksDone,
          totalEarned: newBalance,
          lastSurveyCompleted: Date.now(),
          lastSurveyTransId: trans_id || 'N/A',
          [cpx_done_${trans_id}]: true  // Duplicate prevention
        })
      });

      console.log(✅ Coins credited: ${coinsToAdd} → user: ${user_id});
      return res.status(200).json({ success: true, coins: coinsToAdd });

    } catch (e) {
      console.error('Firebase error:', e);
      return res.status(200).json({ success: false, error: e.message });
    }

  } else {
    // DISQUALIFIED / SCREENOUT — koi action nahi
    console.log(CPX status ${statusNum} — no action);
    return res.status(200).json({ success: true, status: 'no_action' });
  }
}
