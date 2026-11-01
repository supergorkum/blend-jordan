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
| GitHub-repo | `supergorkum/blend-jordan` (bevestigd 1 nov 2026, publiek) |
| Productietak | `main` |
| Live adres | https://vermillion-sawine-41235a.netlify.app |
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
- Admin-portaal (sleutelknop, geen login): reserveringslijst (per week) → weekkalender → prijslijst uploaden → omzet per maand
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
- **Geen wachtwoorden**: dit is een demo (besloten door Edgar, 1 november 2026). Het beheerportaal opent direct met de sleutelknop; er is geen login en er hoort geen wachtwoord in code, tekst of Netlify-instellingen. Komt er ooit een echte salon in productie, dan hoort toegangscontrole aan de serverkant (in `api.js`), niet in `index.html`.
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
ls -l scripts/git-hooks/pre-push   # moet uitvoerbaar zijn (x), anders: chmod +x
```

Het overdrachtsbestand van de chat staat in `.overstap/OVERDRACHT-UIT-CHAT.md` (niet in git). Wat daarin blijvend geldt, staat in dit bestand.

---

## Werken in Claude Code (sinds 1 november 2026)

Een push naar `main` op GitHub (`supergorkum/blend-jordan`, publiek) publiceert de
site: Netlify haalt de repo op, draait `npm install` en zet de map zoals hij is
live. Er is geen bouwstap. Live adres: https://vermillion-sawine-41235a.netlify.app
(Netlify-project `vermillion-sawine-41235a`; de naam is een willekeurige
Netlify-naam, niet "blend").

**Bouwen en proberen gebeurt buiten Google Drive.** Er staat geen `node_modules`
in de projectmap. De controle en de proef draaien in een kopie,
standaard `~/Developer/blend-jordan-build`, die `scripts/bouwmap.mjs` bijhoudt.
Werken doe je altijd in de projectmap; de bouwmap is wegwerp. Draai nooit
`npm install` in de projectmap zelf.

- `npm run controle`: versie en changelog, onderhoudsregel, syntaxis van
  `api.js` en van de scripts in `index.html`, verwijzen alle knoppen naar een
  bestaande functie, kloppen de mappen in `netlify.toml`, staan er geen sleutels
  in de bestanden. Duurt een paar seconden. Wat de controle niet kan: de site
  draaien, de AI of Netlify Blobs aanroepen, het uiterlijk beoordelen. Er is geen
  eslint en geen testset.
- `npm run lokaal`: de site op http://127.0.0.1:5174, ook als preview in Code
  (`.claude/launch.json`). Wijzigingen in de projectmap lopen vanzelf mee. De
  aanroepen naar `/.netlify/functions` gaan naar de LIVE site met de ECHTE
  reserveringen. Acties die gegevens veranderen (boeken, verwijderen, opruimen,
  duur of behandeling aanpassen, prijslijst uploaden) worden in de proef
  geblokkeerd. Alleen met `BLEND_SCHRIJVEN=1 npm run lokaal` gaan ze door.
- `npm run bouwmap`: alleen de bouwmap bijwerken.

**Elke push gaat eerst door de controle.** `scripts/git-hooks/pre-push` draait
`npm run controle` met een extra stap: raakt de push `index.html` of `netlify/`,
dan moeten de versie in `package.json` en de changelog hierboven mee veranderen.
Ingesteld met `git config core.hooksPath scripts/git-hooks`; dat staat in
`.git/config` en reist via Drive mee. Google Drive bewaart het uitvoerbit niet
altijd. **Kijk bij de start van elke sessie na** dat
`scripts/git-hooks/pre-push` uitvoerbaar is (`ls -l`), en zet het zo nodig
terug met `chmod +x`. `git push --no-verify` alleen als Edgar daar zelf om
vraagt.

**Een wijziging in Code** gaat zo:

1. `index.html` en/of `netlify/functions/api.js` rechtstreeks aanpassen.
2. Versie omhoog in `package.json` en een nieuwe rij in de changelog onderaan.
3. `npm run controle`, en bij iets zichtbaars de proef bekijken.
4. Commit in het Engels, `git push`.
5. De deploy nakijken en Edgar kort melden wat er live staat.

**De deploy nakijken.** Wacht ongeveer een minuut en lees dan de live pagina,
bijvoorbeeld met `curl -s https://vermillion-sawine-41235a.netlify.app/ | grep
"onderhoud: Claude Code"`. Zoek op een tekst die alleen in de nieuwe versie
staat, niet op een versienummer. De pagina toont geen versienummer.

**Onderhoudsregel.** Onderaan het welkomstscherm staat in kleine letters
"onderhoud: Claude Code · 2026" (class `onderhoudsregel`). De site is alleen
Nederlands, dus er is een taal. De controle faalt als de regel ontbreekt.

**Niet tegelijk op twee computers.** Git draait in een Google Drive-map. Bij
wisselen van computer eerst `git pull`. Bestanden die alleen online staan,
geeft Drive soms als bestand met de juiste omvang en alleen nullen: lees dat
nooit als leeg en schrijf er niets overheen. `bouwmap.mjs` stopt er dan mee.

**Wat tijdens de overstap is geleerd (1 november 2026):**

- De projectmap bevatte bij de start alleen `CLAUDE.md` en de overdracht. De
  code is opgehaald met `git clone` van GitHub in een tijdelijke map en daarna
  met `.git` erbij naar de Drive-map gekopieerd (`cp -a` van `.git` stopt op de
  alleen-lezen pack-bestanden; kopieer zonder rechten te bewaren). De bestanden
  waren daarna identiek aan GitHub.
- Pushen lukt niet overal. De shell op de HUB heeft geen GitHub-inloggegevens
  en `gh` ontbreekt. De cloudomgeving mag niet pushen naar `supergorkum/blend-jordan`
  (de Claude GitHub-app is voor dit account niet geïnstalleerd). Pushen kan dus
  alleen vanuit een Terminal op een Mac die bij GitHub is aangemeld, of nadat
  de app is geïnstalleerd.
- De shell op de HUB en de cloud komen niet bij `*.netlify.app`. De ingebouwde
  browser wel (toegang vragen). Daarmee is het live adres gevonden.
- `git commit` in een Drive-map met verwijderverbod laat `.git/HEAD.lock`,
  `objects/maintenance.lock` en `objects/*/tmp_obj_*` achter. Na toestemming om
  te verwijderen zijn alleen die restanten weggehaald. Zonder toestemming:
  `mv .git/HEAD.lock .git/stale-HEAD-lock`.
- Het beheerderswachtwoord (en de hele login) is op 1 november 2026 uit de site gehaald, op verzoek van Edgar: het is een demo. De beheeracties in `api.js` hadden toch al geen controle.
- `netlify.toml` publiceert de hele rootmap (`publish = "."`). Daarom geven `/CLAUDE.md`, `/scripts/*`, `/package.json`, `/netlify/*` en een paar andere interne paden via redirects met `force` een 404 (`404.html`). De bestanden staan wel in de publieke GitHub-repo; zet er nooit iets in wat niet openbaar mag.
- `OVERDRACHT-UIT-CHAT.md` staat nu in `.overstap/` (in `.gitignore`).

**Openstaand na de overstap:** zie de laatste commits in `git log`. Is `git rev-list --count origin/main..HEAD` groter dan 0, dan is er nog niet gepusht. Pushen vereist de Claude GitHub-app op `supergorkum/blend-jordan` (of een aangemelde Terminal).

## Changelog

| Versie | Datum | Wat |
|---|---|---|
| 1.0 | nov 2026 | Volledig systeem gebouwd in chat, overgezet naar Code |
| 1.1 | 1 nov 2026 | Overstap naar Claude Code: controle en pre-push hook, bouwmap en lokale proef, onderhoudsregel op het welkomstscherm |
| 1.2 | 1 nov 2026 | Demo zonder wachtwoorden: beheer opent direct; proef schrijft standaard niets; interne bestanden niet meer op te halen via de site |
