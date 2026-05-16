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
      const conflict = dayRes.some(r => { const rEnd = r.startMinutes + r.duration; return !(tEnd <= r.startMinutes || t >= rEnd); });
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

  try {
    const body = JSON.parse(event.body);
    const { action } = body;
    const store = getStore('blend-jordan');

    // ══════════════════════════════════════════════════════════
    // BLENDY CHAT
    // ══════════════════════════════════════════════════════════
    if (action === 'chatMessage') {
      const { messages, name } = body;

      const blendySystem = `Je bent Blendy ✂️, de charmante en enthousiaste virtuele kappersassistent van Blend by Jordan. Je spreekt altijd informeel Nederlands (je/jij/jouw). Je bent warm, persoonlijk en een beetje speels.

DOEL: Een intakegesprek voeren met ${name} om de perfecte haarkleurbehandeling te bepalen.

FASE 1 — HUIDIGE HAARSITUATIE (max 8 vragen per fase):
Vraag naar: haarlengte, haarkleur, of eerder geverfd of highlights gehad, wanneer voor het laatst, huidige staat van de kleur (naturel, egaal geverfd, highlights, balayage).
Per vraag mag je maximaal 3 keer doorvragen als het antwoord vaag is.

FASE 2 — WENSEN EN GEWENST RESULTAAT (max 8 vragen):
Vraag naar: wat de klant wil bereiken (subtiel/uitgesproken), welk effect (faceframe/gedeeltelijk/volledig/balayage/van wortel tot punt), toner ja of nee, knippen ja of nee.
Per vraag mag je maximaal 1 keer doorvragen.

GESPREKSSTIJL:
- Stel altijd precies 1 vraag per bericht — nooit meer dan 1 tegelijk
- Reageer kort en warm op elk antwoord voordat je de volgende vraag stelt
- Noem ${name} af en toe bij naam
- Wees enthousiast maar to-the-point

PRIJSLIJST — gebruik UITSLUITEND deze behandelingen, prijzen en tijden:
${DEFAULT_PRICE_LIST}

BESLISREGELS VOOR DE ANALYSE:
- Faceframe of accent rondom gezicht → XS
- Deel van haar → S (scalp)
- Heel haar of volledig → M (fullhead)
- Van wortel tot punt of van aanzet → L (fullhead van aanzet tot punt)
- Vloeiende overgang → Balayage
- Knippen = ja → kies de Knippen + variant
- Toner = ja of weet niet → incl toner; nee → zonder toner
- Balayage heeft geen toner variant — kies Balayage of Balayage en knippen

AFSLUITING:
Wanneer je genoeg weet: sluit vriendelijk en kort af, en zet dan op de allerlaatste regel precies dit (niets erna):
BLENDY_ANALYSE:{"samenvatting":"[persoonlijke beschrijving van de haarsituatie, 1-2 zinnen]","wens":"[wat de klant wil in 1 zin]","behandeling":"[exacte naam uit de prijslijst]","prijs":[getal],"duur":[getal in minuten],"uitleg":"[waarom deze behandeling het beste past, 1-2 zinnen]"}`;

      const resp = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model: 'claude-sonnet-4-20250514', max_tokens: 800, system: blendySystem, messages })
      });

      const data = await resp.json();
      const raw = data.content?.find(c => c.type === 'text')?.text || '';

      const MARKER = 'BLENDY_ANALYSE:';
      const mIdx = raw.lastIndexOf(MARKER);

      if (mIdx !== -1) {
        const beforeText = raw.substring(0, mIdx).trim();
        const jsonStr = raw.substring(mIdx + MARKER.length).trim();
        let analyse = null;
        try { analyse = JSON.parse(jsonStr); } catch {}
        return { statusCode: 200, headers, body: JSON.stringify({ reply: beforeText, done: true, analyse }) };
      }

      return { statusCode: 200, headers, body: JSON.stringify({ reply: raw, done: false }) };
    }

    // ══════════════════════════════════════════════════════════
    // ANALYSE HAAR (keuze flow)
    // ══════════════════════════════════════════════════════════
    if (action === 'analyzeHair') {
      const { answers, name } = body;
      let useDocumentAPI = false, priceListBase64 = null;
      try { const s = await store.get('pricelist_b64', { type: 'text' }); if (s) { priceListBase64 = s; useDocumentAPI = true; } } catch (_) {}

      const ql = { haarlengte:'Haarlengte', haarkleur:'Huidige haarkleur', eerderGeverfd:'Eerder geverfd of highlights', huidigeKleur:'Huidige staat van de kleur', gewenstResultaat:'Gewenst kleurresultaat', knippen:'Wil ook knippen', toner:'Wil een toner' };
      const answersText = Object.entries(answers).map(([k, v]) => `- ${ql[k] || k}: ${v}`).join('\n');

      const prompt = `Je bent een professionele haarstylist assistent bij Blend by Jordan. Kies de EXACTE behandeling uit de prijslijst.

KLANT: ${name}
ANTWOORDEN:
${answersText}

BESLISREGELS:
1. Accent rondom gezicht of subtiel → XS (faceframe)
2. Deel van haar → S (scalp)
3. Heel haar of volledig → M (fullhead)
4. Van wortel tot punt of van aanzet → L
5. Vloeiende overgang of balayage → Balayage
6. Knippen ja → kies Knippen + variant
7. Toner ja of weet niet → incl toner; nee → zonder toner
8. Balayage heeft geen toner variant
9. Niet van toepassing op haarlengte of resultaat → M als default

PRIJSLIJST:
${useDocumentAPI ? '[zie bijgevoegd document]' : DEFAULT_PRICE_LIST}

Geef UITSLUITEND dit JSON object terug:
{"samenvatting":"...","wens":"...","behandeling":"...","prijs":0.00,"duur":0,"uitleg":"..."}`;

      let messages;
      if (useDocumentAPI && priceListBase64) {
        messages = [{ role: 'user', content: [{ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: priceListBase64 }, title: 'Prijslijst' }, { type: 'text', text: prompt }] }];
      } else {
        messages = [{ role: 'user', content: prompt }];
      }

      const resp = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model: 'claude-sonnet-4-20250514', max_tokens: 1000, messages })
      });

      const data = await resp.json();
      const raw = data.content?.find(c => c.type === 'text')?.text || '{}';
      let analysis;
      try { analysis = JSON.parse(raw.replace(/```json|```/g, '').trim()); }
      catch { analysis = { error: 'Analyse mislukt.' }; }
      return { statusCode: 200, headers, body: JSON.stringify(analysis) };
    }

    // ══════════════════════════════════════════════════════════
    // CHECK BESCHIKBAARHEID
    // ══════════════════════════════════════════════════════════
    if (action === 'checkAvailability') {
      const { durationMinutes } = body;
      const { blobs } = await store.list({ prefix: 'reservation_' });
      const allRes = [];
      for (const b of blobs) { try { const r = await store.get(b.key, { type: 'json' }); if (r) allRes.push(r); } catch (_) {} }
      const today = new Date();
      const availability = {};
      let found = 0, offset = 1;
      while (found < 5) {
        const d = new Date(today); d.setDate(today.getDate() + offset++);
        const dow = d.getDay(); if (dow === 0 || dow === 6) continue;
        const ds = d.toISOString().split('T')[0];
        const slots = getAvailableSlots(allRes, ds, durationMinutes);
        availability[ds] = { available: slots.length > 0, slots };
        found++;
      }
      return { statusCode: 200, headers, body: JSON.stringify({ availability }) };
    }

    // ══════════════════════════════════════════════════════════
    // TIJDSLOTEN VOOR EEN DAG
    // ══════════════════════════════════════════════════════════
    if (action === 'getSlots') {
      const { date, durationMinutes } = body;
      const { blobs } = await store.list({ prefix: 'reservation_' });
      const dayRes = [];
      for (const b of blobs) { try { const r = await store.get(b.key, { type: 'json' }); if (r && r.date === date) dayRes.push(r); } catch (_) {} }
      return { statusCode: 200, headers, body: JSON.stringify({ slots: getAvailableSlots(dayRes, date, durationMinutes) }) };
    }

    // ══════════════════════════════════════════════════════════
    // RESERVERING OPSLAAN
    // ══════════════════════════════════════════════════════════
    if (action === 'saveReservation') {
      const { name, analysis, date, startMinutes } = body;
      let number;
      for (let i = 0; i < 20; i++) {
        const c = generateReservationNumber();
        try { const ex = await store.get(`reservation_${c}`); if (!ex) { number = c; break; } } catch { number = c; break; }
      }
      const reservation = { number, name, analysis, date, startMinutes, duration: analysis.duur, status: 'confirmed', createdAt: new Date().toISOString() };
      await store.set(`reservation_${number}`, JSON.stringify(reservation));
      return { statusCode: 200, headers, body: JSON.stringify({ number, reservation }) };
    }

    // ══════════════════════════════════════════════════════════
    // RESERVERING OPHALEN
    // ══════════════════════════════════════════════════════════
    if (action === 'getReservation') {
      const { number } = body;
      try {
        const r = await store.get(`reservation_${number.toUpperCase()}`, { type: 'json' });
        if (!r) throw new Error();
        return { statusCode: 200, headers, body: JSON.stringify({ reservation: r }) };
      } catch { return { statusCode: 404, headers, body: JSON.stringify({ error: 'Reservering niet gevonden' }) }; }
    }

    // ══════════════════════════════════════════════════════════
    // DUUR AANPASSEN
    // ══════════════════════════════════════════════════════════
    if (action === 'updateDuration') {
      const { number, adjustment } = body;
      try {
        const r = await store.get(`reservation_${number}`, { type: 'json' });
        if (!r) throw new Error();
        r.duration = Math.max(30, r.duration + adjustment);
        await store.set(`reservation_${number}`, JSON.stringify(r));
        return { statusCode: 200, headers, body: JSON.stringify({ reservation: r }) };
      } catch { return { statusCode: 404, headers, body: JSON.stringify({ error: 'Niet gevonden' }) }; }
    }

    // ══════════════════════════════════════════════════════════
    // WEEKOVERZICHT
    // ══════════════════════════════════════════════════════════
    if (action === 'getWeekReservations') {
      const { weekStart } = body;
      const start = new Date(weekStart + 'T12:00:00');
      const weekDates = [];
      for (let i = 0; i < 5; i++) { const d = new Date(start); d.setDate(start.getDate() + i); weekDates.push(d.toISOString().split('T')[0]); }
      const { blobs } = await store.list({ prefix: 'reservation_' });
      const reservations = [];
      for (const b of blobs) { try { const r = await store.get(b.key, { type: 'json' }); if (r && weekDates.includes(r.date)) reservations.push(r); } catch (_) {} }
      return { statusCode: 200, headers, body: JSON.stringify({ reservations }) };
    }

    // ══════════════════════════════════════════════════════════
    // PRIJSLIJST
    // ══════════════════════════════════════════════════════════
    if (action === 'uploadPricelist') {
      const { pdfBase64, fileName } = body;
      await store.set('pricelist_b64', pdfBase64);
      await store.set('pricelist_name', fileName || 'prijslijst.pdf');
      return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
    }

    if (action === 'getPricelistName') {
      try { const n = await store.get('pricelist_name', { type: 'text' }); return { statusCode: 200, headers, body: JSON.stringify({ name: n || null }) }; }
      catch { return { statusCode: 200, headers, body: JSON.stringify({ name: null }) }; }
    }

    // ══════════════════════════════════════════════════════════
    // BLENDY CHAT
    // ══════════════════════════════════════════════════════════
    if (action === 'blendyChat') {
      const { messages, name } = body;

      // Check for custom price list
      let priceListText = DEFAULT_PRICE_LIST;
      try {
        const stored = await store.get('pricelist_b64', { type: 'text' });
        if (stored) {
          // Use default text for system prompt; custom PDF is used in analyzeHair
          // (PDF parsing in system prompts is not supported, so we keep default here)
        }
      } catch (_) {}

      const systemPrompt = `Je bent Blendy, de vrolijke en deskundige stylist assistent van Blend by Jordan kapsalon. Je voert een kort, persoonlijk gesprek om de perfecte behandeling te bepalen.

GESPREKSTRUCTUUR:
DEEL 1 — Huidige haarsituatie (maximaal 8 vragen):
Vraag naar: haarlengte, haarkleur (naturel of geverfd), staat van de kleur (highlights/balayage/egaal/naturel), hoe lang geleden de laatste behandeling, eventuele conditieproblemen.
Je mag per onduidelijk antwoord maximaal 3 keer doorvragen voor verduidelijking.

DEEL 2 — Wat wil de klant (maximaal 8 vragen):
Vraag naar: gewenst resultaat (subtiel faceframe / gedeeltelijk / volledig / balayage / van wortel tot punt), knippen meenemen (ja of nee), toner (ja / nee / weet niet).
Je mag per vraag maximaal 1 keer doorvragen.

STIJLREGELS:
- Stel altijd precies 1 vraag per bericht
- Maximaal 3 korte zinnen per bericht
- Maximaal 1 emoji per bericht
- Altijd in het Nederlands
- Noem de klant bij naam (${name})
- Warm, enthousiast en professioneel, zoals een echte hairstylist

BEHANDELINGSREGELS (gebruik exact deze logica):
- "Accent rondom gezicht" of "subtiel faceframe" → XS highlights
- "Deel van het haar" → S highlights (scalp)
- "Heel het haar" of "volledig" → M highlights (fullhead)
- "Van wortel tot punt" of "van aanzet" → L highlights (fullhead van aanzet tot punt)
- "Vloeiende overgang" of "balayage" → Balayage
- Knippen = ja → kies de "Knippen +" variant
- Toner "ja" of "weet niet" → incl toner; toner "nee" → zonder toner
- Balayage heeft geen toner variant — kies gewoon Balayage of Balayage en knippen

WANNEER KLAAR:
Zodra je voldoende weet voor een concreet behandeladvies, zeg je vriendelijk dat je het gaat uitwerken en voeg je op de VOLGENDE REGEL deze tag toe (NIETS anders erachter):
<ANALYSE>{"samenvatting":"Persoonlijke beschrijving van de haarsituatie van ${name} in 1-2 zinnen","wens":"Wat ${name} wil bereiken in 1 heldere zin","behandeling":"Exacte naam uit de prijslijst","prijs":0.00,"duur":0,"uitleg":"Waarom deze behandeling perfect past in 1-2 zinnen"}</ANALYSE>

PRIJSLIJST (gebruik EXACT deze namen, prijzen en tijden):
${priceListText}`;

      const resp = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': process.env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 600,
          system: systemPrompt,
          messages
        })
      });

      const data = await resp.json();
      const reply = data.content?.find(c => c.type === 'text')?.text || 'Sorry, ik kon geen antwoord genereren. Probeer het opnieuw.';
      return { statusCode: 200, headers, body: JSON.stringify({ reply }) };
    }

    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Onbekende actie' }) };

  } catch (err) {
    console.error('API Error:', err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Server fout: ' + err.message }) };
  }
};
