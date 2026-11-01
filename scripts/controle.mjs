// DE CONTROLE VOOR ELKE PUBLICATIE (1 november 2026).
//
// Een push naar main publiceert de site (Netlify deployt zonder bouwstap).
// Dit script is daarom de poort ervoor: het draait vanzelf bij elke git push
// (scripts/git-hooks/pre-push) en met de hand via npm run controle.
//
// Wat het nakijkt, in deze volgorde:
// 1. package.json-versie staat in de changelog van CLAUDE.md, en de
//    onderhoudsregel staat in index.html;
// 2. bij een push: raakt de push index.html of netlify/, dan horen
//    package.json (versie) en CLAUDE.md (changelog) mee te veranderen;
// 3. de bouwmap buiten Google Drive wordt bijgewerkt (scripts/bouwmap.mjs);
// 4. syntaxis: netlify/functions/api.js en elk inline script in index.html
//    laten zich lezen (parsen, niet uitvoeren);
// 5. elke knop in index.html (onclick e.d.) wijst naar een functie die bestaat;
//    netlify.toml wijst naar mappen die bestaan;
// 6. geen sleutels of tokens in de bestanden die meegaan.
//
// WAT DIT NIET KAN: de site draaien, de AI of Netlify Blobs aanroepen, of
// controleren of een scherm er goed uitziet. Er is geen eslint en geen
// testset in dit project. Voor iets zichtbaars: npm run lokaal en kijken.

import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { REPO, BOUW, synchroniseer, bestandslijst } from "./bouwmap.mjs";

const ONDERHOUDSREGEL = "onderhoud: Claude Code · 2026";
const PUSH = process.argv.includes("--push");
const SNEL = process.argv.includes("--snel");
const fouten = [];
const meld = (t) => console.log("  " + t);
const lees = (rel, basis = REPO) => fs.readFileSync(path.join(basis, rel), "utf8");

function scriptblokken(html) {
  const uit = [];
  const re = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html))) {
    if (/\bsrc\s*=/.test(m[1])) continue;
    const t = /type\s*=\s*["']?([^"'\s>]+)/i.exec(m[1]);
    if (t && !/javascript/i.test(t[1])) continue;
    uit.push({ code: m[2], regel: html.slice(0, m.index).split("\n").length });
  }
  return uit;
}

function versie() {
  console.log("1. Versie, changelog en onderhoudsregel");
  const pkg = JSON.parse(lees("package.json"));
  const mm = String(pkg.version).split(".").slice(0, 2).join(".");
  const rijen = lees("CLAUDE.md")
    .split("\n")
    .filter((r) => /^\|\s*\d+\.\d+\s*\|/.test(r))
    .map((r) => r.split("|")[1].trim());
  if (!rijen.length) fouten.push("CLAUDE.md heeft geen changelog-rijen (| 1.1 | datum | wat |)");
  else if (!rijen.includes(mm)) fouten.push("package.json heeft versie " + pkg.version + " maar de changelog in CLAUDE.md kent " + mm + " niet");
  else meld("versie " + pkg.version + " staat in de changelog");
  if (!lees("index.html").includes(ONDERHOUDSREGEL)) fouten.push('index.html mist de onderhoudsregel "' + ONDERHOUDSREGEL + '"');
  else meld("onderhoudsregel aanwezig");
}

function pushInhoud() {
  console.log("2. Wat deze push meeneemt");
  let basis;
  try {
    basis = execFileSync("git", ["rev-parse", "--verify", "-q", "origin/main"], { cwd: REPO }).toString().trim();
  } catch {
    meld("origin/main onbekend, stap overgeslagen");
    return;
  }
  const namen = execFileSync("git", ["diff", "--name-only", basis + "..HEAD"], { cwd: REPO }).toString().split("\n").filter(Boolean);
  if (!namen.length) return meld("niets nieuws ten opzichte van origin/main");
  meld(namen.length + " bestand(en) gewijzigd");
  const zichtbaar = namen.filter((n) => n === "index.html" || n.startsWith("netlify/"));
  if (zichtbaar.length && !namen.includes("package.json")) fouten.push("deze push wijzigt de site (" + zichtbaar.join(", ") + ") maar de versie in package.json niet.");
  if (zichtbaar.length && !namen.includes("CLAUDE.md")) fouten.push("deze push wijzigt de site maar de changelog in CLAUDE.md niet.");
}

function syntaxis() {
  console.log("4. Syntaxis (in de bouwmap)");
  const api = path.join(BOUW, "netlify/functions/api.js");
  const r = spawnSync(process.execPath, ["--check", api], { encoding: "utf8" });
  if (r.status !== 0) fouten.push("api.js heeft een syntaxfout:\n      " + (r.stderr || "").trim().split("\n").slice(0, 6).join("\n      "));
  else meld("api.js: ok");
  const blokken = scriptblokken(lees("index.html", BOUW));
  blokken.forEach((b, i) => {
    try {
      new vm.Script(b.code, { filename: "index.html (script " + (i + 1) + ")", lineOffset: b.regel - 1 });
    } catch (e) {
      fouten.push("script " + (i + 1) + " in index.html (vanaf regel " + b.regel + "): " + e.message);
    }
  });
  meld(blokken.length + " scriptblok(ken) in index.html gelezen");
}

function verwijzingen() {
  console.log("5. Knoppen, functies en netlify.toml");
  const html = lees("index.html", BOUW);
  const code = scriptblokken(html).map((b) => b.code).join("\n");
  const bekend = new Set(["if", "event", "document", "window", "this", "return", "confirm", "alert", "history", "navigator", "console", "setTimeout"]);
  for (const m of code.matchAll(/function\s+([A-Za-z_$][\w$]*)/g)) bekend.add(m[1]);
  for (const m of code.matchAll(/(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=/g)) bekend.add(m[1]);
  for (const m of code.matchAll(/window\.([A-Za-z_$][\w$]*)\s*=/g)) bekend.add(m[1]);
  const ontbreekt = new Set();
  let aantal = 0;
  for (const m of html.matchAll(/\bon[a-z]+\s*=\s*"\s*([A-Za-z_$][\w$]*)\s*\(/g)) {
    aantal++;
    if (!bekend.has(m[1])) ontbreekt.add(m[1]);
  }
  if (ontbreekt.size) fouten.push("knoppen verwijzen naar functies die niet bestaan: " + [...ontbreekt].join(", "));
  else meld(aantal + " knop-verwijzingen wijzen naar bestaande functies");
  const toml = lees("netlify.toml", BOUW);
  const publish = /publish\s*=\s*"([^"]+)"/.exec(toml);
  const functies = /functions\s*=\s*"([^"]+)"/.exec(toml);
  if (!publish || !fs.existsSync(path.join(BOUW, publish[1], "index.html"))) fouten.push("netlify.toml: publish wijst niet naar een map met index.html");
  if (!functies || !fs.existsSync(path.join(BOUW, functies[1]))) fouten.push("netlify.toml: functions wijst niet naar een bestaande map");
  if (publish && functies) meld("netlify.toml: publish en functions kloppen");
}

function geheimen() {
  console.log("6. Sleutels in de bestanden");
  const patronen = [/sk-ant-[A-Za-z0-9_-]{10,}/, /\bnfp_[A-Za-z0-9]{20,}/, /\bghp_[A-Za-z0-9]{30,}/, /-----BEGIN [A-Z ]*PRIVATE KEY-----/];
  let gelezen = 0;
  for (const rel of bestandslijst()) {
    let buf;
    try {
      buf = fs.readFileSync(path.join(REPO, rel));
    } catch {
      continue;
    }
    if (buf.length > 5 * 1024 * 1024) continue;
    gelezen++;
    const tekst = buf.toString("utf8");
    if (patronen.some((p) => p.test(tekst))) fouten.push("in " + rel + " staat iets wat op een sleutel of token lijkt. Haal het eruit en zet het in .sleutels/ of in Netlify.");
  }
  meld(gelezen + " bestanden nagekeken");
}

console.log("Controle Blend by Jordan" + (PUSH ? " (voor de push)" : ""));
try {
  versie();
  if (PUSH) pushInhoud();
  if (!SNEL) {
    console.log("3. Bouwmap bijwerken");
    synchroniseer();
    syntaxis();
    verwijzingen();
  }
  geheimen();
} catch (e) {
  fouten.push(e.blend ? e.message : "onverwachte fout: " + (e.stack || e.message || e));
}

if (fouten.length) {
  console.log("");
  console.log("NIET IN ORDE:");
  for (const f of fouten) console.log("  - " + f);
  if (PUSH) console.log("\nDe push is tegengehouden. Er is niets gepubliceerd.");
  process.exit(1);
}
console.log("\nAlles in orde." + (PUSH ? " De push gaat door; Netlify publiceert zodra de deploy klaar is." : ""));
console.log("(Niet nagekeken: de site draaien, AI en Blobs aanroepen, het uiterlijk. Gebruik daarvoor npm run lokaal.)");
