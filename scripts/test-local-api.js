#!/usr/bin/env node
'use strict';
/* Test des lokalen API-Layers (APK-Modus) ohne Browser:
   stubt window/localStorage, lädt lib/rules + lib/ical + public/local-api
   und prüft die Verträge (State, Settings, Verordnung, Abschluss-Gate,
   Kursart-Konflikt, Termine/Signaturen, Abrechnung, ICS, CSV, Outbox). */
const assert = require('assert');
const path = require('path');

global.window = globalThis;
const store = new Map();
window.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => { store.set(k, String(v)); },
  removeItem: (k) => { store.delete(k); },
};
require(path.join(__dirname, '..', 'lib', 'rules.js'));
require(path.join(__dirname, '..', 'lib', 'ical.js'));
require(path.join(__dirname, '..', 'public', 'local-api.js'));

const A = window.localApi;
let okCount = 0;
function ok(name, cond, extra) {
  if (!cond) { console.error(`FAIL  ${name}`, extra !== undefined ? JSON.stringify(extra) : ''); process.exitCode = 1; }
  else { okCount++; console.log(`ok    ${name}`); }
}
async function expectThrow(name, fn, muster) {
  try { await fn(); console.error(`FAIL  ${name} – kein Fehler geworfen`); process.exitCode = 1; }
  catch (e) {
    const treffer = !muster || (e.message || '').includes(muster) || (e.daten && JSON.stringify(e.daten)).includes(muster);
    if (!treffer) { console.error(`FAIL  ${name} – Fehlertext unerwartet: ${e.message}`); process.exitCode = 1; }
    else { okCount++; console.log(`ok    ${name} (Fehler korrekt: ${(e.message || '').slice(0, 90)})`); }
    return e;
  }
}

(async () => {
  /* --- State & Regeln --- */
  const st = await A('GET', '/api/state');
  ok('state.leer + lokalModus', st.lokalModus === true && st.mailKonfiguriert === false && st.trainer.length === 0);
  ok('state.Reglasatz geladen', Boolean(st.regeln && st.regeln.arten && st.regeln.hilfsfristen && st.regeln.diag120));
  ok('hilfsfrist NW bekannt', JSON.stringify(st.regeln.hilfsfristen).includes('8'));

  /* --- Settings --- */
  const su = await A('PUT', '/api/settings', {
    anbieter: { email: 'chef@example.de', name: 'RheaSport Test' },
    fuehrungspersonal: [{ name: 'Führung', email: 'fuehrung@example.de' }],
    bundesland: 'NW', ortLändlich: false,
    abrechnung: { satzMap: { 'gkv:rs': 14.5, 'gkv:herzgruppe': 16.8 } },
  });
  ok('settings PUT gemerkt', su.settings.anbieter.email === 'chef@example.de' && su.settings.bundesland === 'NW');

  /* --- Trainer --- */
  const tr = (await A('POST', '/api/trainer', {
    vorname: 'Toni', nachname: 'Trainer', email: 'toni@example.de',
    qualifikationen: ['uebungsleiter', 'innere'],
    notfallqualifikation: 'rettungssanitaeter', notfallGueltigBis: '2027-12-31',
    zertifikateBis: '2028-12-31', verchwiegenheit: '2026-01-01', datenschutzBelehrung: '2026-01-01',
  })).trainer;
  ok('trainer POST', tr.id.startsWith('tr'));

  /* --- Kurse: passend (rs) + unpassend (herzgruppe) --- */
  const iso = (d) => d.toISOString().slice(0, 10);
  const start = new Date(Date.now() - 42 * 86400000);
  const kursBase = {
    titel: 'RG Trocken', art: 'rs', trainerId: tr.id, ort: 'Sporthalle Nord',
    raumflaecheQm: 120, wochentag: 3, beginn: '17:00', dauerMin: 45,
    maxTeilnehmer: 15, startdatum: iso(start), enddatum: '',
    betreuungsArzt: { name: 'Dr. Arzt', visitationAm: '' },
    notfallplan: true, aed: { vorhanden: true, wartungAm: iso(new Date(Date.now() - 100 * 86400000)) },
    notfallkoffer: true, notfallUebungAm: iso(new Date(Date.now() - 80 * 86400000)),
    technischeGeraete: true, ergometer: true,
  };
  const k1 = (await A('POST', '/api/kurse', kursBase)).kurs;
  const k2 = (await A('POST', '/api/kurse', Object.assign({}, kursBase, { titel: 'Herzgruppe', art: 'herzgruppe', trainerId: tr.id }))).kurs;
  ok('kurse POST', k1.id.startsWith('k') && k2.id.startsWith('k'));

  /* --- Verordnung: Scan (JSON, wie der eigene QR-Code) --- */
  const scan = await A('POST', '/api/verordnungen/scan', {
    code: JSON.stringify({
      rs: '1', n: 'Muster, Max', g: '1960-05-04', kk: 'AOK Nordrhein', vs: 'A123456789',
      von: iso(new Date(Date.now() - 20 * 86400000)), bis: iso(new Date(Date.now() + 160 * 86400000)),
      art: 'rs', f: 2, ue: 50, icd: 'M54.5;M51.1', z: 'Schmerzreduktion, Belastbarkeit',
      arzt: 'Dr. Verordnung', ft: 'muster56',
    }),
  });
  ok('QR-Scan (JSON-Roundtrip)', scan.verordnung.name === 'Muster, Max' && scan.verordnung.art === 'rs'
    && Array.isArray(scan.verordnung.icd10) && scan.verordnung.icd10.length === 2 && scan.wiederholung === false);

  const vid = scan.verordnung.id;
  const basis = {
    ausstellungsdatum: iso(new Date(Date.now() - 30 * 86400000)),
    email: 'max.muster@example.de', telefon: '+49 170 1234567',
    kostenuebernahme: { liegtVor: true, datum: iso(new Date(Date.now() - 25 * 86400000)), zeitraum: '' },
    frequenzBegruendung: '', ueeBegruendung: '', dauerBegruendung: '',
    folgeverordnung: false, folgeBegruendung: '', einwilligung: true,
  };

  /* --- Gate: ohne E-Mail/Telefon muss der Abschluss scheitern --- */
  const scan2 = await A('POST', '/api/verordnungen/scan', {
    code: JSON.stringify({ n: 'Ohne, Kontakt', g: '1970-01-01', kk: 'IK', vs: 'X1', von: '2026-06-01', bis: '2026-08-01', art: 'rs', f: 1, uee: 40, icd: 'M54.5', z: 'x', arzt: 'Dr. X', ft: 'muster56' }),
  });
  await expectThrow('Abschluss-Gate ohne Kontakt (422)',
    () => A('PUT', `/api/verordnungen/${scan2.verordnung.id}`, Object.assign({}, basis, { email: '', telefon: '', abschliessen: true })),
    'nicht vollständig');
  await A('DELETE', `/api/verordnungen/${scan2.verordnung.id}`);

  /* --- Gate: falsche Kursart --- */
  await expectThrow('falsche Kursart -> 422',
    () => A('PUT', `/api/verordnungen/${vid}`, Object.assign({ trainerId: tr.id, kursIds: [k2.id] }, basis)),
    'passt nicht');

  /* --- Vollständiger Abschluss --- */
  const zu = await A('PUT', `/api/verordnungen/${vid}`, Object.assign({ trainerId: tr.id, kursIds: [k1.id] }, basis, {
    anmeldungUnterschrift: 'data:image/png;base64,AAAA', anmeldungDatum: '2026-10-01', abschliessen: true,
  }));
  ok('Abschluss -> aktiv', zu.verordnung.status === 'aktiv');
  ok('zwei Entwurf-E-Mails (mailto-bereit)', zu.mails.length === 2 && zu.mails.every((m) => m.status === 'mailto-bereit'),
    zu.mails.map((m) => m.status));
  const st2 = await A('GET', '/api/state');
  ok('Outbox: Patient + Führungspersonal', st2.outbox.length === 2
    && st2.outbox.some((m) => m.typ === 'patient-termine')
    && st2.outbox.some((m) => m.typ === 'verordnung-vollstaendig'));
  const mt = await A('GET', `/api/outbox/${st2.outbox.find((m) => m.typ === 'patient-termine').id}/mailto`);
  ok('mailto-Link', String(mt.mailto).startsWith('mailto:max.muster@example.de'));

  /* --- Termine: Vergangenheit unterschreiben, Zukunft gesperrt --- */
  const von = iso(new Date(Date.now() - 60 * 86400000));
  const bis = iso(new Date(Date.now() + 60 * 86400000));
  const liste = (await A('GET', `/api/termine?von=${von}&bis=${bis}`)).termine;
  ok('Termine materialisiert (vor & nach heute)', liste.some((t) => t.datum < iso(new Date())) && liste.some((t) => t.datum > iso(new Date())));
  const patientId = st2.verordnungen.find((v) => v.id === vid).patientId;
  const eigene = liste.filter((t) => t.kursId === k1.id); // nur die feste Gruppe der Verordnung
  ok('nur eigene Gruppe geprüft', eigene.length >= 4, eigene.length);
  const zukunft = eigene.find((t) => t.datum > iso(new Date()));
  await expectThrow('Vorab-Signatur in Zukunft gesperrt',
    () => A('POST', `/api/termine/${zukunft.id}/anwesenheit`, { patientId, wahrgenommen: true, unterschriftPng: 'data:image/png;base64,AAAA' }),
    'hat noch nicht stattgefunden');

  const vergangen = eigene.filter((t) => t.datum < iso(new Date())).sort((a, b) => (a.datum < b.datum ? 1 : -1))[0];
  await A('POST', `/api/termine/${vergangen.id}/anwesenheit`, { patientId, wahrgenommen: true, unterschriftPng: 'data:image/png;base64,AAAA' });
  const nachLeitung = await A('PUT', `/api/termine/${vergangen.id}`, { leiterBestaetigung: { name: 'Toni Trainer', unterschriftPng: 'data:image/png;base64,BBBB' } });
  ok('Leiter-Bestätigung -> stattgefunden', nachLeitung.termin.status === 'stattgefunden');
  const ab = await A('GET', '/api/abrechnung');
  ok('erbrachte ÜE = 1 (Satz aus Settings)', ab.zeilen.some((z) => z.id === vid && z.erbrachteUee === 1 && z.satz === 14.5),
    ab.zeilen.find((z) => z.id === vid));

  /* --- Block 1: Stundenlohn, Statistik, Gruppennamen, Abbruch --- */
  await A('PUT', `/api/trainer/${tr.id}`, { stundenlohn: '20,50' });
  const stat = await A('GET', '/api/statistik');
  const trz = stat.trainer.find((z) => z.id === tr.id);
  ok('Statistik: Stundenlohn pro Trainer', trz && trz.stundenlohn === 20.5 && trz.stunden >= 0 && stat.gesamt.trainerkostenPrognose >= stat.gesamt.trainerkosten, trz);
  const sg = await A('PUT', '/api/settings', { gruppennamen: ['Gruppe A', ' ', 'Gruppe B'] });
  ok('Gruppennamen speichern', JSON.stringify(sg.settings.gruppennamen) === JSON.stringify(['Gruppe A', 'Gruppe B']));
  await expectThrow('Abbruch ohne Grund', () => A('POST', `/api/verordnungen/${vid}/abbruch`, { grund: '' }), 'Abbruchgrund');
  await A('POST', `/api/verordnungen/${vid}/abbruch`, { grund: 'Umzug', datum: iso(new Date()) });
  const abAb = await A('GET', '/api/abrechnung');
  const abz = abAb.zeilen.find((z) => z.id === vid);
  ok('Abbruch: Status, Grund, erbrachte ÜE bleiben abrechenbar', abz && abz.status === 'abgebrochen' && abz.abbruch.grund === 'Umzug' && abz.erbrachteUee === 1 && abz.fertig, abz);

  /* --- Block 2: Auto-Abrechnung, Storno, Grund, Vorab-Fenster --- */
  ok('Auto-Abrechnung bei Abbruch (Entwurf + Rechnungsnr.)', abz.abrechnung && abz.abrechnung.auto === true && /^RS-\d{4}-0001$/.test(abz.abrechnung.rechnungsNr) && abz.abrechnung.uee === 1 && abz.status === 'abgebrochen', abz.abrechnung);
  const weitere = eigene.filter((t) => t.datum < iso(new Date()) && t.id !== vergangen.id).sort((a, b) => (a.datum < b.datum ? 1 : -1));
  const w1 = weitere[0], w2 = weitere[1];
  await A('POST', `/api/termine/${w1.id}/anwesenheit`, { patientId, wahrgenommen: true, unterschriftPng: 'data:image/png;base64,AAAA' });
  const sto = await A('POST', `/api/termine/${w1.id}/anwesenheit`, { patientId, unterschriftStorno: true });
  ok('Unterschrift stornieren', !sto.eintrag.unterschriftPng && !sto.eintrag.zeitstempel);
  await expectThrow('Grund zu kurz', () => A('POST', `/api/termine/${w2.id}/anwesenheit`, { patientId, fehlGrund: 'x' }), 'Grund');
  const fg = await A('POST', `/api/termine/${w2.id}/anwesenheit`, { patientId, fehlGrund: 'Krank' });
  ok('Grund des Fehlens speichern', fg.eintrag.fehlGrund && fg.eintrag.fehlGrund.grund === 'Krank');
  const nach = await A('POST', `/api/termine/${w2.id}/anwesenheit`, { patientId, wahrgenommen: true, unterschriftPng: 'data:image/png;base64,AAAA' });
  ok('Nachholen löscht Fehl-Grund', !nach.eintrag.fehlGrund && Boolean(nach.eintrag.unterschriftPng));
  const cfg = await A('PUT', '/api/settings', { unterschrift: { vorabMinuten: 15 }, abrechnung: { automatisch: false } });
  ok('Einstellungen: Vorab-Fenster & Auto-Abrechnung', cfg.settings.unterschrift.vorabMinuten === 15 && cfg.settings.abrechnung.automatisch === false);
  await A('PUT', '/api/settings', { unterschrift: { vorabMinuten: 20 }, abrechnung: { automatisch: true } });

  /* --- CSV / Export / ICS / Testmail --- */
  const csv = await A('GET', '/api/abrechnung/export.csv');
  ok('CSV-Export', csv.dateiname.endsWith('.csv') && csv.csv.includes('ÜE erbracht'));
  const exp = await A('GET', '/api/export');
  ok('JSON-Backup', exp.dateiname.startsWith('rheasport-backup-') && JSON.parse(exp.json).trainer.length === 1);
  const share = await A('GET', '/api/kalender/share');
  ok('Kalender-Share lokal', share.lokalModus === true && share.url === '');
  const ics = await A('GET', `/api/calendar/${st2.settings.kalender.token}.ics`);
  ok('ICS-Export', String(ics.ics).startsWith('BEGIN:VCALENDAR') && ics.ics.includes('X-WR-CALNAME'));
  const tm = await A('POST', '/api/testmail', { an: 'chef@example.de' });
  ok('Testmail-Entwurf', tm.outbox.status === 'mailto-bereit');

  /* --- Matching --- */
  const match = await A('POST', '/api/matching', { verordnung: st2.verordnungen.find((v) => v.id === vid) });
  ok('Trainer-Matching liefert Treffer', Array.isArray(match.treffer) && match.treffer.length >= 1);

  console.log(`\n${okCount} Prüfungen bestanden${process.exitCode ? ', ABER FEHLER VORHANDEN' : ' – Lokalmodus-Tests OK'}.`);
})().catch((e) => { console.error('FEHLER (unerwartet):', e); process.exit(1); });
