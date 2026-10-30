/**
 * Demo-Stammdaten anlegen (Beispieldaten, lokal):
 *   npm run demo
 * Löst vorher bestehende Stammdaten (Einstellungen bleiben erhalten).
 */
const BASE = process.env.BASE || 'http://localhost:8080';

async function j(methode, pfad, body) {
  const r = await fetch(BASE + pfad, {
    method: methode,
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`${methode} ${pfad} → ${r.status}: ${d.fehler || JSON.stringify(d).slice(0, 300)}`);
  return d;
}

const SIG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const iso = (d) => d.toISOString().slice(0, 10);

(async () => {
  console.log('Reset …');
  await j('POST', '/api/demo-reset');

  console.log('Einstellungen …');
  await j('PUT', '/api/settings', {
    anbieter: {
      name: 'RheaSport – Physio & fit', strasse: 'Beispielstraße 12', plz: '30159', ort: 'Hannover',
      telefon: '0511 1234567', email: 'rheasport@beispiel-praxis.de', ik: '999999900',
      traeger: 'RehaSport Deutschland e. V. – Landesverband Niedersachsen/NRW',
      iban: 'DE00 1234 5678 9012 3456 00', kontoinhaber: 'RheaSport – Physio & fit', bank: 'Musterbank',
    },
    bundesland: 'NW',
    fuehrungspersonal: [{ name: 'Praxisleitung', email: 'leitung@beispiel-praxis.de' }],
    abrechnung: { satzMap: { 'gkv:rs': 14.5, 'gkv:herzgruppe': 16.8, 'rv:rs': 15.2 } },
  });

  console.log('Trainer …');
  const t1 = (await j('POST', '/api/trainer', {
    vorname: 'Anna', nachname: 'Keller', email: 'a.keller@beispiel-praxis.de', telefon: '0511 1234568',
    qualifikationen: ['uebungsleiter', 'orthopaedie', 'wasser', 'funktionstraining'],
    zertifikateBis: iso(new Date('2028-06-30')), notfallqualifikation: 'notfallsanitaeter',
    notfallGueltigBis: iso(new Date('2027-05-31')), barAnerkennung: 'anerkannt', rsdMitglied: true,
    verchwiegenheit: iso(new Date('2026-01-15')), datenschutzBelehrung: iso(new Date('2026-01-15')),
  })).trainer;
  const t2 = (await j('POST', '/api/trainer', {
    vorname: 'Tobias', nachname: 'Weber', email: 't.weber@beispiel-praxis.de', telefon: '0511 1234569',
    qualifikationen: ['uebungsleiter', 'herzgruppenleiter', 'innere'],
    zertifikateBis: iso(new Date('2029-02-28')), zertifikatHerzBis: iso(new Date('2027-03-01')),
    notfallqualifikation: 'arzt', barAnerkennung: 'anerkannt', rsdMitglied: true,
    verchwiegenheit: iso(new Date('2026-01-15')), datenschutzBelehrung: iso(new Date('2026-01-15')),
  })).trainer;

  console.log('Kurse (feste Gruppen) …');
  const k1 = (await j('POST', '/api/kurse', {
    titel: 'Rehasport Wirbelsäule & Gelenke', art: 'rs', trainerId: t1.id,
    wochentag: 3, beginn: '17:00', dauerMin: 45, maxTeilnehmer: 15,
    ort: 'Sporthalle Nord, Hannover', raumflaecheQm: 120, startdatum: '2026-10-07',
  })).kurs;
  const k2 = (await j('POST', '/api/kurse', {
    titel: 'Rehasport Allgemein & Rücken', art: 'rs', trainerId: t1.id,
    wochentag: 4, beginn: '17:00', dauerMin: 45, maxTeilnehmer: 15,
    ort: 'Sporthalle Nord, Hannover', raumflaecheQm: 120, startdatum: '2026-10-22',
  })).kurs;
  const k3 = (await j('POST', '/api/kurse', {
    titel: 'Herzsport im Klinikum', art: 'herzgruppe', trainerId: t2.id,
    wochentag: 5, beginn: '09:30', dauerMin: 60, maxTeilnehmer: 20,
    ort: 'Klinikum Nord, Rehabilitationsraum 2', raumflaecheQm: 140, startdatum: '2026-10-09',
    betreuungsArzt: { name: 'Dr. med. Schulz (Innere/Kardiologie)', visitationAm: '2026-10-09' },
    notfallplan: true, aed: { vorhanden: true, wartungAm: '2026-09-15' },
    notfallkoffer: true, notfallUebungAm: '2026-10-02',
  })).kurs;

  console.log('Verordnung per Code scannen (Datenabgleich) …');
  const code = 'RS56|Mustermann, Max|1975-04-12|AOK Rheinland/Hamburg|VSNR815012345|2026-10-05|2027-04-05|rs|2|50|M54.2;M62.8|Dr. med. Meier';
  const scan = await j('POST', '/api/verordnungen/scan', { code });
  const vid = scan.verordnung.id;
  const abschluss = await j('PUT', `/api/verordnungen/${vid}`, {
    email: 'max.mustermann@mail.de', telefon: '+49 170 1234567',
    ziele: 'ICF b710.1 leichte Funktionsstörung der Gelenkbeweglichkeit; ICF b735.2 mäßige Funktionsstörung des Muskeltonus. Ziele: Stabilisierung der Hals-, Nacken- und Rumpfmuskulatur, Reduzierung der Funktions- und Aktivitätseinschränkungen.',
    arztName: 'Dr. med. Meier (Kassenpraxis), Stempel/Datum/Unterschrift 03.10.2026',
    ausstellungsdatum: '2026-10-03',
    kostenuebernahme: { liegtVor: true, datum: '2026-10-05', zeitraum: '05.10.2026–05.04.2027' },
    trainerId: t1.id, kursIds: [k2.id, k1.id],
    einwilligung: { erteiltAm: new Date().toISOString(), textVersion: 'Stand 2026', unterschriftPng: SIG },
    anmeldungUnterschrift: SIG, anmeldungDatum: '2026-10-29',
    abschliessen: true,
  });
  console.log('  Status:', abschluss.verordnung.status, '| E-Mails:', abschluss.mails.map((m) => `${m.typ}=${m.status}`).join(', '));

  console.log('Teilnahme vergangener Termin + Leitungsbestätigung …');
  const termine = await (await fetch(`${BASE}/api/termine?von=${iso(new Date(Date.now() - 14 * 86400000))}&bis=${iso(new Date())}`)).json();
  const vergangen = termine.termine
    .filter((t) => t.kurs.id === k2.id || t.kurs.id === k1.id)
    .filter((t) => t.datum < iso(new Date()))
    .sort((a, b) => a.datum.localeCompare(b.datum))[0];
  if (vergangen) {
    const pid = abschluss.verordnung.patientId;
    await j('POST', `/api/termine/${vergangen.id}/anwesenheit`, { patientId: pid, wahrgenommen: true, unterschriftPng: SIG });
    await j('PUT', `/api/termine/${vergangen.id}`, { leiterBestaetigung: { name: 'Anna Keller', unterschriftPng: SIG } });
    console.log('  Teilnahme dokumentiert:', vergangen.datum);
  }

  console.log('\n✔ Demo-Daten angelegt. Öffnen Sie die App und gehen Sie z. B. zu „Verordnung/Datenabgleich“.');
  console.log('  Offene Hinweise: SMTP & Führungspersonal-E-Mail in den Einstellungen konfigurieren für echten Versand.');
})().catch((e) => { console.error('FEHLER:', e.message); process.exit(1); });
