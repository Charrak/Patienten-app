(function () {
/* Auto-generated from vendor/ical.js */
/**
 * Geteilter Terminkalender (iCalendar/ICS).
 * Enthält Kurs-/Termindaten ohne Patientennamen (Art. 9 DSGVO:
 * Gesundheitsdaten dürfen nicht über einen ungeschützten Kalender-Link verteilt werden).
 * Läuft im Node-Server und im Browser/APK (window.RSD_ICAL).
 */
/* eslint-env browser, node */
if (typeof module === 'undefined') { var module = { exports: {} }; }

function pad(n) { return String(n).padStart(2, '0'); }
function fmtDatum(d) { return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`; }
function esc(s) {
  return String(s ?? '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}
function toUtcIso(d) { return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, ''); }

function folgeTermine(kurs, vonDatum, bisDatum, termine) {
  // liefert VEVENTs: grundsätzlich wöchentlich wiederkehrend, mit Einzeländerungen (Ausfall) als CANCELLED
  const events = [];
  const start = new Date(`${kurs.startdatum}T00:00:00`);
  const [h, m] = String(kurs.beginn || '00:00').split(':').map(Number);
  const dauer = Number(kurs.dauerMin) || 45;
  const endeReihe = kurs.enddatum ? new Date(`${kurs.enddatum}T00:00:00`) : null;
  const [vh, vm] = String(kurs.beginn || '00:00').split(':').map(Number);
  void vm; void vh;

  // Ersten Termin ab Wochentag finden
  let erster = new Date(start);
  while (erster.getDay() !== Number(kurs.wochentag)) erster.setDate(erster.getDate() + 1);
  if (erster < start && erster < vonDatum) erster.setDate(erster.getDate() + 7);

  const einzeln = new Map((termine || []).filter((t) => t.kursId === kurs.id).map((t) => [t.datum, t]));
  const [oh, om] = [h, m];

  for (let d = new Date(erster); d <= bisDatum; d.setDate(d.getDate() + 7)) {
    if (endeReihe && d > endeReihe) break;
    if (d < vonDatum) continue;
    const iso = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const einzelnEintrag = einzeln.get(iso);
    if (einzelnEintrag && einzelnEintrag.status === 'ausgefallen') continue;
    const startD = new Date(d); startD.setHours(oh, om, 0, 0);
    const endD = new Date(startD.getTime() + dauer * 60000);
    const uid = `${kurs.id}-${iso}@rheasport-lokal`;
    const titel = `${kurs.titel || 'Rehasport'}${kurs.art === 'herzgruppe' || kurs.art === 'herzinsuffizienz' ? ' (Herzsport)' : ''}`;
    events.push([
      'BEGIN:VEVENT',
      `UID:${uid}`,
      `DTSTAMP:${toUtcIso(new Date())}`,
      `DTSTART:${fmtDatum(startD)}T${pad(startD.getHours())}${pad(startD.getMinutes())}00`,
      `DTEND:${fmtDatum(endD)}T${pad(endD.getHours())}${pad(endD.getMinutes())}00`,
      `SUMMARY:${esc(titel)}`,
      `LOCATION:${esc(kurs.ort || '')}`,
      `DESCRIPTION:${esc(`Feste Rehasportgruppe · ${kurs.dauerMin} Min. · Übungsleitung: ${kurs.trainerName || ''}. Teilnahme nur mit gültiger Verordnung. Bitte Teilnahme unmittelbar vor/nach der Einheit quittieren.`)}`,
      'STATUS:CONFIRMED',
      'TRANSP:OPAQUE',
      'END:VEVENT',
    ].join('\r\n'));
    // ggf. individuelle Statusänderung (z. B. Feiertag) ergänzen
    if (einzelnEintrag && einzelnEintrag.status === 'verschoben' && einzelnEintrag.neuesDatum) {
      const [nh, nm] = String(einzelnEintrag.neueBeginn || kurs.beginn).split(':').map(Number);
      const nS = new Date(`${einzelnEintrag.neuesDatum}T00:00:00`); nS.setHours(nh, nm, 0, 0);
      const nE = new Date(nS.getTime() + dauer * 60000);
      events.push([
        'BEGIN:VEVENT', `UID:${uid}-v2`, `DTSTAMP:${toUtcIso(new Date())}`,
        `DTSTART:${fmtDatum(nS)}T${pad(nS.getHours())}${pad(nS.getMinutes())}00`,
        `DTEND:${fmtDatum(nE)}T${pad(nE.getHours())}${pad(nE.getMinutes())}00`,
        `SUMMARY:${esc(titel)} (verschoben)`, `LOCATION:${esc(kurs.ort || '')}`,
        'STATUS:CONFIRMED', 'END:VEVENT',
      ].join('\r\n'));
    }
  }
  return events;
}

function erstelleIcs(kurse, termine, trainerListe, einstellung) {
  const now = new Date();
  const von = new Date(now); von.setDate(von.getDate() - 30);
  const bis = new Date(now); bis.setFullYear(bis.getFullYear() + 1);
  const alle = [];
  for (const k of kurse.filter((k) => k.aktiv)) {
    const t = { ...k, trainerName: (trainerListe.find((x) => x.id === k.trainerId) || {}).vorname + ' ' + (trainerListe.find((x) => x.id === k.trainerId) || {}).nachname };
    alle.push(...folgeTermine(t, von, bis, termine));
  }
  const titel = (einstellung.kalender && einstellung.kalender.titel) || 'Rehasport Terminkalender';
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//RheaSport//Physio-und-fit//DE',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${esc(titel)}`,
    'X-WR-TIMEZONE:Europe/Berlin',
    ...alle,
    'END:VCALENDAR',
  ].join('\r\n');
}

module.exports = { erstelleIcs };
if (typeof window !== 'undefined' && window) window.RSD_ICAL = module.exports;



})();
