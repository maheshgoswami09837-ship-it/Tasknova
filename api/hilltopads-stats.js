// File: /api/hilltopads-stats.js
// Deploy inside your Vercel project's "api" folder.
// Hides your HilltopAds API key from the browser.

export default async function handler(req, res) {
  const HILLTOP_KEY = process.env.HILLTOPADS_API_KEY; // set in Vercel → Settings → Environment Variables

  const today = new Date().toISOString().slice(0, 10);
  const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const date = req.query.date || monthAgo;   // range start
  const date2 = req.query.date2 || today;    // range end

  // Correct endpoint per HilltopAds docs — no /v1/ prefix
  const url = `https://api.hilltopads.com/publisher/listStats?key=${HILLTOP_KEY}&date=${date}&date2=${date2}&group=date`;

  try {
    const response = await fetch(url);
    const rawText = await response.text();
    let data;
    try { data = JSON.parse(rawText); }
    catch { return res.status(502).json({ error: 'HilltopAds returned non-JSON response', raw: rawText.slice(0, 300) }); }

    if (data.status !== 'success') {
      return res.status(400).json({ error: 'HilltopAds error', details: data });
    }

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.status(200).json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
