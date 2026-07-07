// File: /api/adsterra-stats.js
// Deploy inside your Vercel project's "api" folder.
// Fetches stats for BOTH your Adsterra websites and combines them into one response.

export default async function handler(req, res) {
  const ADSTERRA_TOKEN = process.env.ADSTERRA_API_TOKEN;

  // Both your registered Adsterra websites — comma-separated in env, or hardcoded fallback below.
  const domainIds = (process.env.ADSTERRA_DOMAIN_IDS || '5790053,5796089')
    .split(',')
    .map(d => d.trim())
    .filter(Boolean);

  const today = new Date().toISOString().slice(0, 10);
  // Previously defaulted to last 30 days only — but your Adsterra data goes back
  // further (May 2026), so a 30-day window was missing most of the real revenue.
  // Using Jan 1 of this year as a safe "since account started" default.
  const accountStart = `${new Date().getFullYear()}-01-01`;
  const startDate = req.query.start_date || accountStart;
  const finishDate = req.query.finish_date || today;

  try {
    // Fetch each domain's stats in parallel
    const results = await Promise.all(domainIds.map(async (domainId) => {
      const url = `https://api3.adsterratools.com/publisher/stats.json?domain=${domainId}&start_date=${startDate}&finish_date=${finishDate}&group_by=date`;
      const response = await fetch(url, {
        headers: { 'Accept': 'application/json', 'X-API-Key': ADSTERRA_TOKEN },
      });
      const rawText = await response.text();
      if (!response.ok) {
        throw new Error(`Adsterra API error for domain ${domainId}: ${response.status} — ${rawText.slice(0, 300)}`);
      }
      try { return JSON.parse(rawText); }
      catch { throw new Error(`Adsterra returned non-JSON for domain ${domainId}: ${rawText.slice(0, 300)}`); }
    }));

    // Merge items from all domains, summing by date
    const mergedByDate = {};
    for (const domainResult of results) {
      for (const item of (domainResult.items || [])) {
        const d = item.date;
        if (!mergedByDate[d]) {
          mergedByDate[d] = { date: d, impression: 0, clicks: 0, revenue: 0, cpmSum: 0, cpmCount: 0 };
        }
        mergedByDate[d].impression += Number(item.impression) || 0;
        mergedByDate[d].clicks += Number(item.clicks) || 0;
        mergedByDate[d].revenue += Number(item.revenue) || 0;
        mergedByDate[d].cpmSum += Number(item.cpm) || 0;
        mergedByDate[d].cpmCount += 1;
      }
    }

    const items = Object.values(mergedByDate).map(d => ({
      date: d.date,
      impression: d.impression,
      clicks: d.clicks,
      revenue: d.revenue,
      cpm: d.cpmCount ? d.cpmSum / d.cpmCount : 0,
    }));

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.status(200).json({
      items,
      itemCount: items.length,
      domainsCombined: domainIds,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
