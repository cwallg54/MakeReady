// Vercel serverless function — persists requirements manager state to Vercel KV.
// GET  /api/requirements  → returns full stored JSON
// POST /api/requirements  → overwrites stored JSON with request body
//
// Requires KV_REST_API_URL and KV_REST_API_TOKEN env vars.
// Set up: Vercel dashboard → Storage → Create KV → Connect to this project.
// If KV is not configured, GET returns empty state and POST is a no-op
// (portal falls back to localStorage silently).

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const KV_URL   = process.env.KV_REST_API_URL;
  const KV_TOKEN = process.env.KV_REST_API_TOKEN;
  const KEY      = 'makeready_requirements';
  const EMPTY    = { overrides: {}, additions: [] };

  // No KV configured — degrade gracefully
  if (!KV_URL || !KV_TOKEN) {
    if (req.method === 'GET')  return res.status(200).json(EMPTY);
    if (req.method === 'POST') return res.status(200).json({ ok: true, warning: 'KV not configured' });
    return res.status(405).end();
  }

  const HEADERS = {
    Authorization: `Bearer ${KV_TOKEN}`,
    'Content-Type': 'application/json',
  };

  // ── GET ───────────────────────────────────────────────────────
  if (req.method === 'GET') {
    try {
      const r    = await fetch(`${KV_URL}/get/${KEY}`, { headers: HEADERS });
      const body = await r.json();
      const data = body.result ? JSON.parse(body.result) : EMPTY;
      if (!data.overrides) data.overrides = {};
      if (!data.additions) data.additions = [];
      return res.status(200).json(data);
    } catch (e) {
      console.error('requirements GET error:', e);
      return res.status(200).json(EMPTY); // degrade gracefully
    }
  }

  // ── POST ──────────────────────────────────────────────────────
  if (req.method === 'POST') {
    try {
      const data = req.body || {};
      if (!data.overrides) data.overrides = {};
      if (!data.additions) data.additions = [];

      // Upstash/Vercel KV REST: POST body is an array command
      const r = await fetch(KV_URL, {
        method: 'POST',
        headers: HEADERS,
        body: JSON.stringify(['SET', KEY, JSON.stringify(data)]),
      });
      if (!r.ok) throw new Error('KV returned ' + r.status);
      return res.status(200).json({ ok: true });
    } catch (e) {
      console.error('requirements POST error:', e);
      return res.status(500).json({ error: e.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
