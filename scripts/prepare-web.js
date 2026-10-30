/**
 * Kopiert statische Vendor-Dateien nach public/vendor (Browser/APK-Modus):
 *   jsQR (QR-Dekodierung), qrcode-generator (QR-Erzeugung),
 *   RSD-Regelwerk + iCal-Generator (dual-env aus lib/).
 * Läuft automatisch bei `npm install` (postinstall) und vor `npm start` (prestart).
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const out = path.join(root, 'public', 'vendor');
fs.mkdirSync(out, { recursive: true });

const kopien = [
  ['node_modules/jsqr/dist/jsQR.js', 'jsQR.js'],
  ['node_modules/qrcode-generator/dist/qrcode.js', 'qrcode.js'],
  ['lib/rules.js', 'rules.js'],
  ['lib/ical.js', 'ical.js'],
  ['lib/ocr-parser.js', 'ocr-parser.js'],
  ['node_modules/@zxing/library/umd/index.min.js', 'zxing.js'],
];

for (const [src, ziel] of kopien) {
  const from = path.join(root, src);
  if (!fs.existsSync(from)) {
    console.warn(`[prepare-web] übersprungen (fehlt): ${src}`);
    continue;
  }
  if (ziel === 'rules.js' || ziel === 'ical.js' || ziel === 'ocr-parser.js') {
    // Als IIFE kapseln: lib/*.js deklarieren globale Namen (z. B. esc, pad, ARTEN),
    // die im Browser sonst mit app.js kollidieren (SyntaxError -> App reagiert nicht).
    const code = fs.readFileSync(from, 'utf8');
    fs.writeFileSync(path.join(out, ziel), `(function () {\n${code}\n})();\n`);
  } else {
    fs.copyFileSync(from, path.join(out, ziel));
  }
}
/* ---- Offline-OCR (Tesseract.js + deutsche Sprachdaten) nach public/vendor/tesseract ---- */
function findeDatei(dir, name) {
  if (!fs.existsSync(dir)) return null;
  const treffer = [];
  (function walk(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p); else if (e.name === name) treffer.push(p);
    }
  })(dir);
  // bevorzugt die „best_int“-Variante (gute Qualität, moderate Größe)
  return treffer.find((p) => p.includes('best_int')) || treffer[0] || null;
}
const tessOut = path.join(out, 'tesseract');
fs.mkdirSync(path.join(tessOut, 'lang'), { recursive: true });
const tessDist = path.join(root, 'node_modules', 'tesseract.js', 'dist');
for (const f of ['tesseract.min.js', 'worker.min.js']) {
  const from = path.join(tessDist, f);
  if (fs.existsSync(from)) fs.copyFileSync(from, path.join(tessOut, f));
  else console.warn(`[prepare-web] übersprungen (fehlt): tesseract.js/dist/${f}`);
}
const coreDir = path.join(root, 'node_modules', 'tesseract.js-core');
if (fs.existsSync(coreDir)) {
  for (const f of fs.readdirSync(coreDir)) {
    if (/^tesseract-core.*\.(js|wasm)$/.test(f)) fs.copyFileSync(path.join(coreDir, f), path.join(tessOut, f));
  }
} else console.warn('[prepare-web] übersprungen (fehlt): node_modules/tesseract.js-core');
const deu = findeDatei(path.join(root, 'node_modules', '@tesseract.js-data', 'deu'), 'deu.traineddata.gz');
if (deu) fs.copyFileSync(deu, path.join(tessOut, 'lang', 'deu.traineddata.gz'));
else console.warn('[prepare-web] übersprungen (fehlt): @tesseract.js-data/deu');

console.log(`[prepare-web] ${kopien.length} Dateien nach public/vendor vorbereitet.`);
