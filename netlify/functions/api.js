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

const MORNING_START = 9 * 60, MORNING_END = 12 * 60;
const AFTERNOON_START = 13 * 60, AFTERNOON_END = 18 * 60;

function getBlendStore() {
  try {
    const opts = { name: 'blend-jordan' };
    if (process.env.NETLIFY_SITE_ID)    opts.siteID = process.env.NETLIFY_SITE_ID;
    if (process.env.NETLIFY_AUTH_TOKEN) opts.token  = process.env.NETLIFY_AUTH_TOKEN;
    return getStore(opts);
  } catch (e) {
    console.error('getStore failed:', e.message);
    return null;
  }
}

function generateNumber() {
  const c = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let r = 'BJ';
  for (let i = 0; i < 4; i++) r += c[Math.floor(Math.random() * c.length)];
  return r;
}

function calcSlots(reservations, date, dur) {
  const dayRes = (reservations || []).filter(r => r.date === date && r.status !== 'cancelled');
  const slots = [];
  const check = (s, e) => {
    for (let t = s; t + dur <= e; t += 30) {
      if (!dayRes.some(r => !(t + dur <= r.startMinutes || t >= r.startMinutes + r.duration))) slots.push(t);
    }
  };
  check(MORNING_START, MORNING_END);
  check(AFTERNOON_START, AFTERNOON_END);
  return slots;
}

async function askClaude(model, max_tokens, system, messages) {
  const body = { model, max_tokens, messages };
  if (system) body.system = system;
  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify(body)
  });
  const data = await resp.json();
  console.log('Claude status:', resp.status, 'error:', data.error ? JSON.stringify(data.error) : 'none');
  if (!resp.ok || data.error) throw new Error(data.error?.message || 'Claude HTTP ' + resp.status);
  return data.content?.find(c => c.type === 'text')?.text || '';
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' }, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method not allowed' };
  const H = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };
  let body;
  try { body = JSON.parse(event.body); } catch { return { statusCode: 400, headers: H, body: JSON.stringify({ error: 'Ongeldige JSON' }) }; }
  const { action } = body;
  console.log('Action:', action);

  try {

    // ── ANALYSE HAAR (geen Blobs nodig) ──────────────────────
    if (action === 'analyzeHair') {
      const { answers, name } = body;

      // Haal aangepaste prijslijst op
      let prijslijst = DEFAULT_PRICE_LIST;
      try {
        const tekst = await store.get('pricelist_text', { type:'text' });
        if (tekst) { prijslijst = tekst; }
      } catch {}

      // Haal correctievoorbeelden op (leermateriaal van Jordan)
      let voorbeeldenTekst = '';
      try {
        const raw = await store.get('correctie_voorbeelden', { type:'text' });
        if (raw) {
          const voorbeelden = JSON.parse(raw);
          if (voorbeelden.length > 0) {
            voorbeeldenTekst = '\n\nLEERVOORBEELDEN (eerdere correcties door de stylist, gebruik deze als referentie):\n';
            voorbeelden.slice(-8).forEach((v, i) => {
              const ant = Object.entries(v.answers || {}).map(([k,val]) => `${k}: ${val}`).join(', ');
              voorbeeldenTekst += `${i+1}. Antwoorden: [${ant}] → AI adviseerde: "${v.aiAdvies}" → Correcte behandeling: "${v.correcte}"\n`;
            });
          }
        }
      } catch {}

      const labels = { haarlengte:'Haarlengte', haarkleur:'Haarkleur', eerderGeverfd:'Eerder geverfd', huidigeKleur:'Huidige kleur', gewenstResultaat:'Gewenst resultaat', knippen:'Knippen', toner:'Toner' };
      const answersText = Object.entries(answers).map(([k,v]) => `- ${labels[k]||k}: ${v}`).join('\n');
      const prompt = `Je bent haarstylist assistent bij Blend by Jordan. Geef behandeladvies als JSON.

KLANT: ${name}
ANTWOORDEN:
${answersText}

BESLISREGELS:
1. "rondom gezicht/subtiel/faceframe" → XS faceframe
2. "deel van haar" → S scalp
3. "heel mijn haar/volledig" → M fullhead
4. "van wortel tot punt/van aanzet" → L fullhead van aanzet tot punt
5. "vloeiende overgang/balayage" → Balayage
6. Knippen ja → Knippen + variant
7. Toner ja/weet niet → incl toner; nee → zonder toner
8. Niet van toepassing op resultaat → M als default
9. Balayage heeft geen toner variant

PRIJSLIJST:
${prijslijst}${voorbeeldenTekst}

Geef ALLEEN dit JSON object, geen andere tekst:
{"samenvatting":"situatie ${name} 1-2 zinnen","wens":"wens 1 zin","behandeling":"exacte naam","prijs":0.00,"duur":0,"uitleg":"uitleg 1-2 zinnen"}`;

      const raw = await askClaude('claude-haiku-4-5-20251001', 500, null, [{ role:'user', content: prompt }]);
      let analysis;
      try { analysis = JSON.parse(raw.replace(/```json|```/g,'').trim()); }
      catch (e) { console.error('Parse error, raw:', raw.substring(0,300)); analysis = { error: 'Kon analyse niet verwerken' }; }
      return { statusCode: 200, headers: H, body: JSON.stringify(analysis) };
    }

    // ── BLENDY CHAT (geen Blobs nodig) ───────────────────────
    if (action === 'blendyChat') {
      const { messages, name } = body;
      const sys = `Je bent Blendy, stylist assistent van Blend by Jordan. Voer een persoonlijk gesprek.

DEEL 1 — Huidig haar (max 8 vragen, max 3x doorvragen): haarlengte, haarkleur, staat kleur, laatste behandeling.
DEEL 2 — Wens (max 8 vragen, max 1x doorvragen): resultaat, knippen, toner.
STIJL: 1 vraag per bericht, max 3 zinnen, 1 emoji, Nederlands, noem ${name} bij naam.

BESLISREGELS: faceframe→XS | deel→S | volledig→M | wortel tot punt→L | balayage→Balayage | knippen ja→Knippen+ | toner ja/weet niet→incl | toner nee→zonder

WANNEER KLAAR voeg toe op nieuwe regel:
<ANALYSE>{"samenvatting":"...","wens":"...","behandeling":"exacte naam","prijs":0.00,"duur":0,"uitleg":"..."}</ANALYSE>

PRIJSLIJST:
${DEFAULT_PRICE_LIST}`;
      const reply = await askClaude('claude-haiku-4-5-20251001', 600, sys, messages);
      return { statusCode: 200, headers: H, body: JSON.stringify({ reply }) };
    }

    // ── ALLES MET BLOBS ──────────────────────────────────────
    const store = getBlendStore();
    if (!store) return { statusCode: 500, headers: H, body: JSON.stringify({ error: 'Opslag niet beschikbaar' }) };

    if (action === 'checkAvailability') {
      const { durationMinutes, startDate } = body;
      let allRes = [];
      try { const { blobs } = await store.list({ prefix: 'reservation_' }); for (const b of blobs) { try { const r = await store.get(b.key, { type:'json' }); if (r) allRes.push(r); } catch {} } } catch (e) { console.log('list error:', e.message); }

      const availability = {};
      let found = 0;

      if (startDate) {
        // Show exactly the 5 weekdays of the requested week
        const start = new Date(startDate + 'T12:00:00');
        for (let i = 0; i < 7 && found < 5; i++) {
          const d = new Date(start);
          d.setDate(start.getDate() + i);
          const dow = d.getDay();
          if (dow === 0 || dow === 6) continue;
          const ds = d.toISOString().split('T')[0];
          const slots = calcSlots(allRes, ds, durationMinutes);
          availability[ds] = { available: slots.length > 0, slots };
          found++;
        }
      } else {
        // Default: next 5 weekdays from today
        const today = new Date();
        let offset = 1;
        while (found < 5) {
          const d = new Date(today); d.setDate(today.getDate() + offset++);
          const dow = d.getDay(); if (dow === 0 || dow === 6) continue;
          const ds = d.toISOString().split('T')[0];
          const slots = calcSlots(allRes, ds, durationMinutes);
          availability[ds] = { available: slots.length > 0, slots };
          found++;
        }
      }

      return { statusCode: 200, headers: H, body: JSON.stringify({ availability }) };
    }

    if (action === 'getSlots') {
      const { date, durationMinutes } = body;
      let dayRes = [];
      try { const { blobs } = await store.list({ prefix: 'reservation_' }); for (const b of blobs) { try { const r = await store.get(b.key, { type:'json' }); if (r && r.date === date) dayRes.push(r); } catch {} } } catch {}
      return { statusCode: 200, headers: H, body: JSON.stringify({ slots: calcSlots(dayRes, date, durationMinutes) }) };
    }

    if (action === 'saveReservation') {
      const { name, analysis, date, startMinutes } = body;
      let number;
      for (let i = 0; i < 20; i++) { const c = generateNumber(); try { const ex = await store.get(`reservation_${c}`); if (!ex) { number = c; break; } } catch { number = c; break; } }
      const reservation = { number, name, analysis: { ...analysis, answers }, date, startMinutes, duration: analysis.duur, status:'confirmed', createdAt: new Date().toISOString() };
      await store.set(`reservation_${number}`, JSON.stringify(reservation));
      return { statusCode: 200, headers: H, body: JSON.stringify({ number, reservation }) };
    }

    if (action === 'getReservation') {
      const { number } = body;
      try { const r = await store.get(`reservation_${number.toUpperCase()}`, { type:'json' }); if (!r) throw new Error(); return { statusCode: 200, headers: H, body: JSON.stringify({ reservation: r }) }; }
      catch { return { statusCode: 404, headers: H, body: JSON.stringify({ error: 'Reservering niet gevonden' }) }; }
    }

    if (action === 'deleteReservation') {
      const { number } = body;
      try { await store.delete(`reservation_${number.toUpperCase()}`); return { statusCode: 200, headers: H, body: JSON.stringify({ success: true }) }; }
      catch { return { statusCode: 404, headers: H, body: JSON.stringify({ error: 'Niet gevonden' }) }; }
    }

    if (action === 'cleanupExpired') {
      const today = new Date().toISOString().split('T')[0];
      let deleted = 0;
      try { const { blobs } = await store.list({ prefix: 'reservation_' }); for (const b of blobs) { try { const r = await store.get(b.key, { type:'json' }); if (r && r.date < today) { await store.delete(b.key); deleted++; } } catch {} } } catch (e) { console.log('cleanup:', e.message); }
      return { statusCode: 200, headers: H, body: JSON.stringify({ deleted }) };
    }

    if (action === 'updateDuration') {
      const { number, adjustment } = body;
      try { const r = await store.get(`reservation_${number}`, { type:'json' }); if (!r) throw new Error(); r.duration = Math.max(30, r.duration + adjustment); await store.set(`reservation_${number}`, JSON.stringify(r)); return { statusCode: 200, headers: H, body: JSON.stringify({ reservation: r }) }; }
      catch { return { statusCode: 404, headers: H, body: JSON.stringify({ error: 'Niet gevonden' }) }; }
    }

    if (action === 'getWeekReservations') {
      const { weekStart } = body;
      const start = new Date(weekStart + 'T12:00:00'), weekDates = [];
      for (let i = 0; i < 5; i++) { const d = new Date(start); d.setDate(start.getDate()+i); weekDates.push(d.toISOString().split('T')[0]); }
      let reservations = [];
      try { const { blobs } = await store.list({ prefix: 'reservation_' }); for (const b of blobs) { try { const r = await store.get(b.key, { type:'json' }); if (r && weekDates.includes(r.date)) reservations.push(r); } catch {} } } catch {}
      return { statusCode: 200, headers: H, body: JSON.stringify({ reservations }) };
    }

    if (action === 'updateBehandeling') {
      const { number, behandelingen, naam, totaalPrijs, totaalDuur } = body;
      try {
        const r = await store.get(`reservation_${number}`, { type:'json' });
        if (!r) throw new Error('not found');

        // Sla originele analyse op voor vergelijking
        const origBehandeling = r.analysis?.behandeling || '';

        // Update reservering
        r.analysis = { ...r.analysis, behandeling: naam, behandelingen, prijs: totaalPrijs, duur: totaalDuur };
        r.duration = totaalDuur;
        await store.set(`reservation_${number}`, JSON.stringify(r));

        // Sla correctie op als leervoorbeeld (alleen als de behandeling veranderd is)
        if (origBehandeling && origBehandeling !== naam && r.analysis.answers) {
          try {
            const voorbeeldenRaw = await store.get('correctie_voorbeelden', { type:'text' }).catch(() => '[]');
            const voorbeelden = JSON.parse(voorbeeldenRaw || '[]');
            voorbeelden.push({
              answers: r.analysis.answers,
              aiAdvies: origBehandeling,
              correcte: naam,
              datum: new Date().toISOString()
            });
            // Bewaar maximaal 20 meest recente voorbeelden
            const recent = voorbeelden.slice(-20);
            await store.set('correctie_voorbeelden', JSON.stringify(recent));
            console.log('Correctievoorbeeld opgeslagen:', origBehandeling, '→', naam);
          } catch (e) {
            console.log('Kon correctievoorbeeld niet opslaan:', e.message);
          }
        }

        return { statusCode: 200, headers: H, body: JSON.stringify({ success: true, reservation: r }) };
      } catch (e) {
        return { statusCode: 404, headers: H, body: JSON.stringify({ error: e.message }) };
      }
    }

    if (action === 'getAllReservations') {
      let all = [];
      try {
        const { blobs } = await store.list({ prefix: 'reservation_' });
        for (const b of blobs) {
          try { const r = await store.get(b.key, { type:'json' }); if (r) all.push(r); } catch {}
        }
      } catch (e) { console.log('getAllReservations error:', e.message); }
      all.sort((a,b) => a.date === b.date ? a.startMinutes - b.startMinutes : a.date.localeCompare(b.date));
      return { statusCode: 200, headers: H, body: JSON.stringify({ reservations: all }) };
    }

    if (action === 'uploadPricelist') {
      const { pdfBase64, fileName } = body;
      await store.set('pricelist_b64', pdfBase64);
      await store.set('pricelist_name', fileName || 'prijslijst.pdf');
      // Wis tekst-versie zodat PDF gebruikt wordt
      try { await store.delete('pricelist_text'); } catch {}
      return { statusCode: 200, headers: H, body: JSON.stringify({ success: true }) };
    }

    if (action === 'uploadPricelistText') {
      const { priceText, fileName } = body;
      await store.set('pricelist_text', priceText);
      await store.set('pricelist_name', fileName || 'prijslijst.xlsx');
      // Wis PDF-versie zodat tekst gebruikt wordt
      try { await store.delete('pricelist_b64'); } catch {}
      return { statusCode: 200, headers: H, body: JSON.stringify({ success: true }) };
    }

    if (action === 'getPricelistName') {
      try { const name = await store.get('pricelist_name', { type:'text' }); return { statusCode: 200, headers: H, body: JSON.stringify({ name: name || null }) }; }
      catch { return { statusCode: 200, headers: H, body: JSON.stringify({ name: null }) }; }
    }

    return { statusCode: 400, headers: H, body: JSON.stringify({ error: 'Onbekende actie' }) };

  } catch (err) {
    console.error('Error:', err.message);
    return { statusCode: 500, headers: H, body: JSON.stringify({ error: err.message }) };
  }
};
