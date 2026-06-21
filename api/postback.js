// ============================================================
//  TaskNova — Combined Postback Handler
//
//  CPX Postback URL (CPX dashboard mein lagao):
//  https://tasknovaofficial.vercel.app/api/postback?source=cpx
//    &status={status}&trans_id={trans_id}
//    &amount_usd={amount_usd}&amount_local={amount_local}&user_id={user_id}
//
//  CPALead Postback URL:
//  https://tasknovaofficial.vercel.app/api/postback?source=cpalead
//    &subid={subid}&payout={payout}&password={password}
//
//  Coin Formula (dono ke liye same):
//    USD × 84 (INR rate) = INR
//    INR × 0.25 (25% user share) = User INR
//    User INR × 1 (1 coin = ₹1) = Coins
//    Balance = Total Coins
// ============================================================

const FIREBASE_URL      = 'https://tasknova-66d0f-default-rtdb.firebaseio.com';
const FIREBASE_SECRET   = process.env.FIREBASE_SECRET;
const POSTBACK_PASSWORD = process.env.POSTBACK_PASSWORD;

// ── Shared constants ─────────────────────────────────────────
const USD_TO_INR      = 84;    // 1 USD = ₹84
const USER_SHARE      = 0.25;  // 25% user ko milega
const COINS_PER_RUPEE = 1;     // 1 coin = ₹1

// Helper: USD → Coins
// $1 × 84 = ₹84 → ₹84 × 0.25 = ₹21 → ₹21 × 100 = 2100 coins
function usdToCoins(usdAmount) {
  const inr       = usdAmount * USD_TO_INR;
  const userInr   = inr * USER_SHARE;
  const coins     = Math.round(userInr * COINS_PER_RUPEE);
  return { coins, inr, userInr };
}

export default async function handler(req, res) {

  if (req.method !== 'GET') {
    return res.status(405).send('Method Not Allowed');
  }

  const source    = req.query.source;
  const authParam = FIREBASE_SECRET ? ('?auth=' + FIREBASE_SECRET) : '';

  // ════════════════════════════════════════════════════════════
  //  SOURCE 1 — CPX Research
  //  CPX → amount_usd (publisher dollar payout)
  //  Formula: amount_usd × 84 × 0.25 × 1 = coins
  //  Example: $0.50 × 84 = ₹42 → ₹42 × 0.25 = ₹10.50 → 11 coins (rounded)
  // ════════════════════════════════════════════════════════════
  if (source === 'cpx') {
    const { status, trans_id, amount_usd, amount_local, user_id } = req.query;

    console.log('[CPX] Postback received:', { status, trans_id, amount_usd, user_id });

    // Validation
    if (!user_id) {
      return res.status(200).json({ success: false, reason: 'Missing user_id' });
    }
    const statusCode = parseInt(status);
    if (statusCode !== 1 && statusCode !== 2) {
      console.log('[CPX] Non-success status:', status, '— skip');
      return res.status(200).send('1');
    }
    const isBonus = statusCode === 2; // 2 = survey screen-out bonus

    // Parse USD amount
    // amount_usd = direct dollar value (e.g. 0.50)
    // amount_local = CPX points (e.g. 50) — 100 points =  approx, divide by 100
    let usdAmount = parseFloat(amount_usd || '0');
    if (isNaN(usdAmount) || usdAmount <= 0) {
      // Fallback: amount_local use karo
      const localVal = parseFloat(amount_local || '0');
      if (isNaN(localVal) || localVal <= 0) {
        console.error('[CPX] Both amount_usd and amount_local missing/invalid');
        return res.status(200).send('1');
      }
      usdAmount = localVal / 100; // CPX points to USD
      console.log('[CPX] Using amount_local fallback:', localVal, '→ $' + usdAmount);
    }

    // Calculate coins
    const { coins: coinsToAdd, inr: inrAmount, userInr: userShare } = usdToCoins(usdAmount);
    console.log(`[CPX] Calc: $${usdAmount} × 84 = ₹${inrAmount} × 25% = ₹${userShare} = ${coinsToAdd} coins`);

    try {
      // ── Duplicate check ───────────────────────────────────
      const safeTransId = (trans_id || ('cpx_' + Date.now())).replace(/[^a-zA-Z0-9_-]/g, '_');
      const cpxDupUrl   = `${FIREBASE_URL}/postback_log/cpx/${user_id}/${safeTransId}.json${authParam}`;
      const cpxDupData  = await (await fetch(cpxDupUrl)).json();

      if (cpxDupData && cpxDupData.credited) {
        console.log('[CPX] Duplicate — skip:', safeTransId);
        return res.status(200).send('1');
      }

      // ── User fetch ────────────────────────────────────────
      const userUrl  = `${FIREBASE_URL}/users/${user_id}.json${authParam}`;
      const userData = await (await fetch(userUrl)).json();

      if (!userData || userData.error) {
        console.error('[CPX] User not found:', user_id);
        return res.status(200).json({ success: false, reason: 'User not found' });
      }

      // ── Update user ───────────────────────────────────────
      const newCoins    = (userData.coins     || 0) + coinsToAdd;
      const newBalance  = parseFloat((newCoins / COINS_PER_RUPEE).toFixed(2));
      const newTasksDone= (userData.tasksDone || 0) + 1;

      await fetch(userUrl, {
        method : 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body   : JSON.stringify({ coins: newCoins, balance: newBalance, tasksDone: newTasksDone })
      });

      // ── Task History ──────────────────────────────────────
      await fetch(`${FIREBASE_URL}/users/${user_id}/taskHistory.json${authParam}`, {
        method : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body   : JSON.stringify({
          userId    : user_id,
          taskType  : 'Survey',
          taskName  : isBonus ? 'CPX Survey Screen-Out Bonus' : 'CPX Survey Completed',
          coins     : coinsToAdd,
          status    : 'Success',
          source    : 'CPX Research',
          transId   : safeTransId,
          amountUsd : usdAmount,
          amountInr : inrAmount,
          userShare : userShare,
          timestamp : Date.now(),
        })
      });

      // ── Mark credited ─────────────────────────────────────
      await fetch(cpxDupUrl, {
        method : 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body   : JSON.stringify({ credited: true, coins: coinsToAdd, ts: Date.now() })
      });

      console.log(`[CPX] ✅ ${isBonus ? '(Bonus) ' : ''}+${coinsToAdd} coins → user: ${user_id} | $${usdAmount} → ₹${userShare}`);
      return res.status(200).send('1');

    } catch (e) {
      console.error('[CPX] Error:', e.message);
      return res.status(200).send('1');
    }
  }

  // ════════════════════════════════════════════════════════════
  //  SOURCE 2 — CPALead Offerwall
  //  CPALead → payout (dollar amount)
  //  Formula: payout × 84 × 0.25 × 1 = coins
  //  Example: $0.10 × 84 = ₹8.4 → ₹8.4 × 0.25 = ₹2.10 → 2 coins (rounded)
  // ════════════════════════════════════════════════════════════
  if (source === 'cpalead') {
    const { subid, payout, password, offer_name, offer_id, lead_id } = req.query;

    console.log('[CPALead] Postback received:', { subid, payout, offer_name });

    // Validation
    if (!subid || !payout) {
      console.error('[CPALead] Missing params:', req.query);
      return res.status(200).send('1');
    }
    if (POSTBACK_PASSWORD && password !== POSTBACK_PASSWORD) {
      console.error('[CPALead] Wrong password');
      return res.status(200).send('1');
    }

    // Parse USD amount
    const payoutUsd = parseFloat(payout);
    if (isNaN(payoutUsd) || payoutUsd <= 0) {
      console.error('[CPALead] Invalid payout:', payout);
      return res.status(200).send('1');
    }

    // Calculate coins
    const { coins: coinsToAdd, inr: inrAmount, userInr: userShare } = usdToCoins(payoutUsd);
    console.log(`[CPALead] Calc: $${payoutUsd} × 84 = ₹${inrAmount} × 25% = ₹${userShare} = ${coinsToAdd} coins`);

    try {
      // ── Duplicate check ───────────────────────────────────
      const txKey = (lead_id || offer_id || '').replace(/[^a-zA-Z0-9_-]/g, '_');
      if (txKey) {
        const dupUrl  = `${FIREBASE_URL}/postback_log/cpalead/${subid}/${txKey}.json${authParam}`;
        const dupData = await (await fetch(dupUrl)).json();
        if (dupData && dupData.credited) {
          console.log('[CPALead] Duplicate — skip:', txKey);
          return res.status(200).send('1');
        }
      }

      // ── Rate limit 2 min ──────────────────────────────────
      const rateLimitUrl  = `${FIREBASE_URL}/postback_log/cpalead_rate/${subid}.json${authParam}`;
      const rateLimitData = await (await fetch(rateLimitUrl)).json();
      const lastPostback  = rateLimitData ? rateLimitData.lastTs : 0;
      if (lastPostback && (Date.now() - lastPostback) < 2 * 60 * 1000) {
        console.log('[CPALead] Rate limited:', subid);
        return res.status(200).send('1');
      }
      await fetch(rateLimitUrl, {
        method : 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body   : JSON.stringify({ lastTs: Date.now(), subid })
      });

      const finalTxKey = txKey || ('cl_' + Date.now());

      // ── User fetch ────────────────────────────────────────
      const userUrl  = `${FIREBASE_URL}/users/${subid}.json${authParam}`;
      const userData = await (await fetch(userUrl)).json();
      if (!userData || userData.error) {
        console.error('[CPALead] User not found:', subid);
        return res.status(200).send('1');
      }

      // ── Update user ───────────────────────────────────────
      const newCoins   = (userData.coins     || 0) + coinsToAdd;
      const newBalance = parseFloat((newCoins / COINS_PER_RUPEE).toFixed(2));
      const newTasks   = (userData.tasksDone || 0) + 1;

      await fetch(userUrl, {
        method : 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body   : JSON.stringify({ coins: newCoins, balance: newBalance, tasksDone: newTasks })
      });

      // ── Task History ──────────────────────────────────────
      const offerLabel = offer_name ? decodeURIComponent(offer_name) : 'CPALead Offer';
      await fetch(`${FIREBASE_URL}/users/${subid}/taskHistory.json${authParam}`, {
        method : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body   : JSON.stringify({
          userId    : subid,
          taskType  : 'Offerwall',
          taskName  : offerLabel,
          coins     : coinsToAdd,
          status    : 'Success',
          source    : 'CPALead',
          offerId   : offer_id  || '',
          leadId    : lead_id   || '',
          amountUsd : payoutUsd,
          amountInr : inrAmount,
          userShare : userShare,
          timestamp : Date.now(),
        })
      });

      // ── Mark credited ─────────────────────────────────────
      const clDupUrl = `${FIREBASE_URL}/postback_log/cpalead/${subid}/${finalTxKey}.json${authParam}`;
      await fetch(clDupUrl, {
        method : 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body   : JSON.stringify({ credited: true, coins: coinsToAdd, ts: Date.now() })
      });

      console.log(`[CPALead] ✅ +${coinsToAdd} coins → user: ${subid} | $${payoutUsd} → ₹${userShare} | ${offerLabel}`);
      return res.status(200).send('1');

    } catch (err) {
      console.error('[CPALead] Error:', err.message);
      return res.status(200).send('1');
    }
  }

  // ════════════════════════════════════════════════════════════
  //  Unknown source
  // ════════════════════════════════════════════════════════════
  console.error('[Postback] Unknown source:', source);
  return res.status(200).send('Unknown source');
}
