# CLAUDE.md — Blend by Jordan

Projectgeheugen voor Claude Code. Lees dit als eerste bij elke nieuwe sessie.

---

## Wat is deze site

Reserveringssysteem voor kapsalon **Blend by Jordan** (eigenaar: Jordan).  
Klanten boeken online een behandeling via een vragenstroom of via de AI-chatbot "Blendy".  
Taal: **Nederlands** (klanten en beheerder). Code en commits: Engels.

---

## Techniek

| Onderdeel | Waarde |
|---|---|
| Architectuur | Één `index.html` + Netlify serverless function |
| Framework | Geen (vanilla JS, geen build-stap) |
| Bouwcommando | `npm install` (alleen voor `@netlify/blobs`) |
| Hosting | Netlify |
| GitHub-repo | `supergorkum/blend-jordan` (of gelijknamig) |
| Productietak | `main` |
| Live adres | Zie Netlify-dashboard (nog niet vastgelegd) |
| Opslag | Netlify Blobs, store-naam: `blend-jordan` |
| AI-model | `claude-haiku-4-5-20251001` via Anthropic API |

**Bestandsstructuur:**
```
blend-jordan/
  index.html                    ← volledige frontend (~1500 regels)
  netlify/functions/api.js      ← serverless backend
  package.json
  netlify.toml
  CLAUDE.md                     ← dit bestand
  OVERDRACHT-UIT-CHAT.md
```

---

## Sleutels en wachtwoorden

Staan **alleen** in de Netlify-omgevingsvariabelen van het project (Netlify → Site → Environment variables):

- `ANTHROPIC_API_KEY` — Claude API-sleutel
- `NETLIFY_SITE_ID` — site-ID van Netlify (nodig voor Blobs buiten de function context)
- `NETLIFY_AUTH_TOKEN` — persoonlijk Netlify-token (nodig voor Blobs)

Nooit in code of commits zetten.

---

## Hoe een wijziging live gaat

Er zijn geen patchscripts of .command-bestanden. Werkwijze:

1. Bewerk `index.html` en/of `netlify/functions/api.js` in de projectmap
2. `git add -A && git commit -m "beschrijving"`
3. `git push origin main`
4. Netlify deployt automatisch binnen ~1 minuut

Er is **geen build-stap** nodig; `netlify.toml` publiceert de root direct.

---

## Architectuur — hoe het werkt

### Frontend (`index.html`)
- Schermen: welkom → vragen (7 stuks) → AI-analyse → dagkiezer (weeknavigatie) → tijdslot → bevestiging
- Alternatief instappunt: Blendy-chatbot (schaartje-knop op welkomstscherm), stelt max. 8 vragen in gespreksvorm en leidt naar dezelfde bevestigingsstap
- Admin-portaal: wachtwoord-overlay → reserveringslijst (per week) → weekkalender → prijslijst uploaden → omzet per maand
- Reserveringsnummer: `BL` + 4 tekens, getoond als `BLEND·XXXX`
- Instagram-link: `https://www.instagram.com/blend_x_jordan/`
- Logo: base64-embedded PNG (roze "BLEND X JORDAN" vierkant, border-radius 20px)

### Backend (`netlify/functions/api.js`)
Actions die de frontend aanroept:
- `analyzeHair` — AI-analyse van de 7 antwoorden → behandeling, prijs, duur
- `blendyChat` — Blendy-chatgesprek (max. 8 vragen, 1x doorvragen per vraag)
- `checkAvailability` — beschikbare dagen voor een week (param: `startDate`)
- `getSlots` — beschikbare tijdslots op een specifieke dag
- `saveReservation` — opslaan in Blobs, genereert `BL`+4-teken nummer
- `getReservation` — ophalen van één reservering op nummer
- `deleteReservation` — verwijderen
- `cleanupExpired` — verwijdert verlopen reserveringen (wordt stil aangeroepen bij admin-login)
- `updateDuration` — beheerder past tijdsduur aan
- `updateBehandeling` — beheerder past behandeling(en) aan; slaat correctie-voorbeeld op voor AI-leren
- `getWeekReservations` — alle reserveringen van een week (voor admin weekoverzicht)
- `getAllReservations` — alle reserveringen (voor omzetoverzicht)
- `uploadPricelist` — prijslijst als Excel uploaden (SheetJS via CDN)
- `uploadPricelistText` — prijslijst als tekstformaat opslaan
- `getPricelistName` — naam van de actieve prijslijst ophalen
- `generateEmailNarrative` — AI-tekst voor bevestigingsmail

### AI-leren van correcties
- Beheerder kan in reserveringsdetail de behandeling corrigeren
- Correctie wordt opgeslagen als voorbeeld in blob `correctie_voorbeelden` (max. 20)
- `analyzeHair` neemt deze voorbeelden mee in het systeemprompt

---

## Vaste afspraken

- **Taal in de UI**: altijd Nederlands
- **Reserveringscode**: formaat `BL` + 4 alfanumerieke tekens, display als `BLEND·XXXX`
- **Admin-wachtwoord**: staat in de frontend (zoek op `adminPassword` of vergelijkbaar in `index.html`) — nooit wijzigen zonder Jordan te informeren
- **Tijden**: ochtend 09:00–12:00, middag 13:00–18:00, blokken van 30 minuten
- **Prijslijst**: Jordan kan via het admin-portaal een Excel-prijslijst uploaden; de AI gebruikt die dan als bron

---

## Eerste handeling van elke sessie

```bash
cd /pad/naar/blend-jordan
git pull origin main
cat package.json | grep version
git log --oneline -5
git status
```

Controleer daarna of er nog iets openstaat in `OVERDRACHT-UIT-CHAT.md`.

---

## Changelog

| Versie | Datum | Wat |
|---|---|---|
| 1.0 | nov 2026 | Volledig systeem gebouwd in chat, overgezet naar Code |
| 1.1 | 1 nov 2026 | Overstap naar Claude Code: controle en pre-push hook, bouwmap en lokale proef, onderhoudsregel op het welkomstscherm |
