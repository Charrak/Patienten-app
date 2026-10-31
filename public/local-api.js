/**
 * RheaSport – Lokaler App-Modus (APK/WebView ohne Server)
 * Implementiert die /api/*-Verträge des Servers vollständig im Browser.
 * Daten: localStorage des Geräts (DSGVO: verlassen das Gerät nicht).
 * E-Mails: als Entwurf („mailto-bereit“) – Versand über das Mail-Programm des Geräts.
 *
 * Verwendet window.RSD_RULES (lib/rules.js) und window.RSD_ICAL (lib/ical.js).
 */
(function () {
  'use strict';
  const R = window.RSD_RULES;
  const ICAL = window.RSD_ICAL;

  const KEY = 'rheasport.db.v1';

  function leeresDb() {
    return {
      meta: { version: 1, angelegtAm: new Date().toISOString(), lokal: true },
      settings: {
        anbieter: { name: 'RheaSport – Physio & fit', strasse: '', plz: '', ort: 'Nordrhein-Westfalen', telefon: '', email: '', ik: '', betriebsstaette: '', traeger: '', iban: '', kontoinhaber: '', bank: '' },
        bundesland: 'NW', ortLändlich: false,
        smtp: { host: '', port: 587, secure: false, user: '', pass: '', from: '' },
        fuehrungspersonal: [],
        datenschutz: { dsbName: '', dsbEmail: '', textVersion: 'Stand ' + new Date().getFullYear() },
        kalender: { titel: 'RheaSport Terminkalender', token: id('tok'), geteilt: true },
        abrechnung: { satzMap: {}, automatisch: true, zaehler: 0, vorlagen: {
          gkv: 'Es werden nur tatsächlich erbrachte Übungseinheiten mit ärztlicher Verordnung und vorliegender Kostenübernahme abgerechnet (Sachleistungsprinzip, § 2 SGB V). Gegenüber gesetzlich Versicherten werden keine Eigenbeteiligungen erhoben.',
          rv: 'Abrechnung gemäß § 15 SGB VI und den Richtlinien der Deutschen Rentenversicherung. Es werden nur tatsächlich erbrachte und dokumentierte Übungseinheiten abgerechnet.',
          uv: 'Abrechnung gemäß § 26 SGB VII (gesetzliche Unfallversicherung/DGUV). Nur erbrachte und ärztlich verordnete Leistungen werden abgerechnet.',
          sonstige: 'Abrechnung gemäß der vertraglichen Vereinbarung. Nur erbrachte und dokumentierte Leistungen werden abgerechnet.',
        } },
        unterschrift: { vorabMinuten: 20 },
        google: { adresse: '', abrechnungEmpfaenger: '' },
        gruppennamen: ['Rehasport Orthopädie', 'Rehasport Wirbelsäule', 'Rehasport Innere Medizin', 'Rehasport Neurologie', 'Herzgruppe', 'Funktionstraining Rheuma', 'Funktionstraining Osteoporose', 'Wassergymnastik'],
      },
      trainer: [], patienten: [], verordnungen: [], kurse: [], termine: [],
      zuordnungen: [], outbox: [], audit: [],
    };
  }

  let db = null;

  function laden() {
    if (db) return db;
    try {
      const roh = window.localStorage.getItem(KEY);
      db = roh ? JSON.parse(roh) : leeresDb();
    } catch (_) { db = leeresDb(); }
    const def = leeresDb();
    for (const k of Object.keys(def)) if (db[k] === undefined) db[k] = def[k];
    db.settings = deepMerge(def.settings, db.settings || {});
    return db;
  }
  function deepMerge(base, extra) {
    const out = Object.assign({}, base);
    for (const [k, v] of Object.entries(extra || {})) {
      out[k] = (v && typeof v === 'object' && !Array.isArray(v) && base[k] && typeof base[k] === 'object' && !Array.isArray(base[k]))
        ? deepMerge(base[k], v) : v;
    }
    return out;
  }
  function speichern() {
    let roh = null;
    try { roh = JSON.stringify(db); window.localStorage.setItem(KEY, roh); } catch (e) { console.warn('Speichern fehlgeschlagen', e); }
    if (roh && typeof window.rheaOnSave === 'function') { try { window.rheaOnSave(roh); } catch (_) { /* Backup ist best effort */ } }
  }
  function id(p) {
    const rand = (window.crypto && window.crypto.getRandomValues)
      ? Array.from(window.crypto.getRandomValues(new Uint8Array(4))).map((b) => b.toString(36)).join('')
      : Math.random().toString(36).slice(2);
    return `${p}_${Date.now().toString(36)}${rand}`;
  }
  function audit(ereignis, details, aktor) {
    const d = laden();
    d.audit.unshift({ id: id('a'), ts: new Date().toISOString(), aktor: aktor || 'system', ereignis, details });
    if (d.audit.length > 1000) d.audit.length = 1000;
    speichern();
  }
  const heutigesDatum = () => new Date().toISOString().slice(0, 10);
  const fmt = (iso) => { if (!iso) return '–'; const [j, m, t] = String(iso).split('-'); return t && m ? `${t}.${m}.${j}` : iso; };
  function zuDatum(iso) { if (!iso) return null; const d = new Date(`${iso}T00:00:00`); return Number.isNaN(d.getTime()) ? null : d; }
  function esc(s) { return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

  /* ------------------------------------------------ Code-Parser (wie Server) */
  const CODE_ALIASE = {
    n: 'name', name: 'name', vn: 'name',
    g: 'geburtsdatum', geb: 'geburtsdatum', geburtsdatum: 'geburtsdatum', dob: 'geburtsdatum',
    kk: 'kostentraeger', kostentraeger: 'kostentraeger', kv: 'kostentraeger',
    vs: 'versichertenNr', vsnr: 'versichertenNr', versichertenNr: 'versichertenNr', ik: 'ikDesKostentraegers',
    von: 'von', beginn: 'von', bis: 'bis', ende: 'bis',
    art: 'art', ma: 'art',
    f: 'frequenzProWoche', freq: 'frequenzProWoche', frequenz: 'frequenzProWoche',
    ue: 'uebungseinheiten', uee: 'uebungseinheiten', uebungseinheiten: 'uebungseinheiten',
    icd: 'icd10', icd10: 'icd10', diag: 'icd10',
    z: 'ziele', ziele: 'ziele',
    arzt: 'arztName', arztname: 'arztName',
    ft: 'formular', formular: 'formular',
    kt: 'kostentraegerArt',
    ku: 'kostenuebernahme', kostenuebernahme: 'kostenuebernahme',
    folge: 'folgeverordnung', folgev: 'folgeverordnung',
    email: 'email', mail: 'email',
    tel: 'telefon', telefon: 'telefon',
    aus: 'ausstellungsdatum', ausstellung: 'ausstellungsdatum',
    b: 'baustein',
  };
  const ART_ALIASE = {
    rs: 'rs', rehasport: 'rs', trocken: 'rs', trockengymnastik: 'rs',
    wasser: 'rsWasser', rsWasser: 'rsWasser', 'rs-wasser': 'rsWasser', wassergymnastik: 'rsWasser',
    kinder: 'rsKinder', rsKinder: 'rsKinder', 'rs-kinder': 'rsKinder',
    schwerst: 'rsSchwerstbehindert', rsSchwerstbehindert: 'rsSchwerstbehindert',
    herz: 'herzgruppe', herzgruppe: 'herzgruppe', herzsport: 'herzgruppe', 'herz-gruppe': 'herzgruppe',
    hi: 'herzinsuffizienz', herzinsuffizienz: 'herzinsuffizienz', 'herzinsuffizienzgruppe': 'herzinsuffizienz',
    ft: 'funktionstraining', funktionstraining: 'funktionstraining',
    gb: 'gesundheitsbildung', gesundheitsbildung: 'gesundheitsbildung',
  };
  function normalisiereRoh(roh) {
    const o = {};
    for (const [k, v] of Object.entries(roh || {})) o[CODE_ALIASE[String(k).toLowerCase()] || k] = v;
    if (o.art) {
      const a = String(o.art).trim().toLowerCase();
      o.art = ART_ALIASE[a] || ART_ALIASE[String(o.art).trim()] || o.art;
      if (!R.ARTEN[o.art]) o.art = 'rs';
    }
    if (typeof o.icd10 === 'string') o.icd10 = o.icd10.split(/[;,|]/).map((s) => s.trim()).filter(Boolean);
    if (typeof o.frequenzProWoche === 'string') o.frequenzProWoche = parseInt(o.frequenzProWoche, 10) || 1;
    if (typeof o.uebungseinheiten === 'string') o.uebungseinheiten = parseInt(o.uebungseinheiten, 10) || 0;
    if (o.folgeverordnung !== undefined) o.folgeverordnung = o.folgeverordnung === true || o.folgeverordnung === '1' || o.folgeverordnung === 'true' || o.folgeverordnung === 'ja';
    if (o.kostenuebernahme) {
      o.kostenuebernahme = typeof o.kostenuebernahme === 'object'
        ? { liegtVor: o.kostenuebernahme.liegtVor !== false, datum: o.kostenuebernahme.datum || heutigesDatum(), zeitraum: o.kostenuebernahme.zeitraum || '' }
        : { liegtVor: true, datum: String(o.kostenuebernahme), zeitraum: '' };
    }
    return o;
  }
  function parseVerordnungsCode(rohText) {
    const roh = String(rohText || '').trim();
    if (!roh) return { quelltext: roh, daten: null, format: 'leer' };
    if (roh.startsWith('{')) {
      try { return { quelltext: roh, daten: normalisiereRoh(JSON.parse(roh)), format: 'json' }; } catch (_) { /* weiter */ }
    }
    if (/^https?:\/\//i.test(roh)) {
      try {
        const u = new URL(roh);
        const obj = {};
        u.searchParams.forEach((v, k) => { obj[k] = v; });
        return { quelltext: roh, daten: normalisiereRoh(obj), format: 'url' };
      } catch (_) { /* weiter */ }
    }
    if (roh.toUpperCase().startsWith('RS56')) {
      const teile = roh.split('|').map((s) => s.trim());
      const felder = ['kennung', 'name', 'geburtsdatum', 'kostentraeger', 'versichertenNr', 'von', 'bis', 'art', 'frequenzProWoche', 'uebungseinheiten', 'icd10', 'arztName'];
      const obj = {};
      felder.forEach((f, i) => { if (teile[i] !== undefined && i > 0) obj[f] = teile[i]; });
      return { quelltext: roh, daten: normalisiereRoh(obj), format: 'rs56' };
    }
    return { quelltext: roh, daten: null, format: 'unbekannt' };
  }

  /* ------------------------------------------------ Termine */
  function materialisiereKurs(kurs, bisDatumIso) {
    const d = laden();
    const bis = zuDatum(bisDatumIso) || new Date(Date.now() + 90 * 86400000);
    const start = zuDatum(kurs.startdatum);
    if (!start || !kurs.wochentag) return 0;
    const vorhanden = new Set(d.termine.filter((t) => t.kursId === kurs.id).map((t) => t.datum));
    let neu = 0;
    for (const c = new Date(start); c <= bis; c.setDate(c.getDate() + 1)) {
      if (c.getDay() !== Number(kurs.wochentag)) continue;
      const iso = `${c.getFullYear()}-${String(c.getMonth() + 1).padStart(2, '0')}-${String(c.getDate()).padStart(2, '0')}`;
      if (kurs.enddatum && iso > kurs.enddatum) break;
      if (vorhanden.has(iso)) continue;
      d.termine.push({
        id: id('t'), kursId: kurs.id, datum: iso, beginn: kurs.beginn || '17:00',
        dauerMin: Number(kurs.dauerMin) || 45, status: 'geplant', dokumentation: '',
        anwesenheit: [], leiterBestaetigung: null, arztvisitation: null,
      });
      vorhanden.add(iso); neu++;
    }
    if (neu) speichern();
    return neu;
  }
  function materialisiereAlle(bisIso) { for (const k of laden().kurse.filter((k) => k.aktiv)) materialisiereKurs(k, bisIso); }
  function kursInfo(kursId) {
    const d = laden();
    const k = d.kurse.find((x) => x.id === kursId);
    if (!k) return null;
    const t = d.trainer.find((x) => x.id === k.trainerId);
    return Object.assign({}, k, { trainerName: t ? `${t.vorname} ${t.nachname}` : '–' });
  }
  function termineFuerPatient(patientId, wochen) {
    const d = laden();
    const kursIds = d.zuordnungen.filter((z) => z.patientId === patientId && z.aktiv !== false).map((z) => z.kursId);
    const heuteIso = heutigesDatum();
    const ziel = new Date(Date.now() + (wochen || 12) * 7 * 86400000).toISOString().slice(0, 10);
    for (const kid of kursIds) { const k = d.kurse.find((x) => x.id === kid); if (k) materialisiereKurs(k, ziel); }
    const liste = [];
    for (const t of d.termine) {
      if (!kursIds.includes(t.kursId)) continue;
      if (t.datum < heuteIso || t.datum > ziel) continue;
      if (t.status === 'ausgefallen') continue;
      const k = kursInfo(t.kursId);
      liste.push(Object.assign({}, t, { kursTitel: k ? k.titel : '', ort: k ? k.ort : '' }));
    }
    liste.sort((a, b) => (a.datum + a.beginn).localeCompare(b.datum + b.beginn));
    return liste;
  }

  /* ------------------------------------------------ E-Mails (lokale Entwürfe) */
  function htmlLayout(a, titel, inhalt) {
    const addr = [a.strasse, [a.plz, a.ort].filter(Boolean).join(' ')].filter(Boolean).join(', ');
    return `<!doctype html><html lang="de"><body style="font-family:Segoe UI,Roboto,Arial,sans-serif;color:#1a2b33;background:#f4f8fa;padding:20px;margin:0">
    <div style="max-width:620px;margin:auto;background:#fff;border:1px solid #dfe9ee;border-radius:12px;padding:24px">
    <div style="font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#7aa">${esc(a.name || 'RheaSport')}</div>
    <h1 style="font-size:18px;color:#0b6b6b;margin:6px 0 12px">${esc(titel)}</h1>
    ${inhalt}
    <div style="font-size:11px;color:#789;border-top:1px solid #e6eef2;margin-top:20px;padding-top:10px">
    ${esc(a.name || '')}${addr ? ' · ' + esc(addr) : ''}${a.telefon ? ' · Tel. ' + esc(a.telefon) : ''}<br>
    Diese Nachricht enthält Gesundheitsdaten (Art. 9 DSGVO) und ist ausschließlich für die/den Adressat/in bestimmt.</div>
    </div></body></html>`;
  }
  function mailTermine(patient, verordnung, termine, a) {
    const zeilen = termine.map((t) => `<tr><td>${fmt(t.datum)}</td><td>${esc(t.beginn)} Uhr</td><td>${t.dauerMin} Min.</td><td>${esc(t.kursTitel || '')}</td><td>${esc(t.ort || '')}</td></tr>`).join('');
    const text = `Guten Tag ${patient.vorname} ${patient.nachname},

hier erhalten Sie Ihre nächsten Rehasport-Termine:

${termine.map((t) => `  ${fmt(t.datum)}  ${t.beginn} Uhr  (${t.dauerMin} Min.)  ${t.kursTitel || ''} – ${t.ort || ''}`).join('\n')}

Hinweise: feste Gruppe, Mindestdauer ${verordnung.art === 'herzgruppe' || verordnung.art === 'herzinsuffizienz' ? '60' : '45'} Min., Unterschrift unmittelbar vor/nach der Einheit, keine Eigenbeteiligungen.
Verordnung: ${verordnung.uebungseinheiten} ÜE, ${verordnung.frequenzProWoche}×/Woche, gültig bis ${fmt(verordnung.bis)}.

${a.name || ''}`;
    const inhalt = `<p>Guten Tag ${esc(patient.vorname)} ${esc(patient.nachname)},</p>
      <p>hier erhalten Sie Ihre nächsten <strong>Rehasport-Termine</strong>:</p>
      <table style="width:100%;border-collapse:collapse;font-size:14px"><tr style="background:#f0f6f7"><th style="padding:6px;text-align:left">Datum</th><th style="padding:6px;text-align:left">Zeit</th><th style="padding:6px;text-align:left">Dauer</th><th style="padding:6px;text-align:left">Kurs</th><th style="padding:6px;text-align:left">Ort</th></tr>${zeilen || '<tr><td colspan="5">–</td></tr>'}</table>
      <ul style="font-size:14px">
        <li><strong>Feste Gruppe</strong> – fester Ort, feste Zeit, feste Übungsleitung.</li>
        <li>Mindestdauer: <strong>${verordnung.art === 'herzgruppe' || verordnung.art === 'herzinsuffizienz' ? '60' : '45'} Minuten</strong>.</li>
        <li>Teilnahme <strong>unmittelbar vor oder nach</strong> der Einheit quittieren.</li>
        <li><strong>Keine Eigenbeteiligungen</strong> (Sachleistungsprinzip, § 2 SGB V).</li>
        <li>${esc(verordnung.uebungseinheiten)} ÜE · ${esc(verordnung.frequenzProWoche)}×/Woche · gültig bis ${fmt(verordnung.bis)}.</li>
      </ul>
      <p>${esc(a.name || '')}</p>`;
    return { betreff: `Ihre Rehasport-Termine – ${a.name || 'RheaSport'}`, text, html: htmlLayout(a, 'Ihre Rehasport-Termine', inhalt) };
  }
  function mailVollstaendig(v, patient, pruefung, zuweisung, a) {
    const okRows = pruefung.felder.map((f) => `<tr><td style="color:${f.ok ? '#0a7d38' : '#a56300'};width:20px">${f.ok ? '✓' : '!'}</td><td>${esc(f.name)}</td><td>${esc(f.text)}</td></tr>`).join('');
    const text = `Sehr geehrte Damen und Herren,

die Verordnung von ${patient.vorname} ${patient.nachname} (geb. ${patient.geburtsdatum}) ist VOLLSTÄNDIG.
Kostenträger: ${v.kostentraeger} · Versicherten-Nr.: ${v.versichertenNr}
Zeitraum: ${fmt(v.von)} – ${fmt(v.bis)} · ${v.uebungseinheiten} ÜE · ${v.frequenzProWoche}×/Woche
Zuweisung: ${zuweisung}
Kostenübernahme: ${v.kostenuebernahme && v.kostenuebernahme.liegtVor ? 'liegt vor (' + v.kostenuebernahme.datum + ')' : 'FEHLT'}
Hinweise: ${pruefung.hinweise.join(' | ') || 'keine'}`;
    const inhalt = `<p>Sehr geehrte Damen und Herren,</p>
      <p>die Verordnung von <strong>${esc(patient.vorname)} ${esc(patient.nachname)}</strong> (geb. ${esc(patient.geburtsdatum)}) ist <strong style="color:#0a7d38">VOLLSTÄNDIG</strong>.</p>
      <table style="width:100%;border-collapse:collapse;font-size:14px">
        <tr><td style="padding:4px 0;color:#6d8894">Kostenträger</td><td>${esc(v.kostentraeger)} · ${esc(v.versichertenNr)}</td></tr>
        <tr><td style="padding:4px 0;color:#6d8894">Zeitraum</td><td>${fmt(v.von)} – ${fmt(v.bis)}</td></tr>
        <tr><td style="padding:4px 0;color:#6d8894">Umfang</td><td>${esc(v.uebungseinheiten)} ÜE · ${esc(v.frequenzProWoche)}×/Woche</td></tr>
        <tr><td style="padding:4px 0;color:#6d8894">Kostenübernahme</td><td style="color:#0a7d38">${v.kostenuebernahme && v.kostenuebernahme.liegtVor ? 'liegt vor (' + fmt(v.kostenuebernahme.datum) + ')' : 'FEHLT'}</td></tr>
        <tr><td style="padding:4px 0;color:#6d8894">Zuweisung</td><td>${esc(zuweisung)}</td></tr>
      </table>
      <h2 style="font-size:14px;color:#0b6b6b">Prüfprotokoll (${pruefung.felder.filter((f) => f.blockiert && f.ok).length}/${pruefung.felder.filter((f) => f.blockiert).length})</h2>
      <table style="width:100%;border-collapse:collapse;font-size:13px">${okRows}</table>
      ${pruefung.hinweise.length ? `<p style="color:#a56300;font-size:13px"><strong>Hinweise:</strong> ${esc(pruefung.hinweise.join(' · '))}</p>` : ''}`;
    return { betreff: `Verordnung vollständig – ${patient.nachname}, ${patient.vorname} (geb. ${patient.geburtsdatum})`, text, html: htmlLayout(a, 'Verordnung vollständig – Bestätigung des Datenabgleichs', inhalt) };
  }
  function sendeMail({ typ, an, betreff, text, html, patientId, verordnungId }) {
    const d = laden();
    const eintrag = {
      id: id('m'), ts: new Date().toISOString(), typ,
      an: Array.isArray(an) ? an : [an], betreff, text, html,
      patientId: patientId || null, verordnungId: verordnungId || null,
      status: 'mailto-bereit', fehler: null,
    };
    d.outbox.unshift(eintrag);
    if (d.outbox.length > 500) d.outbox.length = 500;
    audit('mail-entwurf-erstellt', { betreff, an: eintrag.an });
    speichern();
    return eintrag;
  }
  function sendeTermineMail(patient, verordnung) {
    const a = laden().settings.anbieter;
    if (!verordnung) return sendeMail({ typ: 'patient-termine', an: patient.email, betreff: 'Keine Verordnung', text: 'Bitte zuerst eine Verordnung zuweisen.', html: '<p>Bitte zuerst eine Verordnung zuweisen.</p>', patientId: patient.id });
    const termine = termineFuerPatient(patient.id, 8);
    const m = mailTermine(patient, verordnung, termine, a);
    return sendeMail({ typ: 'patient-termine', an: patient.email, betreff: m.betreff, text: m.text, html: m.html, patientId: patient.id, verordnungId: verordnung.id });
  }
  function sendeVollstaendigMail(v, patient, pruefung, zuweisung) {
    const d = laden();
    const emp = (d.settings.fuehrungspersonal || []).map((f) => f.email).filter(Boolean);
    const ziel = emp.length ? emp : (d.settings.anbieter.email ? [d.settings.anbieter.email] : ['–']);
    const m = mailVollstaendig(v, patient, pruefung, zuweisung, d.settings.anbieter);
    return sendeMail({ typ: 'verordnung-vollstaendig', an: ziel, betreff: emp.length ? m.betreff : `(Kein Empfänger hinterlegt) ${m.betreff}`, text: emp.length ? m.text : 'Bitte in den Einstellungen E-Mail-Adressen des Führungspersonals hinterlegen.', html: m.html, patientId: patient.id, verordnungId: v.id });
  }

  /* ------------------------------------------------ Auswertungen */
  function berechneErbrachteUee(verordnung) {
    const d = laden();
    const kid = d.zuordnungen.filter((z) => z.verordnungId === verordnung.id && (z.aktiv !== false || verordnung.abbruch)).map((z) => z.kursId);
    let n = 0;
    const tage = [];
    for (const t of d.termine) {
      if (!kid.includes(t.kursId)) continue;
      if (t.status !== 'stattgefunden' || !t.leiterBestaetigung) continue;
      const a = (t.anwesenheit || []).find((x) => x.patientId === verordnung.patientId);
      if (a && a.wahrgenommen && (a.unterschriftPng || a.unterschriftPapier)) { n++; tage.push(t.datum); }
    }
    return { uee: n, tage: tage.sort() };
  }
  /** Erstellt (bei aktivierter Einstellung) automatisch einen Abrechnungsentwurf mit Rechnungsnummer,
   *  sobald eine Verordnung fertig erbracht oder abgebrochen ist. Entwürfe werden bis zum Status
   *  „abgerechnet“ mit der aktuellen Zahl erbrachter ÜE nachgeführt. */
  function autoAbrechnen(d) {
    const cfg = d.settings.abrechnung || {};
    if (!cfg.automatisch) return 0;
    const heuteIso = heutigesDatum();
    let n = 0;
    for (const v of d.verordnungen) {
      if (!['aktiv', 'abgeschlossen', 'abgebrochen'].includes(v.status)) continue;
      if (v.abrechnung && !v.abrechnung.auto) continue; // manuell angelegt -> nicht anfassen
      const { uee } = berechneErbrachteUee(v);
      if (!uee) continue;
      const fertig = v.status === 'abgebrochen'
        ? Boolean(v.abbruch && v.abbruch.datum <= heuteIso)
        : ((v.uebungseinheiten > 0 && uee >= v.uebungseinheiten) || Boolean(v.bis && v.bis < heuteIso));
      if (!fertig) continue;
      const satz = (v.abrechnung && v.abrechnung.satz) || (cfg.satzMap || {})[`${v.kostentraegerArt || 'gkv'}:${v.art}`] || 0;
      if (v.abrechnung && v.abrechnung.auto) {
        if (v.abrechnung.uee !== uee || v.abrechnung.satz !== satz) { v.abrechnung.uee = uee; v.abrechnung.satz = satz; n++; }
        continue;
      }
      cfg.zaehler = (Number(cfg.zaehler) || 0) + 1;
      d.settings.abrechnung = cfg;
      v.abrechnung = {
        satz, satzQuelle: satz ? 'Vorgabe (Einstellungen)' : 'nicht hinterlegt', berechnetAm: heuteIso,
        rechnungsNr: `RS-${heuteIso.slice(0, 4)}-${String(cfg.zaehler).padStart(4, '0')}`, uee, auto: true,
      };
      audit('abrechnung-automatisch', { verordnungId: v.id, uee, grund: v.status === 'abgebrochen' ? 'abbruch' : 'abschluss' }, 'system');
      n++;
    }
    return n;
  }
  function dashboard() {
    const d = laden();
    const heuteIso = heutigesDatum();
    materialisiereAlle(new Date(Date.now() + 60 * 86400000).toISOString().slice(0, 10));
    const offeneAbgleiche = d.verordnungen.filter((v) => v.status === 'abgleich');
    const aktive = d.verordnungen.filter((v) => v.status === 'aktiv' || v.status === 'vollstaendig');
    const termineHeute = d.termine.filter((t) => t.datum === heuteIso && t.status !== 'ausgefallen');
    const ausstehendSignatur = [];
    for (const t of termineHeute) {
      const k = kursInfo(t.kursId);
      if (!k) continue;
      for (const z of d.zuordnungen.filter((z) => z.kursId === t.kursId && z.aktiv !== false)) {
        const a = (t.anwesenheit || []).find((x) => x.patientId === z.patientId);
        if (!a || !(a.unterschriftPng || a.unterschriftPapier)) {
          const p = d.patienten.find((x) => x.id === z.patientId);
          if (p) ausstehendSignatur.push({ terminId: t.id, patient: `${p.nachname}, ${p.vorname}`, kurs: k.titel, datum: t.datum });
        }
      }
    }
    const jetzt = new Date();
    const zertifikatWarnungen = d.trainer.filter((t) => t.aktiv && t.zertifikateBis && zuDatum(t.zertifikateBis) && (zuDatum(t.zertifikateBis) - jetzt) / 86400000 < 90)
      .map((t) => ({ trainer: `${t.vorname} ${t.nachname}`, bis: t.zertifikateBis }));
    const visitationWarnungen = [];
    for (const k of d.kurse.filter((k) => k.aktiv && (k.art === 'herzgruppe' || k.art === 'herzinsuffizienz'))) {
      let letzte = d.termine.filter((t) => t.kursId === k.id && t.arztvisitation).map((t) => t.arztvisitation.datum).sort().pop();
      const kf = k.betreuungsArzt && k.betreuungsArzt.visitationAm;
      if (kf && (!letzte || kf > letzte)) letzte = kf;
      if (!letzte || (jetzt - zuDatum(letzte)) / 86400000 > 42) visitationWarnungen.push({ kurs: k.titel, letzte: letzte || 'nie', noetig: true });
      else if ((jetzt - zuDatum(letzte)) / 86400000 > 28) visitationWarnungen.push({ kurs: k.titel, letzte, noetig: false });
    }
    const abrechnungBereit = [];
    for (const v of aktive) {
      const { uee } = berechneErbrachteUee(v);
      if (uee >= (v.uebungseinheiten || 0) || (v.bis && v.bis < heuteIso && uee > 0)) abrechnungBereit.push({ id: v.id, uee });
    }
    const hf = R.HILFSFRISTEN[d.settings.bundesland || 'NW'];
    return {
      zaehler: {
        patienten: d.patienten.length, trainer: d.trainer.filter((t) => t.aktiv).length,
        kurse: d.kurse.filter((k) => k.aktiv).length,
        aktiveVerordnungen: aktive.length, offeneAbgleiche: offeneAbgleiche.length,
        termineHeute: termineHeute.length, abrechnungBereit: abrechnungBereit.length,
        signaturenOffen: ausstehendSignatur.length,
      },
      offeneAbgleiche: offeneAbgleiche.map((v) => ({ id: v.id, name: v.name || v.patientId, von: v.von })),
      termineHeute: termineHeute.map((t) => Object.assign({}, t, { kurs: (kursInfo(t.kursId) || {}).titel })),
      ausstehendSignatur: ausstehendSignatur.slice(0, 20),
      zertifikatWarnungen, visitationWarnungen, abrechnungBereit,
      hilfsfrist: { text: hf.text, bundesland: d.settings.bundesland || 'NW', laendlich: Boolean(d.settings.ortLändlich) },
      smtp: false, lokalModus: true,
    };
  }
  function zuordnungsText(v) {
    const d = laden();
    const kursIds = v.kursIds || d.zuordnungen.filter((z) => z.verordnungId === v.id && z.aktiv !== false).map((z) => z.kursId);
    const t = d.trainer.find((x) => x.id === v.trainerId);
    const teile = kursIds.map((kid) => (kursInfo(kid) || {}).titel).filter(Boolean);
    return `${t ? t.vorname + ' ' + t.nachname : '–'} · ${teile.join(' + ') || 'kein Kurs'}`;
  }
  function mailtoLink(e) {
    const to = (e.an || []).join(',');
    return `mailto:${to}?subject=${encodeURIComponent(e.betreff)}&body=${encodeURIComponent(e.text || '')}`;
  }
  function err(msg, daten) { const e = new Error(msg); e.lokal = true; if (daten) e.daten = daten; return e; }

  /* ------------------------------------------------ Router */
  async function localApi(methode, url, body) {
    const d = laden();
    const [pfad] = String(url).split('?');
    const p = pfad.split('/').filter(Boolean); // ['api', ...]
    const m = methode.toUpperCase();
    const seg = p.slice(1); // ohne 'api'
    const [res, id1, id2] = seg;

    /* ---- State / Dashboard ---- */
    if (res === 'state' && m === 'GET') {
      if (autoAbrechnen(d)) speichern();
      const def = leeresDb();
      return {
        ok: true,
        settings: deepMerge(def.settings, d.settings),
        trainer: d.trainer, patienten: d.patienten,
        verordnungen: d.verordnungen.map((v) => Object.assign({}, v, { pruefung: R.pruefeVerordnung(v), erbrachteUee: berechneErbrachteUee(v).uee })),
        kurse: d.kurse, termine: d.termine, zuordnungen: d.zuordnungen,
        outbox: d.outbox, audit: d.audit.slice(0, 200),
        regeln: {
          arten: R.ARTEN, qualifikationen: R.QUALIFIKATIONEN,
          notfallqualifikationen: R.NOTFALLQUALIFIKATIONEN, bundeslaender: R.BUNDESLAENDER,
          hilfsfristen: R.HILFSFRISTEN, diag120: R.DIAGNOSEN_120.map((x) => x.label),
        },
        kursPruefungen: Object.fromEntries(d.kurse.map((k) => [k.id, R.pruefeKurs(k, d.trainer.find((t) => t.id === k.trainerId), { bundesland: d.settings.bundesland })])),
        mailKonfiguriert: false, lokalModus: true,
      };
    }
    if (res === 'dashboard' && m === 'GET') return { ok: true, dashboard: dashboard() };

    /* ---- Einstellungen ---- */
    if (res === 'settings' && m === 'PUT') {
      const b = body || {};
      if (b.anbieter) Object.assign(d.settings.anbieter, b.anbieter);
      if (b.smtp) { const pass = b.smtp.pass === '••••••' ? d.settings.smtp.pass : b.smtp.pass; Object.assign(d.settings.smtp, b.smtp, { pass }); }
      if (b.fuehrungspersonal) d.settings.fuehrungspersonal = b.fuehrungspersonal;
      if (b.datenschutz) Object.assign(d.settings.datenschutz, b.datenschutz);
      if (b.kalender) Object.assign(d.settings.kalender, b.kalender);
      if (b.abrechnung) Object.assign(d.settings.abrechnung, b.abrechnung);
      if (b.google) d.settings.google = Object.assign({}, d.settings.google || {}, { adresse: String(b.google.adresse || '').trim(), abrechnungEmpfaenger: String(b.google.abrechnungEmpfaenger || '').trim() });
      if (b.unterschrift) d.settings.unterschrift = Object.assign({}, d.settings.unterschrift || {}, { vorabMinuten: Math.min(60, Math.max(0, Number(b.unterschrift.vorabMinuten) || 0)) });
      if (Array.isArray(b.gruppennamen)) d.settings.gruppennamen = b.gruppennamen.map((x) => String(x).trim()).filter(Boolean);
      if (b.bundesland) d.settings.bundesland = b.bundesland;
      if (b.ortLändlich !== undefined) d.settings.ortLändlich = Boolean(b.ortLändlich);
      speichern(); audit('einstellungen-geaendert', { keys: Object.keys(b) });
      return { ok: true, settings: deepMerge(leeresDb().settings, d.settings) };
    }

    /* ---- Trainer ---- */
    if (res === 'trainer') {
      if (m === 'POST') {
        const b = body || {};
        if (!b.vorname || !b.nachname) throw err('Vor- und Nachname sind erforderlich.');
        const t = {
          id: id('tr'), vorname: b.vorname, nachname: b.nachname, email: b.email || '', telefon: b.telefon || '',
          stundenlohn: Number(String(b.stundenlohn || 0).replace(',', '.')) || 0,
          qualifikationen: b.qualifikationen || ['uebungsleiter'],
          zertifikateBis: b.zertifikateBis || '', zertifikatHerzBis: b.zertifikatHerzBis || '',
          notfallqualifikation: b.notfallqualifikation || 'keine', notfallGueltigBis: b.notfallGueltigBis || '',
          barAnerkennung: b.barAnerkennung || 'anerkannt', rsdMitglied: Boolean(b.rsdMitglied),
          verchwiegenheit: b.verchwiegenheit || '', datenschutzBelehrung: b.datenschutzBelehrung || '',
          bemerkung: b.bemerkung || '', aktiv: b.aktiv !== false, angelegtAm: new Date().toISOString(),
          farbe: b.farbe || '',
        };
        d.trainer.push(t); speichern(); audit('trainer-angelegt', { id: t.id });
        return { ok: true, trainer: t };
      }
      if (m === 'PUT') {
        const t = d.trainer.find((x) => x.id === id1);
        if (!t) throw err('Trainer nicht gefunden.', null, 404);
        const keys = Object.keys(body || {});
        if (body && body.stundenlohn !== undefined) body.stundenlohn = Number(String(body.stundenlohn).replace(',', '.')) || 0;
        Object.assign(t, body, { id: t.id });
        speichern(); audit('trainer-geaendert', { id: t.id, keys });
        return { ok: true, trainer: t };
      }
      if (m === 'DELETE') {
        const t = d.trainer.find((x) => x.id === id1);
        if (!t) throw err('Trainer nicht gefunden.');
        if (d.kurse.some((k) => k.trainerId === t.id)) { t.aktiv = false; speichern(); audit('trainer-deaktiviert', { id: t.id }); return { ok: true, deaktiviert: true }; }
        d.trainer = d.trainer.filter((x) => x.id !== t.id);
        speichern(); audit('trainer-geloescht', { id: t.id });
        return { ok: true };
      }
    }

    /* ---- Kurse ---- */
    if (res === 'kurse') {
      if (m === 'POST') {
        const b = body || {};
        if (!b.titel || !b.art || !b.trainerId || !b.wochentag || !b.beginn || !b.startdatum) throw err('Titel, Art, Übungsleitung, Wochentag, Beginn und Startdatum sind erforderlich.');
        const k = {
          id: id('k'), titel: b.titel, art: b.art, trainerId: b.trainerId, ort: b.ort || '',
          raumflaecheQm: Number(b.raumflaecheQm) || 0,
          wochentag: Number(b.wochentag), beginn: b.beginn,
          dauerMin: Number(b.dauerMin) || R.ARTEN[b.art].minDauerMin,
          maxTeilnehmer: Number(b.maxTeilnehmer) || R.ARTEN[b.art].maxTN,
          startdatum: b.startdatum, enddatum: b.enddatum || '',
          betreuungsArzt: b.betreuungsArzt || null,
          notfallplan: Boolean(b.notfallplan), aed: b.aed || { vorhanden: false, wartungAm: '' },
          notfallkoffer: Boolean(b.notfallkoffer), notfallUebungAm: b.notfallUebungAm || '',
          technischeGeraete: Boolean(b.technischeGeraete), ergometer: Boolean(b.ergometer),
          gemischtMitPraevention: Boolean(b.gemischtMitPraevention), zusatzleistungGleichzeitig: Boolean(b.zusatzleistungGleichzeitig),
          bemerkung: b.bemerkung || '', aktiv: true, angelegtAm: new Date().toISOString(),
        };
        const trainer = d.trainer.find((x) => x.id === k.trainerId);
        const pr = R.pruefeKurs(k, trainer, { bundesland: d.settings.bundesland });
        d.kurse.push(k);
        if (!pr.blockiert) materialisiereKurs(k, new Date(Date.now() + 90 * 86400000).toISOString().slice(0, 10));
        speichern(); audit('kurs-angelegt', { id: k.id, fehler: pr.fehler });
        return { ok: true, kurs: k, pruefung: pr };
      }
      if (m === 'PUT') {
        const k = d.kurse.find((x) => x.id === id1);
        if (!k) throw err('Kurs nicht gefunden.');
        const b = body || {};
        Object.assign(k, b, { id: k.id });
        const trainer = d.trainer.find((x) => x.id === k.trainerId);
        const pr = R.pruefeKurs(k, trainer, { bundesland: d.settings.bundesland });
        if (!pr.blockiert && k.aktiv) materialisiereKurs(k, new Date(Date.now() + 90 * 86400000).toISOString().slice(0, 10));
        speichern(); audit('kurs-geaendert', { id: k.id });
        return { ok: true, kurs: k, pruefung: pr };
      }
      if (m === 'DELETE') {
        const k = d.kurse.find((x) => x.id === id1);
        if (!k) throw err('Kurs nicht gefunden.');
        if (d.zuordnungen.some((z) => z.kursId === k.id && z.aktiv !== false)) { k.aktiv = false; speichern(); audit('kurs-deaktiviert', { id: k.id }); return { ok: true, deaktiviert: true }; }
        d.kurse = d.kurse.filter((x) => x.id !== k.id);
        d.termine = d.termine.filter((t) => t.kursId !== k.id);
        speichern(); audit('kurs-geloescht', { id: k.id });
        return { ok: true };
      }
    }

    /* ---- Patienten ---- */
    if (res === 'patienten') {
      if (m === 'POST' && !id1) {
        const b = body || {};
        if (!b.vorname || !b.nachname || !b.geburtsdatum) throw err('Vorname, Nachname und Geburtsdatum sind erforderlich.');
        const dup = d.patienten.find((p) => p.nachname.toLowerCase() === b.nachname.toLowerCase() && p.vorname.toLowerCase() === b.vorname.toLowerCase() && p.geburtsdatum === b.geburtsdatum);
        if (dup) throw err(`Patient/in existiert bereits (ID ${dup.id}).`);
        const p = {
          id: id('p'), vorname: b.vorname, nachname: b.nachname, geburtsdatum: b.geburtsdatum,
          geschlecht: b.geschlecht || '', strasse: b.strasse || '', plz: b.plz || '', ort: b.ort || '',
          email: b.email || '', telefon: b.telefon || '', einwilligung: b.einwilligung || null,
          bemerkung: b.bemerkung || '', angelegtAm: new Date().toISOString(),
          angelegtVon: b.angelegtVon || '',
        };
        d.patienten.push(p); speichern(); audit('patient-angelegt', { id: p.id, angelegtVon: p.angelegtVon }, 'rezeption');
        return { ok: true, patient: p };
      }
      if (m === 'PUT') {
        const p = d.patienten.find((x) => x.id === id1);
        if (!p) throw err('Patient nicht gefunden.');
        const b = Object.assign({}, body);
        if (b.einwilligung) { p.einwilligung = b.einwilligung; audit('einwilligung-dokumentiert', { patientId: p.id }, 'rezeption'); delete b.einwilligung; }
        Object.assign(p, b, { id: p.id });
        speichern(); audit('patient-geaendert', { id: p.id }, 'rezeption');
        return { ok: true, patient: p };
      }
      if (m === 'GET' && id2 === 'termine') {
        const p = d.patienten.find((x) => x.id === id1);
        if (!p) throw err('Patient nicht gefunden.');
        return { ok: true, termine: termineFuerPatient(p.id, 16) };
      }
      if (m === 'GET' && id2 === 'anwesenheit') {
        const p = d.patienten.find((x) => x.id === id1);
        if (!p) throw err('Patient nicht gefunden.');
        const kid = d.zuordnungen.filter((z) => z.patientId === p.id && (z.aktiv !== false || z.abgebrochenAm)).map((z) => z.kursId);
        const liste = d.termine.filter((t) => kid.includes(t.kursId) && (t.anwesenheit || []).some((a) => a.patientId === p.id))
          .map((t) => {
            const a = t.anwesenheit.find((x) => x.patientId === p.id);
            return { datum: t.datum, beginn: t.beginn, status: t.status, kurs: (kursInfo(t.kursId) || {}).titel, wahrgenommen: a.wahrgenommen, zeitstempel: a.zeitstempel, unterschrift: Boolean(a.unterschriftPng), unterschriftPng: a.unterschriftPng || null, unterschriftPapier: Boolean(a.unterschriftPapier), leiter: Boolean(t.leiterBestaetigung), fehlGrund: a.fehlGrund || null };
          }).sort((a, b) => b.datum.localeCompare(a.datum));
        return { ok: true, anwesenheit: liste };
      }
      if (m === 'POST' && id2 === 'termine-mail') {
        const p = d.patienten.find((x) => x.id === id1);
        if (!p) throw err('Patient nicht gefunden.');
        if (!p.email) throw err('Keine E-Mail-Adresse hinterlegt.');
        const v = d.verordnungen.find((x) => x.patientId === p.id && ['aktiv', 'vollstaendig', 'abgeschlossen'].includes(x.status));
        return { ok: true, outbox: sendeTermineMail(p, v) };
      }
    }

    /* ---- Verordnungen ---- */
    if (res === 'verordnungen') {
      if (id1 === 'scan' && m === 'POST') {
        let parsed = parseVerordnungsCode((body && body.code) || '');
        if (!parsed.daten && body && body.manuell && body.format) parsed = { quelltext: String(body.quelltext || ''), daten: null, format: body.format };
        const daten = parsed.daten || (body && body.manuell && typeof body.manuell === 'object' ? normalisiereRoh(body.manuell) : {});
        const art = daten.art && R.ARTEN[daten.art] ? daten.art : 'rs';
        const v = {
          id: id('v'),
          quelle: (parsed.format === 'unbekannt' || parsed.format === 'leer') ? 'manuell' : 'scan',
          codeFormat: parsed.format, codeQuelltext: (parsed.quelltext || '').slice(0, 4000),
          formular: daten.formular || 'muster56',
          name: daten.name || '', geburtsdatum: daten.geburtsdatum || '',
          kostentraeger: daten.kostentraeger || '', kostentraegerArt: daten.kostentraegerArt || 'gkv',
          versichertenNr: daten.versichertenNr || '', ik: daten.ik || '',
          ausstellungsdatum: daten.ausstellungsdatum || '',
          von: daten.von || '', bis: daten.bis || '', art,
          frequenzProWoche: daten.frequenzProWoche || 1,
          frequenzBegruendung: '', uebungseinheiten: daten.uebungseinheiten || R.ARTEN[art].ueeRegel,
          ueeBegruendung: '', dauerBegruendung: '',
          icd10: daten.icd10 || [], ziele: daten.ziele || '',
          folgeverordnung: Boolean(daten.folgeverordnung), folgeBegruendung: '',
          baustein: daten.baustein || '', arztName: daten.arztName || '',
          kostenuebernahme: daten.kostenuebernahme || { liegtVor: false, datum: '', zeitraum: '' },
          email: daten.email || '', telefon: daten.telefon || '',
          patientId: null, trainerId: '', kursIds: [], einwilligung: false,
          status: 'abgleich', angelegtAm: new Date().toISOString(),
        };
        const bestehend = d.verordnungen.find((x) => x.status === 'abgleich' && x.codeQuelltext && x.codeQuelltext === v.codeQuelltext && v.codeQuelltext);
        if (bestehend) return { ok: true, verordnung: bestehend, wiederholung: true, pruefung: R.pruefeVerordnung(bestehend) };
        d.verordnungen.push(v); speichern(); audit('verordnung-gescannt', { id: v.id, format: parsed.format }, 'rezeption');
        return { ok: true, verordnung: v, pruefung: R.pruefeVerordnung(v), wiederholung: false };
      }
      if (m === 'POST' && !id1) {
        const b = body || {};
        if (!b.name && !b.patientId) throw err('Pflichtangaben fehlen.');
        const neu = {
          id: id('v'), quelle: 'manuell', codeFormat: 'manuell', codeQuelltext: '',
          status: 'abgleich', angelegtAm: new Date().toISOString(),
          formular: b.formular || 'muster56', art: b.art || 'rs', icd10: b.icd10 || [],
          kursIds: [], trainerId: '', einwilligung: false,
          kostenuebernahme: { liegtVor: false, datum: '', zeitraum: '' },
        };
        Object.assign(neu, b, { id: neu.id });
        d.verordnungen.push(neu); speichern(); audit('verordnung-angelegt', { id: neu.id }, 'rezeption');
        return { ok: true, verordnung: neu, pruefung: R.pruefeVerordnung(neu) };
      }
      if (m === 'GET' && !id1) {
        return { ok: true, verordnungen: d.verordnungen.map((v) => Object.assign({}, v, berechneErbrachteUee(v) && { erbrachteUee: berechneErbrachteUee(v).uee, erbrachteTage: berechneErbrachteUee(v).tage })) };
      }
      if (m === 'PUT') {
        const v = d.verordnungen.find((x) => x.id === id1);
        if (!v) throw err('Verordnung nicht gefunden.');
        const b = body || {};
        const vorher = { trainerId: v.trainerId, kursIds: v.kursIds };
        const erlaubt = ['name', 'geburtsdatum', 'kostentraeger', 'kostentraegerArt', 'versichertenNr', 'ik',
          'ausstellungsdatum', 'von', 'bis', 'art', 'frequenzProWoche', 'frequenzBegruendung',
          'uebungseinheiten', 'ueeBegruendung', 'dauerBegruendung', 'icd10', 'ziele', 'folgeverordnung',
          'folgeBegruendung', 'baustein', 'arztName', 'kostenuebernahme', 'email', 'telefon',
          'formular', 'trainerId', 'kursIds', 'patientId', 'status'];
        for (const k of erlaubt) if (b[k] !== undefined) v[k] = b[k];

        let patient = d.patienten.find((p) => p.id === v.patientId);
        if (!patient && b.abschliessen === true && b.anlegen !== false && v.name && v.geburtsdatum) {
          const [nach, vor] = String(v.name).split(',').map((s) => s.trim());
          const dup = d.patienten.find((p) => p.nachname.toLowerCase() === (nach || '').toLowerCase() && p.vorname.toLowerCase() === (vor || '').toLowerCase() && p.geburtsdatum === v.geburtsdatum);
          if (dup) { patient = dup; v.patientId = dup.id; }
          else {
            patient = {
              id: id('p'), vorname: vor || '', nachname: nach || '', geburtsdatum: v.geburtsdatum,
              strasse: '', plz: '', ort: '', email: v.email || '', telefon: v.telefon || '',
              einwilligung: b.einwilligung || null, bemerkung: '', angelegtAm: new Date().toISOString(),
              angelegtVon: b.angelegtVon || 'Datenabgleich',
            };
            d.patienten.push(patient); v.patientId = patient.id;
            audit('patient-im-datenabgleich-angelegt', { patientId: patient.id }, 'rezeption');
          }
        } else if (patient && (b.email !== undefined || b.telefon !== undefined || b.einwilligung)) {
          if (b.email !== undefined) patient.email = b.email;
          if (b.telefon !== undefined) patient.telefon = b.telefon;
          if (b.einwilligung) patient.einwilligung = b.einwilligung;
        }
        if (b.anmeldungUnterschrift) {
          v.anmeldung = { datum: b.anmeldungDatum || heutigesDatum(), unterschriftPng: b.anmeldungUnterschrift, ts: new Date().toISOString() };
          if (patient && !patient.einwilligung && b.einwilligung) patient.einwilligung = b.einwilligung;
        }
        if (b.einwilligung) { v.einwilligung = true; v.einwilligungAm = new Date().toISOString(); if (patient) patient.einwilligung = b.einwilligung; }

        if (b.kursIds !== undefined) {
          const unpassend = (b.kursIds || []).map((kid) => d.kurse.find((k) => k.id === kid)).filter((k) => k && R.pruefeKursZuordnung(v, k).blockiert);
          if (unpassend.length) {
            const msg = unpassend.flatMap((k) => R.pruefeKursZuordnung(v, k).fehler).join(' · ');
            const e = err(msg, { ok: false, fehler: msg, pruefung: R.pruefeVerordnung(v), verordnung: v });
            e.status = 422; throw e;
          }
          const vorhanden = d.zuordnungen.filter((z) => z.verordnungId === v.id);
          for (const z of vorhanden) z.aktiv = (b.kursIds || []).includes(z.kursId);
          for (const kid of b.kursIds || []) {
            if (!vorhanden.some((z) => z.kursId === kid)) {
              d.zuordnungen.push({ id: id('z'), verordnungId: v.id, patientId: v.patientId, kursId: kid, seit: heutigesDatum(), aktiv: true });
            }
          }
          if (b.gruppenwechselGrund) audit('gruppenwechsel', { verordnungId: v.id, grund: b.gruppenwechselGrund, von: vorher.kursIds, auf: b.kursIds }, 'rezeption');
          v.kursIds = b.kursIds;
        }

        const pruefung = R.pruefeVerordnung(v);
        const kursFe = [];
        for (const kid of v.kursIds || []) {
          const k = d.kurse.find((x) => x.id === kid);
          if (k) kursFe.push(...R.pruefeKursZuordnung(v, k).fehler);
        }

        let mails = [];
        if (b.abschliessen === true) {
          const gesamt = [...pruefung.fehler, ...kursFe];
          if (gesamt.length) {
            speichern();
            const e = err('Verordnung ist noch nicht vollständig.', { ok: false, fehler: 'Verordnung ist noch nicht vollständig.', pruefung: Object.assign({}, pruefung, { fehler: gesamt }), verordnung: v });
            e.status = 422; throw e;
          }
          if (!patient) throw err('Kein Patient angelegt.');
          if (!(v.kursIds || []).length) throw err('Keine feste Gruppe (Kurs) zugeordnet.');
          v.status = 'aktiv';
          v.vollstaendigAm = new Date().toISOString();
          audit('verordnung-vollstaendig', { verordnungId: v.id, zuweisung: zuordnungsText(v) }, 'rezeption');
          for (const kid of v.kursIds) { const k = d.kurse.find((x) => x.id === kid); if (k) materialisiereKurs(k, new Date(Date.now() + 60 * 86400000).toISOString().slice(0, 10)); }
          speichern();
          mails.push(sendeTermineMail(patient, v));
          mails.push(sendeVollstaendigMail(v, patient, pruefung, zuordnungsText(v)));
        } else {
          speichern();
        }
        audit('verordnung-geaendert', { verordnungId: v.id, keys: Object.keys(b) }, 'rezeption');
        return { ok: true, verordnung: v, pruefung: R.pruefeVerordnung(v), kurseFehler: kursFe, mails };
      }
      if (m === 'DELETE') {
        const v = d.verordnungen.find((x) => x.id === id1);
        if (!v) throw err('Verordnung nicht gefunden.');
        if (v.status === 'aktiv') throw err('Aktive Verordnungen können nicht gelöscht werden (Nachvollziehbarkeit).');
        d.verordnungen = d.verordnungen.filter((x) => x.id !== v.id);
        d.zuordnungen = d.zuordnungen.filter((z) => z.verordnungId !== v.id);
        speichern(); audit('verordnung-geloescht', { id: v.id }, 'rezeption');
        return { ok: true };
      }
      if (m === 'POST' && id2 === 'abbruch') {
        const v = d.verordnungen.find((x) => x.id === id1);
        if (!v) throw err('Verordnung nicht gefunden.');
        const b = body || {};
        const grund = String(b.grund || '').trim();
        if (grund.length < 3) throw err('Bitte einen Abbruchgrund angeben.');
        if (v.status === 'abgerechnet' || v.status === 'abgebrochen') throw err('Verordnung ist bereits abgerechnet bzw. abgebrochen.');
        v.abbruch = { grund, datum: b.datum || heutigesDatum(), ts: new Date().toISOString() };
        v.statusVorAbbruch = v.status; v.status = 'abgebrochen';
        for (const z of d.zuordnungen.filter((x) => x.verordnungId === v.id)) { z.aktiv = false; z.abgebrochenAm = v.abbruch.datum; }
        /* Kalendereinträge nach Abbruchdatum als ausgefallen markieren */
        const abbruchDatum = v.abbruch.datum;
        const kidAbbruch = d.zuordnungen.filter((z) => z.verordnungId === v.id).map((z) => z.kursId);
        let termineGeloescht = 0;
        for (const t of d.termine) {
          if (!kidAbbruch.includes(t.kursId)) continue;
          if (t.datum > abbruchDatum && t.status === 'geplant') {
            t.status = 'ausgefallen';
            t.ausgefallenGrund = `Maßnahme abgebrochen am ${abbruchDatum}: ${grund}`;
            termineGeloescht++;
          }
        }
        autoAbrechnen(d);
        speichern(); audit('verordnung-abgebrochen', { verordnungId: v.id, grund, termineStorniert: termineGeloescht }, 'rezeption');
        return { ok: true, verordnung: v, termineStorniert: termineGeloescht };
      }
      if (m === 'POST' && id2 === 'abrechnung') {
        const v = d.verordnungen.find((x) => x.id === id1);
        if (!v) throw err('Verordnung nicht gefunden.');
        const b = body || {};
        /* Vergütungssatz beibehalten wenn er schon existiert (nicht durch Träger/Leistungsänderung überschreiben) */
        const alterSatz = v.abrechnung && v.abrechnung.satz;
        const neuerSatz = b.satz !== undefined && b.satz !== '' ? Number(b.satz) : alterSatz;
        const satzQuelle = b.satzQuelle || (alterSatz && neuerSatz === alterSatz && v.abrechnung.satzQuelle) || 'manuell';
        v.abrechnung = Object.assign({}, v.abrechnung || {}, {
          satz: neuerSatz || 0, satzQuelle,
          berechnetAm: heutigesDatum(), rechnungsNr: b.rechnungsNr || (v.abrechnung && v.abrechnung.rechnungsNr) || '',
          uee: berechneErbrachteUee(v).uee,
        });
        if (b.abrechnen) v.status = 'abgerechnet';
        if (b.bezahlt !== undefined) {
          v.abrechnung.bezahlt = Boolean(b.bezahlt);
          v.abrechnung.bezahltAm = b.bezahlt ? heutigesDatum() : null;
          v.abrechnung.bezahltNotiz = b.bezahltNotiz || '';
          if (b.bezahlt) v.status = 'bezahlt';
        }
        speichern(); audit('abrechnung-dokumentiert', { verordnungId: v.id, satz: v.abrechnung.satz, bezahlt: v.abrechnung.bezahlt }, 'buchhaltung');
        return { ok: true, verordnung: v };
      }
      if (m === 'GET' && id2 === 'qrcode.png') {
        // PNG-Rendering übernimmt das Frontend (qrcode-generator); hier der Payload:
        const v = d.verordnungen.find((x) => x.id === id1);
        if (!v) throw err('Verordnung nicht gefunden.');
        return { ok: true, payload: JSON.stringify({ rs: '1', n: v.name, g: v.geburtsdatum, kk: v.kostentraeger, vs: v.versichertenNr, von: v.von, bis: v.bis, art: v.art, f: v.frequenzProWoche, ue: v.uebungseinheiten, icd: (v.icd10 || []).join(','), z: v.ziele, arzt: v.arztName, ft: v.formular, id: v.id }) };
      }
    }

    /* ---- Matching ---- */
    if (res === 'matching' && m === 'POST') {
      const v = body && body.verordnung;
      if (!v) throw err('Keine Verordnungsdaten.');
      const belegung = {};
      for (const z of d.zuordnungen.filter((z) => z.aktiv !== false)) belegung[z.kursId] = (belegung[z.kursId] || 0) + 1;
      const kurse = d.kurse.map((k) => Object.assign({}, k, { belegt: belegung[k.id] || 0 }));
      return { ok: true, treffer: R.waehleTrainer(v, d.trainer, kurse) };
    }

    /* ---- Termine ---- */
    if (res === 'termine') {
      if (m === 'GET' && !id1) {
        const q = new URLSearchParams(String(url).split('?')[1] || '');
        const von = q.get('von') || new Date().toISOString().slice(0, 10);
        const bis = q.get('bis') || new Date(Date.now() + 90 * 86400000).toISOString().slice(0, 10);
        materialisiereAlle(bis);
        const liste = d.termine.filter((t) => t.datum >= von && t.datum <= bis).map((t) => {
          const k = kursInfo(t.kursId) || {};
          const teilnehmer = d.zuordnungen.filter((z) => z.kursId === t.kursId && z.aktiv !== false).map((z) => {
            const p = d.patienten.find((x) => x.id === z.patientId) || {};
            const a = (t.anwesenheit || []).find((x) => x.patientId === z.patientId) || {};
            return { patientId: z.patientId, name: `${p.nachname || '?'}, ${p.vorname || ''}`, wahrgenommen: Boolean(a.wahrgenommen), unterschrift: Boolean(a.unterschriftPng), zeitstempel: a.zeitstempel || null, verordnungId: z.verordnungId, vorab: Boolean(a.vorab), papier: Boolean(a.unterschriftPapier), fehlGrund: a.fehlGrund || null };
          });
          return Object.assign({}, t, { kurs: { id: k.id, titel: k.titel, art: k.art, ort: k.ort, trainerName: k.trainerName, beginn: k.beginn, dauerMin: k.dauerMin, wochentag: k.wochentag, betreuungsArzt: k.betreuungsArzt }, teilnehmer });
        });
        return { ok: true, termine: liste };
      }
      if (m === 'PUT' && id1) {
        const t = d.termine.find((x) => x.id === id1);
        if (!t) throw err('Termin nicht gefunden.');
        const b = body || {};
        if (b.status) t.status = b.status;
        if (b.dokumentation !== undefined) t.dokumentation = b.dokumentation;
        if (b.arztvisitation) t.arztvisitation = Object.assign({}, b.arztvisitation, { ts: new Date().toISOString() });
        if (b.leiterBestaetigung) {
          const name = typeof b.leiterBestaetigung === 'object' ? b.leiterBestaetigung.name : b.leiterBestaetigung;
          t.leiterBestaetigung = {
            name: name || '',
            unterschriftPng: (typeof b.leiterBestaetigung === 'object' && b.leiterBestaetigung.unterschriftPng) || null,
            ts: new Date().toISOString(),
          };
          if (t.status === 'geplant') t.status = 'stattgefunden';
          audit('teilnahmebestaetigung-leitung', { terminId: t.id });
          autoAbrechnen(d);
        }
        if (b.neuesDatum || b.neueBeginn) {
          t.status = 'verschoben';
          t.neuesDatum = b.neuesDatum || '';
          t.neueBeginn = b.neueBeginn || '';
          audit('termin-verschoben', { terminId: t.id, auf: `${t.neuesDatum} ${t.neueBeginn}` });
        }
        speichern();
        return { ok: true, termin: t };
      }
      if (m === 'POST' && id2 === 'anwesenheit') {
        const t = d.termine.find((x) => x.id === id1);
        if (!t) throw err('Termin nicht gefunden.');
        const b = body || {};
        const { patientId } = b;
        if (!patientId) throw err('Patient fehlt.');
        if (!d.zuordnungen.some((z) => z.kursId === t.kursId && z.patientId === patientId && (z.aktiv !== false || (z.abgebrochenAm && t.datum <= z.abgebrochenAm)))) {
          throw err('Patient/in ist nicht Teil dieser festen Gruppe.');
        }
        const [h, mnt] = String(t.beginn || '00:00').split(':').map(Number);
        const start = new Date(`${t.datum}T${String(h).padStart(2, '0')}:${String(mnt).padStart(2, '0')}:00`);
        const ende = new Date(start.getTime() + (t.dauerMin || 45) * 60000);
        const jetzt = new Date();
        const abgeschlossen = jetzt >= ende || t.status === 'stattgefunden';
        const vorabMin = Math.max(0, Number((d.settings.unterschrift || {}).vorabMinuten ?? 20));
        const fruehestens = new Date(start.getTime() - vorabMin * 60000);
        const unterschreibt = Boolean(b.unterschriftPng || b.unterschriftPapier || b.wahrgenommen === true);
        if (unterschreibt && !abgeschlossen && jetzt < fruehestens) {
          throw err(vorabMin > 0
            ? `Die Übungseinheit hat noch nicht stattgefunden. Unterschriften sind frühestens ${vorabMin} Minuten vor Kursbeginn möglich (ab ${fruehestens.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })} Uhr). Vorab-Eintragungen davor sind laut Rahmenvereinbarung unzulässig.`
            : 'Die Übungseinheit hat noch nicht stattgefunden. Teilnahme/Unterschrift ist laut Rahmenvereinbarung unmittelbar vor oder nach der Übungseinheit zu dokumentieren – Vorab-Eintragungen sind unzulässig.');
        }
        let eintrag = (t.anwesenheit || []).find((x) => x.patientId === patientId);
        if (!eintrag) { eintrag = { patientId, wahrgenommen: false, unterschriftPng: null, zeitstempel: null }; t.anwesenheit = t.anwesenheit || []; t.anwesenheit.push(eintrag); }
        if (b.wahrgenommen !== undefined) eintrag.wahrgenommen = Boolean(b.wahrgenommen);
        const vorab = jetzt < start;
        const nachgeholt = jetzt.getTime() - ende.getTime() > 6 * 3600000;
        if (b.unterschriftPng) { eintrag.unterschriftPng = b.unterschriftPng; eintrag.unterschriftPapier = false; eintrag.zeitstempel = jetzt.toISOString(); eintrag.vorab = vorab; eintrag.nachgeholt = nachgeholt; delete eintrag.fehlGrund; audit('teilnehmerunterschrift', { terminId: t.id, patientId, vorab, nachgeholt }, 'teilnehmer'); }
        if (b.unterschriftPapier) { eintrag.unterschriftPapier = true; eintrag.zeitstempel = jetzt.toISOString(); eintrag.vorab = vorab; eintrag.nachgeholt = nachgeholt; delete eintrag.fehlGrund; audit('teilnehmerunterschrift-papier', { terminId: t.id, patientId, nachgeholt }, 'leitung'); }
        if (b.unterschriftLoeschen) { eintrag.unterschriftPng = null; eintrag.unterschriftPapier = false; eintrag.zeitstempel = null; eintrag.vorab = false; audit('unterschrift-korrigiert', { terminId: t.id, patientId }, 'leitung'); }
        if (b.unterschriftStorno) {
          const war = eintrag.vorab;
          eintrag.unterschriftPng = null; eintrag.unterschriftPapier = false; eintrag.zeitstempel = null; eintrag.vorab = false;
          if (war) eintrag.wahrgenommen = false; // Vorab-Unterschrift storniert -> Teilnahme wieder offen
          audit('unterschrift-storniert', { terminId: t.id, patientId, vorab: Boolean(war) }, 'leitung');
        }
        if (b.fehlGrund !== undefined) {
          const g = String(b.fehlGrund || '').trim();
          if (g) {
            if (g.length < 3) throw err('Bitte einen Grund für die fehlende Unterschrift angeben.');
            eintrag.fehlGrund = { grund: g, ts: jetzt.toISOString() };
            audit('unterschrift-fehlt-grund', { terminId: t.id, patientId, grund: g }, 'leitung');
          } else delete eintrag.fehlGrund;
        }
        speichern();
        return { ok: true, termin: t, eintrag };
      }
    }

    /* ---- Abrechnung ---- */
    if (res === 'abrechnung') {
      if (m === 'GET' && !id1) {
        const heuteIso = heutigesDatum();
        const zeilen = [];
        for (const v of d.verordnungen) {
          if (!['aktiv', 'abgeschlossen', 'abgerechnet', 'abgebrochen', 'bezahlt'].includes(v.status)) continue;
          const { uee, tage } = berechneErbrachteUee(v);
          const fertig = uee >= (v.uebungseinheiten || 0) || (v.bis && v.bis < heuteIso) || v.status === 'abgebrochen';
          const patient = d.patienten.find((p) => p.id === v.patientId) || {};
          const trainer = v.trainerId ? d.trainer.find((t) => t.id === v.trainerId) : null;
          const art = R.ARTEN[v.art] || {};
          const key = `${v.kostentraegerArt || 'gkv'}:${v.art}`;
          const satzVorgaben = (d.settings.abrechnung && d.settings.abrechnung.satzMap) || {};
          /* Vergütungssatz: gespeicherter Satz hat Vorrang (bleibt bei Träger/Leistungsänderung erhalten) */
          const satz = (v.abrechnung && v.abrechnung.satz) || satzVorgaben[key] || 0;
          const offen = (v.status === 'abgerechnet' || (fertig && uee > 0)) && !(v.abrechnung && v.abrechnung.bezahlt);
          zeilen.push({
            id: v.id, status: v.status, fertig, erbrachteUee: uee, geplanteUee: v.uebungseinheiten || 0,
            patientId: v.patientId,
            patient: `${patient.nachname || v.name || '?'}, ${patient.vorname || ''}`,
            trainerName: trainer ? `${trainer.vorname} ${trainer.nachname}` : '',
            trainerId: v.trainerId || '',
            kostentraeger: v.kostentraeger, kostentraegerArt: v.kostentraegerArt || 'gkv',
            art: v.art, artLabel: art.label || v.art, von: v.von, bis: v.bis,
            letzterTermin: tage.length ? tage[tage.length - 1] : null,
            satz, betrag: satz ? Math.round(satz * uee * 100) / 100 : null,
            abrechnung: v.abrechnung || null, abbruch: v.abbruch || null,
            offen, bezahlt: Boolean(v.abrechnung && v.abrechnung.bezahlt),
            hinweis: !fertig && v.bis && v.bis < heuteIso ? 'Verordnung abgelaufen – erbrachte ÜE abrechnen, Rest verfällt.' : '',
          });
        }
        return { ok: true, zeilen, satzMap: (d.settings.abrechnung && d.settings.abrechnung.satzMap) || {}, quelle: 'https://verguetungssaetze.rehasport-deutschland.de/' };
      }
      if (m === 'GET' && id1 === 'export.csv') {
        const rows = [['Rechnungsnr', 'Patient', 'Geb.', 'Kostenträger', 'Art', 'Verordnung von', 'bis', 'ÜE erbracht', 'Satz EUR', 'Betrag EUR', 'Status', 'Bezahlt', 'abgerechnet am', 'Abbruchgrund']];
        for (const v of d.verordnungen) {
          if (!['aktiv', 'abgeschlossen', 'abgerechnet', 'abgebrochen', 'bezahlt'].includes(v.status)) continue;
          const { uee } = berechneErbrachteUee(v);
          const p = d.patienten.find((x) => x.id === v.patientId) || {};
          const satz = (v.abrechnung && v.abrechnung.satz) || 0;
          rows.push([(v.abrechnung && v.abrechnung.rechnungsNr) || '', `${p.nachname || ''}, ${p.vorname || ''}`, p.geburtsdatum || '', v.kostentraeger || '',
            (R.ARTEN[v.art] || {}).label || v.art, v.von || '', v.bis || '', uee, satz, satz ? (satz * uee).toFixed(2) : '',
            v.status, v.abrechnung && v.abrechnung.bezahlt ? 'ja' : 'nein', (v.abrechnung && v.abrechnung.berechnetAm) || '', (v.abbruch && v.abbruch.grund) || '']);
        }
        const csv = '﻿' + rows.map((r) => r.map((z) => `"${String(z ?? '').replace(/"/g, '""')}"`).join(';')).join('\r\n');
        return { ok: true, csv, dateiname: 'rehasport-abrechnung.csv' };
      }
    }

    /* ---- Statistik (Monat, Trainer-Verdienst, Einnahmen) ---- */
    if (res === 'statistik' && m === 'GET') {
      const q = new URLSearchParams(String(url).split('?')[1] || '');
      const monat = /^\d{4}-\d{2}$/.test(q.get('monat') || '') ? q.get('monat') : heutigesDatum().slice(0, 7);
      const [jj, mm] = monat.split('-').map(Number);
      const von = `${monat}-01`, bis = `${monat}-${String(new Date(jj, mm, 0).getDate()).padStart(2, '0')}`;
      materialisiereAlle(bis);
      const heuteIso = heutigesDatum();
      const satzMap = (d.settings.abrechnung && d.settings.abrechnung.satzMap) || {};
      const satzFuer = (v) => (v && ((v.abrechnung && v.abrechnung.satz) || satzMap[`${v.kostentraegerArt || 'gkv'}:${v.art}`])) || 0;
      const zeilen = new Map(d.trainer.map((t) => [t.id, { id: t.id, name: `${t.vorname} ${t.nachname}`, aktiv: t.aktiv !== false, stundenlohn: Number(t.stundenlohn) || 0, termine: 0, stunden: 0, geplantTermine: 0, geplantStunden: 0, ausgefallen: 0, unbestaetigt: 0 }]));
      let teilnahmen = 0, einnahmen = 0, einnahmenGeplant = 0;
      for (const t of d.termine) {
        if (t.datum < von || t.datum > bis) continue;
        const kurs = d.kurse.find((k) => k.id === t.kursId);
        const z = kurs && zeilen.get(kurs.trainerId);
        const std = (Number(t.dauerMin) || 45) / 60;
        if (t.status === 'ausgefallen') { if (z) z.ausgefallen++; continue; }
        if (t.status === 'stattgefunden') {
          if (z) { z.termine++; z.stunden += std; }
          for (const a of (t.anwesenheit || [])) {
            if (!a.wahrgenommen) continue;
            teilnahmen++;
            const v = d.verordnungen.find((x) => x.patientId === a.patientId && x.id === (d.zuordnungen.find((zz) => zz.kursId === t.kursId && zz.patientId === a.patientId) || {}).verordnungId);
            einnahmen += satzFuer(v);
          }
        } else if (t.status === 'geplant') {
          if (z) { z.geplantTermine++; z.geplantStunden += std; if (t.datum < heuteIso) z.unbestaetigt++; }
          for (const zu of d.zuordnungen.filter((x) => x.kursId === t.kursId && x.aktiv !== false)) einnahmenGeplant += satzFuer(d.verordnungen.find((x) => x.id === zu.verordnungId));
        }
      }
      const rund = (n) => Math.round(n * 100) / 100;
      const trainer = [...zeilen.values()].filter((z) => z.aktiv || z.termine || z.geplantTermine).map((z) => Object.assign(z, {
        stunden: rund(z.stunden), geplantStunden: rund(z.geplantStunden),
        verdienst: rund(z.stunden * z.stundenlohn), prognose: rund((z.stunden + z.geplantStunden) * z.stundenlohn),
      }));
      const kosten = rund(trainer.reduce((a, z) => a + z.verdienst, 0)), kostenPrognose = rund(trainer.reduce((a, z) => a + z.prognose, 0));
      return { ok: true, monat, von, bis, trainer, gesamt: {
        termine: trainer.reduce((a, z) => a + z.termine, 0), geplantTermine: trainer.reduce((a, z) => a + z.geplantTermine, 0),
        ausgefallen: trainer.reduce((a, z) => a + z.ausgefallen, 0), teilnahmen,
        abbrueche: d.verordnungen.filter((v) => v.abbruch && String(v.abbruch.datum).startsWith(monat)).length,
        trainerkosten: kosten, trainerkostenPrognose: kostenPrognose,
        einnahmen: rund(einnahmen), einnahmenPrognose: rund(einnahmen + einnahmenGeplant),
        ergebnisPrognose: rund(einnahmen + einnahmenGeplant - kostenPrognose),
      } };
    }

    /* ---- Outbox ---- */
    if (res === 'outbox') {
      if (m === 'GET' && !id1) return { ok: true, outbox: d.outbox };
      const e = d.outbox.find((x) => x.id === id1);
      if (!e) throw err('Eintrag nicht gefunden.');
      if (m === 'GET' && id2 === 'mailto') return { ok: true, mailto: mailtoLink(e) };
      if (m === 'POST' && id2 === 'status') {
        const st = body && body.status;
        if (!['gesendet', 'fehler', 'mailto-bereit'].includes(st)) throw err('Ungültiger Status.');
        e.status = st; e.fehler = (body && body.fehler) || null; e.via = (body && body.via) || e.via || null;
        if (st === 'gesendet') e.gesendetAm = new Date().toISOString();
        audit('mail-status', { id: e.id, status: st, via: e.via }, 'system');
        speichern();
        return { ok: true, outbox: e };
      }
      if (m === 'POST' && id2 === 'erneut') {
        const neu = sendeMail({ typ: e.typ, an: e.an, betreff: e.betreff, text: e.text, html: e.html, patientId: e.patientId, verordnungId: e.verordnungId });
        return { ok: true, outbox: neu };
      }
    }
    if (res === 'testmail' && m === 'POST') {
      const an = (body && body.an) || d.settings.anbieter.email;
      if (!an) throw err('Keine Zieladresse.');
      const eintrag = sendeMail({ typ: 'test', an, betreff: 'RheaSport Test-E-Mail', text: 'Test-Entwurf (lokaler Modus).', html: '<p>Test-Entwurf (lokaler Modus) ✔</p>' });
      return { ok: true, outbox: eintrag };
    }

    /* ---- Geteilter Kalender ---- */
    if (res === 'kalender' && m === 'GET' && id1 === 'share') {
      return {
        ok: true, url: '', geteilt: d.settings.kalender.geteilt, titel: d.settings.kalender.titel,
        lokalModus: true,
        datenschutzHinweis: 'Im APK-Modus wird der Kalender als .ics-Datei geteilt – sie enthält nur Kurstermine, keine Patientennamen (Art. 9 DSGVO).',
      };
    }
    if (res === 'kalender' && m === 'POST' && id1 === 'rotate') {
      d.settings.kalender.token = id('tok'); speichern(); audit('kalender-link-erneuert', {});
      return { ok: true, token: d.settings.kalender.token };
    }
    if (res === 'calendar' && m === 'GET') {
      const token = String(id1 || '').replace(/\.ics$/, '');
      if (!d.settings.kalender.geteilt || d.settings.kalender.token !== token) throw err('Kalender-Link ungültig.');
      materialisiereAlle(new Date(Date.now() + 330 * 86400000).toISOString().slice(0, 10));
      return { ok: true, ics: ICAL.erstelleIcs(d.kurse, d.termine, d.trainer, d.settings) };
    }

    /* ---- Export / Import / Reset ---- */
    if (res === 'export' && m === 'GET') return { ok: true, json: JSON.stringify(db, null, 1), dateiname: `rheasport-backup-${heutigesDatum()}.json` };
    if (res === 'import' && m === 'POST') {
      const neu = body;
      if (!neu || typeof neu !== 'object' || !neu.settings || !Array.isArray(neu.trainer)) throw err('Ungültiges Backup-Format.');
      db = neu; speichern(); audit('daten-import', {});
      return { ok: true, backup: 'lokal-überschrieben' };
    }
    if (res === 'demo-reset' && m === 'POST') {
      d.trainer = []; d.kurse = []; d.patienten = []; d.verordnungen = [];
      d.termine = []; d.zuordnungen = []; d.outbox = [];
      speichern(); audit('stammdaten-geloescht', {});
      return { ok: true };
    }

    throw err(`Lokaler Modus: API nicht implementiert – ${m} ${url}`, { status: 404 });
  }

  window.localApi = localApi;
  window.rheaDbKey = KEY;
  window.rheaDbReset = function () { db = null; try { window.localStorage.removeItem(KEY); } catch (_) {} return laden(); };
})();
