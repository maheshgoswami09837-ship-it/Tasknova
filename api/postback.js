const FIREBASE_URL = 'https://tasknova-66d0f-default-rtdb.firebaseio.com';
const FIREBASE_SECRET = process.env.FIREBASE_SECRET;

export default async function handler(req, res) {
  const status = req.query.status;
  const trans_id = req.query.trans_id;
  const amount_local = req.query.amount_local;
  const user_id = req.query.user_id;

  console.log('CPX Postback:', status, trans_id, amount_local, user_id);

  if (!status || !user_id) {
    return res.status(200).json({ success: false, reason: 'Missing params' });
  }

  const statusNum = parseInt(status);
  const authParam = FIREBASE_SECRET ? ('?auth=' + FIREBASE_SECRET) : '';

  if (statusNum === 1) {
    try {
      const userRes = await fetch(FIREBASE_URL + '/users/' + user_id + '.json' + authParam);
      const userData = await userRes.json();

      if (!userData) {
        return res.status(200).json({ success: false, reason: 'User not found' });
      }

      const doneKey = 'cpx_done_' + trans_id;
      if (userData[doneKey]) {
        return res.status(200).json({ success: false, reason: 'Already processed' });
      }

      const coinsToAdd = amount_local ? Math.max(1, Math.round(parseFloat(amount_local))) : 500;
      const newCoins = (userData.coins || 0) + coinsToAdd;
      const newBalance = parseFloat((newCoins / 100).toFixed(2));
      const newTasksDone = (userData.tasksDone || 0) + 1;

      const updateData = {
        coins: newCoins,
        balance: newBalance,
        tasksDone: newTasksDone,
        totalEarned: newBalance,
        lastSurveyCompleted: Date.now(),
        lastSurveyTransId: trans_id || 'N/A'
      };
      updateData[doneKey] = true;

      await fetch(FIREBASE_URL + '/users/' + user_id + '.json' + authParam, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updateData)
      });

      console.log('Coins credited: ' + coinsToAdd + ' to user: ' + user_id);
      return res.status(200).json({ success: true, coins: coinsToAdd });

    } catch (e) {
      console.error('Error:', e.message);
      return res.status(200).json({ success: false, error: e.message });
    }

  } else {
    return res.status(200).json({ success: true, status: 'no_action' });
  }
}
