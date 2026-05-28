// ============================================================
//  TaskNova — Combined Postback Handler
//  Handles: 1) CPX/CPA Research  2) CPALead Offerwall
//
//  CPX URL:
//  https://tasknovaofficial.vercel.app/api/postback?source=cpx&status={status}&trans_id={trans_id}&amount_local={amount_local}&user_id={user_id}
//
//  CPALead URL:
//  https://tasknovaofficial.vercel.app/api/postback?source=cpalead&subid={subid}&payout={payout}&password={password}
// ============================================================

const FIREBASE_URL      = 'https://tasknova-66d0f-default-rtdb.firebaseio.com';
const FIREBASE_SECRET   = process.env.FIREBASE_SECRET;
const POSTBACK_PASSWORD = process.env.POSTBACK_PASSWORD;
const COINS_PER_DOLLAR  = 2000; // CPALead: $1 = 2000 coins

export default async function handler(req, res) {

  if (req.method !== 'GET') {
    return res.status(405).send('Method Not Allowed');
  }

  const source = req.query.source;
  const authParam = FIREBASE_SECRET ? ('?auth=' + FIREBASE_SECRET) : '';

  // ════════════════════════════════════════════════════════════
  //  SOURCE 1 — CPX / CPA Research
  // ════════════════════════════════════════════════════════════
  if (source === 'cpx') {
    const { status, trans_id, amount_local, user_id } = req.query;

    console.log('CPX Postback:', status, trans_id, amount_local, user_id);

    if (!status || !user_id) {
      return res.status(200).json({ success: false, reason: 'Missing params' });
    }

    const statusNum = parseInt(status);

    if (statusNum === 1) {
      try {
        const userRes  = await fetch(FIREBASE_URL + '/users/' + user_id + '.json' + authParam);
        const userData = await userRes.json();

        if (!userData) {
          return res.status(200).json({ success: false, reason: 'User not found' });
        }

        // Duplicate check
        const doneKey = 'cpx_done_' + trans_id;
        if (userData[doneKey]) {
          return res.status(200).json({ success: false, reason: 'Already processed' });
        }

        const coinsToAdd  = amount_local ? Math.max(1, Math.round(parseFloat(amount_local))) : 500;
        const newCoins    = (userData.coins     || 0) + coinsToAdd;
        const newBalance  = parseFloat((newCoins / 100).toFixed(2));
        const newTasksDone = (userData.tasksDone || 0) + 1;

        const updateData = {
          coins:                newCoins,
          balance:              newBalance,
          tasksDone:            newTasksDone,
          totalEarned:          newBalance,
          lastSurveyCompleted:  Date.now(),
          lastSurveyTransId:    trans_id || 'N/A'
        };
        updateData[doneKey] = true;

        await fetch(FIREBASE_URL + '/users/' + user_id + '.json' + authParam, {
          method:  'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify(updateData)
        });

        console.log('[CPX] Coins credited:', coinsToAdd, '→ user:', user_id);
        return res.status(200).json({ success: true, coins: coinsToAdd });

      } catch (e) {
        console.error('[CPX] Error:', e.message);
        return res.status(200).json({ success: false, error: e.message });
      }

    } else {
      return res.status(200).json({ success: true, status: 'no_action' });
    }
  }

  // ════════════════════════════════════════════════════════════
  //  SOURCE 2 — CPALead Offerwall
  // ════════════════════════════════════════════════════════════
  if (source === 'cpalead') {
    const { subid, payout, password } = req.query;

    // Parameter check
    if (!subid || !payout || !password) {
      console.error('[CPALead] Missing params:', req.query);
      return res.status(400).send('Missing parameters');
    }

    // Password verify
    if (password !== POSTBACK_PASSWORD) {
      console.error('[CPALead] Wrong password');
      return res.status(403).send('Forbidden');
    }

    const payoutAmount = parseFloat(payout);
    if (isNaN(payoutAmount) || payoutAmount <= 0) {
      return res.status(400).send('Invalid payout');
    }

    const coinsToAdd = Math.round(payoutAmount * COINS_PER_DOLLAR);

    try {
      const userRes  = await fetch(FIREBASE_URL + '/users/' + subid + '.json' + authParam);
      const userData = await userRes.json();

      if (!userData || userData.error) {
        console.error('[CPALead] User not found:', subid);
        return res.status(200).send('1'); // CPALead ko 200 chahiye
      }

      const newCoins   = (userData.coins     || 0) + coinsToAdd;
      const newBalance = parseFloat((newCoins / 100).toFixed(2));
      const newTasks   = (userData.tasksDone  || 0) + 1;

      await fetch(FIREBASE_URL + '/users/' + subid + '.json' + authParam, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          coins:         newCoins,
          balance:       newBalance,
          totalEarned:   newBalance,
          tasksDone:     newTasks,
          lastOfferwall: Date.now()
        })
      });

      console.log('[CPALead] ✅', subid, '| +' + coinsToAdd + ' coins | $' + payoutAmount);
      return res.status(200).send('1'); // CPALead success signal

    } catch (err) {
      console.error('[CPALead] Error:', err.message);
      return res.status(500).send('Server error');
    }
  }

  // ════════════════════════════════════════════════════════════
  //  Unknown source
  // ════════════════════════════════════════════════════════════
  console.error('[Postback] Unknown source:', source);
  return res.status(400).send('Unknown source');
}
