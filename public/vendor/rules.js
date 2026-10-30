(function () {
/* Auto-generated from vendor/rules.js */
/**
 * RSD-Regelwerk für die RehaSport-/Funktionstrainings-Verwaltung
 * Quellen (Pflichtmodul „RSD Rehasport für Verantwortliche“, BAR/RSD-Unterlagen):
 *  - Rahmenvereinbarung über den Rehabilitationssport und das Funktionstraining (BAR, 01.01.2022)
 *  - § 43 SGB V i. V. m. § 64 SGB IX, § 20 SGB V (Prävention – strikt getrennt)
 *  - Muster 56 (gültig ab 01.01.2023), G0850/G0851 (DRV), DGUV-Verordnung (ab 01.01.2025)
 *  - DSGVO Art. 9 (Gesundheitsdaten), § 203 StGB / Vertraulichkeit
 *  - Hilfsfristen der Länder (NRW: 8 Minuten, ländliche Gebiete 12 Minuten)
 * Läuft sowohl im Node-Server als auch im Browser/APK-WebView (window.RSD_RULES).
 */
/* eslint-env browser, node */
if (typeof module === 'undefined') { var module = { exports: {} }; }

const HILFSFRISTEN = {
  BW: { text: '10 bis 15 Minuten', min: 10, max: 15 },
  BY: { text: '12 Minuten', min: 12, max: 12 },
  BE: { text: 'bedarfsgerecht', min: 10, max: 15 },
  BB: { text: '15 Minuten', min: 15, max: 15 },
  HB: { text: '10 Minuten', min: 10, max: 10 },
  HH: { text: '8 bis 10 Minuten', min: 8, max: 10 },
  HE: { text: '10 bis 15 Minuten', min: 10, max: 15 },
  MV: { text: '10 Minuten', min: 10, max: 10 },
  NI: { text: 'in 15 Minuten', min: 15, max: 15 },
  NW: { text: '8 Minuten, in ländlichen Bereichen 12 Minuten', min: 8, max: 12 },
  RP: { text: '15 Minuten', min: 15, max: 15 },
  SL: { text: '12 Minuten', min: 12, max: 12 },
  SN: { text: '12 Minuten', min: 12, max: 12 },
  ST: { text: '12 Minuten', min: 12, max: 12 },
  SH: { text: '12 Minuten', min: 12, max: 12 },
  TH: { text: '14 Minuten, in ländlichen Bereichen 17 Minuten', min: 14, max: 17 },
};

const BUNDESLAENDER = [
  ['BW', 'Baden-Württemberg'], ['BY', 'Bayern'], ['BE', 'Berlin'], ['BB', 'Brandenburg'],
  ['HB', 'Bremen'], ['HH', 'Hamburg'], ['HE', 'Hessen'], ['MV', 'Mecklenburg-Vorpommern'],
  ['NI', 'Niedersachsen'], ['NW', 'Nordrhein-Westfalen'], ['RP', 'Rheinland-Pfalz'],
  ['SL', 'Saarland'], ['SN', 'Sachsen'], ['ST', 'Sachsen-Anhalt'], ['SH', 'Schleswig-Holstein'],
  ['TH', 'Thüringen'],
];

/** Arten von Übungsveranstaltungen (Rahmenvereinbarung / Muster 56) */
const ARTEN = {
  rs: {
    label: 'Rehabilitationssport (Trockengymnastik)',
    minDauerMin: 45, maxTN: 15, qmProTN: 5,
    ueeRegel: 50, ueeMaxOhneBegruendung: 50,
    qualifikation: ['uebungsleiter'],
  },
  rsWasser: {
    label: 'Rehabilitationssport im Wasser (Wassergymnastik)',
    minDauerMin: 45, maxTN: 15, qmProTN: 3,
    ueeRegel: 50, ueeMaxOhneBegruendung: 50,
    qualifikation: ['uebungsleiter', 'wasser'],
  },
  rsKinder: {
    label: 'Rehabilitationssport für Kinder',
    minDauerMin: 45, maxTN: 10, qmProTN: 5,
    ueeRegel: 50, ueeMaxOhneBegruendung: 50,
    qualifikation: ['uebungsleiter', 'kinder'],
  },
  rsSchwerstbehindert: {
    label: 'Rehabilitationssport schwerstbehinderter Menschen',
    minDauerMin: 45, maxTN: 7, qmProTN: 5,
    ueeRegel: 50, ueeMaxOhneBegruendung: 50,
    qualifikation: ['uebungsleiter'],
  },
  herzgruppe: {
    label: 'Rehabilitationssport in Herzgruppen (Herzsport)',
    minDauerMin: 60, maxTN: 20, qmProTN: 5,
    ueeRegel: 90, ueeMaxOhneBegruendung: 90,
    qualifikation: ['uebungsleiter', 'herzgruppenleiter'],
    aerztlich: true,
  },
  herzinsuffizienz: {
    label: 'RS in Herzinsuffizienzgruppen',
    minDauerMin: 60, maxTN: 12, qmProTN: 5,
    ueeRegel: 90, ueeMaxOhneBegruendung: 90,
    qualifikation: ['uebungsleiter', 'herzgruppenleiter'],
    aerztlich: true,
  },
  funktionstraining: {
    label: 'Funktionstraining',
    minDauerMin: 45, maxTN: 15, qmProTN: 5,
    ueeRegel: 50, ueeMaxOhneBegruendung: 50,
    qualifikation: ['funktionstraining'],
  },
  gesundheitsbildung: {
    label: 'Gesundheitsbildungsmaßnahme',
    minDauerMin: 45, maxTN: 15, qmProTN: 5,
    ueeRegel: 50, ueeMaxOhneBegruendung: 50,
    qualifikation: ['gesundheitsbildung'],
    bausteine: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'],
  },
};

const QUALIFIKATIONEN = [
  { id: 'uebungsleiter', label: 'Übungsleiter/in Rehabilitationssport (BAR, ab 01.01.2020)' },
  { id: 'herzgruppenleiter', label: 'Herzgruppenleitung (DGPR/Sport in Herzgruppen)' },
  { id: 'wasser', label: 'Rehabilitationssport im Wasser / Wassergymnastik' },
  { id: 'kinder', label: 'Rehabilitationssport mit Kindern und Jugendlichen' },
  { id: 'funktionstraining', label: 'Funktionstraining (physio-/ergotherapiebasiert)' },
  { id: 'gesundheitsbildung', label: 'Gesundheitsbildungsmaßnahmen (Bausteine A–H)' },
  { id: 'orthopaedie', label: 'Fachbereich Orthopädie/Rheumatologie' },
  { id: 'innere', label: 'Fachbereich Innere Medizin' },
  { id: 'neurologie', label: 'Fachbereich Neurologie' },
  { id: 'sensorik', label: 'Fachbereich Sensorik' },
  { id: 'psychiatrie', label: 'Fachbereich Psychiatrie/Psychosomatik' },
  { id: 'geistige', label: 'Geistige Behinderung' },
];

const NOTFALLQUALIFIKATIONEN = [
  { id: 'arzt', label: 'Arzt/Ärztin mit Notfallerfahrung', minuten: 0 },
  { id: 'pa', label: 'Physician Assistant (Notfallmanagement)', minuten: 0 },
  { id: 'notfallsanitaeter', label: 'Notfallsanitäter/in', minuten: 0 },
  { id: 'rettungsassistent', label: 'Rettungsassistent/in', minuten: 0 },
  { id: 'rettungssanitaeter', label: 'Rettungssanitäter/in (mind. 1 Jahr Berufserfahrung)', minuten: 0 },
  { id: 'intensivpflege', label: 'Fachkraft Intensivpflege/Anästhesie', minuten: 0 },
  { id: 'keine', label: 'keine eigene Notfallqualifikation (Absicherung über andere Person)', minuten: null },
];

/** Diagnosen mit Anspruch auf 120 ÜE / 36 Monate (Rahmenvereinbarung Ziffer „Voraussetzungen“) */
const DIAGNOSEN_120 = [
  { label: 'Infantile Zerebralparese', icd: ['P80', 'P81', 'P82'] },
  { label: 'Querschnittlähmung/schwere Lähmungen', icd: ['G81', 'G82', 'G83'] },
  { label: 'Doppelamputation von Gliedmaßen', icd: ['Z89'] },
  { label: 'Organische Hirnschädigung (SHT, Tumor, Infekt, Insult, Blutung, Hypoxie)', icd: ['S06', 'I60', 'I61', 'I62', 'I63', 'I69', 'C71', 'G91', 'P91'] },
  { label: 'Multiple Sklerose', icd: ['G35'] },
  { label: 'Morbus Parkinson', icd: ['G20', 'G21'] },
  { label: 'Morbus Bechterew (Spondylitis ankylosans)', icd: ['M45'] },
  { label: 'Muskeldystrophie', icd: ['G71'] },
  { label: 'Asthma bronchiale', icd: ['J45', 'J46'] },
  { label: 'COPD', icd: ['J44'] },
  { label: 'Mukoviszidose (zystische Fibrose)', icd: ['E84'] },
  { label: 'Polyneuropathie', icd: ['G60', 'G61', 'G62', 'G63', 'G64'] },
  { label: 'Dialysepflichtiges Nierenversagen', icd: ['N18.5', 'N18.6', 'Z99.2'] },
  { label: 'Diabetes mellitus mit Folgeerkrankungen', icd: ['E10', 'E11', 'E13'] },
  { label: 'Schädigungen mentaler Funktionen (Demenz, Intelligenzminderung, Epilepsie)', icd: ['F00', 'F01', 'F02', 'F03', 'F70', 'F71', 'F72', 'F73', 'F74', 'F75', 'F76', 'F77', 'F78', 'F79', 'G40'] },
  { label: 'Erworbene Blindheit (letzte 12 Monate)', icd: ['H54'] },
];

/** Zuordnung ICD-Kapitel → BAR-Fachblöcken (weiche Auswahlhilfe für Trainer-Matching) */
function fachbereicheFuerIcd(icdListe) {
  const bereiche = new Set();
  for (const raw of icdListe || []) {
    const icd = String(raw).trim().toUpperCase();
    if (!icd) continue;
    const ch = icd[0];
    const nr = parseInt(icd.slice(1), 10);
    if (ch === 'M') bereiche.add('orthopaedie');
    else if (ch === 'I') bereiche.add('innere');
    else if (ch === 'G') bereiche.add('neurologie');
    else if (ch === 'H') bereiche.add('sensorik');
    else if (ch === 'J') bereiche.add('innere');
    else if (ch === 'F') { bereiche.add('psychiatrie'); if (/^F0|^F7|^F84/.test(icd)) bereiche.add('geistige'); }
    else if (ch === 'E') bereiche.add('innere');
    else if (ch === 'N') bereiche.add('innere');
    else if (ch === 'C' || ch === 'D') bereiche.add('psychiatrie');
    if (nr === undefined) continue;
  }
  return [...bereiche];
}

function finde120erDiagnosen(icdListe) {
  const treffer = [];
  const codes = (icdListe || []).map((c) => String(c).trim().toUpperCase()).filter(Boolean);
  for (const diag of DIAGNOSEN_120) {
    if (codes.some((c) => diag.icd.some((p) => c === p || c.startsWith(p)))) treffer.push(diag.label);
  }
  return treffer;
}


/* ====================== ICD-10-Regelwerk (Plausibilität Diagnose ↔ Maßnahme) ======================
 * Weiche Auswahlhilfe: Ungültiges Format blockiert, alles andere sind Hinweise.
 * Die ärztliche Diagnose bleibt maßgeblich; Rehasport ist nicht auf Listendiagnosen beschränkt. */
const ICD_FORMAT = /^[A-TV-Z]\d{2}(\.\d{1,2})?[GVZAB!+*†]?$/;
const ICD_BEREICHE = [
  { von: 'I20', bis: 'I25', label: 'Ischämische Herzkrankheit (KHK, Infarkt)', arten: ['herzgruppe', 'rs'], herz: true },
  { von: 'I50', bis: 'I50', label: 'Herzinsuffizienz', arten: ['herzinsuffizienz'], herz: true },
  { von: 'I42', bis: 'I43', label: 'Kardiomyopathie', arten: ['herzgruppe', 'herzinsuffizienz', 'rs'], herz: true },
  { von: 'I05', bis: 'I09', label: 'Rheumatische Herzkrankheit/Klappenfehler', arten: ['herzgruppe', 'rs'], herz: true },
  { von: 'I34', bis: 'I39', label: 'Herzklappenerkrankungen', arten: ['herzgruppe', 'rs'], herz: true },
  { von: 'I44', bis: 'I49', label: 'Herzrhythmusstörungen/Überleitungsstörungen', arten: ['herzgruppe', 'rs'], herz: true },
  { von: 'Z95', bis: 'Z95', label: 'Zustand nach Herzklappen-/Bypass-/Stent-Versorgung', arten: ['herzgruppe', 'rs'], herz: true },
  { von: 'I10', bis: 'I15', label: 'Hypertonie', arten: ['rs', 'herzgruppe'] },
  { von: 'I60', bis: 'I69', label: 'Zerebrovaskuläre Erkrankungen (Schlaganfall)', arten: ['rs'], uee120: true },
  { von: 'I70', bis: 'I79', label: 'Gefäßerkrankungen (z. B. pAVK)', arten: ['rs'] },
  { von: 'M00', bis: 'M25', label: 'Arthropathien (Rheuma, Arthrose)', arten: ['rs', 'rsWasser', 'funktionstraining'] },
  { von: 'M30', bis: 'M36', label: 'Systemerkrankungen des Bindegewebes', arten: ['rs', 'rsWasser', 'funktionstraining'] },
  { von: 'M40', bis: 'M54', label: 'Wirbelsäule/Rücken', arten: ['rs', 'rsWasser', 'funktionstraining'] },
  { von: 'M45', bis: 'M45', label: 'Morbus Bechterew', arten: ['rs', 'rsWasser', 'funktionstraining'], uee120: true },
  { von: 'M60', bis: 'M79', label: 'Weichteilerkrankungen (z. B. Fibromyalgie M79.7)', arten: ['rs', 'rsWasser', 'funktionstraining'] },
  { von: 'M80', bis: 'M85', label: 'Osteoporose/Knochenerkrankungen', arten: ['rs', 'rsWasser', 'funktionstraining'] },
  { von: 'M86', bis: 'M99', label: 'Sonstige Muskel-Skelett-Erkrankungen', arten: ['rs', 'rsWasser'] },
  { von: 'G10', bis: 'G14', label: 'Systematrophien (z. B. Chorea Huntington)', arten: ['rs', 'rsSchwerstbehindert'] },
  { von: 'G20', bis: 'G26', label: 'Morbus Parkinson/Bewegungsstörungen', arten: ['rs'], uee120: true },
  { von: 'G35', bis: 'G37', label: 'Multiple Sklerose/demyelinisierende Erkrankungen', arten: ['rs', 'rsWasser'], uee120: true },
  { von: 'G40', bis: 'G47', label: 'Epilepsie/episodische Störungen', arten: ['rs'], uee120: true },
  { von: 'G50', bis: 'G64', label: 'Nerven-/Polyneuropathien', arten: ['rs'], uee120: true },
  { von: 'G70', bis: 'G73', label: 'Muskelerkrankungen', arten: ['rs'], uee120: true },
  { von: 'G80', bis: 'G83', label: 'Zerebralparese/Lähmungen', arten: ['rs', 'rsKinder', 'rsSchwerstbehindert'], uee120: true },
  { von: 'J40', bis: 'J47', label: 'Chronische Atemwegserkrankungen (COPD, Asthma)', arten: ['rs', 'rsWasser'], uee120: true },
  { von: 'E10', bis: 'E14', label: 'Diabetes mellitus', arten: ['rs'] },
  { von: 'E65', bis: 'E68', label: 'Adipositas', arten: ['rs'] },
  { von: 'E84', bis: 'E84', label: 'Mukoviszidose', arten: ['rs'], uee120: true },
  { von: 'N18', bis: 'N19', label: 'Chronische Niereninsuffizienz', arten: ['rs'] },
  { von: 'C00', bis: 'C97', label: 'Bösartige Neubildungen (onkologischer Rehasport)', arten: ['rs', 'rsWasser'] },
  { von: 'F00', bis: 'F99', label: 'Psychische/Verhaltensstörungen', arten: ['rs'] },
  { von: 'S00', bis: 'T98', label: 'Verletzungen/Unfallfolgen', arten: ['rs', 'rsWasser'] },
  { von: 'Z89', bis: 'Z89', label: 'Amputation von Gliedmaßen', arten: ['rs', 'rsSchwerstbehindert'], uee120: true },
  { von: 'Q00', bis: 'Q99', label: 'Angeborene Fehlbildungen', arten: ['rs', 'rsKinder'] },
  { von: 'H54', bis: 'H54', label: 'Sehbehinderung/Blindheit', arten: ['rs'], uee120: true },
];

function icdZuZahl(code) {
  const m = /^([A-Z])(\d{2})/.exec(String(code).toUpperCase());
  return m ? m[1].charCodeAt(0) * 100 + parseInt(m[2], 10) : null;
}
function findeIcdBereich(code) {
  const z = icdZuZahl(code);
  if (z === null) return null;
  return ICD_BEREICHE.find((b) => z >= icdZuZahl(b.von) && z <= icdZuZahl(b.bis)) || null;
}

/** ICD-10-Liste gegen Format und Maßnahmenart prüfen. */
function pruefeIcd(icdListe, art, uee) {
  const codes = (icdListe || []).map((c) => String(c).trim().toUpperCase()).filter(Boolean);
  const ungueltig = codes.filter((c) => !ICD_FORMAT.test(c));
  const gueltig = codes.filter((c) => ICD_FORMAT.test(c));
  const hinweise = [];
  const bereiche = [];
  let unspezifisch = 0;
  for (const c of gueltig) {
    const b = findeIcdBereich(c);
    if (b) bereiche.push({ code: c, bereich: b });
    else if (/^[RZ]/.test(c)) unspezifisch++;
  }
  if (gueltig.length && unspezifisch === gueltig.length) {
    hinweise.push('Nur unspezifische Symptom-/Zusatzcodes (R/Z) angegeben – ärztlich prüfen lassen, ob eine rehasport-relevante Hauptdiagnose fehlt.');
  }
  const istHerz = art === 'herzgruppe' || art === 'herzinsuffizienz';
  const herzBereiche = bereiche.filter((x) => x.bereich.herz);
  if (istHerz && gueltig.length && !herzBereiche.length) {
    hinweise.push(`Maßnahme „${(ARTEN[art] || {}).label || art}“ gewählt, aber keine kardiale Diagnose (I20–I25, I42–I50, Z95 …) in der ICD-Liste.`);
  }
  if (!istHerz && herzBereiche.length) {
    const herz = herzBereiche.map((x) => x.code).join(', ');
    hinweise.push(`Kardiale Diagnose (${herz}) bei Art „${(ARTEN[art] || {}).label || art}“ – ggf. Herzgruppe/Herzinsuffizienzgruppe verordnet?`);
  }
  if (gueltig.some((c) => /^I50/.test(c)) && art === 'herzgruppe') {
    hinweise.push('Herzinsuffizienz (I50) darf KEINER Herzgruppe zugeordnet werden – Herzinsuffizienzgruppe wählen (Rahmenvereinbarung).');
  }
  const passt = bereiche.some((x) => x.bereich.arten.includes(art));
  if (art && bereiche.length && !passt && !istHerz && !herzBereiche.length) {
    hinweise.push(`ICD-Diagnose(n) (${bereiche.map((x) => x.code).join(', ')}) typischerweise für ${[...new Set(bereiche.flatMap((x) => x.bereich.arten))].map((a) => (ARTEN[a] || {}).label || a).join(' / ')} – gewählte Art prüfen.`);
  }
  if (Number(uee) === 120 && bereiche.length && !bereiche.some((x) => x.bereich.uee120) && !finde120erDiagnosen(gueltig).length) {
    hinweise.push('120 ÜE angegeben, aber keine der ICD-Diagnosen gehört typischerweise zu den schweren Beeinträchtigungen – Begründung/Genehmigung prüfen.');
  }
  return { gueltig, ungueltig, bereiche, hinweise };
}

function parseDatum(s) {
  if (!s) return null;
  const d = new Date(`${s}T00:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function tageZwischen(a, b) {
  if (!a || !b) return null;
  return Math.round((b.getTime() - a.getTime()) / 86400000);
}

function heute() { return new Date(); }

/* ------------------------------------------------------------------ */
/* Vollständigkeitsprüfung der Verordnung (Datenabgleich)             */
/* ------------------------------------------------------------------ */

/**
 * Prüft eine Verordnung gegen die RSD-/BAR-Regeln.
 * @returns {{felder:Array, blockiert:boolean, fehler:Array, hinweise:Array, okProzent:number}}
 */
function pruefeVerordnung(v, ctx = {}) {
  const fehler = [];
  const hinweise = [];
  const felder = []; // {name, ok, text} für die Checkliste im Datenabgleich

  const addFeld = (name, ok, text, blockierend = true) => {
    felder.push({ name, ok, text, blockierend });
    if (!ok) (blockierend ? fehler : hinweise).push(text);
  };

  // --- Formular / Kostenträger ---
  const formularOk = ['muster56', 'g0850', 'dguv'].includes(v.formular);
  addFeld('Formular aktuell', formularOk,
    formularOk ? 'Gültiges Formular (Muster 56 ab 2023, G0850 oder DGUV-Verordnung ab 2025).'
      : 'Kein aktuelles Formular erkannt – Muster 56 (gültig ab 01.01.2023) ist verpflichtend!',
    true);

  // --- Stammdaten ---
  const pflicht = [
    ['Name, Vorname der/des Versicherten', v.name],
    ['Geburtsdatum', v.geburtsdatum],
    ['Krankenkasse/Kostenträger', v.kostentraeger],
    ['Versicherten-Nr.', v.versichertenNr],
    ['Verordnungsdauer „von“', v.von],
    ['Verordnungsdauer „bis“', v.bis],
    ['Art der Maßnahme', v.art],
    ['Frequenz pro Woche', v.frequenzProWoche],
    ['Anzahl Übungseinheiten', v.uebungseinheiten],
    ['Ärztin/Arzt (Name, Stempel, Datum, Unterschrift)', v.arztName],
    ['Diagnose (ICD-10)', Array.isArray(v.icd10) && v.icd10.length ? 'x' : ''],
    ['Ziele/Funktions- und Belastungseinschränkungen', v.ziele],
  ];
  for (const [name, wert] of pflicht) addFeld(name, Boolean(wert && String(wert).trim()), `Pflichtangabe fehlt: ${name}.`, true);

  // --- ICD-10-Regelwerk ---
  if (Array.isArray(v.icd10) && v.icd10.length) {
    const icdP = pruefeIcd(v.icd10, v.art, parseInt(v.uebungseinheiten, 10) || 0);
    addFeld('ICD-10-Format', icdP.ungueltig.length === 0,
      icdP.ungueltig.length ? `Ungültiger ICD-10-Code: ${icdP.ungueltig.join(', ')} (erwartet z. B. M54.5).` : `${icdP.gueltig.length} ICD-10-Code(s) formal gültig.`, true);
    for (const h of icdP.hinweise) addFeld('ICD-10 Plausibilität', false, h, false);
  }

  // --- E-Mail/Telefon (Datenabgleich) ---
  const mailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.email || '');
  addFeld('E-Mail-Adresse', mailOk, mailOk ? 'E-Mail-Adresse gültig.' : 'E-Mail-Adresse fehlt oder ist ungültig.', true);
  const telOk = (v.telefon || '').replace(/[^\d+]/g, '').length >= 6;
  addFeld('Telefonnummer', telOk, telOk ? 'Telefonnummer erfasst.' : 'Telefonnummer fehlt.', true);

  // --- Kostenübernahme muss VOR Beginn vorliegen ---
  const ku = v.kostenuebernahme;
  const kuOk = Boolean(ku && ku.liegtVor && ku.datum);
  addFeld('Kostenübernahme liegt vor', kuOk,
    kuOk ? `Kostenübernahme vom ${ku.datum} dokumentiert (muss vor der 1. Übungseinheit vorliegen).`
      : 'Kostenübernahme der Krankenkasse fehlt – der Beginn ist unzulässig! (Vertragsverstoß „Annahme nicht genehmigter Verordnungen“)',
    true);

  const von = parseDatum(v.von);
  const bis = parseDatum(v.bis);
  const ausstellung = parseDatum(v.ausstellungsdatum);

  // --- Gültigkeit / Beginnfristen ---
  if (von && bis) {
    const monate = (bis.getFullYear() - von.getFullYear()) * 12 + (bis.getMonth() - von.getMonth()) + (bis.getDate() >= von.getDate() ? 0 : -0.5);
    if (monate > 12.5) {
      addFeld('Verordnungsdauer', false, 'Verordnungsdauer über 12 Monate – nicht zulässig (längstens 12 Monate mit ausführlicher Begründung).', true);
    } else if (monate > 6.5) {
      const ok = Boolean((v.dauerBegruendung || '').trim());
      addFeld('Verordnungsdauer > 6 Monate', ok,
        ok ? 'Dauer über 6 Monate – Begründung dokumentiert.'
          : 'Dauer über 6 Monate erfordert eine ausführliche Begründung (Regelfall: 6 Monate).', true);
    } else {
      addFeld('Verordnungsdauer', true, 'Verordnungsdauer im Regelfall (bis 6 Monate).');
    }
    if (bis < von) addFeld('Zeitraum von/bis', false, '„Bis“ liegt vor „von“.', true);
  }
  if (ausstellung && von) {
    const tage = tageZwischen(ausstellung, von);
    if (tage > 92) {
      addFeld('Beginnfrist', false,
        `Beginn erst ${tage} Tage nach Ausstellung – Frist des Kostenträgers (i. d. R. 3 Monate) prüfen!`, false);
    } else {
      addFeld('Beginnfrist', true, 'Beginn innerhalb von 3 Monaten nach Ausstellung.');
    }
  }

  // --- Frequenz ---
  const freq = parseInt(v.frequenzProWoche, 10);
  if (freq >= 3) {
    const ok = Boolean((v.frequenzBegruendung || '').trim());
    addFeld('Frequenz > 2/Woche', ok,
      ok ? '3 Übungsveranstaltungen/Woche – Begründung dokumentiert.'
        : 'Mehr als 2 Übungsveranstaltungen pro Woche nur mit ausführlicher Begründung.', true);
  } else if (freq >= 1) {
    addFeld('Frequenz', true, `${freq}× pro Woche (Regelfall 1–2×).`);
  }

  // --- Übungseinheiten ---
  const artInfo = ARTEN[v.art] || ARTEN.rs;
  const uee = parseInt(v.uebungseinheiten, 10) || 0;
  const istHerz = v.art === 'herzgruppe' || v.art === 'herzinsuffizienz';
  if (uee === 120) {
    const treffer = finde120erDiagnosen(v.icd10);
    const ok = treffer.length > 0 || Boolean((v.ueeBegruendung || '').trim());
    addFeld('120 ÜE / 36 Monate', ok,
      ok ? (treffer.length ? `120 ÜE zulässig (Diagnose: ${treffer.join(', ')}).` : '120 ÜE mit Begründung dokumentiert.')
        : '120 ÜE nur bei den in der Rahmenvereinbarung gelisteten schweren Beeinträchtigungen (bzw. mit Begründung).', true);
  } else if (uee === 90 && istHerz) {
    addFeld('90 ÜE / 24 Monate', true, '90 ÜE im Herzsport (Koronarsport) zulässig.');
  } else if (uee > artInfo.ueeMaxOhneBegruendung) {
    const ok = Boolean((v.ueeBegruendung || '').trim());
    addFeld('Übungseinheiten über Richtwert', ok,
      ok ? 'ÜE über Richtwert – Begründung/Genehmigung dokumentiert.'
        : `${uee} ÜE über dem Richtwert (${artInfo.ueeRegel}) – Genehmigung/Begründung erforderlich.`, true);
  } else if (uee > 0) {
    addFeld('Übungseinheiten', true, `${uee} ÜE im Rahmen der Richtwerte (${artInfo.ueeRegel} ÜE).`);
  } else {
    addFeld('Übungseinheiten', false, 'Anzahl der Übungseinheiten fehlt.', true);
  }

  // --- Folgeverordnung ---
  if (v.folgeverordnung) {
    const ok = Boolean((v.folgeBegruendung || '').trim());
    addFeld('Folgeverordnung begründet', ok,
      ok ? 'Folgeverordnung – Begründung (Selbstständigkeit noch nicht möglich) dokumentiert.'
        : 'Folgeverordnung erfordert die Begründung, warum der/die Versicherte die erlernten Übungen noch nicht selbstständig durchführen kann.', true);
  } else {
    addFeld('Erstverordnung', true, 'Erstverordnung (keine Folgeverordnung).');
  }

  // --- Kostenträger-spezifische Hinweise ---
  if ((v.kostentraegerArt || 'gkv') === 'gkv' && v.formular !== 'muster56') {
    addFeld('Formular GKV', false, 'Für GKV-Versicherte ist das Muster 56 (ab 2023) zwingend – bei Genehmigungsverzicht besonders beachten!', false);
  }
  if (v.art === 'herzinsuffizienz') {
    addFeld('Herzinsuffizienzgruppe', false,
      'Wichtig: Diese/r Versicherte darf NICHT an einer Herzgruppe teilnehmen – Zuordnung nur zur Herzinsuffizienzgruppe!', false);
  }
  if (!v.einwilligung) {
    addFeld('Einwilligung DSGVO', false, 'Einwilligungserklärung (Art. 9 DSGVO) noch nicht dokumentiert – im letzten Schritt einholen.', true);
  }

  const pflichtFelder = felder.filter((f) => f.blockiert);
  const okPflicht = pflichtFelder.filter((f) => f.ok).length;
  const okProzent = pflichtFelder.length ? Math.round((okPflicht / pflichtFelder.length) * 100) : 0;
  return { felder, fehler, hinweise, blockiert: fehler.length > 0, okProzent };
}

/* ------------------------------------------------------------------ */
/* Kurs-/Gruppenprüfung                                                */
/* ------------------------------------------------------------------ */

function pruefeKurs(k, trainer, extra = {}) {
  const fehler = [];
  const hinweise = [];
  const art = ARTEN[k.art] || ARTEN.rs;

  if ((k.dauerMin || 0) < art.minDauerMin) {
    fehler.push(`Mindestdauer: Rehasport benötigt mind. ${art.minDauerMin} Minuten je Übungsveranstaltung${k.art === 'herzgruppe' || k.art === 'herzinsuffizienz' ? ' (Herzgruppe: 60)' : ''}.`);
  }
  const maxTN = k.maxTeilnehmer || art.maxTN;
  if (maxTN > art.maxTN) fehler.push(`Teilnehmerzahl ${maxTN} überschreitet das Maximum von ${art.maxTN} (${art.label}).`);
  if (k.raumflaecheQm) {
    const platz = Math.floor(k.raumflaecheQm / art.qmProTN);
    if (maxTN > platz) fehler.push(`Fläche ${k.raumflaecheQm} qm reicht nur für ${platz} Teilnehmende (${art.qmProTN} qm/Person${art.qmProTN === 3 ? ' im Wasser' : ''}).`);
  } else {
    hinweise.push('Raumfläche nicht hinterlegt – 5 qm pro Teilnehmende(n) (im Wasser 3 qm) sind nachzuweisen.');
  }
  if (trainer) {
    const fehlend = (art.qualifikation || []).filter((q) => !(trainer.qualifikationen || []).includes(q));
    if (fehlend.length) fehler.push(`Trainer/in erfüllt die Qualifikationsanforderung(en) nicht: ${fehlend.join(', ')} (auch für Urlaubs-/Krankheitsvertretung zwingend!).`);
    if (trainer.barAnerkennung !== 'anerkannt') fehler.push('Trainer/in ist nicht als Übungsleiter/in nach BAR/RSD anerkannt bzw. genehmigt.');
    if (trainer.zertifikateBis && parseDatum(trainer.zertifikateBis) && parseDatum(trainer.zertifikateBis) < heute()) {
      fehler.push(`Qualifikationsnachweis ist am ${trainer.zertifikateBis} abgelaufen (Herzgruppen-Nachweise max. 2 Jahre, sonst 4 Jahre).`);
    }
    if ((art.qualifikation || []).includes('herzgruppenleiter') && trainer.zertifikatHerzBis && parseDatum(trainer.zertifikatHerzBis) < heute()) {
      fehler.push(`Herzgruppen-Zertifikat ist am ${trainer.zertifikatHerzBis} abgelaufen (max. 2-jährige Befristung).`);
    }
  } else {
    fehler.push('Keine Übungsleitung zugewiesen.');
  }

  if (art.aerztlich) {
    if (!k.betreuungsArzt || !k.betreuungsArzt.name) fehler.push('Herzgruppe: betreuende/r Ärztin/Arzt muss benannt sein (ständige Anwesenheit bzw. Visitation mind. alle 6 Wochen).');
    if (!k.notfallplan) fehler.push('Herzgruppe: Notfallplan fehlt.');
    if (!k.aed || !k.aed.vorhanden) fehler.push('Herzgruppe: (A)ED nicht dokumentiert.');
    else if (k.aed.wartungAm && tageZwischen(parseDatum(k.aed.wartungAm), heute()) > 180) {
      hinweise.push(`AED-Wartungskontrolle älter als 6 Monate (letzte: ${k.aed.wartungAm}).`);
    }
    if (!k.notfallkoffer) fehler.push('Herzgruppe: Notfallkoffer (DIN-Norm) fehlt.');
    if (k.notfallUebungAm && tageZwischen(parseDatum(k.notfallUebungAm), heute()) > 180) {
      hinweise.push(`Letzte Notfallübung länger als 6 Monate her (${k.notfallUebungAm}) – mind. 2×/Jahr erforderlich.`);
    } else if (!k.notfallUebungAm) {
      hinweise.push('Notfallübungen müssen mindestens 2× jährlich durchgeführt werden.');
    }
    const hf = HILFSFRISTEN[extra.bundesland || 'NW'];
    hinweise.push(`Hilfsfrist ${extra.bundesland || 'NW'}: ${hf.text} – Notfallabsicherung muss darunterliegen.`);
  }
  if (k.technischeGeraete && !(art.aerztlich && k.ergometer)) {
    fehler.push('Technische Geräte (Sequenz-/Seilzug-/Kraftgeräte, Laufband …) sind im Rehasport unzulässig (Ausnahme: Ergometer nur in Herzgruppen).');
  }
  if (k.gemischtMitPraevention) {
    fehler.push('Rehasport darf nicht mit Präventionsangeboten (§ 20 SGB V) in derselben Gruppe vermischt werden.');
  }
  if (k.dauerMin >= 45 && k.zusatzleistungGleichzeitig) {
    fehler.push('Zusatzleistungen (z. B. Gerätetraining) dürfen nicht innerhalb der 45 Minuten Rehasport stattfinden.');
  }
  return { fehler, hinweise, blockiert: fehler.length > 0 };
}

/* ------------------------------------------------------------------ */
/* Trainer-Matching anhand der Verordnung                              */
/* ------------------------------------------------------------------ */

/**
 * Wählt passende Trainer/innen für eine Verordnung aus (harte Filter + Score).
 * @returns Array aus {trainer, score, kann, gruende, passteKurse}
 */
function waehleTrainer(v, trainerListe, kurseListe) {
  const art = ARTEN[v.art] || ARTEN.rs;
  const bedarf = parseInt(v.frequenzProWoche, 10) || 1;
  const fachbereiche = fachbereicheFuerIcd(v.icd10);
  const ergebnisse = [];

  for (const t of trainerListe) {
    if (!t.aktiv) continue;
    const gruende = [];
    const hart = [];
    const quals = t.qualifikationen || [];

    // Harte Filter
    for (const q of art.qualifikation || []) {
      if (!quals.includes(q)) hart.push(`Qualifikation „${q}“ fehlt`);
    }
    if (t.barAnerkennung !== 'anerkannt') hart.push('keine BAR-/RSD-Anerkennung');
    const bis = parseDatum(t.zertifikateBis);
    if (bis && bis < heute()) hart.push(`Zertifikat abgelaufen (${t.zertifikateBis})`);
    if ((art.qualifikation || []).includes('herzgruppenleiter') && t.zertifikatHerzBis && parseDatum(t.zertifikatHerzBis) < heute()) {
      hart.push(`Herzgruppen-Zertifikat abgelaufen (${t.zertifikatHerzBis})`);
    }

    // Kurse dieses Trainers, die zur Verordnungsart passen
    const passteKurse = kurseListe.filter((k) => k.aktiv && k.trainerId === t.id && k.art === v.art);
    if (!passteKurse.length) hart.push('kein passender Kurs (feste Gruppe) in dieser Art');

    // Frequenzabdeckung
    const wochentage = new Set(passteKurse.map((k) => k.wochentag));
    const abdeckung = wochentage.size;
    let score = 0;
    if (hart.length === 0) {
      score += 40;
      gruende.push('Grundqualifikation & Anerkennung erfüllt');
      score += Math.min(abdeckung, bedarf) * 8;
      if (abdeckung >= bedarf) gruende.push(`Frequenzbedarf ${bedarf}×/Woche abgedeckt (${abdeckung} feste Wochentage)`);
      else gruende.push(`Hinweis: nur ${abdeckung}×/Woche verfügbar (Verordnung: ${bedarf}×/Woche)`);
      // Fachbereichs-Bonus
      const fachTreffer = (fachbereiche || []).filter((f) => quals.includes(f));
      score += fachTreffer.length * 6;
      if (fachTreffer.length) gruende.push(`Fachbereich passt zu ICD-10: ${fachTreffer.map((f) => (QUALIFIKATIONEN.find((q) => q.id === f) || {}).label || f).join(', ')}`);
      // Notfallqualifikation (relevant für alle, besonders Herz)
      if (t.notfallqualifikation && t.notfallqualifikation !== 'keine') { score += 5; gruende.push('Notfallqualifikation vorhanden'); }
      if (art.aerztlich && t.notfallqualifikation === 'keine') gruende.push('Hinweis: Herzgruppe zusätzlich ärztliche Betreuung/Notfallabsicherung sicherstellen');
      // Freie Plätze
      const frei = passteKurse.reduce((s, k) => s + Math.max(0, (k.maxTeilnehmer || art.maxTN) - (k.belegt || 0)), 0);
      score += Math.min(frei, 10);
      if (frei === 0) gruende.push('Hinweis: aktuell keine freien Plätze');
      // Restlaufzeit Zertifikat
      if (bis) {
        const monateRest = tageZwischen(heute(), bis) / 30;
        if (monateRest < 6) { gruende.push(`Zertifikat läuft in ${Math.round(monateRest)} Monaten ab`); score -= 5; }
        else score += 3;
      }
      // Zuzahlung/Hinweis Herzinsuffizienz-Grenze
      if (v.art === 'herzinsuffizienz') gruende.push('Nur Herzinsuffizienzgruppe zulässig – keine Herzgruppe!');
    }

    ergebnisse.push({
      trainer: t,
      kann: hart.length === 0,
      hart,
      score: Math.max(0, score),
      gruende,
      passteKurse,
      freiePlaetze: passteKurse.reduce((s, k) => s + Math.max(0, (k.maxTeilnehmer || art.maxTN) - (k.belegt || 0)), 0),
    });
  }
  ergebnisse.sort((a, b) => (b.kann - a.kann) || (b.score - a.score));
  return ergebnisse;
}

/** Prüft, ob ein Kurs zu einer Verordnung zuordenbar ist (feste Gruppe). */
function pruefeKursZuordnung(v, k) {
  const fehler = [];
  const hinweise = [];
  if (k.art !== v.art) {
    if (v.art === 'herzinsuffizienz' && k.art === 'herzgruppe') {
      fehler.push('Zu einer Herzinsuffizienz-Verordnung darf KEINE Herzgruppe gewählt werden (Rahmenvereinbarung).');
    } else {
      fehler.push(`Kursart „${(ARTEN[k.art] || {}).label || k.art}“ passt nicht zur verordneten Art „${(ARTEN[v.art] || {}).label || v.art}“ – Rehasport ist nur in der festen, verordneten Gruppe möglich.`);
    }
  }
  return { fehler, hinweise, blockiert: fehler.length > 0 };
}

module.exports = {
  HILFSFRISTEN, BUNDESLAENDER, ARTEN, QUALIFIKATIONEN, NOTFALLQUALIFIKATIONEN, DIAGNOSEN_120,
  fachbereicheFuerIcd, finde120erDiagnosen, pruefeVerordnung, pruefeKurs, waehleTrainer,
  pruefeKursZuordnung, parseDatum, tageZwischen, ICD_BEREICHE, pruefeIcd, findeIcdBereich,
};
if (typeof window !== 'undefined' && window) window.RSD_RULES = module.exports;



})();
