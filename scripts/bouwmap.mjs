// DE BOUWMAP (1 november 2026).
//
// De projectmap staat in Google Drive. Alles wat het project buiten de
// bestanden zelf nodig heeft (controles, de lokale proef) draait in een kopie
// buiten Drive, standaard ~/Developer/blend-jordan-build. Zo komt er nooit
// node_modules of ander gruis in Drive. Blend heeft geen bouwstap en voor de
// controle is geen npm install nodig; de map is er vooral om de proef en de
// controle op een schone, gelijke kopie te laten draaien.
//
// Dit bestand houdt die kopie gelijk aan de projectmap: het neemt precies de
// bestanden over die git kent of zou kennen (alles wat niet in .gitignore
// staat) en haalt weg wat in de projectmap niet meer bestaat. Werken doe je
// altijd in de projectmap. De bouwmap is wegwerp.

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

export const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const BOUW = path.resolve(process.env.BLEND_BOUWMAP || path.join(os.homedir(), "Developer", "blend-jordan-build"));

const MERKTEKEN = ".blend-bouwmap";
const EIGEN = new Set(["node_modules", "dist", MERKTEKEN]);
// Google Drive geeft voor een bestand dat alleen online staat soms geen fout
// maar een bestand met de juiste omvang en alleen nullen erin.
const TEKST = /\.(m?jsx?|json|css|html|md|toml|txt|svg)$/i;

function fout(t) {
  const e = new Error(t);
  e.blend = true;
  throw e;
}

function veiligheid() {
  const rel = path.relative(REPO, BOUW);
  if (!rel || !rel.startsWith("..")) fout("De bouwmap ligt in of op de projectmap (" + BOUW + "). Dat mag niet.");
  if (/CloudStorage|Google ?Drive|Mijn Drive|My Drive/i.test(BOUW)) fout("De bouwmap ligt in een cloudmap (" + BOUW + "). Kies een gewone map, bijvoorbeeld ~/Developer/blend-jordan-build.");
  if (fs.existsSync(BOUW)) {
    const inhoud = fs.readdirSync(BOUW);
    if (inhoud.length && !inhoud.includes(MERKTEKEN)) {
      fout("De map " + BOUW + " bestaat al en is niet door dit script gemaakt. Ik raak hem niet aan. Kies een andere map met BLEND_BOUWMAP.");
    }
  } else {
    fs.mkdirSync(BOUW, { recursive: true });
  }
  fs.writeFileSync(path.join(BOUW, MERKTEKEN), "Kopie van de Blend by Jordan-projectmap. Weggooien mag altijd.\n");
}

export function bestandslijst() {
  const uit = execFileSync("git", ["ls-files", "-co", "--exclude-standard", "-z"], { cwd: REPO, maxBuffer: 64 * 1024 * 1024 });
  return uit
    .toString("utf8")
    .split("\0")
    .filter(Boolean)
    .filter((p) => !p.split("/").some((d) => EIGEN.has(d)));
}

function alleenNullen(buf) {
  if (!buf.length) return false;
  for (let i = 0; i < buf.length; i++) if (buf[i] !== 0) return false;
  return true;
}

function doorloop(map, rel, uit) {
  for (const naam of fs.readdirSync(map, { withFileTypes: true })) {
    if (!rel && EIGEN.has(naam.name)) continue;
    const r = rel ? rel + "/" + naam.name : naam.name;
    const vol = path.join(map, naam.name);
    if (naam.isDirectory()) doorloop(vol, r, uit);
    else uit.push(r);
  }
  return uit;
}

export function synchroniseer({ stil = false } = {}) {
  veiligheid();
  const bestanden = bestandslijst();
  const bekend = new Set();
  let gekopieerd = 0;
  for (const rel of bestanden) {
    const bron = path.join(REPO, rel);
    let st;
    try {
      st = fs.statSync(bron);
    } catch {
      continue; // in git maar weggehaald in de werkmap
    }
    if (!st.isFile()) continue;
    bekend.add(rel);
    const doel = path.join(BOUW, rel);
    let gelijk = false;
    try {
      const d = fs.statSync(doel);
      gelijk = d.size === st.size && Math.abs(d.mtimeMs - st.mtimeMs) < 1;
    } catch {
      gelijk = false;
    }
    if (gelijk) continue;
    const buf = fs.readFileSync(bron);
    if (TEKST.test(rel) && alleenNullen(buf)) {
      fout("Het bestand " + rel + " bestaat alleen uit nullen. Google Drive heeft het waarschijnlijk nog niet echt binnengehaald. Open de projectmap in Finder, wacht tot Drive klaar is, en probeer opnieuw.");
    }
    fs.mkdirSync(path.dirname(doel), { recursive: true });
    fs.writeFileSync(doel, buf);
    fs.utimesSync(doel, st.atime, st.mtime);
    gekopieerd++;
  }
  let verwijderd = 0;
  for (const rel of doorloop(BOUW, "", [])) {
    if (!bekend.has(rel)) {
      fs.unlinkSync(path.join(BOUW, rel));
      verwijderd++;
    }
  }
  if (!stil) console.log("Bouwmap " + BOUW + ": " + gekopieerd + " bijgewerkt, " + verwijderd + " weggehaald, " + bekend.size + " bestanden in totaal.");
  return { gekopieerd, verwijderd, totaal: bekend.size };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  try {
    synchroniseer();
  } catch (e) {
    console.error("GESTOPT: " + e.message);
    process.exit(1);
  }
}
