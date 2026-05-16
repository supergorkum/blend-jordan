const { getStore } = require('@netlify/blobs');

const DEFAULT_PRICE_LIST = `
Highlights XS (+/-12 folies, faceframe): €68,45 | 75 minuten
Knippen + Highlights XS (faceframe, +/-12 folies): €106,35 | 95 minuten
Highlights S (scalp) zonder toner: €98,80 | 85 minuten
Highlights S (scalp) incl toner: €128,80 | 135 minuten
Knippen + Highlights S (scalp) zonder toner: €136,70 | 115 minuten
Knippen + Highlights S (scalp) incl toner: €166,70 | 190 minuten
Highlights M (fullhead) zonder toner: €122,50 | 110 minuten
Highlights M (fullhead) incl toner: €152,50 | 160 minuten
Knippen + Highlights M (fullhead) zonder toner: €160,40 | 140 minuten
Knippen + Highlights M (fullhead) incl toner: €190,40 | 190 minuten
Highlights L (fullhead van aanzet tot punt) zonder toner: €147,50 | 125 minuten
Highlights L (fullhead van aanzet tot punt) incl toner: €177,50 | 175 minuten
Knippen + Highlights L (fullhead lengten en punten) zonder toner: €183,40 | 155 minuten
Knippen + Highlights L (fullhead lengten en punten) incl toner: €213,40 | 205 minuten
Balayage: €145,00 | 155 minuten
Balayage en knippen: €182,90 | 185 minuten
`;

const MORNING_START   = 9  * 60;
const MORNING_END     = 12 * 60;
const AFTERNOON_START = 13 * 60;
const AFTERNOON_END   = 18 * 60;

function getBlendStore() {
  const opts = { name: 'blend-jordan' };
  if (process.env.NETLIFY_SITE_ID)    opts.siteID = process.env.NETLIFY_SITE_ID;
  if (process.env.NETLIFY_AUTH_TOKEN) opts.token  = process.env.NETLIFY_AUTH_TOKEN;
  return getStore(opts);
}

function generateReservationNumber() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let r = 'BJ';
  for (let i = 0; i < 4; i++) r += chars[Math.floor(Math.random() * chars.length)];
  return r;
}

function getAvailableSlots(reservations, date, durationMinutes) {
  const dayRes = reservations
    .filter(r => r.date === date && r.status !== 'cancelled')
    .sort((a, b) => a.startMinutes - b.startMinutes);
  const slots = [];
  const check = (start, end) => {
    for (let t = start; t + durationMinutes <= end; t += 30) {
      const tEnd = t + durationMinutes;
      const conflict = dayRes.some(r => !(tEnd <= r.startMinutes || t >= r.startMinutes + r.duration));
      if (!conflict) slots.push(t);
    }
  };
  check(MORNING_START, MORNING_END);
  check(AFTERNOON_START, AFTERNOON_END);
  return slots;
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' }, body: '' };
  }
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method not allowed' };

  const headers = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };

  let body;
  try { body = JSON.parse(event.body); }
  catch { return { statusCode: 400, headers, body: JSON.stringify({ error: 'Ongeldige JSON' }) }; }

  const { action } = body;
  console.log('Action:', action);

  try {
    const store = getBlendStore();

    if (action === 'analyzeHair') {
      const { answers, name } = body;
      const labels = { haarlengte:'Haarlengte', haarkleur:'Haarkleur', eerderGeverfd:'Eerder geverfd', huidigeKleur:'Huidige kleur', gewenstResultaat:'Gewenst resultaat', knippen:'Knippen', toner:'Toner' };
      const answersText = Object.entries(answers).map(([k,v]) => `- ${labels[k]||k}: ${v}`).join('\n');

      const prompt = `Je bent haarstylist assistent bij Blend by Jordan. Analyseer de antwoorden en kies de EXACTE behandeling.

KLANT: ${name}
ANTWOORDEN:
${answersText}

BESLISREGELS:
1. "rondom gezicht" of "subtiel" → XS (faceframe)
2. "deel van haar" → S (scalp)
3. "heel mijn haar" of "volledig" → M (fullhead)
4. "van wortel tot punt" of "van aanzet" → L (fullhead van aanzet tot punt)
5. "vloeiende overgang" of "balayage" → Balayage
6. Knippen = ja → kies "Knippen +" variant
7. Toner ja/weet niet → incl toner; nee → zonder toner
8. Niet van toepassing op resultaat → M als default
9. Balayage heeft geen toner variant

PRIJSLIJST:
${DEFAULT_PRICE_LIST}

Geef ALLEEN dit JSON object terug:
{"samenvatting":"situatie ${name} 1-2 zinnen","wens":"wens 1 zin","behandeling":"exacte naam","prijs":0.00,"duur":0,"uitleg":"uitleg 1-2 zinnen"}`;

      const resp = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model: 'claude-sonnet-4-20250514', max_tokens: 1000, messages: [{ role:'user', content: prompt }] })
      });
      const data = await resp.json();
      const raw = data.content?.find(c => c.type === 'text')?.text || '{}';
      let analysis;
      try { analysis = JSON.parse(raw.replace(/```json|```/g,'').trim()); }
      catch { analysis = { error: 'Analyse mislukt. Probeer opnieuw.' }; }
      return { statusCode: 200, headers, body: JSON.stringify(analysis) };
    }

    if (action === 'checkAvailability') {
      const { durationMinutes } = body;
      let allRes = [];
      try {
        const { blobs } = await store.list({ prefix: 'reservation_' });
        for (const blob of blobs) { try { const r = await store.get(blob.key, { type:'json' }); if (r) allRes.push(r); } catch {} }
      } catch (e) { console.log('Blobs error:', e.message); }

      const today = new Date();
      const availability = {};
      let found = 0, offset = 1;
      while (found < 5) {
        const d = new Date(today);
        d.setDate(today.getDate() + offset++);
        const dow = d.getDay();
        if (dow === 0 || dow === 6) continue;
        const ds = d.toISOString().split('T')[0];
        const slots = getAvailableSlots(allRes, ds, durationMinutes);
        availability[ds] = { available: slots.length > 0, slots };
        found++;
      }
      return { statusCode: 200, headers, body: JSON.stringify({ availability }) };
    }

    if (action === 'getSlots') {
      const { date, durationMinutes } = body;
      let dayRes = [];
      try {
        const { blobs } = await store.list({ prefix: 'reservation_' });
        for (const blob of blobs) { try { const r = await store.get(blob.key, { type:'json' }); if (r && r.date === date) dayRes.push(r); } catch {} }
      } catch (e) { console.log('Blobs error:', e.message); }
      return { statusCode: 200, headers, body: JSON.stringify({ slots: getAvailableSlots(dayRes, date, durationMinutes) }) };
    }

    if (action === 'saveReservation') {
      const { name, analysis, date, startMinutes } = body;
      let number;
      for (let i = 0; i < 20; i++) {
        const c = generateReservationNumber();
        try { const ex = await store.get(`reservation_${c}`); if (!ex) { number = c; break; } }
        catch { number = c; break; }
      }
      const reservation = { number, name, analysis, date, startMinutes, duration: analysis.duur, status:'confirmed', createdAt: new Date().toISOString() };
      await store.set(`reservation_${number}`, JSON.stringify(reservation));
      return { statusCode: 200, headers, body: JSON.stringify({ number, reservation }) };
    }

    if (action === 'getReservation') {
      const { number } = body;
      try {
        const reservation = await store.get(`reservation_${number.toUpperCase()}`, { type:'json' });
        if (!reservation) throw new Error('not found');
        return { statusCode: 200, headers, body: JSON.stringify({ reservation }) };
      } catch { return { statusCode: 404, headers, body: JSON.stringify({ error: 'Reservering niet gevonden' }) }; }
    }

    if (action === 'updateDuration') {
      const { number, adjustment } = body;
      try {
        const reservation = await store.get(`reservation_${number}`, { type:'json' });
        if (!reservation) throw new Error('not found');
        reservation.duration = Math.max(30, reservation.duration + adjustment);
        await store.set(`reservation_${number}`, JSON.stringify(reservation));
        return { statusCode: 200, headers, body: JSON.stringify({ reservation }) };
      } catch { return { statusCode: 404, headers, body: JSON.stringify({ error: 'Niet gevonden' }) }; }
    }

    if (action === 'getWeekReservations') {
      const { weekStart } = body;
      const start = new Date(weekStart + 'T12:00:00');
      const weekDates = [];
      for (let i = 0; i < 5; i++) { const d = new Date(start); d.setDate(start.getDate()+i); weekDates.push(d.toISOString().split('T')[0]); }
      let reservations = [];
      try {
        const { blobs } = await store.list({ prefix: 'reservation_' });
        for (const blob of blobs) { try { const r = await store.get(blob.key, { type:'json' }); if (r && weekDates.includes(r.date)) reservations.push(r); } catch {} }
      } catch (e) { console.log('Blobs error:', e.message); }
      return { statusCode: 200, headers, body: JSON.stringify({ reservations }) };
    }

    if (action === 'uploadPricelist') {
      const { pdfBase64, fileName } = body;
      await store.set('pricelist_b64', pdfBase64);
      await store.set('pricelist_name', fileName || 'prijslijst.pdf');
      return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
    }

    if (action === 'getPricelistName') {
      try { const name = await store.get('pricelist_name', { type:'text' }); return { statusCode: 200, headers, body: JSON.stringify({ name: name || null }) }; }
      catch { return { statusCode: 200, headers, body: JSON.stringify({ name: null }) }; }
    }

    if (action === 'blendyChat') {
      const { messages, name } = body;
      const systemPrompt = `Je bent Blendy, de vriendelijke stylist assistent van Blend by Jordan. Je voert een persoonlijk gesprek om de perfecte behandeling te bepalen.

GESPREKSTRUCTUUR:
DEEL 1 — Huidige haarsituatie (max 8 vragen, max 3x doorvragen per vraag):
Vraag naar: haarlengte, haarkleur, staat kleur, hoe lang geleden behandeling.

DEEL 2 — Gewenste behandeling (max 8 vragen, max 1x doorvragen):
Vraag naar: gewenst resultaat, knippen, toner.

STIJL: 1 vraag per bericht, max 3 zinnen, max 1 emoji, altijd Nederlands, noem ${name} bij naam.

BEHANDELINGSREGELS:
- "rondom gezicht/faceframe" → XS highlights
- "deel haar" → S highlights (scalp)
- "heel haar/volledig" → M highlights (fullhead)
- "wortel tot punt/aanzet" → L highlights
- "balayage/vloeiende overgang" → Balayage
- knippen ja → "Knippen +" variant
- toner ja/weet niet → incl toner; nee → zonder toner

WANNEER KLAAR: sluit vriendelijk af en voeg toe op nieuwe regel:
<ANALYSE>{"samenvatting":"situatie ${name} 1-2 zinnen","wens":"wens 1 zin","behandeling":"exacte naam uit lijst","prijs":0.00,"duur":0,"uitleg":"uitleg 1-2 zinnen"}</ANALYSE>

PRIJSLIJST:
${DEFAULT_PRICE_LIST}`;

      const resp = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model: 'claude-sonnet-4-20250514', max_tokens: 600, system: systemPrompt, messages })
      });
      const data = await resp.json();
      const reply = data.content?.find(c => c.type === 'text')?.text || 'Sorry, probeer opnieuw.';
      return { statusCode: 200, headers, body: JSON.stringify({ reply }) };
    }

    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Onbekende actie' }) };

  } catch (err) {
    console.error('API Error:', err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Server fout: ' + err.message }) };
  }
};
