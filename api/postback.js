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

const CPALEAD_COINS_PER_DOLLAR = 2000;
const CPX_COINS_PER_RUPEE      = 100;

export default async function handler(req, res) {

  if (req.method !== 'GET') {
    return res.status(405).send('Method Not Allowed');
  }

  const source    = req.query.source;
  const authParam = FIREBASE_SECRET ? ('?auth=' + FIREBASE_SECRET) : '';

  // ════════════════════════════════════════════════════════════
  //  SOURCE 1 — CPX / CPA Research
  // ════════════════════════════════════════════════════════════
  if (source === 'cpx') {
    const { status, trans_id, amount_local, user_id } = req.query;

    console.log('[CPX] Postback received:', { status, trans_id, amount_local, user_id });

    if (!user_id) {
      return res.status(200).json({ success: false, reason: 'Missing user_id' });
    }

    // Sirf status=1 pe coins do
    if (parseInt(status) !== 1) {
      console.log('[CPX] Non-success status:', status, '— skip');
      return res.status(200).send('1');
    }

    try {
      // ── Duplicate check ──────────────────────────────────────
      const safeTransId = (trans_id || ('cpx_' + Date.now())).replace(/[^a-zA-Z0-9_-]/g, '_');
      const cpxDupUrl   = `${FIREBASE_URL}/postback_log/cpx/${user_id}/${safeTransId}.json${authParam}`;
      const cpxDupData  = await (await fetch(cpxDupUrl)).json();

      if (cpxDupData && cpxDupData.credited) {
        console.log('[CPX] Duplicate — skip:', safeTransId);
        return res.status(200).send('1');
      }

      // ── User fetch ───────────────────────────────────────────
      const userUrl  = `${FIREBASE_URL}/users/${user_id}.json${authParam}`;
      const userData = await (await fetch(userUrl)).json();

      if (!userData || userData.error) {
        console.error('[CPX] User not found:', user_id);
        return res.status(200).json({ success: false, reason: 'User not found' });
      }

      // ── Coins calculate ──────────────────────────────────────
      // amount_local = CPX se INR rupees mein aata hai (e.g. '10.50')
      // 100 coins = Rs 1  =>  coinsToAdd = rupees x 100
      // balance   = totalCoins / 100  =>  balance = rupees (SAHI)
      const rupees     = parseFloat(amount_local || '0');
      if (isNaN(rupees) || rupees <= 0) {
        console.error('[CPX] Invalid amount_local:', amount_local);
        return res.status(200).send('1');
      }
      const coinsToAdd = Math.max(50, Math.round(rupees * CPX_COINS_PER_RUPEE));

      const newCoins    = (userData.coins     || 0) + coinsToAdd;
      const newBalance  = parseFloat((newCoins / 100).toFixed(2));
      const newTasksDone= (userData.tasksDone || 0) + 1;

      // ── Update user ──────────────────────────────────────────
      await fetch(userUrl, {
        method : 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body   : JSON.stringify({
          coins    : newCoins,
          balance  : newBalance,
          tasksDone: newTasksDone,
        })
      });

      // ── Task History log ─────────────────────────────────────
      await fetch(`${FIREBASE_URL}/users/${user_id}/taskHistory.json${authParam}`, {
        method : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body   : JSON.stringify({
          userId   : user_id,
          taskType : 'Survey',
          taskName : 'CPX Survey Completed',
          coins    : coinsToAdd,
          status   : 'Success',
          source   : 'CPX Research',
          transId  : safeTransId,
          amountInr: rupees,
          timestamp: Date.now(),
        })
      });

      // ── Mark credited ────────────────────────────────────────
      await fetch(cpxDupUrl, {
        method : 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body   : JSON.stringify({ credited: true, coins: coinsToAdd, ts: Date.now() })
      });

      console.log(`[CPX] ✅ +${coinsToAdd} coins → user: ${user_id} | ₹${rupees}`);
      return res.status(200).send('1');

    } catch (e) {
      console.error('[CPX] Error:', e.message);
      return res.status(200).send('1');
    }
  }

  // ════════════════════════════════════════════════════════════
  //  SOURCE 2 — CPALead Offerwall
  // ════════════════════════════════════════════════════════════
  if (source === 'cpalead') {
    const { subid, payout, password, offer_name, offer_id, lead_id } = req.query;

    console.log('[CPALead] Postback received:', { subid, payout, offer_name });

    if (!subid || !payout) {
      console.error('[CPALead] Missing params:', req.query);
      return res.status(200).send('1');
    }

    if (POSTBACK_PASSWORD && password !== POSTBACK_PASSWORD) {
      console.error('[CPALead] Wrong password — got:', password);
      return res.status(200).send('1');
    }

    const payoutUsd = parseFloat(payout);
    if (isNaN(payoutUsd) || payoutUsd <= 0) {
      console.error('[CPALead] Invalid payout:', payout);
      return res.status(200).send('1');
    }

    const coinsToAdd = Math.round(payoutUsd * CPALEAD_COINS_PER_DOLLAR);

    try {
      // ── Duplicate check ──────────────────────────────────────
      const txKey = (lead_id || offer_id || '').replace(/[^a-zA-Z0-9_-]/g, '_');

      if (txKey) {
        const dupUrl  = `${FIREBASE_URL}/postback_log/cpalead/${subid}/${txKey}.json${authParam}`;
        const dupData = await (await fetch(dupUrl)).json();
        if (dupData && dupData.credited) {
          console.log('[CPALead] Duplicate lead_id — skip:', txKey);
          return res.status(200).send('1');
        }
      }

      // ── Rate limit — 2 min ───────────────────────────────────
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

      // ── User fetch ────────────────────────────────────────────
      const userUrl  = `${FIREBASE_URL}/users/${subid}.json${authParam}`;
      const userData = await (await fetch(userUrl)).json();

      if (!userData || userData.error) {
        console.error('[CPALead] User not found:', subid);
        return res.status(200).send('1');
      }

      // ── Update coins ──────────────────────────────────────────
      const newCoins   = (userData.coins     || 0) + coinsToAdd;
      const newBalance = parseFloat((newCoins / 100).toFixed(2));
      const newTasks   = (userData.tasksDone || 0) + 1;

      await fetch(userUrl, {
        method : 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body   : JSON.stringify({
          coins    : newCoins,
          balance  : newBalance,
          tasksDone: newTasks,
        })
      });

      // ── Task History log ──────────────────────────────────────
      const offerLabel = offer_name ? decodeURIComponent(offer_name) : 'CPALead Offer';
      await fetch(`${FIREBASE_URL}/users/${subid}/taskHistory.json${authParam}`, {
        method : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body   : JSON.stringify({
          userId   : subid,
          taskType : 'Offerwall',
          taskName : offerLabel,
          coins    : coinsToAdd,
          status   : 'Success',
          source   : 'CPALead',
          offerId  : offer_id  || '',
          leadId   : lead_id   || '',
          payout   : payoutUsd,
          timestamp: Date.now(),
        })
      });

      // ── Mark credited ─────────────────────────────────────────
      const clDupUrl = `${FIREBASE_URL}/postback_log/cpalead/${subid}/${finalTxKey}.json${authParam}`;
      await fetch(clDupUrl, {
        method : 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body   : JSON.stringify({ credited: true, coins: coinsToAdd, ts: Date.now() })
      });

      console.log(`[CPALead] ✅ +${coinsToAdd} coins → user: ${subid} | $${payoutUsd} | ${offerLabel}`);
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
