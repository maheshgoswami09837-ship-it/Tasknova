// File: /api/adsterra-stats.js
// Deploy this inside your Vercel project's "api" folder.
// It hides your Adsterra token from the browser and avoids CORS issues.

export default async function handler(req, res) {
  const ADSTERRA_TOKEN = process.env.ADSTERRA_API_TOKEN; // set this in Vercel → Project → Settings → Environment Variables
  const DOMAIN_ID = process.env.ADSTERRA_DOMAIN_ID;       // your website's domain ID from Adsterra

  const today = new Date().toISOString().slice(0, 10);
  const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const startDate = req.query.start_date || monthAgo;
  const finishDate = req.query.finish_date || today;

  // Exact params per Adsterra docs: format, finish_date, group_by, start_date, domain
  const url = `https://api3.adsterratools.com/publisher/stats.json?format=json&domain=${DOMAIN_ID}&start_date=${startDate}&finish_date=${finishDate}&group_by=date`;

  try {
    const response = await fetch(url, {
      headers: {
        'Accept': 'application/json',
        'X-API-Key': ADSTERRA_TOKEN, // header, not URL — per docs
      },
    });

    if (!response.ok) {
      return res.status(response.status).json({ error: `Adsterra API returned ${response.status}` });
    }

    const data = await response.json();
    res.setHeader('Access-Control-Allow-Origin', '*'); // restrict to your domain in production if you want
    res.status(200).json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
