// Vercel serverless function — calls Anthropic Claude API to extract
// user stories and definitions from a meeting transcript.
// Requires ANTHROPIC_API_KEY environment variable set in Vercel dashboard.

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({
      error: 'ANTHROPIC_API_KEY is not configured. Add it in the Vercel dashboard under Settings → Environment Variables.'
    });
  }

  const { transcript, meetingDate, attendees, section } = req.body || {};

  if (!transcript || transcript.trim().length < 50) {
    return res.status(400).json({ error: 'Transcript is missing or too short (minimum 50 characters).' });
  }

  const SYSTEM_PROMPT = `You are a senior product analyst working on MakeReady — a Print MIS (Management Information System) and ERP platform for Great Mountain West (G54.com), a commercial print and graphics production company.

MakeReady replaces three systems: SAP Business One (ERP), Zoey B2B (eCommerce), and Vision33 Saltbox (middleware connector). It covers these modules:
- CRM: Business Partners (customers), contacts, account groups, activity log
- Sales: Quotes, Sales Orders, Deliveries, AR Invoices, Incoming Payments
- Web Store: Native B2B storefront at store.g54.com; Account Group pricing; auto-creates Sales Orders from web orders
- Jobs & Production: Work orders auto-created from Sales Orders; status pipeline (New→Prepress→Printing→Finishing→Ready→Shipped)
- Inventory & MRP: Item master, stock levels, Web Store publishing
- Accounting: AP, AR, bank reconciliation, journal entries, chart of accounts
- Controlling: Cost centers, budgets, P&L by segment
- Asset Accounting: Fixed assets, depreciation
- Content Library: Digital asset management with AI auto-tagging and natural language search
- Workflows & Approvals: Configurable approval rules (e.g., orders ≥$5,000 require manager approval)
- Reports: Sales, production, financial dashboards and exports
- Administration: Users, roles, system config, audit log
- RBAC: 6 roles — Admin, Sales Manager, Sales Rep, Finance, Production, Art Department

Stakeholders:
- Kim Lund (kim@g54.com) — Sales, Finance
- Chase de Jong (chase@g54.com) — Sales (CRM, eComm)
- Britney de Jong (britney@g54.com) — Finance (Accounting, AP), Operations (Process)
- Leslie Weiler (leslie@g54.com) — Sales (Digital Catalogs), Finance (AR, Reports), Operations (Inventory)
- Tyson Johnson (tyson@g54.com) — Operations (Production, Inventory), Art (Library)
- Cody de Jong (cody@g54.com) — Sales (eComm, Digital Catalogs), Art (Requests, Library, Website)

Your job: analyze a meeting transcript and extract structured software requirements. Be precise. Distinguish between confirmed requirements, implied needs, and open questions. Do not invent requirements that aren't in the transcript.

User story ID prefixes by module:
CRM, SALES, WEB, JOB, INV, ACC, CTRL, ASSET, LIB, WF, RPT, ADMIN, AUTH, GEN

Return ONLY valid JSON — no markdown fences, no preamble — in exactly this structure:
{
  "summary": "2-3 sentence plain-English summary of what was discussed and decided",
  "detectedModule": "primary module this transcript relates to (e.g. crm, sales, content-library)",
  "userStories": [
    {
      "id": "US-CRM-01",
      "title": "Short descriptive title (5-8 words)",
      "role": "the user role performing the action",
      "want": "what they want to accomplish (start with a verb)",
      "so_that": "the business benefit or outcome",
      "acceptanceCriteria": [
        "Given [context] when [action] then [expected result]"
      ],
      "priority": "high|medium|low",
      "confidence": "high|medium|low",
      "sourceQuote": "verbatim quote from transcript supporting this story (max 120 chars, or empty string if none)"
    }
  ],
  "definitions": [
    {
      "term": "Business or domain term",
      "definition": "Clear definition as used by this team in this context"
    }
  ],
  "openQuestions": [
    "A specific question raised or implied in the transcript that needs follow-up"
  ],
  "outOfScope": [
    "Something mentioned that is explicitly deferred or out of scope"
  ]
}

Confidence levels:
- high: requirement stated explicitly and clearly
- medium: implied or partially stated; likely correct but needs confirmation
- low: inferred from context; needs explicit verification with stakeholder

Keep each user story atomic — one story = one unit of functionality. Split compound requirements. Aim for 3-8 acceptance criteria per story. Write acceptance criteria in Given/When/Then format.`;

  const userMessage = `Meeting Date: ${meetingDate || 'Not specified'}
Attendees: ${attendees || 'Not specified'}
Module/Topic: ${section || 'Auto-detect from transcript'}

--- TRANSCRIPT START ---
${transcript.trim()}
--- TRANSCRIPT END ---

Extract all software requirements from this transcript as structured user stories. If the transcript contains discussion of multiple modules, create stories for each. Flag anything ambiguous as a lower-confidence story or an open question.`;

  try {
    const apiResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 8096,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userMessage }]
      })
    });

    if (!apiResponse.ok) {
      const errorText = await apiResponse.text();
      console.error('Anthropic API error:', errorText);
      return res.status(502).json({ error: 'Claude API returned an error. Check server logs.' });
    }

    const apiData = await apiResponse.json();
    const rawText = apiData.content?.[0]?.text || '';

    // Parse JSON — Claude should return clean JSON but handle edge cases
    let parsed;
    try {
      parsed = JSON.parse(rawText);
    } catch {
      // Strip markdown fences if Claude wrapped it anyway
      const match = rawText.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (match) {
        parsed = JSON.parse(match[1].trim());
      } else {
        // Last resort: find the outermost { ... }
        const objMatch = rawText.match(/\{[\s\S]*\}/);
        if (objMatch) parsed = JSON.parse(objMatch[0]);
        else throw new Error('No valid JSON found in Claude response');
      }
    }

    // Validate minimal shape
    if (!parsed.userStories) parsed.userStories = [];
    if (!parsed.definitions) parsed.definitions = [];
    if (!parsed.openQuestions) parsed.openQuestions = [];
    if (!parsed.outOfScope) parsed.outOfScope = [];

    return res.status(200).json(parsed);

  } catch (err) {
    console.error('process-transcript error:', err);
    return res.status(500).json({ error: err.message || 'Unexpected server error' });
  }
};
