// DE LOKALE PROEF (1 november 2026).
//
// Start de site op http://127.0.0.1:5174 vanuit de bouwmap buiten Google
// Drive en houdt die bouwmap bij terwijl je in de projectmap werkt: elke
// opgeslagen wijziging staat binnen een seconde in de proef.
//
// LET OP: de gegevens in de proef zijn de ECHTE gegevens. De aanroepen naar
// /.netlify/functions gaan via een doorgeefluik naar de live site
// (standaard https://vermillion-sawine-41235a.netlify.app, aan te passen met
// BLEND_LIVE). Een boeking, verwijdering of correctie in de proef verandert
// dus echte reserveringen. Kijken en klikken mag; opslaan alleen met opzet.

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { BOUW, REPO, synchroniseer } from "./bouwmap.mjs";

const POORT = Number(process.env.PORT || 5174);
const LIVE = (process.env.BLEND_LIVE || "https://vermillion-sawine-41235a.netlify.app").replace(/\/$/, "");
const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
  ".md": "text/plain; charset=utf-8",
};

try {
  synchroniseer();
} catch (e) {
  console.error("GESTOPT: " + e.message);
  process.exit(1);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://127.0.0.1");
  if (url.pathname.startsWith("/.netlify/functions/")) {
    const delen = [];
    for await (const d of req) delen.push(d);
    try {
      const r = await fetch(LIVE + url.pathname + url.search, {
        method: req.method,
        headers: { "content-type": req.headers["content-type"] || "application/json" },
        body: req.method === "GET" || req.method === "HEAD" ? undefined : Buffer.concat(delen),
      });
      res.writeHead(r.status, { "content-type": r.headers.get("content-type") || "application/json" });
      res.end(Buffer.from(await r.arrayBuffer()));
    } catch (e) {
      res.writeHead(502, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "De live site is niet bereikbaar vanuit de proef: " + e.message }));
    }
    return;
  }
  let rel = decodeURIComponent(url.pathname);
  if (rel.endsWith("/")) rel += "index.html";
  const vol = path.normalize(path.join(BOUW, rel));
  if (vol !== BOUW && !vol.startsWith(BOUW + path.sep)) {
    res.writeHead(403);
    return res.end("Niet toegestaan");
  }
  fs.readFile(vol, (err, buf) => {
    if (err) {
      res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      return res.end("Niet gevonden");
    }
    res.writeHead(200, { "content-type": TYPES[path.extname(vol).toLowerCase()] || "application/octet-stream", "cache-control": "no-store" });
    res.end(buf);
  });
});
server.listen(POORT, "127.0.0.1", () => console.log("[blend] proef op http://127.0.0.1:" + POORT + " (gegevens: " + LIVE + ")"));

// Bijhouden. Een korte pauze vangt een reeks opslagacties in een keer op.
let klok = null;
const OVERSLAAN = /(^|\/)(\.git|node_modules|dist|\.netlify)(\/|$)/;
try {
  fs.watch(REPO, { recursive: true }, (_soort, naam) => {
    if (naam && OVERSLAAN.test(String(naam).split(path.sep).join("/"))) return;
    clearTimeout(klok);
    klok = setTimeout(() => {
      try {
        const r = synchroniseer({ stil: true });
        if (r.gekopieerd || r.verwijderd) console.log("[blend] proef bijgewerkt: " + r.gekopieerd + " bestand(en)");
      } catch (e) {
        console.error("[blend] bijwerken mislukt: " + e.message);
      }
    }, 300);
  });
} catch (e) {
  console.error("[blend] meekijken met de projectmap lukt niet (" + e.message + "); draai na een wijziging npm run bouwmap.");
}

for (const sein of ["SIGINT", "SIGTERM"]) process.on(sein, () => server.close(() => process.exit(0)));
