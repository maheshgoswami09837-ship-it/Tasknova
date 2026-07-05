// File: /api/hilltopads-stats.js
// Deploy inside your Vercel project's "api" folder.
// Hides your HilltopAds API key from the browser.

export default async function handler(req, res) {
  const HILLTOP_KEY = process.env.HILLTOPADS_API_KEY; // set in Vercel → Settings → Environment Variables

  const today = new Date().toISOString().slice(0, 10);
  const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const date = req.query.date || monthAgo;   // range start
  const date2 = req.query.date2 || today;    // range end

  // group=date -> response comes back keyed directly by date string
  const url = `https://api.hilltopads.com/v1/publisher/listStats?key=${HILLTOP_KEY}&date=${date}&date2=${date2}&group=date`;

  try {
    const response = await fetch(url);
    const data = await response.json();

    if (data.status !== 'success') {
      return res.status(400).json({ error: 'HilltopAds error', details: data });
    }

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.status(200).json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
