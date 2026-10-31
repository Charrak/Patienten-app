(function () {
/* Auto-generated from vendor/ocr-parser.js */
/**
 * Verordnungs-Parser für Foto-OCR und PDF417-/Barcode-Inhalte.
 * Läuft im Node-Server, in Tests und im Browser/APK (window.RSD_OCR).
 *
 *  - extrahiereIcd(text)        ICD-10-Codes aus Freitext (inkl. typischer OCR-Verwechslungen)
 *  - parseOcrText(text)         Felder der Verordnung (Muster 56 / G0850 / DGUV) aus OCR-Text
 *  - parseBarcodeText(text)     Inhalt eines PDF417-/Strichcodes (Schlüssel=Wert oder Freitext)
 *
 * Es werden nur Vorschläge erzeugt – alle Werte werden im Datenabgleich geprüft.
 */
/* eslint-env browser, node */
if (typeof module === 'undefined') { var module = { exports: {} }; }

const ICD_FORMAT = /^[A-TV-Z]\d{2}(\.\d{1,2})?[GVZAB!+*†]?$/;

/** Häufige OCR-Verwechslungen in Ziffernpositionen korrigieren (O→0, I/l→1, S→5, B→8) */
function korrigiereZiffern(s) {
  return s.replace(/[OoQD]/g, '0').replace(/[Il|]/g, '1').replace(/S/g, '5').replace(/B/g, '8').replace(/Z/g, '2');
}

function normalisiereIcd(roh) {
  let s = String(roh || '').trim().toUpperCase().replace(/\s+/g, '').replace(/,/g, '.').replace(/[–—]/g, '-');
  if (!s) return '';
  const m = /^([A-Z])([0-9OQDIL|SBZ]{2})(?:\.([0-9OQDIL|SBZ]{1,2}))?([GVZAB!+*†])?$/.exec(s);
  if (!m) return s;
  const [, ch, nn, dec, zusatz] = m;
  return `${ch}${korrigiereZiffern(nn)}${dec ? '.' + korrigiereZiffern(dec) : ''}${zusatz || ''}`;
}

function istIcdFormat(code) { return ICD_FORMAT.test(String(code || '').trim().toUpperCase()); }

/** ICD-10-Codes im Text finden (eindeutig, Reihenfolge erhalten). */
function extrahiereIcd(text) {
  const t = String(text || '');
  const gefunden = [];
  // Kandidaten: Buchstabe + 2 Ziffern (OCR-tolerant) + optional .Ziffern + optionaler Zusatz
  const re = /(?<![A-Za-z0-9])([A-TV-Z])[\s]?([0-9OQDIl|SBZ]{2})(?:[.,]([0-9OQDIl|SBZ]{1,2}))?([GVZAB!+*†])?(?![A-Za-z0-9])/g;
  let m;
  while ((m = re.exec(t)) !== null) {
    const code = `${m[1]}${korrigiereZiffern(m[2])}${m[3] ? '.' + korrigiereZiffern(m[3]) : ''}${m[4] || ''}`;
    if (!istIcdFormat(code)) continue;
    // Ohne Dezimalstelle nur akzeptieren, wenn der Treffer klar als Code dasteht (echte Ziffern, kein reines Wort)
    if (!m[3]) {
      if (!/^[A-Z]\d{2}$/.test(`${m[1]}${m[2]}`)) continue;
      const davor = t.slice(Math.max(0, m.index - 80), m.index);
      if (!/ICD|Diagnose|Diagn\./i.test(davor)) continue;
    }
    if (!gefunden.includes(code)) gefunden.push(code);
  }
  return gefunden;
}

/* ------------------------------------------------------------------ Datumshelfer */
function isoAusDeutsch(tag, monat, jahr) {
  let j = Number(jahr);
  if (j < 100) j += 2000;
  const mm = String(Number(monat)).padStart(2, '0');
  const dd = String(Number(tag)).padStart(2, '0');
  if (Number(monat) < 1 || Number(monat) > 12 || Number(tag) < 1 || Number(tag) > 31) return '';
  return `${j}-${mm}-${dd}`;
}

function findeDaten(text) {
  const liste = [];
  const re = /(?<!\d)(\d{1,2})\s?[.\-/]\s?(\d{1,2})\s?[.\-/]\s?(\d{4}|\d{2})(?!\d)/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    const iso = isoAusDeutsch(m[1], m[2], m[3]);
    if (iso) liste.push({ iso, index: m.index, roh: m[0] });
  }
  return liste;
}

const KASSEN = [
  'AOK', 'Barmer', 'Techniker Krankenkasse', 'TK', 'DAK', 'IKK', 'BKK', 'KKH', 'hkk', 'Knappschaft', 'SBK', 'Mobil Krankenkasse',
  'VIACTIV', 'Audi BKK', 'Debeka', 'Bosch BKK', 'Mhplus', 'Salus BKK', 'BIG direkt', 'Novitas', 'SVLFG', 'Deutsche Rentenversicherung', 'DRV',
  'Berufsgenossenschaft', 'Unfallkasse',
];

function sucheKostentraeger(text) {
  const zeilen = String(text || '').split(/\r?\n/);
  for (const z of zeilen) {
    for (const k of KASSEN) {
      const re = new RegExp(`(?<![A-Za-zÄÖÜäöü])${k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![a-zäöü])`, k === 'TK' || k === 'AOK' ? '' : 'i');
      if (re.test(z)) return z.replace(/\s{2,}/g, ' ').trim().slice(0, 80);
    }
  }
  return '';
}

function sucheArt(text) {
  const t = String(text || '').toLowerCase();
  if (/herzinsuffizienz/.test(t)) return 'herzinsuffizienz';
  if (/herzgruppe|herzsport|koronarsport/.test(t)) return 'herzgruppe';
  if (/wasser/.test(t)) return 'rsWasser';
  if (/funktionstraining/.test(t)) return 'funktionstraining';
  if (/kinder|jugendliche/.test(t) && /rehabilitationssport|rehasport/.test(t)) return 'rsKinder';
  if (/rehabilitationssport|rehasport|rehabilitations-sport/.test(t)) return 'rs';
  return '';
}

/** Felder aus OCR-Text (Freitext, ggf. mit Rauschen) ableiten. */
function parseOcrText(rohText) {
  const text = String(rohText || '').replace(/\u00a0/g, ' ');
  const felder = {};
  const gefunden = [];   // Liste der erkannten Feldnamen (für die Anzeige)

  // Versichertennummer (Buchstabe + 9 Ziffern, z. B. A123456789)
  const vs = /(?<![A-Za-z0-9])([A-Z])\s?(\d{9})(?!\d)/.exec(text);
  if (vs) { felder.versichertenNr = `${vs[1]}${vs[2]}`; gefunden.push('versichertenNr'); }

  // Name: Zeile nach/neben „Name, Vorname“ oder erste „Nachname, Vorname“-Zeile
  let name = '';
  const mName = /(?:Name,?\s*Vorname[^\n]*\n\s*|Name,?\s*Vorname\s*(?:des|der)?\s*(?:Versicherten)?\s*[:\-]?\s*)([A-ZÄÖÜ][\p{L}'\-]+(?:\s[A-ZÄÖÜ][\p{L}'\-]+)?,\s*[A-ZÄÖÜ][\p{L}'\-]+(?:\s[A-ZÄÖÜ][\p{L}'\-]+)?)/u.exec(text);
  if (mName) name = mName[1];
  else {
    const m2 = /(?:^|\n)\s*([A-ZÄÖÜ][\p{L}'\-]+(?:\s[A-ZÄÖÜ][\p{L}'\-]+)?,\s*[A-ZÄÖÜ][\p{L}'\-]+(?:\s[A-ZÄÖÜ][\p{L}'\-]+)?)\s*(?:\n|$)/u.exec(text);
    if (m2) name = m2[1];
  }
  if (name) { felder.name = name.trim(); gefunden.push('name'); }

  // Datumsangaben
  const daten = findeDaten(text);
  const nahe = (stichwort) => {
    const idx = text.search(stichwort);
    if (idx < 0) return null;
    return daten.find((d) => d.index >= idx && d.index - idx < 90) || null;
  };
  const geb = nahe(/geb(?:\.|oren|urtsdatum)?\s*(?:am|datum)?/i);
  if (geb) { felder.geburtsdatum = geb.iso; gefunden.push('geburtsdatum'); }
  const ausg = nahe(/(?:ausgestellt|ausstellung|verordnungsdatum|datum\s+der\s+verordnung|Datum)\b/i);
  const rest = daten.filter((d) => d !== geb);
  if (ausg && ausg !== geb) { felder.ausstellungsdatum = ausg.iso; gefunden.push('ausstellungsdatum'); }
  else if (!geb && daten.length) {
    // ältestes Datum plausibel als Geburtsdatum
    const alt = [...daten].sort((a, b) => a.iso.localeCompare(b.iso))[0];
    if (alt && alt.iso < '2015-01-01') { felder.geburtsdatum = alt.iso; gefunden.push('geburtsdatum'); }
  }
  // Verordnungszeitraum: „von … bis …“ bzw. „Beginn … Ende …“
  const zeitraum = /(?:von|ab|beginn)\D{0,12}(\d{1,2}[.\-/]\d{1,2}[.\-/]\d{2,4})\D{1,25}?(?:bis|ende|-)\D{0,12}(\d{1,2}[.\-/]\d{1,2}[.\-/]\d{2,4})/i.exec(text);
  if (zeitraum) {
    const a = findeDaten(zeitraum[1])[0]; const b = findeDaten(zeitraum[2])[0];
    if (a && b) { felder.von = a.iso; felder.bis = b.iso; gefunden.push('von', 'bis'); }
  }
  if (!felder.ausstellungsdatum) {
    const kandidat = rest.filter((d) => d.iso !== felder.von && d.iso !== felder.bis && d.iso !== felder.geburtsdatum).pop();
    if (kandidat && kandidat.iso >= '2020-01-01') { felder.ausstellungsdatum = kandidat.iso; gefunden.push('ausstellungsdatum'); }
  }

  // Kostenträger, Art, Formular
  const kt = sucheKostentraeger(text);
  if (kt) { felder.kostentraeger = kt; gefunden.push('kostentraeger'); }
  if (/deutsche rentenversicherung|\bDRV\b|G\s?0850/i.test(text)) { felder.kostentraegerArt = 'rv'; felder.formular = 'g0850'; }
  else if (/berufsgenossenschaft|unfallkasse|DGUV/i.test(text)) { felder.kostentraegerArt = 'uv'; felder.formular = 'dguv'; }
  else if (/muster\s?56|rehabilitationssport|funktionstraining/i.test(text)) { felder.formular = 'muster56'; }
  const art = sucheArt(text);
  if (art) { felder.art = art; gefunden.push('art'); }

  // Frequenz und Übungseinheiten
  const mf = /(\d)\s*[x×X]\s*(?:pro|je|\/|in\s+der)?\s*Woche|(\d)\s*(?:mal|-mal)\s*(?:pro|\/|je|in\s+der)?\s*Woche|Wochenfrequenz\D{0,6}(\d)/i.exec(text);
  const freq = mf ? Number(mf[1] || mf[2] || mf[3]) : 0;
  if (freq >= 1 && freq <= 3) { felder.frequenzProWoche = freq; gefunden.push('frequenzProWoche'); }
  const mu = /(\d{2,3})\s*(?:Übungseinheiten|Uebungseinheiten|ÜE|UE|Einheiten)/i.exec(text)
    || /(?:Übungseinheiten|Uebungseinheiten|Anzahl\s+der\s+Einheiten)\D{0,12}(\d{2,3})/i.exec(text);
  if (mu && [10, 12, 18, 20, 24, 30, 36, 40, 45, 50, 60, 90, 120].includes(Number(mu[1]))) {
    felder.uebungseinheiten = Number(mu[1]); gefunden.push('uebungseinheiten');
  }

  // Folgeverordnung
  if (/folgeverordnung/i.test(text) && !/erstverordnung\s*[:\-]?\s*(?:x|\u2612|\u2611|ja)/i.test(text)) {
    const m = /folgeverordnung\s*([☒☑xX✓✔])?/i.exec(text);
    if (m && m[1]) { felder.folgeverordnung = true; gefunden.push('folgeverordnung'); }
  }

  // ICD-10
  const icd = extrahiereIcd(text);
  if (icd.length) { felder.icd10 = icd.slice(0, 8); gefunden.push('icd10'); }

  // Ärztin/Arzt
  const mA = /((?:Dr\.?|Prof\.?)(?:\s*med\.?)?\s+[A-ZÄÖÜ][\p{L}'\-]+(?:\s+[A-ZÄÖÜ][\p{L}'\-]+)?)/u.exec(text);
  if (mA) { felder.arztName = mA[1].trim(); gefunden.push('arztName'); }

  // Ziele / Einschränkungen (Zeile nach Stichwort)
  const mZ = /(?:Ziele?|Funktionseinschr[aä]nkung(?:en)?|Belastungseinschr[aä]nkung(?:en)?|Befund)[^\n:]*[:\-]\s*([^\n]{8,200})/i.exec(text);
  if (mZ) { felder.ziele = mZ[1].trim(); gefunden.push('ziele'); }

  return { felder, gefunden: [...new Set(gefunden)], anzahl: new Set(gefunden).size };
}

/** Inhalt eines PDF417-/Strichcodes interpretieren. */
function parseBarcodeText(rohText) {
  const roh = String(rohText || '').replace(/\u0000/g, '').trim();
  if (!roh) return { felder: {}, format: 'leer', gefunden: [] };

  // 1) Schlüssel=Wert / Schlüssel:Wert, getrennt durch Zeilenumbruch, ; | oder GS/RS/US-Steuerzeichen
  const teile = roh.split(/[\r\n\u001d\u001e\u001f;|]+/).map((s) => s.trim()).filter(Boolean);
  const kv = {};
  let treffer = 0;
  for (const t of teile) {
    const m = /^([A-Za-zÄÖÜäöüß_\-. ]{1,32})\s*[=:]\s*(.+)$/.exec(t);
    if (m) { kv[m[1].trim()] = m[2].trim(); treffer++; }
  }
  const felder = {};
  const gefunden = [];
  if (treffer >= 2) {
    const alias = {
      name: 'name', versicherter: 'name', vname: 'name',
      geburtsdatum: 'geburtsdatum', gebdat: 'geburtsdatum', geb: 'geburtsdatum', dob: 'geburtsdatum',
      kostentraeger: 'kostentraeger', kasse: 'kostentraeger', krankenkasse: 'kostentraeger', kk: 'kostentraeger',
      versichertennummer: 'versichertenNr', versichertennr: 'versichertenNr', vsnr: 'versichertenNr', kvnr: 'versichertenNr',
      ik: 'ik', von: 'von', beginn: 'von', bis: 'bis', ende: 'bis',
      icd: 'icd10', icd10: 'icd10', diagnose: 'icd10', diagnosen: 'icd10',
      arzt: 'arztName', arztname: 'arztName', lanr: 'lanr', bsnr: 'bsnr',
      ausstellungsdatum: 'ausstellungsdatum', datum: 'ausstellungsdatum',
      uebungseinheiten: 'uebungseinheiten', ue: 'uebungseinheiten', frequenz: 'frequenzProWoche', art: 'art',
    };
    for (const [k, v] of Object.entries(kv)) {
      const key = alias[k.toLowerCase().replace(/[\s_.\-]/g, '')];
      if (!key) continue;
      if (key === 'icd10') felder.icd10 = extrahiereIcd(v).length ? extrahiereIcd(v) : String(v).split(/[;,\s]+/).filter(Boolean);
      else if (['geburtsdatum', 'von', 'bis', 'ausstellungsdatum'].includes(key)) {
        const d = /^\d{4}-\d{2}-\d{2}$/.test(v) ? { iso: v } : findeDaten(v)[0] || (/^\d{8}$/.test(v) ? { iso: `${v.slice(0, 4)}-${v.slice(4, 6)}-${v.slice(6, 8)}` } : null);
        if (d) felder[key] = d.iso;
      } else felder[key] = v;
      gefunden.push(key);
    }
    if (gefunden.length) return { felder, format: 'barcode-kv', gefunden: [...new Set(gefunden)] };
  }

  // 2) Freitext-Inhalt: dieselbe Erkennung wie bei OCR
  const o = parseOcrText(roh);
  if (o.anzahl) return { felder: o.felder, format: 'barcode-text', gefunden: o.gefunden };

  // 3) Nichts Verwertbares: Rohinhalt wird im Datenabgleich als Quelltext mitgeführt
  return { felder: {}, format: 'barcode-roh', gefunden: [] };
}

module.exports = { ICD_FORMAT, istIcdFormat, normalisiereIcd, extrahiereIcd, parseOcrText, parseBarcodeText, findeDaten };
if (typeof window !== 'undefined' && window) window.RSD_OCR = module.exports;



})();
