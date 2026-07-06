// ============================================================
//  TaskNova — Combined Postback Handler (FIXED: CPX reversal handling)
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
//
//  ⚠️ CONFIRMED from CPX dashboard (Postback Settings):
//     status = 1  → completed (credit the user)
//     status = 2  → CANCELED / fraud reversal (CPX calls the SAME url again,
//                   with the SAME trans_id, 15-60 days later if they detect fraud)
//     This is NOT a "bonus" — it means: take back what was given for this transaction.
// ============================================================

const FIREBASE_URL      = 'https://tasknova-66d0f-default-rtdb.firebaseio.com';
const FIREBASE_SECRET   = process.env.FIREBASE_SECRET;
const POSTBACK_PASSWORD = process.env.POSTBACK_PASSWORD;

// ── Shared constants ─────────────────────────────────────────
const USD_TO_INR      = 84;    // 1 USD = ₹84 (fixed rate used for coin calculation)
const USER_SHARE      = 0.25;  // 25% user ko milega
const COINS_PER_RUPEE = 1;     // 1 coin = ₹1

// Helper: USD → Coins
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
  // ════════════════════════════════════════════════════════════
  if (source === 'cpx') {
    const { status, trans_id, amount_usd, amount_local, user_id } = req.query;

    console.log('[CPX] Postback received:', { status, trans_id, amount_usd, user_id });

    if (!user_id) {
      return res.status(200).json({ success: false, reason: 'Missing user_id' });
    }
    const statusCode = parseInt(status);
    if (statusCode !== 1 && statusCode !== 2) {
      console.log('[CPX] Unknown status:', status, '— skip');
      return res.status(200).send('1');
    }

    const safeTransId = (trans_id || ('cpx_' + Date.now())).replace(/[^a-zA-Z0-9_-]/g, '_');
    const cpxLogUrl    = `${FIREBASE_URL}/postback_log/cpx/${user_id}/${safeTransId}.json${authParam}`;

    try {
      const existing = await (await fetch(cpxLogUrl)).json();

      // ──────────────────────────────────────────────────────
      //  STATUS 2 = CANCELED / FRAUD REVERSAL
      //  Claw back the coins that were given for this transaction.
      // ──────────────────────────────────────────────────────
      if (statusCode === 2) {
        if (!existing || !existing.credited) {
          console.log('[CPX] Cancel received but nothing was credited for this trans_id — nothing to reverse:', safeTransId);
          return res.status(200).send('1');
        }
        if (existing.reversed) {
          console.log('[CPX] Already reversed — skip:', safeTransId);
          return res.status(200).send('1');
        }

        const userUrl  = `${FIREBASE_URL}/users/${user_id}.json${authParam}`;
        const userData = await (await fetch(userUrl)).json();
        if (!userData || userData.error) {
          console.error('[CPX] User not found during reversal:', user_id);
          return res.status(200).send('1');
        }

        const coinsToRemove = existing.coins || 0;
        const newCoins      = Math.max(0, (userData.coins || 0) - coinsToRemove);
        const newBalance    = parseFloat((newCoins / COINS_PER_RUPEE).toFixed(2));

        await fetch(userUrl, {
          method : 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body   : JSON.stringify({ coins: newCoins, balance: newBalance })
        });

        // Mark the postback log entry as reversed (dashboard uses this to exclude it)
        await fetch(cpxLogUrl, {
          method : 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body   : JSON.stringify({ reversed: true, reversedAt: Date.now() })
        });

        // Also mark the matching taskHistory entry as reversed, if we saved its key
        if (existing.taskHistoryKey) {
          await fetch(`${FIREBASE_URL}/users/${user_id}/taskHistory/${existing.taskHistoryKey}.json${authParam}`, {
            method : 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body   : JSON.stringify({ reversed: true, status: 'Reversed' })
          });
        }

        console.log(`[CPX] ⚠️ REVERSED ${coinsToRemove} coins from user ${user_id} (fraud/cancel: ${safeTransId})`);
        return res.status(200).send('1');
      }

      // ──────────────────────────────────────────────────────
      //  STATUS 1 = COMPLETED — normal crediting flow
      // ──────────────────────────────────────────────────────
      if (existing && existing.credited) {
        console.log('[CPX] Duplicate — skip:', safeTransId);
        return res.status(200).send('1');
      }

      let usdAmount = parseFloat(amount_usd || '0');
      if (isNaN(usdAmount) || usdAmount <= 0) {
        const localVal = parseFloat(amount_local || '0');
        if (isNaN(localVal) || localVal <= 0) {
          console.error('[CPX] Both amount_usd and amount_local missing/invalid');
          return res.status(200).send('1');
        }
        usdAmount = localVal / 100;
        console.log('[CPX] Using amount_local fallback:', localVal, '→ $' + usdAmount);
      }

      const { coins: coinsToAdd, inr: inrAmount, userShare } = usdToCoins(usdAmount);
      console.log(`[CPX] Calc: $${usdAmount} × 84 = ₹${inrAmount} × 25% = ₹${userShare} = ${coinsToAdd} coins`);

      const userUrl  = `${FIREBASE_URL}/users/${user_id}.json${authParam}`;
      const userData = await (await fetch(userUrl)).json();
      if (!userData || userData.error) {
        console.error('[CPX] User not found:', user_id);
        return res.status(200).json({ success: false, reason: 'User not found' });
      }

      const newCoins     = (userData.coins     || 0) + coinsToAdd;
      const newBalance   = parseFloat((newCoins / COINS_PER_RUPEE).toFixed(2));
      const newTasksDone = (userData.tasksDone || 0) + 1;

      await fetch(userUrl, {
        method : 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body   : JSON.stringify({ coins: newCoins, balance: newBalance, tasksDone: newTasksDone })
      });

      // Push taskHistory entry and capture its generated key so we can mark it
      // reversed later if CPX cancels this transaction
      const taskHistoryRes = await fetch(`${FIREBASE_URL}/users/${user_id}/taskHistory.json${authParam}`, {
        method : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body   : JSON.stringify({
          userId    : user_id,
          taskType  : 'Survey',
          taskName  : 'CPX Survey Completed',
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
      const taskHistoryData = await taskHistoryRes.json();
      const taskHistoryKey  = taskHistoryData && taskHistoryData.name ? taskHistoryData.name : null;

      // Mark credited — store taskHistoryKey too so a future reversal can find it
      await fetch(cpxLogUrl, {
        method : 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body   : JSON.stringify({
          credited: true,
          coins: coinsToAdd,
          ts: Date.now(),
          taskHistoryKey: taskHistoryKey,
        })
      });

      console.log(`[CPX] ✅ +${coinsToAdd} coins → user: ${user_id} | $${usdAmount} → ₹${userShare}`);
      return res.status(200).send('1');

    } catch (e) {
      console.error('[CPX] Error:', e.message);
      return res.status(200).send('1');
    }
  }

  // ════════════════════════════════════════════════════════════
  //  SOURCE 2 — CPALead Offerwall (unchanged)
  // ════════════════════════════════════════════════════════════
  if (source === 'cpalead') {
    const { subid, payout, password, offer_name, offer_id, lead_id } = req.query;

    console.log('[CPALead] Postback received:', { subid, payout, offer_name });

    if (!subid || !payout) {
      console.error('[CPALead] Missing params:', req.query);
      return res.status(200).send('1');
    }
    if (POSTBACK_PASSWORD && password !== POSTBACK_PASSWORD) {
      console.error('[CPALead] Wrong password');
      return res.status(200).send('1');
    }

    const payoutUsd = parseFloat(payout);
    if (isNaN(payoutUsd) || payoutUsd <= 0) {
      console.error('[CPALead] Invalid payout:', payout);
      return res.status(200).send('1');
    }

    const { coins: coinsToAdd, inr: inrAmount, userShare } = usdToCoins(payoutUsd);
    console.log(`[CPALead] Calc: $${payoutUsd} × 84 = ₹${inrAmount} × 25% = ₹${userShare} = ${coinsToAdd} coins`);

    try {
      const txKey = (lead_id || offer_id || '').replace(/[^a-zA-Z0-9_-]/g, '_');
      if (txKey) {
        const dupUrl  = `${FIREBASE_URL}/postback_log/cpalead/${subid}/${txKey}.json${authParam}`;
        const dupData = await (await fetch(dupUrl)).json();
        if (dupData && dupData.credited) {
          console.log('[CPALead] Duplicate — skip:', txKey);
          return res.status(200).send('1');
        }
      }

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

      const userUrl  = `${FIREBASE_URL}/users/${subid}.json${authParam}`;
      const userData = await (await fetch(userUrl)).json();
      if (!userData || userData.error) {
        console.error('[CPALead] User not found:', subid);
        return res.status(200).send('1');
      }

      const newCoins   = (userData.coins     || 0) + coinsToAdd;
      const newBalance = parseFloat((newCoins / COINS_PER_RUPEE).toFixed(2));
      const newTasks   = (userData.tasksDone || 0) + 1;

      await fetch(userUrl, {
        method : 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body   : JSON.stringify({ coins: newCoins, balance: newBalance, tasksDone: newTasks })
      });

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

  console.error('[Postback] Unknown source:', source);
  return res.status(200).send('Unknown source');
}
