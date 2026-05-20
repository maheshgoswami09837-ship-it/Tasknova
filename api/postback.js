const FIREBASE_URL = 'https://tasknova-66d0f-default-rtdb.firebaseio.com';
const FIREBASE_SECRET = process.env.FIREBASE_SECRET;

export default async function handler(req, res) {
  const { status, trans_id, amount_local, amount_usd, user_id } = req.query;

  console.log('CPX Postback:', { status, trans_id, amount_local, user_id });

  if (!status || !user_id) {
    return res.status(200).json({ success: false, reason: 'Missing params' });
  }

  const statusNum = parseInt(status);
  const authParam = FIREBASE_SECRET ? ?auth=${FIREBASE_SECRET} : '';

  if (statusNum === 1) {
    try {
      // User data fetch with secret
      const userRes = await fetch(${FIREBASE_URL}/users/${user_id}.json${authParam});
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

      // Firebase update with secret
      await fetch(${FIREBASE_URL}/users/${user_id}.json${authParam}, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          coins: newCoins,
          balance: newBalance,
          tasksDone: newTasksDone,
          totalEarned: newBalance,
          lastSurveyCompleted: Date.now(),
          lastSurveyTransId: trans_id || 'N/A',
          [cpx_done_${trans_id}]: true
        })
      });

      console.log(Coins credited: ${coinsToAdd} to user: ${user_id});
      return res.status(200).json({ success: true, coins: coinsToAdd });

    } catch (e) {
      console.error('Error:', e);
      return res.status(200).json({ success: false, error: e.message });
    }

  } else {
    return res.status(200).json({ success: true, status: 'no_action' });
  }
}
