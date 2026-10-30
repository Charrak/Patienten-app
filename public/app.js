/* RheaSport – Physio & fit · Frontend (lokal, DSGVO-konform) */
'use strict';

/* Lokalmodus (APK/WebView oder ?local=1): Daten & API laufen im Browser,
   es wird kein Server benötigt. Sonst: lokaler Node-Server wie gehabt. */
window.LOCAL_MODE = Boolean(window.Capacitor)
  || location.protocol === 'capacitor:' || location.protocol === 'file:'
  || /(?:\?|&)local=1(?:&|$)/.test(location.search);

/* ----------------------------- Helfer ----------------------------- */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = (iso) => { if (!iso) return '–'; const [j, m, t] = iso.split('-'); return t && m ? `${t}.${m}.${j}` : iso; };
const heutigesISO = () => new Date().toISOString().slice(0, 10);
const euroFmt = (n) => (Number(n) || 0).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });
const WOCHENTAGE = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
const WOCHENTAGE_LANG = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];

function toast(msg, cls = '') {
  const t = document.createElement('div');
  t.className = `toast ${cls}`;
  t.textContent = msg;
  $('#toasts').appendChild(t);
  setTimeout(() => { t.style.opacity = '0'; t.style.transition = '.4s'; setTimeout(() => t.remove(), 450); }, cls === 'err' ? 6500 : 3800);
}

async function api(methode, url, body) {
  if (window.LOCAL_MODE && window.localApi) {
    // APK/WebView: komplette API lokal im Gerät (localStorage)
    return window.localApi(methode, url, body);
  }
  const r = await fetch(url, {
    method: methode,
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  let j = null;
  try { j = await r.json(); } catch (_) { /* z. B. CSV */ }
  if (!r.ok) {
    const err = new Error((j && (j.fehler || (j.pruefung && j.pruefung.fehler || []).join(' · '))) || `HTTP ${r.status}`);
    err.status = r.status; err.daten = j;
    throw err;
  }
  return j;
}

/* ----------------------------- Modal ----------------------------- */
let modalOnClose = null;
function openModal(titel, bodyHtml, footButtons = [], opts = {}) {
  const root = $('#modal-root');
  root.hidden = false;
  root.querySelector('.modal').className = `modal${opts.wide ? ' wide' : ''}`;
  $('#modal-title').textContent = titel;
  $('#modal-body').innerHTML = bodyHtml;
  const foot = $('#modal-foot');
  foot.innerHTML = '';
  for (const b of footButtons) {
    const btn = document.createElement('button');
    btn.className = b.cls || 'btn';
    btn.innerHTML = b.label;
    btn.onclick = b.onClick;
    foot.appendChild(btn);
  }
  modalOnClose = opts.onClose || null;
  return $('#modal-body');
}
function closeModal() {
  $('#modal-root').hidden = true;
  $('#modal-body').innerHTML = '';
  if (modalOnClose) { const f = modalOnClose; modalOnClose = null; f(); }
}
$('#modal-close').onclick = closeModal;
$('#modal-root .modal-backdrop').onclick = closeModal;
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('#modal-root').hidden) closeModal(); });

/* ------------------------- Unterschriften-Pad ------------------------- */
function openSigPad(titel, hinweisText) {
  return new Promise((resolve) => {
    let fertig = false;
    const body = openModal(titel, `
      <div class="sig-wrap">
        <div class="sig-meta"><strong>${esc(hinweisText || '')}</strong><br>
        Zeitstempel: ${new Date().toLocaleString('de-DE')} · Die Unterschrift wird unmittelbar vor/nach der Übungseinheit geleistet.
        Korrekturen werden protokolliert – Vordatierung/Tipp-Ex sind unzulässig (Rahmenvereinbarung/RSD).</div>
        <div class="sig-pad-box">
          <canvas class="sig-pad" id="sig-canvas"></canvas>
          <div class="sig-baseline"></div>
          <div class="sig-hintline">Hier mit Maus, Finger oder Stift unterschreiben</div>
        </div>
      </div>`, [
      { label: '🧽 Löschen', cls: 'btn', onClick: () => clearPad() },
      { label: 'Verwerfen', cls: 'btn', onClick: () => { fertig = true; closeModal(); resolve(null); } },
      { label: '✔ Unterschrift übernehmen', cls: 'btn primary', onClick: () => {
        const png = leer ? null : canvas.toDataURL('image/png');
        if (!png) { toast('Bitte zuerst unterschreiben.', 'err'); return; }
        fertig = true; closeModal(); resolve(png);
      } },
    ], { onClose: () => { if (!fertig) resolve(null); } });

    const canvas = $('#sig-canvas', body);
    const ctx = canvas.getContext('2d');
    let zeichnet = false, leer = true;
    const dpr = window.devicePixelRatio || 1;
    function resize() {
      const r = canvas.getBoundingClientRect();
      const alt = leer ? null : canvas.toDataURL();
      canvas.width = Math.max(1, r.width * dpr); canvas.height = Math.max(1, r.height * dpr);
      ctx.scale(dpr, dpr);
      ctx.lineWidth = 2.2; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#12323a';
      if (alt) {
        const i = new Image();
        i.onload = () => ctx.drawImage(i, 0, 0, r.width, r.height);
        i.src = alt;
        leer = false;
      }
    }
    function clearPad() { ctx.clearRect(0, 0, canvas.width, canvas.height); leer = true; }
    requestAnimationFrame(() => {
      resize();
      const pos = (e) => { const r = canvas.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
      canvas.addEventListener('pointerdown', (e) => {
        zeichnet = true;
        try { canvas.setPointerCapture(e.pointerId); } catch (_) {}
        const [x, y] = pos(e);
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 0.6, y + 0.6); ctx.stroke();
        leer = false;
      });
      canvas.addEventListener('pointermove', (e) => {
        if (!zeichnet) return;
        const [x, y] = pos(e);
        ctx.lineTo(x, y); ctx.stroke();
        leer = false;
      });
      canvas.addEventListener('pointerup', () => { zeichnet = false; });
      canvas.addEventListener('pointercancel', () => { zeichnet = false; });
      canvas.addEventListener('pointerleave', () => { zeichnet = false; });
    });
  });
}

/* ----------------------------- State ----------------------------- */
let S = null;   // /api/state
let D = null;   // Dashboard
let termineCache = [];
let aktuelleView = 'dashboard';

async function reload(renderView = true) {
  const [s, d] = await Promise.all([api('GET', '/api/state'), api('GET', '/api/dashboard')]);
  S = s; D = d.dashboard;
  renderNavBadges();
  $('#side-hilfsfrist').innerHTML = `⚠ Hilfsfrist ${esc(D.hilfsfrist.bundesland)}: <strong>${esc(D.hilfsfrist.text)}</strong>${D.hilfsfrist.laendlich ? ' (ländl. Gebiet)' : ''}`;
  if (renderView) renderAktuelleView();
  if (googleAktiv() && RheaGoogle.optionen().autoMail && RheaGoogle.status().angemeldet) setTimeout(() => gmailOffeneSenden(true), 300);
}

function renderNavBadges() {
  const a = $('#nav-abgleiche'), s = $('#nav-signaturen'), o = $('#nav-outbox');
  a.hidden = !D.zaehler.offeneAbgleiche; a.textContent = D.zaehler.offeneAbgleiche;
  const sig = D.zaehler.signaturenOffen;
  s.hidden = !sig; s.textContent = sig; s.classList.add('amber');
  const offen = (S.outbox || []).filter((m) => m.status !== 'gesendet').length;
  o.hidden = !offen; o.textContent = offen; o.classList.add('amber');
}

/* ----------------------------- Navigation ----------------------------- */
$$('#nav button').forEach((b) => {
  b.onclick = () => zeigeView(b.dataset.view);
});
function zeigeView(view) {
  aktuelleView = view;
  $$('#nav button').forEach((b) => b.classList.toggle('active', b.dataset.view === view));
  $$('.view').forEach((v) => { v.hidden = v.id !== `view-${view}`; });
  renderAktuelleView();
}
function renderAktuelleView() {
  if (!S || !D) return;
  switch (aktuelleView) {
    case 'dashboard': renderDashboard(); break;
    case 'scan': renderScan(); break;
    case 'patienten': renderPatienten(); break;
    case 'trainer': renderTrainer(); break;
    case 'kurse': renderKurse(); break;
    case 'kalender': renderKalender(); break;
    case 'abrechnung': renderAbrechnung(); break;
    case 'dokumente': renderDokumente(); break;
    case 'postfach': renderPostfach(); break;
    case 'einstellungen': renderEinstellungen(); break;
  }
}

/* ============================== DASHBOARD ============================== */
function renderDashboard() {
  const z = D.zaehler;
  const stat = (n, t, cls = '', view = '') => `<div class="stat" data-v="${view}"><div class="n ${cls}">${n}</div><div class="t">${t}</div></div>`;
  $('#dash-stats').innerHTML =
    stat(z.offeneAbgleiche, 'Offene Datenabgleiche', z.offeneAbgleiche ? 'amber' : '', 'scan') +
    stat(z.termineHeute, 'Termine heute', '', 'kalender') +
    stat(z.aktiveVerordnungen, 'Aktive Verordnungen', '', 'patienten') +
    stat(z.signaturenOffen, 'Signaturen offen', z.signaturenOffen ? 'red' : '', 'kalender') +
    stat(z.abrechnungBereit, 'Abrechnung bereit', z.abrechnungBereit ? 'amber' : '', 'abrechnung') +
    stat(`${z.kurse}/${z.trainer}`, 'Kurse / Trainer', '', 'kurse');
  $$('#dash-stats .stat').forEach((el) => { el.onclick = () => zeigeView(el.dataset.v); });

  const warns = [];
  if (!D.smtp && S.lokalModus) warns.push('<div class="warnbox info"><strong>APK-Lokalmodus</strong>Termine- und Vollständigkeits-E-Mails liegen als Entwurf bereit und werden über die Mail-App des Geräts versendet (<button class="link" onclick="zeigeView(\'postfach\')">E-Mail-Journal</button>).</div>');
  else if (!D.smtp) warns.push(`<div class="warnbox wa"><strong>SMTP nicht konfiguriert</strong>E-Mails (Patienten-Termine &amp; Bestätigung ans Führungspersonal) werden als Entwurf vorgehalten. <button class="link" onclick="zeigeView('einstellungen')">Einstellungen öffnen</button></div>`);
  for (const w of D.zertifikatWarnungen) warns.push(`<div class="warnbox wa"><strong>Zertifikat läuft ab</strong>${esc(w.trainer)}: Qualifikationsnachweis bis ${fmt(w.bis)}</div>`);
  for (const v of D.visitationWarnungen) warns.push(v.noetig
    ? `<div class="warnbox err"><strong>Arztvisitation fällig</strong>${esc(v.kurs)}: Herzgruppen-Visitation mind. alle 6 Wochen (letzte: ${v.letzte === 'nie' ? 'nie' : fmt(v.letzte)})</div>`
    : `<div class="warnbox wa"><strong>Arztvisitation in Kürze</strong>${esc(v.kurs)}: letzte Visitation ${fmt(v.letzte)} (Intervall max. 6 Wochen)</div>`);
  warns.push(`<div class="warnbox info"><strong>Notfallabsicherung NRW</strong>Hilfsfrist ${esc(D.hilfsfrist.text)} – Notfallplan, (A)ED-Prüfung und Notfallübungen (2×/Jahr) für Herzgruppen bereithalten.</div>`);
  $('#dash-warn').innerHTML = `<div class="warn-grid">${warns.join('')}</div>`;

  $('#dash-heute').innerHTML = D.termineHeute.length ? D.termineHeute.map((t) =>
    `<div class="item"><div><strong>${esc(t.beginn)} Uhr</strong> · ${esc(t.kurs || '')} <span class="muted">(${esc(t.status)})</span></div>
     <button class="btn small" onclick="oeffneTermin('${t.id}')">Verwalten</button></div>`).join('')
    : '<div class="muted">Heute keine Termine.</div>';

  $('#dash-abgleiche').innerHTML = D.offeneAbgleiche.length ? D.offeneAbgleiche.map((v) =>
    `<div class="item"><div><strong>${esc(v.name || 'Ohne Namen')}</strong><div class="muted">Verordnung von ${fmt(v.von)}</div></div>
     <button class="btn small" onclick="fortsetzeAbgleich('${v.id}')">Datenabgleich fortsetzen</button></div>`).join('')
    : '<div class="muted">Keine offenen Datenabgleiche.</div>';

  $('#dash-signaturen').innerHTML = D.ausstehendSignatur.length ? D.ausstehendSignatur.map((s) =>
    `<div class="item"><div>${esc(s.patient)} <span class="muted">· ${esc(s.kurs)} · ${fmt(s.datum)}</span></div>
     <button class="btn small" onclick="oeffneTermin('${s.terminId}')">Unterschrift erfassen</button></div>`).join('')
    : '<div class="muted">Keine offenen Signaturen.</div>';
}

/* ============================== SCAN / WIZARD ============================== */
const WIZ = { v: null, pruefung: null, step: 1, trainerId: null, kursIds: [], sig: null, match: [], saveTimer: null };

function renderScan() {
  const off = (S.verordnungen || []).filter((v) => v.status === 'abgleich');
  $('#offene-abgleiche').innerHTML = off.length ? off.map((v) =>
    `<div class="item"><div><strong>${esc(v.name || v.id)}</strong><div class="muted">${fmt(v.von)} – ${fmt(v.bis)} · ${esc((S.regeln.arten[v.art] || {}).label || '')}</div></div>
     <button class="btn small" onclick="fortsetzeAbgleich('${v.id}')">Öffnen</button></div>`).join('')
    : '<div class="muted">Keine weiteren offenen Abgleiche.</div>';

  const kassen = [...new Set((S.verordnungen || []).map((v) => v.kostentraeger).filter(Boolean))];
  $('#kk-liste').innerHTML = kassen.map((k) => `<option value="${esc(k)}">`).join('');

  if (!WIZ.v) { $('#scan-start').hidden = false; $('#wizard').hidden = true; }
}

window.fortsetzeAbgleich = async (id) => {
  const v = (S.verordnungen || []).find((x) => x.id === id);
  if (!v) return;
  WIZ.v = { ...v, icd10: v.icd10 || [] };
  WIZ.pruefung = null; WIZ.trainerId = v.trainerId || null; WIZ.kursIds = v.kursIds || [];
  WIZ.sig = v.anmeldung ? v.anmeldung.unterschriftPng : null;
  $('#scan-start').hidden = true;
  $('#wizard').hidden = false;
  befuelleWizard();
  zeigeSchritt(1);
};

function befuelleWizard() {
  const v = WIZ.v;
  const set = (id, val) => { const el = $(id); if (el) el.value = val ?? ''; };
  set('#f-name', v.name); set('#f-geb', v.geburtsdatum); set('#f-kk', v.kostentraeger);
  set('#f-kkart', v.kostentraegerArt); set('#f-vs', v.versichertenNr); set('#f-ik', v.ik);
  set('#f-aus', v.ausstellungsdatum); set('#f-von', v.von); set('#f-bis', v.bis);
  const artSel = $('#f-art');
  artSel.innerHTML = Object.entries(S.regeln.arten).map(([id, a]) => `<option value="${id}">${esc(a.label)}</option>`).join('');
  set('#f-art', v.art);
  set('#f-freq', String(v.frequenzProWoche || 1));
  const uee = String(v.uebungseinheiten || 50);
  const ueeSel = $('#f-uee');
  if (['50', '90', '120'].includes(uee)) { ueeSel.value = uee; $('#f-uee-custom-wrap').hidden = true; }
  else { ueeSel.value = 'custom'; $('#f-uee-custom-wrap').hidden = false; set('#f-uee-custom', uee); }
  set('#f-formular', v.formular || 'muster56'); set('#f-arzt', v.arztName);
  set('#f-icd', (v.icd10 || []).join(', ')); set('#f-ziele', v.ziele);
  $('#f-folge').checked = Boolean(v.folgeverordnung); set('#f-folge-beg', v.folgeBegruendung);
  const ku = v.kostenuebernahme || {};
  $('#f-ku').checked = Boolean(ku.liegtVor); set('#f-ku-datum', ku.datum); set('#f-ku-zeitraum', ku.zeitraum);
  set('#f-freq-beg', v.frequenzBegruendung); set('#f-uee-beg', v.ueeBegruendung); set('#f-dauer-beg', v.dauerBegruendung);
  set('#f-email', v.email); set('#f-tel', v.telefon);
  $('#scan-format-note').textContent = v.codeFormat ? `Quelle: ${v.codeFormat}` : '';
  $('#text-version').textContent = (S.settings.datenschutz || {}).textVersion || '';
  $('#wiz-sig-preview').innerHTML = WIZ.sig ? `<img src="${WIZ.sig}" alt="Unterschrift">` : '– noch keine Unterschrift –';
  aktualisiereSichtbarkeiten();
  entwurfSpeichern(); // Validierung/Lebenslauf sofort anstoßen
}

function aktualisiereSichtbarkeiten() {
  $('#wrap-folge-beg').hidden = !$('#f-folge').checked;
  $('#wrap-freq-beg').hidden = Number($('#f-freq').value) < 3;
  const monate = (() => {
    const a = $('#f-von').value, b = $('#f-bis').value;
    if (!a || !b) return 0;
    const da = new Date(a), dbm = new Date(b);
    return (dbm.getFullYear() - da.getFullYear()) * 12 + (dbm.getMonth() - da.getMonth()) + (dbm.getDate() >= da.getDate() ? 0 : -1);
  })();
  $('#wrap-dauer-beg').hidden = monate <= 6;
  const ueeWert = $('#f-uee').value === 'custom' ? Number($('#f-uee-custom').value || 0) : Number($('#f-uee').value);
  const artRegel = (S.regeln.arten[$('#f-art').value] || {}).ueeRegel || 50;
  $('#wrap-uee-beg').hidden = !(ueeWert > artRegel && ueeWert !== 120);
}

function sammleFelder() {
  const v = WIZ.v;
  const get = (id) => $(id).value.trim();
  const uee = $('#f-uee').value === 'custom' ? Number($('#f-uee-custom').value || 0) : Number($('#f-uee').value);
  Object.assign(v, {
    name: get('#f-name'), geburtsdatum: get('#f-geb'), kostentraeger: get('#f-kk'),
    kostentraegerArt: $('#f-kkart').value, versichertenNr: get('#f-vs'), ik: get('#f-ik'),
    ausstellungsdatum: get('#f-aus'), von: get('#f-von'), bis: get('#f-bis'),
    art: $('#f-art').value, frequenzProWoche: Number($('#f-freq').value),
    uebungseinheiten: uee, formular: $('#f-formular').value, arztName: get('#f-arzt'),
    icd10: get('#f-icd').split(/[;,]/).map((s) => s.trim()).filter(Boolean),
    ziele: $('#f-ziele').value.trim(),
    folgeverordnung: $('#f-folge').checked, folgeBegruendung: $('#f-folge-beg').value.trim(),
    kostenuebernahme: { liegtVor: $('#f-ku').checked, datum: get('#f-ku-datum'), zeitraum: get('#f-ku-zeitraum') },
    frequenzBegruendung: $('#f-freq-beg').value.trim(), ueeBegruendung: $('#f-uee-beg').value.trim(),
    dauerBegruendung: $('#f-dauer-beg').value.trim(),
    email: get('#f-email'), telefon: get('#f-tel'),
  });
  return v;
}

async function entwurfSpeichern() {
  if (!WIZ.v) return null;
  const v = sammleFelder();
  try {
    const r = await api('PUT', `/api/verordnungen/${v.id}`, v);
    WIZ.v = r.verordnung; WIZ.pruefung = r.pruefung;
    zeichneAbgleichLive();
    if (WIZ.step === 2) zeichnePruefliste();
    return r;
  } catch (e) { toast(`Speichern fehlgeschlagen: ${e.message}`, 'err'); return null; }
}

function debounceEntwurf() {
  aktualisiereSichtbarkeiten();
  clearTimeout(WIZ.saveTimer);
  WIZ.saveTimer = setTimeout(entwurfSpeichern, 700);
}

function zeichneAbgleichLive() {
  const p = WIZ.pruefung;
  if (!p) { $('#abgleich-live').innerHTML = ''; return; }
  const fehlend = p.felder.filter((f) => f.blockiert && !f.ok);
  const ok = p.felder.filter((f) => f.blockiert && f.ok).length;
  $('#abgleich-live').innerHTML = fehlend.length
    ? `<div class="bad">${ok}/${p.felder.filter((f) => f.blockiert).length} Pflichtprüfungen – noch offen:</div>` +
      fehlend.slice(0, 6).map((f) => `<div class="bad">✕ ${esc(f.text)}</div>`).join('') +
      (fehlend.length > 6 ? `<div class="warn">… +${fehlend.length - 6} weitere</div>` : '')
    : `<div class="ok">✔ Alle ${ok} Pflichtprüfungen bestanden – Verordnung vollständig.</div>` +
      p.hinweise.map((h) => `<div class="warn">⚠ ${esc(h)}</div>`).join('');
}

function zeichnePruefliste() {
  const p = WIZ.pruefung;
  if (!p) { $('#pruef-liste').innerHTML = '<div class="muted">Bitte zuerst die Daten im Schritt 1 erfassen.</div>'; return; }
  $('#pruef-liste').innerHTML = p.felder.map((f) => {
    const cls = f.ok ? 'ok' : (f.blockiert ? 'bad' : 'warn');
    const ic = f.ok ? '✓' : (f.blockiert ? '✕' : '!');
    return `<div class="check-item ${cls}"><span class="ic">${ic}</span><div><strong>${esc(f.name)}</strong><div>${esc(f.text)}</div></div></div>`;
  }).join('') + (p.hinweise.length ? p.hinweise.map((h) => `<div class="check-item warn"><span class="ic">!</span><div>${esc(h)}</div></div>`).join('') : '');
}

function zeigeSchritt(n) {
  WIZ.step = n;
  $$('#wizard-steps span').forEach((s) => {
    const i = Number(s.dataset.step);
    s.classList.toggle('active', i === n);
    s.classList.toggle('done', i < n);
  });
  $$('.step').forEach((s) => { s.hidden = s.id !== `step-${n}`; });
  if (n === 2) entwurfSpeichern().then(() => zeichnePruefliste());
}

/* --- Schritt 3: Matching --- */
async function ladeMatching() {
  const v = sammleFelder();
  const r = await api('POST', '/api/matching', { verordnung: v });
  WIZ.match = r.treffer;
  const box = $('#trainer-match');
  if (!r.treffer.length) { box.innerHTML = '<div class="muted">Keine Trainer/innen hinterlegt. Bitte zuerst Trainer &amp; Kurse anlegen.</div>'; return; }
  box.innerHTML = r.treffer.map((m, i) => {
    const t = m.trainer;
    const quals = (t.qualifikationen || []).map((q) => `<span class="chip ${m.kann ? 'green' : 'gray'}">${esc((S.regeln.qualifikationen.find((x) => x.id === q) || {}).label || q)}</span>`).join(' ');
    const kuTxt = m.passteKurse.map((k) => `${WOCHENTAGE[k.wochentag]} ${esc(k.beginn)} (${k.belegt}/${k.maxTeilnehmer} belegt)`).join(' · ');
    return `<div class="match ${m.kann ? 'can' : 'no'} ${WIZ.trainerId === t.id ? 'selected' : ''}" data-i="${i}" ${m.kann ? '' : 'aria-disabled="true"'}>
      <div>
        <div class="who">${esc(t.vorname)} ${esc(t.nachname)} ${m.kann ? '<span class="chip green">geeignet</span>' : '<span class="chip red">nicht geeignet</span>'}</div>
        <div class="chips" style="margin:6px 0">${quals}</div>
        <div class="reasons">${m.gruende.map((g) => `<div>${esc(g)}</div>`).join('')}</div>
        ${m.hart.length ? `<div class="hart">${m.hart.map((g) => `<div>${esc(g)}</div>`).join('')}</div>` : ''}
        <div class="muted small">Feste Gruppe(n): ${kuTxt || '–'}</div>
      </div>
      <div class="score"><div class="big">${m.kann ? m.score : '–'}</div><div>Match-Punkte</div>
      <div style="margin-top:6px">${m.kann ? `<span class="chip blue">freie Plätze: ${m.freiePlaetze}</span>` : ''}</div></div>
    </div>`;
  }).join('');
  $$('#trainer-match .match').forEach((el) => {
    el.onclick = () => {
      const m = r.treffer[Number(el.dataset.i)];
      if (!m.kann) { toast('Diese/r Trainer/in erfüllt die Anforderungen nicht.', 'err'); return; }
      WIZ.trainerId = m.trainer.id;
      WIZ.kursIds = [];
      $$('#trainer-match .match').forEach((x) => x.classList.remove('selected'));
      el.classList.add('selected');
      $('#btn-zu-gruppe').disabled = false;
    };
  });
  $('#btn-zu-gruppe').disabled = !WIZ.trainerId;
}

/* --- Schritt 4: Gruppen --- */
function zeichneGruppen() {
  const m = WIZ.match.find((x) => x.trainer.id === WIZ.trainerId);
  const box = $('#gruppen-liste');
  if (!m) { box.innerHTML = ''; return; }
  const v = sammleFelder();
  const freq = v.frequenzProWoche || 1;
  const volleTage = new Set();
  box.innerHTML = m.passteKurse.map((k) => {
    const voll = k.belegt >= k.maxTeilnehmer && !WIZ.kursIds.includes(k.id);
    if (voll) volleTage.add(k.wochentag);
    const artRegeln = S.regeln.arten[k.art] || {};
    return `<div class="gruppe ${WIZ.kursIds.includes(k.id) ? 'selected' : ''} ${voll ? 'nein' : ''}" data-id="${k.id}">
      <div><div class="t">${WOCHENTAGE_LANG[k.wochentag]} · ${esc(k.beginn)} Uhr · ${k.dauerMin} Min.</div>
      <div class="muted small">${esc(k.titel)} · ${esc(k.ort || 'Ort offen')} · max. ${k.maxTeilnehmer} TN (Regel: ${artRegeln.maxTN || '–'}) ${k.belegt ? `· ${k.belegt} belegt` : ''}${voll ? ' · <strong>ausgebucht</strong>' : ''}</div></div>
      <div>${WIZ.kursIds.includes(k.id) ? '<span class="chip green">zugewiesen</span>' : '<span class="chip gray">hinzufügen</span>'}</div>
    </div>`;
  }).join('') || '<div class="muted">Für diese Verordnung wurde keine feste Gruppe dieses Trainers gefunden.</div>';
  $$('#gruppen-liste .gruppe').forEach((el) => {
    el.onclick = () => {
      const id = el.dataset.id;
      const idx = WIZ.kursIds.indexOf(id);
      if (idx >= 0) WIZ.kursIds.splice(idx, 1); else WIZ.kursIds.push(id);
      zeichneGruppen();
    };
  });
  const tage = new Set(m.passteKurse.filter((k) => WIZ.kursIds.includes(k.id)).map((k) => k.wochentag));
  if (WIZ.kursIds.length && tage.size < freq) {
    box.insertAdjacentHTML('beforeend', `<div class="hint">Hinweis: Die Verordnung sieht <strong>${freq}×/Woche</strong> vor, zugewiesen sind <strong>${tage.size}×</strong> – ggf. weitere Gruppe(n) wählen oder Frequenzbegründung prüfen.</div>`);
  }
}

$('#btn-wiz-sig').onclick = async () => {
  const name = sammleFelder().name || 'Versicherte/r';
  const png = await openSigPad('Unterschrift – Anmeldung & Einwilligung (Art. 9 DSGVO)', `${name} · ${new Date().toLocaleDateString('de-DE')}`);
  if (png) { WIZ.sig = png; $('#wiz-sig-preview').innerHTML = `<img src="${png}" alt="Unterschrift">`; $('#chk-anmeldung').checked = true; }
};

$('#btn-zu-pruefung').onclick = async () => {
  const v = sammleFelder();
  if (!v.name || !v.geburtsdatum) { toast('Name und Geburtsdatum sind Pflicht.', 'err'); return; }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.email)) { toast('Im Datenabgleich ist eine gültige E-Mail-Adresse einzutragen.', 'err'); return; }
  if ((v.telefon || '').replace(/[^\d+]/g, '').length < 6) { toast('Im Datenabgleich ist eine Telefonnummer einzutragen.', 'err'); return; }
  await entwurfSpeichern();
  zeigeSchritt(2);
};
$('#btn-zu-trainer').onclick = async () => {
  try { await ladeMatching(); zeigeSchritt(3); }
  catch (e) { toast(`Matching fehlgeschlagen: ${e.message}`, 'err'); }
};
$('#btn-zu-gruppe').onclick = () => { zeichneGruppen(); zeigeSchritt(4); };
$$('[data-goto-step]').forEach((b) => { b.onclick = () => zeigeSchritt(Number(b.dataset.gotoStep)); });

$('#btn-abschliessen').onclick = async () => {
  const v = sammleFelder();
  if (!WIZ.kursIds.length) { toast('Bitte mindestens eine feste Gruppe zuweisen.', 'err'); return; }
  if (!$('#chk-einwilligung').checked) { toast('Einwilligungserklärung (DSGVO) muss bestätigt sein.', 'err'); return; }
  if (!$('#chk-anmeldung').checked || !WIZ.sig) { toast('Anmeldung und digitale Unterschrift sind erforderlich.', 'err'); return; }
  const payload = {
    ...v,
    trainerId: WIZ.trainerId, kursIds: WIZ.kursIds,
    einwilligung: { erteiltAm: new Date().toISOString(), textVersion: (S.settings.datenschutz || {}).textVersion || '', unterschriftPng: WIZ.sig },
    anmeldungUnterschrift: WIZ.sig, anmeldungDatum: heutigesISO(),
    abschliessen: true,
  };
  try {
    const r = await api('PUT', `/api/verordnungen/${v.id}`, payload);
    await reload(true);
    const mails = r.mails || [];
    const mailTxt = mails.map((m) => `• ${esc((m.an || []).join(', '))}: ${m.status === 'gesendet' ? '<span class="chip green">gesendet</span>' : m.status === 'konfiguration-offen' ? '<span class="chip amber">Entwurf (SMTP offen)</span>' : `<span class="chip red">Fehler: ${esc(m.fehler || '')}</span>`}<div class="muted small">${esc(m.betreff)}</div>`).join('');
    openModal('✔ Datenabgleich abgeschlossen', `
      <div class="hint" style="background:var(--green-l)">Die Verordnung ist <strong>vollständig</strong> und als <strong>aktiv</strong> markiert. Patient/in wurde angelegt und der festen Gruppe zugeordnet.</div>
      <h2 style="font-size:15px">Versandte Nachrichten</h2>
      ${mailTxt || '<div class="muted">Keine Nachrichten erzeugt.</div>'}
      <ul class="hint" style="background:var(--blue-l)">
        <li><strong>Patient/in</strong> erhält die Terminübersicht per E-Mail.</li>
        <li><strong>Führungspersonal</strong> erhält die Bestätigung, dass die Verordnung vollständig ist (inkl. Prüfprotokoll).</li>
      </ul>
      <p class="muted small">Hinweis: Abrechnung erst nach tatsächlich stattgefundenen Übungseinheiten mit digitaler Teilnahmebestätigung (Zeitstempel).</p>`,
      [{ label: 'Zur Übersicht', cls: 'btn primary', onClick: () => { closeModal(); resetWizard(); zeigeView('dashboard'); } },
       { label: 'Weitere Verordnung scannen', cls: 'btn', onClick: () => { closeModal(); resetWizard(); } }]);
  } catch (e) {
    if (e.daten && e.daten.pruefung) {
      WIZ.pruefung = e.daten.pruefung;
      zeigeSchritt(2);
      toast('Noch nicht vollständig – bitte die roten Punkte in der Prüfliste beheben.', 'err');
    } else toast(e.message, 'err');
  }
};

function resetWizard() {
  WIZ.v = null; WIZ.pruefung = null; WIZ.step = 1; WIZ.trainerId = null; WIZ.kursIds = []; WIZ.sig = null; WIZ.match = [];
  $('#scan-start').hidden = false; $('#wizard').hidden = true;
  $('#scan-code').value = ''; $('#scan-manuell-box').hidden = true; $('#scan-live').hidden = true;
  renderScan();
}

/* --- Scan-Optionen --- */
$$('#view-scan [data-f]').forEach((el) => {
  el.addEventListener('input', debounceEntwurf);
  el.addEventListener('change', debounceEntwurf);
});
$('#f-ku').addEventListener('change', debounceEntwurf);
$('#f-uee').addEventListener('change', () => { $('#f-uee-custom-wrap').hidden = $('#f-uee').value !== 'custom'; debounceEntwurf(); });
$('#f-uee-custom').addEventListener('input', debounceEntwurf);

/* Bekannte Formate (JSON/URL/RS56) gehen direkt an den Parser; PDF417-/Strichcode-Inhalte werden über RSD_OCR ausgewertet */
async function handleCode(raw, opts = {}) {
  stopKamera();
  try {
    const roh = String(raw || '').trim();
    const bekannt = /^\{/.test(roh) || /^https?:\/\//i.test(roh) || /^RS56/i.test(roh);
    let body = { code: roh };
    let info = '';
    if (!bekannt && window.RSD_OCR) {
      const b = window.RSD_OCR.parseBarcodeText(roh);
      body = { manuell: b.felder, format: opts.format || b.format, quelltext: roh };
      info = b.gefunden.length ? ` ${b.gefunden.length} Feld(er) übernommen.` : ' Inhalt nicht lesbar zuordenbar – bitte im Datenabgleich ergänzen.';
    }
    const r = await api('POST', '/api/verordnungen/scan', body);
    await reload(false);
    if (r.wiederholung) toast('Dieser Code wurde bereits erfasst – offener Abgleich geöffnet.');
    else toast(`Code erkannt – Datenabgleich geöffnet.${info}`, 'ok');
    window.fortsetzeAbgleich(r.verordnung.id);
  } catch (e) { toast(`Scan fehlgeschlagen: ${e.message}`, 'err'); }
}

/* --- Bibliotheken bei Bedarf nachladen (ZXing für PDF417, Tesseract für OCR) --- */
const _skripte = {};
function ladeSkript(url) {
  if (_skripte[url]) return _skripte[url];
  _skripte[url] = new Promise((res, rej) => {
    const el = document.createElement('script');
    el.src = url; el.onload = res; el.onerror = () => { delete _skripte[url]; rej(new Error(`Bibliothek fehlt: ${url}`)); };
    document.head.appendChild(el);
  });
  return _skripte[url];
}

/* --- Barcode-Erkennung: BarcodeDetector (QR/DataMatrix/PDF417), sonst jsQR + ZXing --- */
let _detector;
async function holeDetector() {
  if (_detector !== undefined) return _detector;
  _detector = null;
  try {
    if ('BarcodeDetector' in window) {
      const gewuenscht = ['qr_code', 'data_matrix', 'pdf417', 'code_128', 'aztec'];
      const unterstuetzt = window.BarcodeDetector.getSupportedFormats ? await window.BarcodeDetector.getSupportedFormats() : gewuenscht;
      const formate = gewuenscht.filter((f) => unterstuetzt.includes(f));
      if (formate.length) _detector = { det: new window.BarcodeDetector({ formats: formate }), formate };
    }
  } catch (_) { _detector = null; }
  return _detector;
}
let _zxing = null;
async function holeZxing() {
  if (_zxing) return _zxing;
  try {
    if (!window.ZXing) await ladeSkript('/vendor/zxing.js');
    const Z = window.ZXing;
    const hints = new Map();
    hints.set(Z.DecodeHintType.POSSIBLE_FORMATS, [Z.BarcodeFormat.PDF_417, Z.BarcodeFormat.QR_CODE, Z.BarcodeFormat.DATA_MATRIX]);
    hints.set(Z.DecodeHintType.TRY_HARDER, true);
    const reader = new Z.MultiFormatReader();
    reader.setHints(hints);
    _zxing = { Z, reader };
  } catch (_) { _zxing = null; }
  return _zxing;
}
/* quelle: <video>, <img> oder <canvas>. Gibt den Rohtext oder null zurück.
   optionen: max (längste Kante in px), drehen (90 = Quer-/Hochformat tauschen), nurZxing */
async function dekodiereQuelle(quelle, optionen = {}) {
  const det = await holeDetector();
  if (det && !optionen.drehen) {
    try {
      const codes = await det.det.detect(quelle);
      if (codes.length) return codes[0].rawValue;
    } catch (_) { /* weiter */ }
  }
  const breite = quelle.videoWidth || quelle.naturalWidth || quelle.width;
  const hoehe = quelle.videoHeight || quelle.naturalHeight || quelle.height;
  if (!breite || !hoehe) return null;
  const max = optionen.max || 1600;
  const sk = Math.min(1, max / Math.max(breite, hoehe));
  const w = Math.round(breite * sk), h = Math.round(hoehe * sk);
  const c = document.createElement('canvas');
  const dreh = optionen.drehen === 90;
  c.width = dreh ? h : w; c.height = dreh ? w : h;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  if (dreh) { ctx.translate(c.width, 0); ctx.rotate(Math.PI / 2); }
  ctx.drawImage(quelle, 0, 0, w, h);
  if (dreh) ctx.setTransform(1, 0, 0, 1, 0, 0);
  if (window.jsQR && !optionen.nurZxing) {
    const d = ctx.getImageData(0, 0, c.width, c.height);
    const erg = window.jsQR(d.data, d.width, d.height);
    if (erg && erg.data) return erg.data;
  }
  if (optionen.ohneZxing) return null;
  const zx = await holeZxing();
  if (zx) {
    const { Z, reader } = zx;
    const lum = new Z.HTMLCanvasElementLuminanceSource(c);
    for (const Binarizer of [Z.HybridBinarizer, Z.GlobalHistogramBinarizer]) {
      try {
        const res = reader.decode(new Z.BinaryBitmap(new Binarizer(lum)));
        if (res && res.getText()) return res.getText();
      } catch (_) { /* nichts gefunden – nächster Binarizer */ }
    }
  }
  return null;
}
/* Foto/Bild: mehrere Auflösungen und Drehungen durchprobieren (PDF417 ist breit und fein) */
async function dekodiereBildGruendlich(quelle) {
  for (const drehen of [0, 90]) {
    for (const max of [2400, 1600, 1000]) {
      const raw = await dekodiereQuelle(quelle, { max, drehen });
      if (raw) return raw;
    }
  }
  return null;
}

$('#btn-manuell').onclick = () => { $('#scan-manuell-box').hidden = false; $('#scan-code').focus(); };
$('#btn-scan-code').onclick = () => {
  const raw = $('#scan-code').value.trim();
  if (!raw) { toast('Bitte Code eingeben.', 'err'); return; }
  handleCode(raw);
};
$('#btn-scan-vollstaendig-manuell').onclick = async () => {
  const r = await api('POST', '/api/verordnungen/scan', { manuell: {} });
  await reload(false);
  window.fortsetzeAbgleich(r.verordnung.id);
};

/* Kamera / Bild */
let kameraStream = null, kameraTimer = null;
async function startKamera() {
  $('#scan-manuell-box').hidden = true;
  try {
    kameraStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } } });
  } catch (e) {
    toast('Kein Kamerazugriff – bitte Code eingeben oder ein Bild mit QR-/PDF417-Code wählen.', 'err');
    $('#scan-manuell-box').hidden = false;
    return;
  }
  const video = $('#scan-video');
  $('#scan-live').hidden = false;
  video.srcObject = kameraStream;
  await video.play();
  let laeuft = false, takt = 0;
  const VARIANTEN = [{ max: 1920 }, { max: 1280 }, { max: 1920, drehen: 90 }];
  kameraTimer = setInterval(async () => {
    if (!kameraStream || laeuft || !video.videoWidth) return;
    laeuft = true;
    try {
      const raw = await dekodiereQuelle(video, VARIANTEN[takt++ % VARIANTEN.length]);
      if (raw) handleCode(raw);
    } catch (_) { /* Frame überspringen */ } finally { laeuft = false; }
  }, 350);
}
function stopKamera() {
  clearInterval(kameraTimer); kameraTimer = null;
  if (kameraStream) { kameraStream.getTracks().forEach((t) => t.stop()); kameraStream = null; }
  $('#scan-live').hidden = true;
}
$('#btn-kamera').onclick = startKamera;
$('#btn-kamera-stop').onclick = stopKamera;

async function ladeBild(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = url; });
    return img;
  } finally { setTimeout(() => URL.revokeObjectURL(url), 30000); }
}
$('#qr-file').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const img = await ladeBild(file);
    const raw = await dekodiereBildGruendlich(img);
    if (raw) await handleCode(raw);
    else toast('Kein Code (QR/DataMatrix/PDF417) im Bild erkannt. Bitte näher/schärfer fotografieren oder „Foto auslesen (OCR)“ nutzen.', 'err');
  } catch (err) {
    toast(`Bild konnte nicht gelesen werden: ${err.message}`, 'err');
  } finally { e.target.value = ''; }
});

/* ======================= Foto-OCR (Tesseract, komplett offline) ======================= */
function bereiteOcrBildVor(img) {
  const lang = Math.max(img.naturalWidth || img.width, img.naturalHeight || img.height);
  const sk = lang > 2600 ? 2600 / lang : (lang < 1600 ? Math.min(2, 1800 / lang) : 1);
  const c = document.createElement('canvas');
  c.width = Math.round((img.naturalWidth || img.width) * sk); c.height = Math.round((img.naturalHeight || img.height) * sk);
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, c.width, c.height);
  const d = ctx.getImageData(0, 0, c.width, c.height);
  const px = d.data;
  let min = 255, max = 0;
  for (let i = 0; i < px.length; i += 4) {
    const g = Math.round(0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2]);
    px[i] = px[i + 1] = px[i + 2] = g;
    if (g < min) min = g; if (g > max) max = g;
  }
  const spanne = Math.max(1, max - min);
  for (let i = 0; i < px.length; i += 4) {
    const v = Math.max(0, Math.min(255, ((px[i] - min) * 255) / spanne));
    px[i] = px[i + 1] = px[i + 2] = v;
  }
  ctx.putImageData(d, 0, 0);
  return c;
}
async function erkenneText(canvas, fortschritt) {
  await ladeSkript('/vendor/tesseract/tesseract.min.js');
  const basis = `${location.origin}/vendor/tesseract`;
  const worker = await window.Tesseract.createWorker('deu', 1, {
    workerPath: `${basis}/worker.min.js`,
    corePath: basis,
    langPath: `${basis}/lang`,
    gzip: true,
    workerBlobURL: false,
    cacheMethod: 'none',
    logger: (m) => { if (m && m.status === 'recognizing text' && fortschritt) fortschritt(Math.round((m.progress || 0) * 100)); },
  });
  try {
    await worker.setParameters({ preserve_interword_spaces: '1', tessedit_pageseg_mode: '4' });
    const { data } = await worker.recognize(canvas);
    return data.text || '';
  } finally { try { await worker.terminate(); } catch (_) { /* ignorieren */ } }
}
const FELD_NAMEN = {
  name: 'Name', geburtsdatum: 'Geburtsdatum', kostentraeger: 'Kostenträger', versichertenNr: 'Versicherten-Nr.', ausstellungsdatum: 'Ausstellung',
  von: 'von', bis: 'bis', art: 'Art', frequenzProWoche: 'Frequenz/Woche', uebungseinheiten: 'Übungseinheiten', icd10: 'ICD-10',
  arztName: 'Ärztin/Arzt', ziele: 'Ziele', folgeverordnung: 'Folgeverordnung', formular: 'Formular', kostentraegerArt: 'Kostenträgerart',
};
function ocrFelderHtml(felder) {
  const zeilen = Object.entries(felder).filter(([k]) => FELD_NAMEN[k]).map(([k, v]) =>
    `<tr><td class="muted">${esc(FELD_NAMEN[k])}</td><td><strong>${esc(Array.isArray(v) ? v.join(', ') : (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? fmt(v) : v))}</strong></td></tr>`).join('');
  return zeilen ? `<table class="mini-table">${zeilen}</table>` : '<div class="muted">Keine Felder sicher erkannt – Text unten korrigieren oder im Datenabgleich manuell erfassen.</div>';
}
function zeigeOcrErgebnis(text, barcodeRoh, quelleName) {
  let felder = {};
  const auswerten = () => {
    const o = window.RSD_OCR.parseOcrText($('#ocr-text').value);
    felder = Object.assign({}, o.felder);
    if (barcodeRoh) {
      const b = window.RSD_OCR.parseBarcodeText(barcodeRoh);
      felder = Object.assign(felder, b.felder); // Barcode-Werte haben Vorrang
    }
    $('#ocr-felder').innerHTML = ocrFelderHtml(felder);
  };
  openModal('Verordnung ausgelesen', `
    <p class="hint">${barcodeRoh ? '✔ Barcode im Foto gefunden und ausgewertet. ' : ''}Bitte <strong>alle Werte im nächsten Schritt prüfen</strong> – OCR kann sich verlesen (besonders Ziffern in ICD-Codes und Versicherten-Nr.).</p>
    <div id="ocr-felder"></div>
    <label style="display:block;margin-top:10px">Erkannter Text (korrigierbar)
      <textarea id="ocr-text" rows="9" style="width:100%;font-family:monospace;font-size:12px"></textarea></label>`,
  [
    { label: 'Neu auswerten', cls: 'btn', onClick: () => auswerten() },
    { label: 'Abbrechen', cls: 'btn', onClick: () => closeModal() },
    { label: '✔ Übernehmen & Datenabgleich öffnen', cls: 'btn primary', onClick: async () => {
      auswerten();
      const quell = barcodeRoh ? `${barcodeRoh}\n---\n${$('#ocr-text').value}` : $('#ocr-text').value;
      closeModal();
      try {
        const r = await api('POST', '/api/verordnungen/scan', { manuell: felder, format: barcodeRoh ? 'foto-barcode+ocr' : 'foto-ocr', quelltext: quell });
        await reload(false);
        toast(r.wiederholung ? 'Bereits erfasst – offener Abgleich geöffnet.' : 'Foto ausgewertet – Datenabgleich geöffnet.', 'ok');
        window.fortsetzeAbgleich(r.verordnung.id);
      } catch (e) { toast(`Übernahme fehlgeschlagen: ${e.message}`, 'err'); }
    } },
  ], { wide: true });
  $('#ocr-text').value = text;
  auswerten();
}
$('#ocr-file').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  stopKamera();
  openModal('Verordnung wird ausgelesen …', '<div id="ocr-status">Bild wird vorbereitet …</div><div class="muted small">Die Texterkennung läuft komplett auf diesem Gerät (keine Übertragung).</div>', [], { wide: false });
  const status = (t) => { const el = $('#ocr-status'); if (el) el.textContent = t; };
  try {
    const img = await ladeBild(file);
    status('Suche Barcode (PDF417/QR) im Foto …');
    const barcode = await dekodiereBildGruendlich(img);
    status('Texterkennung (OCR) läuft … 0 %');
    const canvas = bereiteOcrBildVor(img);
    const text = await erkenneText(canvas, (p) => status(`Texterkennung (OCR) läuft … ${p} %`));
    closeModal();
    if (!text.trim() && !barcode) { toast('Es konnte kein Text erkannt werden. Bitte gerade, hell und scharf fotografieren.', 'err'); return; }
    zeigeOcrErgebnis(text, barcode, file.name);
  } catch (err) {
    closeModal();
    toast(`OCR fehlgeschlagen: ${err.message}. Alternativ Code eingeben oder manuell erfassen.`, 'err');
  }
});
$('#btn-foto').onclick = () => $('#ocr-file').click();

/* ============================== PATIENTEN ============================== */
function verordnungFuerPatient(pid) {
  return (S.verordnungen || []).filter((v) => v.patientId === pid);
}
function statusChip(status) {
  const map = { abgleich: ['amber', 'Datenabgleich'], vollstaendig: ['green', 'vollständig'], aktiv: ['green', 'aktiv'], abgeschlossen: ['blue', 'abgeschlossen'], abgerechnet: ['purple', 'abgerechnet'], abgebrochen: ['red', 'abgebrochen'], bezahlt: ['green', 'bezahlt'] };
  const [c, t] = map[status] || ['gray', status];
  return `<span class="chip ${c}">${t}</span>`;
}
function kursname(kid) { const k = (S.kurse || []).find((x) => x.id === kid); return k ? k.titel : kid; }
function zuordnungenFuerVerordnung(vid) {
  return (S.zuordnungen || []).filter((z) => z.verordnungId === vid && z.aktiv !== false);
}

function renderPatienten() {
  const such = ($('#pat-suche').value || '').toLowerCase();
  const filter = $('#pat-filter').value, gruppe = $('#pat-gruppe').value, sort = $('#pat-sort').value;
  const gSel = $('#pat-gruppe');
  if (gSel.options.length - 1 !== (S.kurse || []).length) {
    gSel.innerHTML = '<option value="">alle</option>' + (S.kurse || []).map((k) => `<option value="${k.id}">${esc(k.titel)}</option>`).join('');
    gSel.value = gruppe;
  }
  const info = (p) => {
    const vs = verordnungFuerPatient(p.id);
    const aktiv = vs.find((v) => v.status === 'aktiv') || vs[0];
    const kid = aktiv ? zuordnungenFuerVerordnung(aktiv.id).map((z) => z.kursId) : [];
    return { vs, aktiv, kid };
  };
  const liste = (S.patienten || [])
    .filter((p) => !such || `${p.nachname} ${p.vorname} ${p.email} ${p.telefon}`.toLowerCase().includes(such))
    .filter((p) => {
      const { vs, kid } = info(p);
      if (gruppe && !kid.includes(gruppe)) return false;
      if (!filter) return true;
      if (filter === 'keine') return !vs.length;
      if (filter === 'ohne-einwilligung') return !p.einwilligung;
      return vs.some((v) => v.status === filter);
    });
  const cmp = {
    name: (x, y) => x.nachname.localeCompare(y.nachname, 'de') || x.vorname.localeCompare(y.vorname, 'de'),
    'name-z': (x, y) => y.nachname.localeCompare(x.nachname, 'de'),
    geb: (x, y) => String(x.geburtsdatum || '').localeCompare(String(y.geburtsdatum || '')),
    ende: (x, y) => String((info(x).aktiv || {}).bis || '9999').localeCompare(String((info(y).aktiv || {}).bis || '9999')),
  }[sort] || ((x, y) => 0);
  const rows = liste.sort(cmp)
    .map((p) => {
      const { aktiv, kid } = info(p);
      return `<tr>
        <td><strong>${esc(p.nachname)}, ${esc(p.vorname)}</strong>${p.angelegtVon ? `<div class="muted small">angelegt von ${esc(p.angelegtVon)}</div>` : ''}</td>
        <td>${fmt(p.geburtsdatum)}</td>
        <td><div>${esc(p.email || '–')}</div><div class="muted small">${esc(p.telefon || '–')}</div></td>
        <td>${aktiv ? `${statusChip(aktiv.status)} <span class="muted small">${aktiv.uebungseinheiten} ÜE · ${fmt(aktiv.von)}–${fmt(aktiv.bis)}</span>${aktiv.abbruch ? `<div class="muted small">Grund: ${esc(aktiv.abbruch.grund)}</div>` : ''}` : '<span class="chip amber">keine Verordnung</span>'}</td>
        <td>${kid.map((k) => `<span class="chip blue">${esc(kursname(k))}</span>`).join(' ') || '–'}</td>
        <td>${p.einwilligung ? '<span class="chip green">DSGVO ✓</span>' : '<span class="chip red">Einwilligung fehlt</span>'}</td>
        <td class="row"><button class="btn small" onclick="oeffnePatient('${p.id}')">Öffnen</button></td>
      </tr>`;
    }).join('');
  $('#pat-tabelle tbody').innerHTML = rows || '<tr><td colspan="7" class="muted">Keine Patienten gefunden.</td></tr>';
}
['#pat-filter', '#pat-gruppe', '#pat-sort'].forEach((id) => $(id).addEventListener('change', renderPatienten));
$('#pat-suche').addEventListener('input', renderPatienten);

$('#btn-neuer-patient').onclick = () => {
  openModal('Neue/r Patient/in anlegen', `
    <div class="form2">
      <label>Vorname *<input id="np-vor"></label>
      <label>Nachname *<input id="np-nach"></label>
      <label>Geburtsdatum *<input type="date" id="np-geb"></label>
      <label>Telefon<input id="np-tel"></label>
      <label class="span2">E-Mail<input id="np-mail" type="email"></label>
      <label>Straße/Nr.<input id="np-str"></label>
      <div class="row" style="align-items:flex-end"><label>PLZ<input id="np-plz"></label><label>Ort<input id="np-ort"></label></div>
      <label>Angelegt von (Mitarbeiter/in) *<input id="np-angelegt-von" placeholder="Name der erfassenden Person"></label>
      <label class="span2">Bemerkung<textarea id="np-bem" rows="2"></textarea></label>
    </div>
    <p class="hint">Empfehlung (RSD): Stammdaten &amp; Unterschrift möglichst direkt an der Rezeption erfassen. Eine Verordnung kann anschließend per Scan zugeordnet werden.</p>`,
    [
      { label: 'Abbrechen', cls: 'btn', onClick: closeModal },
      { label: 'Anlegen', cls: 'btn primary', onClick: async () => {
        const angelegtVon = $('#np-angelegt-von').value.trim();
        if (!angelegtVon) { toast('Bitte angeben, wer den Patienten angelegt hat.', 'err'); return; }
        try {
          await api('POST', '/api/patienten', {
            vorname: $('#np-vor').value.trim(), nachname: $('#np-nach').value.trim(), geburtsdatum: $('#np-geb').value,
            email: $('#np-mail').value.trim(), telefon: $('#np-tel').value.trim(),
            strasse: $('#np-str').value.trim(), plz: $('#np-plz').value.trim(), ort: $('#np-ort').value.trim(),
            bemerkung: $('#np-bem').value.trim(), angelegtVon,
          });
          closeModal(); await reload(true); toast('Patient/in angelegt.', 'ok');
        } catch (e) { toast(e.message, 'err'); }
      } },
    ]);
};

window.verordnungAbbrechen = (vid) => {
  const v = (S.verordnungen || []).find((x) => x.id === vid);
  if (!v) return;
  const gruende = ['Patient/in hat abgebrochen', 'Krankheit / Krankenhausaufenthalt', 'Umzug', 'Kostenträger hat Leistung beendet', 'Ärztlicher Rat', 'Nicht erschienen / nicht erreichbar', 'Sonstiges'];
  openModal('Verordnung abbrechen', `
    <p class="hint">Bereits erbrachte und unterschriebene Übungseinheiten bleiben abrechenbar. Die Zuordnung zur Gruppe endet.</p>
    <div class="form2">
      <label>Abbruchdatum<input type="date" id="ab-datum" value="${heutigesISO()}"></label>
      <label>Grund *<select id="ab-sel">${gruende.map((g) => `<option>${esc(g)}</option>`).join('')}</select></label>
      <label class="span2">Begründung / Details *<textarea id="ab-text" rows="3" placeholder="z. B. Umzug nach …, ab 12.11. keine Teilnahme mehr"></textarea></label>
    </div>`,
    [
      { label: 'Zurück', cls: 'btn', onClick: closeModal },
      { label: 'Verordnung abbrechen', cls: 'btn danger', onClick: async () => {
        const grund = `${$('#ab-sel').value}${$('#ab-text').value.trim() ? ' – ' + $('#ab-text').value.trim() : ''}`;
        if (!$('#ab-text').value.trim()) { toast('Bitte eine Begründung eintragen.', 'err'); return; }
        try {
          const r = await api('POST', `/api/verordnungen/${vid}/abbruch`, { grund, datum: $('#ab-datum').value });
          closeModal(); await reload(true);
          const storniert = r.termineStorniert || 0;
          toast(`Verordnung abgebrochen.${storniert ? ` ${storniert} zukünftige Kalendereinträge storniert.` : ''}`, 'ok');
        }
        catch (e) { toast(e.message, 'err'); }
      } },
    ]);
};

window.oeffnePatient = async (pid) => {
  const p = (S.patienten || []).find((x) => x.id === pid);
  if (!p) return;
  const vs = verordnungFuerPatient(pid);
  let termine = [], anw = [], abrZeilen = [];
  try {
    [termine, anw, abrZeilen] = await Promise.all([
      api('GET', `/api/patienten/${pid}/termine`).then((r) => r.termine),
      api('GET', `/api/patienten/${pid}/anwesenheit`).then((r) => r.anwesenheit),
      api('GET', '/api/abrechnung').then((r) => r.zeilen || []),
    ]);
  } catch (_) { /* egal */ }

  const vHtml = vs.map((v) => {
    const kid = zuordnungenFuerVerordnung(v.id);
    const erb = v.erbrachteUee ?? (v.abrechnung && v.abrechnung.uee) ?? '–';
    return `<div class="item"><div>
      <strong>${esc((S.regeln.arten[v.art] || {}).label || v.art)}</strong> ${statusChip(v.status)}
      <div class="muted small">${fmt(v.von)} – ${fmt(v.bis)} · ${v.uebungseinheiten} ÜE · ${v.frequenzProWoche}×/Woche · erbracht: ${erb} · ${esc(v.kostentraeger || '')}</div>
      ${v.abbruch ? `<div class="errline">Abgebrochen am ${fmt(v.abbruch.datum)} – Grund: ${esc(v.abbruch.grund)}</div>` : ''}
      <div>${kid.map((z) => `<span class="chip blue">${esc(kursname(z.kursId))}</span>`).join(' ')}</div>
    </div><div class="row">
      ${['abgleich', 'vollstaendig', 'aktiv'].includes(v.status) ? `<button class="btn small danger" onclick="verordnungAbbrechen('${v.id}')">Abbrechen</button>` : ''}
      ${kid.length ? `<button class="btn small" onclick="gruppeAendern('${v.id}')">Gruppe ändern</button>` : ''}
      <button class="btn small" onclick="oeffneVerordnung('${v.id}')">Details/Code</button>
    </div></div>`;
  }).join('') || '<div class="muted">Keine Verordnung – per Scan im Menü „Verordnung/Datenabgleich“ hinzufügen.</div>';

  const tHtml = termine.slice(0, 10).map((t) =>
    `<div class="item"><div><strong>${fmt(t.datum)}</strong> ${esc(t.beginn)} Uhr <span class="muted">· ${esc(t.kursTitel)} · ${esc(t.ort)}</span></div><span class="chip ${t.status === 'ausgefallen' ? 'gray' : 'green'}">${esc(t.status)}</span></div>`).join('')
    || '<div class="muted">Keine anstehenden Termine.</div>';

  const aHtml = anw.slice(0, 15).map((a) =>
    `<div class="item"><div><strong>${fmt(a.datum)}</strong> <span class="muted">${esc(a.kurs)}</span>
      <div class="muted small">Zeitstempel: ${a.zeitstempel ? new Date(a.zeitstempel).toLocaleString('de-DE') : '–'} · Leitung bestätigt: ${a.leiter ? 'ja' : 'nein'}</div></div>
      <div>${a.unterschrift ? '<span class="chip green">digital unterschrieben</span>' : a.wahrgenommen ? '<span class="chip amber">ohne Sig.</span>' : '<span class="chip gray">nicht teilgenommen</span>'}</div></div>`).join('')
    || '<div class="muted">Noch keine Teilnahmen dokumentiert.</div>';

  const fehlend = fehlendeUnterschriften(pid);
  const druckZeilen = vs.filter((v) => !['abgleich'].includes(v.status)).map((v) => {
    const vorg = v.kostentraegerArt === 'rv' || v.formular === 'g0850' ? 'drv' : (v.kostentraegerArt === 'uv' || v.formular === 'dguv' ? 'dguv' : 'standard');
    return `<div class="item"><div><strong>${esc((S.regeln.arten[v.art] || {}).label || v.art)}</strong> <span class="muted small">${fmt(v.von)} – ${fmt(v.bis)}</span></div>
      <div class="row" style="flex-wrap:wrap"><select id="pr-var-${v.id}"><option value="standard" ${vorg === 'standard' ? 'selected' : ''}>Standard (GKV)</option><option value="drv" ${vorg === 'drv' ? 'selected' : ''}>Rentenversicherung</option><option value="dguv" ${vorg === 'dguv' ? 'selected' : ''}>DGUV</option></select>
      <button class="btn small" onclick="druckeListe('${v.id}', document.getElementById('pr-var-${v.id}').value)">🖨 Unterschriftenliste</button>
      <button class="btn small" onclick="druckeVerordnungMitUnterschriften('${v.id}')">🖨 Verordnung + Unterschriften</button>
      <button class="btn small" onclick="druckeRechnung('${v.id}')">🖨 Rechnung</button></div></div>`;
  }).join('') || '<div class="muted">Keine Verordnung für eine Liste vorhanden.</div>';
  const abrHtml = vs.map((v) => {
    const z = abrZeilen.find((x) => x.id === v.id);
    if (!z) return `<div class="item"><div><strong>${esc((S.regeln.arten[v.art] || {}).label || v.art)}</strong> ${statusChip(v.status)}<div class="muted small">Noch nicht abrechnungsrelevant.</div></div></div>`;
    return `<div class="item"><div><strong>${esc(z.artLabel)}</strong> ${statusChip(z.status)}
      <div class="muted small">${fmt(z.von)} – ${fmt(z.bis)} · ${z.erbrachteUee} von ${z.geplanteUee} ÜE erbracht · Satz ${z.satz ? euroFmt(z.satz) : '–'} · Betrag ${z.betrag != null ? euroFmt(z.betrag) : '–'}</div>
      ${z.abrechnung && z.abrechnung.rechnungsNr ? `<div class="muted small">Rechnungs-Nr. ${esc(z.abrechnung.rechnungsNr)}${z.abrechnung.auto ? ' (automatisch erstellt)' : ''} · ${fmt(z.abrechnung.berechnetAm)}</div>` : ''}
      ${z.abbruch ? `<div class="errline">Abbruch ${fmt(z.abbruch.datum)}: ${esc(z.abbruch.grund)}</div>` : ''}</div></div>`;
  }).join('') || '<div class="muted">Keine Verordnung.</div>';
  const tAlle = termine.slice(0, 25).map((t) =>
    `<div class="item"><div><strong>${fmt(t.datum)}</strong> ${esc(t.beginn)} Uhr <span class="muted">· ${esc(t.kursTitel)} · ${esc(t.ort)}</span></div><span class="chip ${t.status === 'ausgefallen' ? 'gray' : 'green'}">${esc(t.status)}</span></div>`).join('')
    || '<div class="muted">Keine anstehenden Termine.</div>';
  const aAlle = anw.slice(0, 40).map((a) =>
    `<div class="item"><div><strong>${fmt(a.datum)}</strong> <span class="muted">${esc(a.kurs)}</span>
      <div class="muted small">Zeitstempel: ${a.zeitstempel ? new Date(a.zeitstempel).toLocaleString('de-DE') : '–'} · Leitung bestätigt: ${a.leiter ? 'ja' : 'nein'}${a.fehlGrund ? ` · Grund: ${esc(a.fehlGrund.grund)}` : ''}</div>
      ${a.unterschriftPng ? `<img src="${a.unterschriftPng}" alt="Unterschrift" style="max-height:40px;max-width:180px;margin-top:4px;border:1px solid var(--line);border-radius:4px;background:#fff">` : ''}</div>
      <div>${a.unterschrift ? '<span class="chip green">digital unterschrieben</span>' : a.unterschriftPapier ? '<span class="chip green">Papierliste</span>' : a.wahrgenommen ? '<span class="chip amber">ohne Sig.</span>' : '<span class="chip gray">nicht teilgenommen</span>'}</div></div>`).join('')
    || '<div class="muted">Noch keine Teilnahmen dokumentiert.</div>';

  openModal(`${p.nachname}, ${p.vorname}`, `
    <div class="ptabs">
      <button class="ptab active" data-pt="ue">Übersicht</button>
      <button class="ptab" data-pt="te">Termine</button>
      <button class="ptab" data-pt="un">Unterschriften${fehlend.length ? ` <span class="chip red">${fehlend.length}</span>` : ''}</button>
      <button class="ptab" data-pt="ab">Abrechnung</button>
      <button class="ptab" data-pt="dk">Dokumente</button>
    </div>
    <div class="ppanel" data-pp="ue">
      <div class="grid2">
      <div>
        <h2 style="font-size:15px">Kontakt &amp; Einwilligung</h2>
        <div class="form2">
          <label>E-Mail<input id="op-mail" value="${esc(p.email || '')}"></label>
          <label>Telefon<input id="op-tel" value="${esc(p.telefon || '')}"></label>
        </div>
        <div class="row" style="margin-top:8px">
          <button class="btn small" id="op-save">Kontakt speichern</button>
          <button class="btn small" id="op-mailbtn">📅 Termin-E-Mail senden</button>
        </div>
        <div style="margin-top:8px">${p.einwilligung
          ? `<span class="chip green">DSGVO-Einwilligung ${fmt((p.einwilligung.erteiltAm || '').slice(0, 10))}</span>${p.einwilligung.unterschriftPng ? ` <img class="sig" style="height:38px;vertical-align:middle" src="${p.einwilligung.unterschriftPng}" alt="Unterschrift">` : ''}`
          : '<button class="btn small" id="op-einw">✍ Einwilligung einholen</button>'}</div>
        <div class="muted small" style="margin-top:6px">Geb.: ${fmt(p.geburtsdatum)} · ${esc(p.strasse || '')} ${esc(p.plz || '')} ${esc(p.ort || '')}</div>
        <div class="muted small" style="margin-top:4px">Angelegt am ${fmt((p.angelegtAm || '').slice(0, 10))}${p.angelegtVon ? ` von <strong>${esc(p.angelegtVon)}</strong>` : ''}</div>
      </div>
        <div>
          <h2 style="font-size:15px">Nächste Termine</h2><div class="list">${tHtml}</div>
        </div>
      </div>
      <h2 style="font-size:15px;margin-top:14px">Verordnungen</h2><div class="list">${vHtml}</div>
    </div>
    <div class="ppanel" data-pp="te" hidden><h2 style="font-size:15px">Anstehende Termine (12 Wochen)</h2><div class="list">${tAlle}</div></div>
    <div class="ppanel" data-pp="un" hidden>
      ${fehlend.length ? `<div class="errline">⚠ ${fehlend.length} Einheit(en) ohne Unterschrift/Grund: ${fehlend.slice(-5).map((x) => fmt(x.datum)).join(', ')} <button class="btn small" id="pt-fehlt">Nachholen / Grund</button></div>` : '<div class="muted small">Keine fehlenden Unterschriften.</div>'}
      <h2 style="font-size:15px;margin-top:10px">Unterschriftenlisten drucken</h2><div class="list">${druckZeilen}</div>
      <h2 style="font-size:15px;margin-top:10px">Teilnahmen (Anwesenheit &amp; Unterschriften)</h2><div class="list">${aAlle}</div>
    </div>
    <div class="ppanel" data-pp="ab" hidden><h2 style="font-size:15px">Abrechnung</h2><div class="list">${abrHtml}</div></div>
    <div class="ppanel" data-pp="dk" hidden><div id="pt-dok"></div></div>`,
    [{ label: 'Schließen', cls: 'btn primary', onClick: closeModal }], { wide: true });

  $$('#modal-body .ptab').forEach((b) => { b.onclick = () => {
    $$('#modal-body .ptab').forEach((x) => x.classList.toggle('active', x === b));
    $$('#modal-body .ppanel').forEach((x) => { x.hidden = x.dataset.pp !== b.dataset.pt; });
    if (b.dataset.pt === 'dk') dokScansInto($('#pt-dok'), pid);
  }; });
  const ptf = $('#pt-fehlt');
  if (ptf) ptf.onclick = () => fehlendeDialog(pid, `${p.nachname}, ${p.vorname}`, () => window.oeffnePatient(pid));

  $('#op-save').onclick = async () => {
    try {
      await api('PUT', `/api/patienten/${pid}`, { email: $('#op-mail').value.trim(), telefon: $('#op-tel').value.trim() });
      await reload(true); toast('Kontaktdaten gespeichert.', 'ok');
    } catch (e) { toast(e.message, 'err'); }
  };
  $('#op-mailbtn').onclick = async () => {
    try { const r = await api('POST', `/api/patienten/${pid}/termine-mail`); toast(mailStatusText(r.outbox), r.outbox.status === 'gesendet' ? 'ok' : ''); }
    catch (e) { toast(e.message, 'err'); }
  };
  const einw = $('#op-einw');
  if (einw) einw.onclick = async () => {
    const png = await openSigPad(`Einwilligung Art. 9 DSGVO – ${p.vorname} ${p.nachname}`, 'Einwilligungserklärung zur Verarbeitung von Gesundheitsdaten');
    if (!png) return;
    try {
      await api('PUT', `/api/patienten/${pid}`, { einwilligung: { erteiltAm: new Date().toISOString(), textVersion: (S.settings.datenschutz || {}).textVersion || '', unterschriftPng: png } });
      await reload(true); closeModal(); toast('Einwilligung dokumentiert.', 'ok');
    } catch (e) { toast(e.message, 'err'); }
  };
};

/* ------------------------- Unterschriftenlisten (Druck) ------------------------- */
const PRINT_CSS = `
  .pr-page{font-family:Arial,Helvetica,sans-serif;color:#000;max-width:900px;margin:0 auto;padding:18px;font-size:12.5px}
  .pr-page h1{font-size:17px;margin:0 0 4px}.pr-page .sub{color:#333;margin-bottom:10px}
  .pr-page table{border-collapse:collapse;width:100%}.pr-page th,.pr-page td{border:1px solid #000;padding:5px 6px;vertical-align:middle}
  .pr-page th{background:#eee;text-align:left}.pr-page thead{display:table-header-group}.pr-page tr{page-break-inside:avoid}
  .pr-page .kopf td{border:none;padding:2px 8px 2px 0}.pr-page .kopf{margin-bottom:10px;width:auto}
  .pr-page td.sig{height:34px;width:34%}.pr-page td.sig img{max-height:30px;max-width:100%}
  .pr-page .foot{margin-top:18px;display:flex;gap:30px}.pr-page .foot div{flex:1;border-top:1px solid #000;padding-top:4px;font-size:11.5px}
  .pr-page .fine{margin-top:10px;font-size:11px;color:#333}`;

function listeHtml(v, variante) {
  const p = (S.patienten || []).find((x) => x.id === v.patientId) || {};
  const an = S.settings.anbieter || {};
  const kids = (S.zuordnungen || []).filter((z) => z.verordnungId === v.id).map((z) => z.kursId);
  const kurse = kids.map((k) => (S.kurse || []).find((x) => x.id === k)).filter(Boolean);
  const trainer = [...new Set(kurse.map((k) => { const t = (S.trainer || []).find((x) => x.id === k.trainerId); return t ? `${t.vorname} ${t.nachname}` : ''; }).filter(Boolean))].join(', ');
  const termine = (S.termine || []).filter((t) => kids.includes(t.kursId) && t.status !== 'ausgefallen' && t.status !== 'verschoben'
    && (!v.von || t.datum >= v.von) && (!v.bis || t.datum <= v.bis)).sort((a, b) => (a.datum + a.beginn).localeCompare(b.datum + b.beginn));
  const n = Math.max(termine.length, Number(v.uebungseinheiten) || 0, 10);
  let zeilen = '';
  for (let i = 0; i < n; i++) {
    const t = termine[i];
    const a = t ? (t.anwesenheit || []).find((x) => x.patientId === v.patientId) : null;
    const sig = a && a.unterschriftPng ? `<img src="${a.unterschriftPng}" alt="">` : (a && a.unterschriftPapier ? '<em>Papier</em>' : '');
    zeilen += `<tr><td style="width:6%">${i + 1}</td><td style="width:14%">${t ? fmt(t.datum) : ''}</td><td style="width:10%">${t ? esc(t.beginn || '') : ''}</td><td class="sig">${sig}</td><td style="width:20%"></td></tr>`;
  }
  const artLabel = (S.regeln.arten[v.art] || {}).label || v.art;
  const titel = { standard: 'Teilnahmenachweis / Unterschriftenliste – Rehabilitationssport und Funktionstraining',
    drv: 'Teilnahmenachweis Rehabilitationssport – Deutsche Rentenversicherung',
    dguv: 'Teilnahmenachweis Rehabilitationssport – gesetzliche Unfallversicherung (DGUV)' }[variante] || 'Unterschriftenliste';
  const extra = variante === 'drv'
    ? `<tr><td>Versicherungsnummer (DRV):</td><td><strong>${esc(v.versichertenNr || '______________')}</strong></td></tr><tr><td>Aktenzeichen / Bewilligung:</td><td>______________________</td></tr>`
    : variante === 'dguv'
      ? `<tr><td>Aktenzeichen / Schadensnummer:</td><td>______________________</td></tr><tr><td>Unfalltag:</td><td>______________________</td></tr>`
      : `<tr><td>Versichertennummer:</td><td><strong>${esc(v.versichertenNr || '______________')}</strong></td></tr>`;
  return `<style>${PRINT_CSS}</style><div class="pr-page">
    <h1>${esc(titel)}</h1><div class="sub">${esc(an.name || '')}${an.ik ? ' · IK ' + esc(an.ik) : ''}${an.strasse ? ' · ' + esc(an.strasse) : ''} ${esc(an.plz || '')} ${esc(an.ort || '')}</div>
    <table class="kopf">
      <tr><td>Teilnehmer/in:</td><td><strong>${esc(p.nachname || v.name || '')}, ${esc(p.vorname || '')}</strong> (geb. ${fmt(p.geburtsdatum || v.geburtsdatum)})</td></tr>
      ${extra}
      <tr><td>Kostenträger:</td><td>${esc(v.kostentraeger || '')}</td></tr>
      <tr><td>Maßnahme:</td><td>${esc(artLabel)} · ${v.uebungseinheiten || '–'} ÜE · ${v.frequenzProWoche || '–'}×/Woche</td></tr>
      <tr><td>Verordnungszeitraum:</td><td>${fmt(v.von)} – ${fmt(v.bis)}</td></tr>
      <tr><td>Gruppe / Ort:</td><td>${esc(kurse.map((k) => k.titel + (k.ort ? ' (' + k.ort + ')' : '')).join(' + ') || '–')}</td></tr>
      <tr><td>Übungsleitung:</td><td>${esc(trainer || '–')}</td></tr>
    </table>
    <table><thead><tr><th>Nr.</th><th>Datum</th><th>Uhrzeit</th><th>Unterschrift Teilnehmer/in</th><th>Kürzel Übungsleitung</th></tr></thead><tbody>${zeilen}</tbody></table>
    <div class="foot"><div>Ort, Datum</div><div>Unterschrift Übungsleitung</div></div>
    <div class="fine">Mit der Unterschrift bestätigt die/der Teilnehmende die Teilnahme an der jeweiligen Übungseinheit. Unterschrift unmittelbar vor oder nach der Einheit, keine Vordatierung.</div>
  </div>`;
}

function zeigeDruckansicht(html, dateiname) {
  let root = $('#print-root');
  if (!root) { root = document.createElement('div'); root.id = 'print-root'; document.body.appendChild(root); }
  root.innerHTML = `<div class="pr-bar noprint"><button class="btn primary" id="pr-print">🖨 Drucken</button><button class="btn" id="pr-share">Als HTML teilen/speichern</button><button class="btn" id="pr-close">Schließen</button>
    <span class="muted small">Nachbildung der üblichen Teilnahmenachweise – kein amtliches Formular; bitte mit dem Original des Kostenträgers abgleichen.</span></div>${html}`;
  root.hidden = false; document.body.classList.add('printing');
  const zu = () => { root.hidden = true; root.innerHTML = ''; document.body.classList.remove('printing'); };
  $('#pr-close').onclick = zu;
  $('#pr-print').onclick = () => { try { window.print(); } catch (_) { toast('Drucken wird hier nicht unterstützt – bitte „Als HTML teilen/speichern“ nutzen.', 'err'); } };
  $('#pr-share').onclick = () => dateiTeilen(dateiname, `<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(dateiname)}</title></head><body>${html}</body></html>`, 'text/html');
}

window.druckeListe = (vid, variante) => {
  const v = (S.verordnungen || []).find((x) => x.id === vid);
  if (!v) return;
  const p = (S.patienten || []).find((x) => x.id === v.patientId) || {};
  zeigeDruckansicht(listeHtml(v, variante || 'standard'), `Unterschriftenliste_${(p.nachname || 'Patient').replace(/\W+/g, '_')}_${variante || 'standard'}.html`);
};

/* ---- Verordnung mit Unterschriften drucken ---- */
window.druckeVerordnungMitUnterschriften = (vid) => {
  const v = (S.verordnungen || []).find((x) => x.id === vid);
  if (!v) return;
  const p = (S.patienten || []).find((x) => x.id === v.patientId) || {};
  const an = S.settings.anbieter || {};
  const kids = (S.zuordnungen || []).filter((z) => z.verordnungId === v.id).map((z) => z.kursId);
  const kurse = kids.map((k) => (S.kurse || []).find((x) => x.id === k)).filter(Boolean);
  const trainer = [...new Set(kurse.map((k) => { const t = (S.trainer || []).find((x) => x.id === k.trainerId); return t ? `${t.vorname} ${t.nachname}` : ''; }).filter(Boolean))].join(', ');
  const termine = (S.termine || []).filter((t) => kids.includes(t.kursId) && t.status !== 'ausgefallen' && t.status !== 'verschoben'
    && (!v.von || t.datum >= v.von) && (!v.bis || t.datum <= v.bis)).sort((a, b) => (a.datum + a.beginn).localeCompare(b.datum + b.beginn));
  const artLabel = (S.regeln.arten[v.art] || {}).label || v.art;
  /* Unterschriften aus den Terminen sammeln */
  const sigZeilen = termine.map((t, i) => {
    const a = (t.anwesenheit || []).find((x) => x.patientId === v.patientId);
    const sig = a && a.unterschriftPng ? `<img src="${a.unterschriftPng}" alt="Unterschrift" style="max-height:32px;max-width:160px">` : (a && a.unterschriftPapier ? '<em>Papier</em>' : '<span style="color:#999">–</span>');
    const teilgenommen = a && a.wahrgenommen;
    return `<tr><td>${i + 1}</td><td>${fmt(t.datum)}</td><td>${esc(t.beginn || '')}</td><td>${esc((S.kurse || []).find((k) => k.id === t.kursId)?.titel || '')}</td>
      <td style="text-align:center">${teilgenommen ? '✓' : '–'}</td><td class="sig">${sig}</td></tr>`;
  }).join('');
  const anmeldungSig = v.anmeldung && v.anmeldung.unterschriftPng ? `<img src="${v.anmeldung.unterschriftPng}" alt="Anmeldung-Unterschrift" style="max-height:50px;max-width:220px">` : '–';
  const einwillSig = p.einwilligung && p.einwilligung.unterschriftPng ? `<img src="${p.einwilligung.unterschriftPng}" alt="Einwilligung-Unterschrift" style="max-height:50px;max-width:220px">` : '–';
  const html = `<style>${PRINT_CSS}</style><div class="pr-page">
    <h1>Verordnung mit Unterschriften</h1>
    <div class="sub">${esc(an.name || '')}${an.ik ? ' · IK ' + esc(an.ik) : ''}${an.strasse ? ' · ' + esc(an.strasse) : ''} ${esc(an.plz || '')} ${esc(an.ort || '')}</div>
    <h2 style="font-size:15px;margin-top:12px">Verordnungsdaten</h2>
    <table class="kopf">
      <tr><td>Teilnehmer/in:</td><td><strong>${esc(p.nachname || v.name || '')}, ${esc(p.vorname || '')}</strong> (geb. ${fmt(p.geburtsdatum || v.geburtsdatum)})</td></tr>
      <tr><td>Versichertennummer:</td><td>${esc(v.versichertenNr || '–')}</td></tr>
      <tr><td>Kostenträger:</td><td>${esc(v.kostentraeger || '')} (${esc(v.kostentraegerArt || 'gkv')})</td></tr>
      <tr><td>Maßnahme:</td><td>${esc(artLabel)} · ${v.uebungseinheiten || '–'} ÜE · ${v.frequenzProWoche || '–'}×/Woche</td></tr>
      <tr><td>Verordnungszeitraum:</td><td>${fmt(v.von)} – ${fmt(v.bis)}</td></tr>
      <tr><td>Arzt/Ärztin:</td><td>${esc(v.arztName || '–')}</td></tr>
      <tr><td>ICD-10:</td><td>${esc((v.icd10 || []).join(', '))}</td></tr>
      <tr><td>Gruppe / Ort:</td><td>${esc(kurse.map((k) => k.titel + (k.ort ? ' (' + k.ort + ')' : '')).join(' + ') || '–')}</td></tr>
      <tr><td>Übungsleitung:</td><td>${esc(trainer || '–')}</td></tr>
      <tr><td>Status:</td><td>${esc(v.status)}</td></tr>
    </table>
    <h2 style="font-size:15px;margin-top:16px">Anmeldung &amp; Einwilligung (DSGVO)</h2>
    <table>
      <tr><td style="width:50%">Anmeldung vom ${v.anmeldung ? fmt(v.anmeldung.datum) : '–'}:<br>${anmeldungSig}</td>
      <td style="width:50%">DSGVO-Einwilligung${p.einwilligung ? ' vom ' + fmt((p.einwilligung.erteiltAm || '').slice(0, 10)) : ' fehlt'}:<br>${einwillSig}</td></tr>
    </table>
    <h2 style="font-size:15px;margin-top:16px">Teilnahmenachweis (Unterschriften je Übungseinheit)</h2>
    <table>
      <thead><tr><th>Nr.</th><th>Datum</th><th>Uhrzeit</th><th>Gruppe</th><th>Teiln.</th><th>Unterschrift Teilnehmer/in</th></tr></thead>
      <tbody>${sigZeilen || '<tr><td colspan="6">Keine Termine im Verordnungszeitraum.</td></tr>'}</tbody>
    </table>
    <div class="foot"><div>Ort, Datum</div><div>Unterschrift Übungsleitung</div></div>
    <div class="fine">Mit der Unterschrift bestätigt die/der Teilnehmende die Teilnahme an der jeweiligen Übungseinheit. Unterschrift unmittelbar vor oder nach der Einheit, keine Vordatierung. Gedruckt am ${fmt(heutigesISO())}.</div>
  </div>`;
  zeigeDruckansicht(html, `Verordnung_Unterschriften_${(p.nachname || 'Patient').replace(/\W+/g, '_')}.html`);
};

function mailStatusText(m) {
  if (!m) return 'Unbekannter Status';
  if (m.status === 'gesendet') return `E-Mail gesendet an ${(m.an || []).join(', ')}`;
  if (m.status === 'mailto-bereit') return `Entwurf bereit – Senden über das E-Mail-Programm: ${(m.an || []).join(', ')}`;
  if (m.status === 'konfiguration-offen') return 'SMTP nicht konfiguriert – Entwurf liegt im Journal (Einstellungen).';
  if (m.status === 'fehler') return `Fehler: ${m.fehler}`;
  return 'wartet auf Versand';
}

/** Datei teilen (Web Share) bzw. Zwischenablage/Download – für den APK-Modus. */
async function dateiTeilen(name, inhalt, mime) {
  try {
    const file = new File([inhalt], name, { type: mime });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: name });
      return;
    }
  } catch (e) { if (e && e.name === 'AbortError') return; }
  try { await navigator.clipboard.writeText(String(inhalt)); toast('In die Zwischenablage kopiert – in der E-Mail-App/Dort einfügen.', 'ok'); return; } catch (_) { /* weiter */ }
  const blob = new Blob([inhalt], { type: mime });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 8000);
}

window.oeffneVerordnung = (vid) => {
  const v = (S.verordnungen || []).find((x) => x.id === vid);
  if (!v) return;
  openModal(`Verordnung ${v.id}`, `
    <div class="grid2">
      <div class="list">
        ${[['Versicherte/r', v.name], ['Geburtsdatum', fmt(v.geburtsdatum)], ['Kostenträger', `${v.kostentraeger || '–'} (${v.kostentraegerArt || 'gkv'})`],
          ['Versicherten-Nr.', v.versichertenNr], ['Zeitraum', `${fmt(v.von)} – ${fmt(v.bis)}`], ['ÜE / Frequenz', `${v.uebungseinheiten} ÜE · ${v.frequenzProWoche}×/Woche`],
          ['Art', (S.regeln.arten[v.art] || {}).label || v.art], ['ICD-10', (v.icd10 || []).join(', ')], ['Arzt/Ärztin', v.arztName],
          ['Kostenübernahme', v.kostenuebernahme && v.kostenuebernahme.liegtVor ? `${fmt(v.kostenuebernahme.datum)} ✓` : 'fehlt ✕'],
          ['Formular', v.formular], ['Status', statusChip(v.status)]].map(([a, b]) => `<div class="item"><span class="muted">${esc(a)}</span><strong>${esc(b ?? '–')}</strong></div>`).join('')}
      </div>
      <div style="text-align:center">
        <div class="muted small">QR-Code der Verordnung (Neu-Scan führt in denselben Datenabgleich):</div>
        <div id="vo-qr" style="display:inline-block;padding:6px;background:#fff;border:1px solid var(--line);border-radius:10px"></div>
        <div class="muted small">Zuletzt erbrachte ÜE: ${v.erbrachteUee ?? '–'} / ${v.uebungseinheiten}</div>
      </div>
    </div>`,
    [{ label: 'Schließen', cls: 'btn primary', onClick: closeModal }], { wide: true });
  // QR rendern: lokal im Gerät (qrcode-generator) bzw. per Server-PNG
  const qrBox = $('#vo-qr');
  if (window.LOCAL_MODE) {
    try {
      const payload = JSON.stringify({ rs: '1', n: v.name, g: v.geburtsdatum, kk: v.kostentraeger, vs: v.versichertenNr, von: v.von, bis: v.bis, art: v.art, f: v.frequenzProWoche, ue: v.uebungseinheiten, icd: (v.icd10 || []).join(','), z: v.ziele, arzt: v.arztName, ft: v.formular, id: v.id });
      const c = window.qrcode(0, 'M');
      c.addData(payload);
      c.make();
      qrBox.innerHTML = c.createSvgTag({ cellSize: 4, margin: 2, scalable: true });
      const svg = qrBox.querySelector('svg');
      if (svg) { svg.style.width = '240px'; svg.style.height = '240px'; }
    } catch (e) { qrBox.textContent = 'QR-Erzeugung nicht verfügbar.'; }
  } else {
    qrBox.innerHTML = `<img src="/api/verordnungen/${v.id}/qrcode.png" alt="QR" style="max-width:260px">`;
  }
};

window.gruppeAendern = (vid) => {
  const v = (S.verordnungen || []).find((x) => x.id === vid);
  const aktuell = zuordnungenFuerVerordnung(vid).map((z) => z.kursId);
  const passend = (S.kurse || []).filter((k) => k.aktiv && k.art === v.art);
  openModal('Gruppe (Kurs) ändern', `
    <p class="hint">Ein Gruppenwechsel ist nur begründet zulässig und wird dokumentiert (kein willkürliches „Gruppenhopping“). Die neue Gruppe muss zur verordneten Art passen.</p>
    <div class="gruppe-list" id="ga-list">
      ${passend.map((k) => `<div class="gruppe ${aktuell.includes(k.id) ? 'selected' : ''}" data-id="${k.id}">
        <div><div class="t">${esc(k.titel)}</div><div class="muted small">${WOCHENTAGE[k.wochentag]} ${esc(k.beginn)} · ${esc(k.ort || '')} · ${(S.trainer || []).find((t) => t.id === k.trainerId) ? esc(`${(S.trainer.find((t) => t.id === k.trainerId) || {}).vorname} ${(S.trainer.find((t) => t.id === k.trainerId) || {}).nachname}`) : ''}</div></div>
        <div>${aktuell.includes(k.id) ? '<span class="chip green">aktuell</span>' : '<span class="chip gray">wählbar</span>'}</div></div>`).join('') || '<div class="muted">Keine passenden Kurse angelegt.</div>'}
    </div>
    <label style="margin-top:10px">Begründung des Gruppenwechsels *<textarea id="ga-grund" rows="2"></textarea></label>`,
    [
      { label: 'Abbrechen', cls: 'btn', onClick: closeModal },
      { label: 'Wechsel speichern', cls: 'btn primary', onClick: async () => {
        const gewaehlt = $$('#ga-list .gruppe.selected').map((el) => el.dataset.id);
        const grund = $('#ga-grund').value.trim();
        if (!gewaehlt.length) { toast('Bitte Gruppe(n) wählen.', 'err'); return; }
        if (gewaehlt.join() !== aktuell.join() && !grund) { toast('Für einen Gruppenwechsel ist eine Begründung erforderlich.', 'err'); return; }
        try {
          await api('PUT', `/api/verordnungen/${vid}`, { kursIds: gewaehlt, gruppenwechselGrund: grund || undefined });
          closeModal(); await reload(true); toast('Gruppe(n) aktualisiert.', 'ok');
        } catch (e) { toast(e.message, 'err'); }
      } },
    ]);
  $$('#ga-list .gruppe').forEach((el) => { el.onclick = () => el.classList.toggle('selected'); });
};

/* ============================== TRAINER ============================== */
function renderTrainer() {
  const box = $('#trainer-karten');
  box.innerHTML = (S.trainer || []).map((t) => {
    const kurse = (S.kurse || []).filter((k) => k.trainerId === t.id && k.aktiv);
    const rest = t.zertifikateBis ? Math.round((new Date(t.zertifikateBis) - new Date()) / 86400000) : null;
    const abgelaufen = rest !== null && rest < 0;
    const bald = rest !== null && rest >= 0 && rest < 90;
    const nf = (S.regeln.notfallqualifikationen || []).find((n) => n.id === t.notfallqualifikation);
    const farbeStyle = t.farbe ? `border-left:5px solid ${t.farbe};` : '';
    const farbeDot = t.farbe ? `<span style="display:inline-block;width:14px;height:14px;border-radius:50%;background:${esc(t.farbe)};vertical-align:middle;margin-right:4px" title="Farbe: ${esc(t.farbe)}"></span>` : '';
    return `<div class="karte ${t.aktiv ? '' : 'nein'}" style="${farbeStyle}">
      <h3>${farbeDot}${esc(t.vorname)} ${esc(t.nachname)}
        ${t.aktiv ? '<span class="chip green">aktiv</span>' : '<span class="chip gray">inaktiv</span>'}
        ${t.barAnerkennung === 'anerkannt' ? '<span class="chip blue">BAR/RSD ✓</span>' : '<span class="chip red">keine Anerkennung</span>'}</h3>
      <div class="chips">${(t.qualifikationen || []).map((q) => `<span class="chip">${esc((S.regeln.qualifikationen.find((x) => x.id === q) || {}).label || q)}</span>`).join('')}</div>
      <div class="meta">🚑 Notfall: ${esc(nf ? nf.label : '–')} ${t.notfallGueltigBis ? `· gültig bis ${fmt(t.notfallGueltigBis)}` : ''}<br>
        📜 Nachweis gültig bis: <strong>${fmt(t.zertifikateBis)}</strong>${(t.qualifikationen || []).includes('herzgruppenleiter') && t.zertifikatHerzBis ? ` (Herz: ${fmt(t.zertifikatHerzBis)})` : ''}<br>
        ✉ ${esc(t.email || '–')} · ☎ ${esc(t.telefon || '–')}${t.stundenlohn ? ` · 💶 ${euroFmt(t.stundenlohn)}/Std.` : ''}<br>
        📋 Verschwiegenheitserklärung: ${t.verchwiegenheit || t.verchwiegenheitDatum ? '✓ ' + fmt(t.verchwiegenheit || t.verchwiegenheitDatum) : '<span class="chip amber">offen (§203/Art.9)</span>'}
        · Datenschutz-Belehrung: ${t.datenschutzBelehrung ? '✓ ' + fmt(t.datenschutzBelehrung) : '–'}</div>
      ${abgelaufen ? '<div class="errline">⚠ Qualifikationsnachweis abgelaufen – Einsatz unzulässig (auch für Vertretungen)!</div>' :
        bald ? `<div class="warnline">⚠ Nachweis läuft in ${rest} Tagen ab (Herzgruppen max. 2 J., sonst 4 J.).</div>` : ''}
      ${kurse.length ? `<div class="meta">Kurse: ${kurse.map((k) => esc(k.titel)).join(' · ')}</div>` : '<div class="meta muted">Keine Kurse</div>'}
      <div class="acts">
        <button class="btn small" onclick="trainerForm('${t.id}')">Bearbeiten</button>
        <button class="btn small ${t.aktiv ? 'danger' : ''}" onclick="trainerToggle('${t.id}')">${t.aktiv ? 'Deaktivieren' : 'Reaktivieren'}</button>
      </div>
    </div>`;
  }).join('') || '<div class="muted">Noch keine Trainer/innen angelegt.</div>';
}

window.trainerForm = (id) => {
  const t = id ? (S.trainer || []).find((x) => x.id === id) : null;
  const nfOpts = (S.regeln.notfallqualifikationen || []).map((n) =>
    `<option value="${n.id}" ${t && t.notfallqualifikation === n.id ? 'selected' : ''}>${esc(n.label)}</option>`).join('');
  const qBoxes = (S.regeln.qualifikationen || []).map((q) =>
    `<label class="check"><input type="checkbox" class="tf-q" value="${q.id}" ${t && (t.qualifikationen || []).includes(q.id) ? 'checked' : ''} ${!t && q.id === 'uebungsleiter' ? 'checked' : ''}> ${esc(q.label)}</label>`).join('');
  openModal(t ? `Trainer/in bearbeiten: ${t.vorname} ${t.nachname}` : 'Neue/r Trainer/in', `
    <div class="form2">
      <label>Vorname *<input id="tf-vor" value="${esc(t ? t.vorname : '')}"></label>
      <label>Nachname *<input id="tf-nach" value="${esc(t ? t.nachname : '')}"></label>
      <label>E-Mail<input id="tf-mail" value="${esc(t ? t.email : '')}"></label>
      <label>Telefon<input id="tf-tel" value="${esc(t ? t.telefon : '')}"></label>
      <label>Stundenlohn (€/Std.)<input type="number" step="0.01" min="0" id="tf-lohn" value="${esc(t && t.stundenlohn ? t.stundenlohn : '')}"></label>
      <label>Farbe zuordnen<input type="color" id="tf-farbe" value="${esc(t && t.farbe ? t.farbe : '#0b6b6b')}" style="height:38px;padding:2px"></label>
      <label>Nachweis gültig bis (max. 4 J.) *<input type="date" id="tf-bis" value="${esc(t ? t.zertifikateBis : '')}"></label>
      <label>Herzgruppen-Zertifikat gültig bis (max. 2 J.)<input type="date" id="tf-hzbis" value="${esc(t ? t.zertifikatHerzBis : '')}"></label>
      <label>Notfallqualifikation (Rahmenvereinbarung)<select id="tf-nf">${nfOpts}</select></label>
      <label>Notfallqualifikation gültig bis<input type="date" id="tf-nfbis" value="${esc(t ? t.notfallGueltigBis : '')}"></label>
      <label>Anerkennung<select id="tf-ane">
        <option value="anerkannt" ${!t || t.barAnerkennung === 'anerkannt' ? 'selected' : ''}>BAR/RSD anerkannt &amp; genehmigt</option>
        <option value="pruefung" ${t && t.barAnerkennung === 'pruefung' ? 'selected' : ''}>in Prüfung</option>
        <option value="nein" ${t && t.barAnerkennung === 'nein' ? 'selected' : ''}>nicht anerkannt</option></select></label>
      <label class="check"><input type="checkbox" id="tf-rsd" ${t && t.rsdMitglied ? 'checked' : ''}> Mitglied RehaSport Deutschland e.&nbsp;V.</label>
      <label class="span2">Qualifikationen / Fachbereiche (auch für Urlaubs-/Krankheitsvertretungen relevant)</label>
      <div class="span2" style="columns:2">${qBoxes}</div>
      <label>Verschwiegenheitserklärung am<input type="date" id="tf-versch" value="${esc(t ? (t.verchwiegenheit || t.verchwiegenheitDatum || '') : '')}"></label>
      <label>Datenschutz-Belehrung am<input type="date" id="tf-dsb" value="${esc(t ? t.datenschutzBelehrung : '')}"></label>
      <label class="span2">Bemerkung<textarea id="tf-bem" rows="2">${esc(t ? t.bemerkung : '')}</textarea></label>
      <label class="span2 check"><input type="checkbox" id="tf-aktiv" ${!t || t.aktiv ? 'checked' : ''}> Aktiv einsetzbar</label>
    </div>`,
    [
      { label: 'Abbrechen', cls: 'btn', onClick: closeModal },
      ...(t ? [{ label: 'Löschen', cls: 'btn danger', onClick: async () => {
        if (!confirm('Trainer/in löschen? (wird deaktiviert, falls Kurse bestehen)')) return;
        try { await api('DELETE', `/api/trainer/${t.id}`); closeModal(); await reload(true); toast('Gelöscht/deaktiviert.'); } catch (e) { toast(e.message, 'err'); }
      } }] : []),
      { label: 'Speichern', cls: 'btn primary', onClick: async () => {
        const payload = {
          vorname: $('#tf-vor').value.trim(), nachname: $('#tf-nach').value.trim(),
          email: $('#tf-mail').value.trim(), telefon: $('#tf-tel').value.trim(), stundenlohn: $('#tf-lohn').value,
          farbe: $('#tf-farbe').value || '',
          zertifikateBis: $('#tf-bis').value, zertifikatHerzBis: $('#tf-hzbis').value,
          notfallqualifikation: $('#tf-nf').value, notfallGueltigBis: $('#tf-nfbis').value,
          barAnerkennung: $('#tf-ane').value, rsdMitglied: $('#tf-rsd').checked,
          qualifikationen: $$('#modal-body input.tf-q:checked').map((c) => c.value),
          verchwiegenheit: $('#tf-versch').value, datenschutzBelehrung: $('#tf-dsb').value,
          bemerkung: $('#tf-bem').value.trim(), aktiv: $('#tf-aktiv').checked,
        };
        if (!payload.vorname || !payload.nachname) { toast('Vor- und Nachname erforderlich.', 'err'); return; }
        try {
          await api(t ? 'PUT' : 'POST', t ? `/api/trainer/${t.id}` : '/api/trainer', payload);
          closeModal(); await reload(true); toast('Gespeichert.', 'ok');
        } catch (e) { toast(e.message, 'err'); }
      } },
    ], { wide: true });
};
$('#btn-neuer-trainer').onclick = () => trainerForm(null);

window.trainerToggle = async (id) => {
  const t = (S.trainer || []).find((x) => x.id === id);
  try { await api('PUT', `/api/trainer/${id}`, { aktiv: !t.aktiv }); await reload(true); }
  catch (e) { toast(e.message, 'err'); }
};

document.addEventListener('change', (e) => {
  if (e.target && e.target.id === 'kf-titelsel' && e.target.value) { $('#kf-titel').value = e.target.value; $('#kf-titel').focus(); }
});

/* ============================== KURSE ============================== */
function renderKurse() {
  $('#kurs-liste').innerHTML = (S.kurse || []).map((k) => {
    const pr = (S.kursPruefungen || {})[k.id] || { fehler: [], hinweise: [] };
    const tr = (S.trainer || []).find((t) => t.id === k.trainerId);
    const belegt = (S.zuordnungen || []).filter((z) => z.kursId === k.id && z.aktiv !== false).length;
    const art = S.regeln.arten[k.art] || {};
    return `<div class="karte ${k.aktiv ? '' : 'nein'}">
      <h3>${esc(k.titel)} ${k.aktiv ? '<span class="chip green">aktiv</span>' : '<span class="chip gray">inaktiv</span>'}</h3>
      <div class="chips"><span class="chip blue">${esc(art.label || k.art)}</span>
        <span class="chip">${WOCHENTAGE_LANG[k.wochentag]} ${esc(k.beginn)} Uhr</span>
        <span class="chip">${k.dauerMin} Min. (mind. ${art.minDauerMin})</span>
        <span class="chip ${belegt >= (k.maxTeilnehmer || art.maxTN) ? 'amber' : 'green'}">${belegt}/${k.maxTeilnehmer || art.maxTN} TN</span></div>
      <div class="meta">👨‍🏫 ${tr ? esc(`${tr.vorname} ${tr.nachname}`) : 'keine Übungsleitung!'} · 📍 ${esc(k.ort || '–')}
        ${k.raumflaecheQm ? `· 📐 ${k.raumflaecheQm} qm (max. ${Math.floor(k.raumflaecheQm / (art.qmProTN || 5))} TN)` : ''}
        <br>📅 Start ${fmt(k.startdatum)}${k.enddatum ? ` – Ende ${fmt(k.enddatum)}` : ' – laufend'}
        ${(k.art === 'herzgruppe' || k.art === 'herzinsuffizienz') ? `<br>🩺 ${esc((k.betreuungsArzt || {}).name || 'kein Betreuungsarzt!')} · AED: ${k.aed && k.aed.vorhanden ? '✓ ' + fmt(k.aed.wartungAm) : '✕'} · Notfallplan: ${k.notfallplan ? '✓' : '✕'} · Koffer: ${k.notfallkoffer ? '✓' : '✕'}` : ''}</div>
      ${pr.fehler.map((f) => `<div class="errline">✕ ${esc(f)}</div>`).join('')}
      ${pr.hinweise.map((h) => `<div class="warnline">⚠ ${esc(h)}</div>`).join('')}
      <div class="acts">
        <button class="btn small" onclick="kursForm('${k.id}')">Bearbeiten</button>
        <button class="btn small" onclick="oeffneKalenderTagKurs('${k.id}')">Termine</button>
        <button class="btn small ${k.aktiv ? 'danger' : ''}" onclick="kursToggle('${k.id}')">${k.aktiv ? 'Deaktivieren' : 'Reaktivieren'}</button>
      </div>
    </div>`;
  }).join('') || '<div class="muted">Noch keine Kurse angelegt.</div>';
}

window.kursForm = (id) => {
  const k = id ? (S.kurse || []).find((x) => x.id === id) : null;
  const artOpts = Object.entries(S.regeln.arten).map(([a, info]) =>
    `<option value="${a}" ${k && k.art === a ? 'selected' : (!k && a === 'rs' ? 'selected' : '')}>${esc(info.label)} (mind. ${info.minDauerMin} Min., max. ${info.maxTN} TN)</option>`).join('');
  const trOpts = (S.trainer || []).map((t) =>
    `<option value="${t.id}" ${k && k.trainerId === t.id ? 'selected' : ''}>${esc(t.vorname)} ${esc(t.nachname)}${t.barAnerkennung === 'anerkannt' ? '' : ' (nicht anerkannt!)'}</option>`).join('');
  const wtOpts = WOCHENTAGE_LANG.map((w, i) => `<option value="${i}" ${k && Number(k.wochentag) === i ? 'selected' : (!k && i === 3 ? 'selected' : '')}>${w}</option>`).join('');
  const ba = (k && k.betreuungsArzt) || {};
  const aed = (k && k.aed) || {};
  const isHerz = k && (k.art === 'herzgruppe' || k.art === 'herzinsuffizienz');
  openModal(k ? `Kurs bearbeiten: ${k.titel}` : 'Neuen Kurs eintragen', `
    <div class="form2">
      <label class="span2">Gruppenname – aus Liste wählen oder selbst eintragen<select id="kf-titelsel"><option value="">– Vorschlag wählen –</option>${((S.settings.gruppennamen) || []).map((n) => `<option>${esc(n)}</option>`).join('')}</select></label>
      <label class="span2">Titel der festen Gruppe *<input id="kf-titel" value="${esc(k ? k.titel : '')}" placeholder="z. B. Rehasport Wirbelsäule – Mi 17:00"></label>
      <label>Art *<select id="kf-art">${artOpts}</select></label>
      <label>Übungsleitung *<select id="kf-trainer"><option value="">– wählen –</option>${trOpts}</select></label>
      <label>Wochentag *<select id="kf-wt">${wtOpts}</select></label>
      <label>Beginn *<input type="time" id="kf-beginn" value="${esc(k ? k.beginn : '17:00')}"></label>
      <label>Dauer (Min.) *<input type="number" id="kf-dauer" value="${esc(k ? k.dauerMin : 45)}" min="30" max="180"></label>
      <label>Max. Teilnehmer<input type="number" id="kf-max" value="${esc(k ? k.maxTeilnehmer : 15)}" min="1" max="25"></label>
      <label>Ort / Raum<input id="kf-ort" value="${esc(k ? k.ort : '')}"></label>
      <label>Raumfläche nutzbar (qm)<input type="number" id="kf-qm" value="${k ? k.raumflaecheQm || '' : ''}" placeholder="5 qm × TN"></label>
      <label>Startdatum *<input type="date" id="kf-start" value="${esc(k ? k.startdatum : heutigesISO())}"></label>
      <label>Enddatum (optional)<input type="date" id="kf-ende" value="${esc(k ? k.enddatum : '')}"></label>

      <div class="span2 hint" id="kf-herz-hint" ${isHerz ? '' : 'hidden'}>
        <strong>Herzgruppen-Regeln:</strong> ständige ärztliche Anwesenheit bzw. Visitation mind. alle 6 Wochen (dokumentiert),
        Notfallplan, (A)ED, Notfallkoffer, Notfallübungen 2×/Jahr. Mindestdauer 60 Minuten, max. 20 TN (Herzinsuffizienz: 12).
        NRW-Hilfsfrist 8 Min. (ländlich 12 Min.).</div>
      <label class="span2">Betreuende/r Ärztin/Arzt (Herzgruppe)<input id="kf-arzt" value="${esc(ba.name || '')}" placeholder="Name, Fachbereich, Erreichbarkeit"></label>
      <label>Letzte Arztvisitation<input type="date" id="kf-vis" value="${esc(ba.visitationAm || '')}"></label>
      <label>Letzte Notfallübung<input type="date" id="kf-notfueb" value="${esc(k ? k.notfallUebungAm : '')}"></label>
      <label class="check"><input type="checkbox" id="kf-plan" ${k && k.notfallplan ? 'checked' : ''}> Notfallplan vorhanden</label>
      <label class="check"><input type="checkbox" id="kf-aed" ${aed.vorhanden ? 'checked' : ''}> (A)ED vorhanden</label>
      <label>AED-Wartung am<input type="date" id="kf-aedw" value="${esc(aed.wartungAm || '')}"></label>
      <label class="check"><input type="checkbox" id="kf-koffer" ${k && k.notfallkoffer ? 'checked' : ''}> Notfallkoffer (DIN)</label>
      <div class="span2" style="border-top:1px dashed var(--line);margin-top:6px;padding-top:8px">
        <label class="check"><input type="checkbox" id="kf-ger" ${k && k.technischeGeraete ? 'checked' : ''}> Technische Geräte im Einsatz (im Rehasport unzulässig! Ausnahme: Ergometer in Herzgruppen)</label>
        <label class="check"><input type="checkbox" id="kf-ergo" ${k && k.ergometer ? 'checked' : ''}> Ergometer nur in Herzgruppe</label>
        <label class="check"><input type="checkbox" id="kf-praev" ${k && k.gemischtMitPraevention ? 'checked' : ''}> Vermischung mit Präventionsangebot (§ 20 SGB V) – unzulässig!</label>
        <label class="check"><input type="checkbox" id="kf-zusatz" ${k && k.zusatzleistungGleichzeitig ? 'checked' : ''}> Zusatzleistungen innerhalb der 45 Min. – unzulässig!</label>
      </div>
      <label class="span2 check"><input type="checkbox" id="kf-aktiv" ${!k || k.aktiv ? 'checked' : ''}> Kurs aktiv</label>
    </div>`,
    [
      { label: 'Abbrechen', cls: 'btn', onClick: closeModal },
      ...(k ? [{ label: 'Löschen', cls: 'btn danger', onClick: async () => {
        if (!confirm('Kurs löschen?')) return;
        try { const r = await api('DELETE', `/api/kurse/${k.id}`); closeModal(); await reload(true); toast(r.deaktiviert ? 'Kurs hat Teilnehmer – deaktiviert.' : 'Gelöscht.'); } catch (e) { toast(e.message, 'err'); }
      } }] : []),
      { label: 'Speichern & prüfen', cls: 'btn primary', onClick: async () => {
        const payload = {
          titel: $('#kf-titel').value.trim(), art: $('#kf-art').value, trainerId: $('#kf-trainer').value,
          wochentag: Number($('#kf-wt').value), beginn: $('#kf-beginn').value,
          dauerMin: Number($('#kf-dauer').value), maxTeilnehmer: Number($('#kf-max').value),
          ort: $('#kf-ort').value.trim(), raumflaecheQm: Number($('#kf-qm').value) || 0,
          startdatum: $('#kf-start').value, enddatum: $('#kf-ende').value,
          betreuungsArzt: $('#kf-arzt').value.trim() ? { name: $('#kf-arzt').value.trim(), visitationAm: $('#kf-vis').value } : null,
          notfallplan: $('#kf-plan').checked,
          aed: { vorhanden: $('#kf-aed').checked, wartungAm: $('#kf-aedw').value },
          notfallkoffer: $('#kf-koffer').checked, notfallUebungAm: $('#kf-notfueb').value,
          technischeGeraete: $('#kf-ger').checked, ergometer: $('#kf-ergo').checked,
          gemischtMitPraevention: $('#kf-praev').checked, zusatzleistungGleichzeitig: $('#kf-zusatz').checked,
          aktiv: $('#kf-aktiv').checked,
        };
        if (!payload.titel || !payload.trainerId || !payload.startdatum) { toast('Titel, Übungsleitung und Startdatum sind Pflicht.', 'err'); return; }
        try {
          const r = await api(k ? 'PUT' : 'POST', k ? `/api/kurse/${k.id}` : '/api/kurse', payload);
          const p = r.pruefung;
          if (p.blockiert) toast(`Kurs gespeichert, aber RSD-Verstöße: ${p.fehler.join(' | ')}`, 'err');
          else if (p.hinweise.length) toast(`Gespeichert. Hinweise: ${p.hinweise.join(' | ')}`);
          else toast('Kurs gespeichert – alle RSD-Prüfungen bestanden.', 'ok');
          closeModal(); await reload(true);
        } catch (e) { toast(e.message, 'err'); }
      } },
    ], { wide: true });
  const artSel = $('#kf-art');
  const upd = () => {
    const a = S.regeln.arten[artSel.value] || {};
    $('#kf-dauer').value = k && k.art === artSel.value ? k.dauerMin : a.minDauerMin;
    $('#kf-max').value = k && k.art === artSel.value ? k.maxTeilnehmer : a.maxTN;
    $('#kf-herz-hint').hidden = !(artSel.value === 'herzgruppe' || artSel.value === 'herzinsuffizienz');
  };
  artSel.addEventListener('change', upd);
  if (!k) upd();
};
$('#btn-neuer-kurs').onclick = () => kursForm(null);

window.kursToggle = async (id) => {
  const k = (S.kurse || []).find((x) => x.id === id);
  try { await api('PUT', `/api/kurse/${id}`, { aktiv: !k.aktiv }); await reload(true); }
  catch (e) { toast(e.message, 'err'); }
};

window.oeffneKalenderTagKurs = async (kid) => {
  zeigeView('kalender');
  const k = (S.kurse || []).find((x) => x.id === kid);
  const heute = new Date();
  const ziel = new Date();
  while (ziel.getDay() !== Number(k.wochentag) || ziel < heute) ziel.setDate(ziel.getDate() + 1);
  const iso = `${ziel.getFullYear()}-${String(ziel.getMonth() + 1).padStart(2, '0')}-${String(ziel.getDate()).padStart(2, '0')}`;
  calMon = new Date(ziel); calMon.setDate(1);
  await renderKalender();
  zeigeTag(iso);
};

/* ============================== KALENDER ============================== */
let calMon = new Date(); calMon.setDate(1);
let calTermine = [];

async function ladeTermine(von, bis) {
  const r = await api('GET', `/api/termine?von=${von}&bis=${bis}`);
  termineCache = r.termine;
  return r.termine;
}

async function renderKalender() {
  const share = await api('GET', '/api/kalender/share');
  const lokal = Boolean(share.lokalModus || window.LOCAL_MODE);
  if (lokal) {
    $('#share-url').textContent = 'Kalender als .ics-Datei teilen (Google/Apple/Outlook) – ohne Patientendaten';
    $('#share-hinweis').textContent = share.datenschutzHinweis;
    $('#btn-share-copy').textContent = '📅 An Google Kalender / teilen';
    $('#btn-share-copy').onclick = teileIcsDatei;
    $('#btn-share-rotate').hidden = true;
    $('#chk-share').checked = share.geteilt !== false;
    $('#chk-share').parentElement.lastChild.textContent = ' Kalender-Export aktiv (Freigabe über Teilen-Funktion)';
  } else {
    $('#share-url').textContent = share.url;
    $('#share-hinweis').textContent = share.datenschutzHinweis;
    $('#btn-share-copy').textContent = '🔗 Link kopieren';
    $('#btn-share-copy').onclick = async () => {
      try { await navigator.clipboard.writeText($('#share-url').textContent); toast('Kalender-Link kopiert.', 'ok'); }
      catch (_) { toast('Bitte Link manuell markieren/kopieren.', 'err'); }
    };
    $('#btn-share-rotate').hidden = false;
    $('#chk-share').checked = share.geteilt;
  }

  const jahr = calMon.getFullYear(), mon = calMon.getMonth();
  $('#cal-label').textContent = calMon.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' });

  const von = new Date(jahr, mon, 1).toISOString().slice(0, 10);
  const letzte = new Date(jahr, mon + 1, 0);
  const bis = letzte.toISOString().slice(0, 10);
  calTermine = await ladeTermine(von, bis);

  const erstes = new Date(jahr, mon, 1);
  const startOffset = erstes.getDay(); // So=0
  const grid = $('#kalender-grid');
  let html = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'].map((w) => `<div class="wd">${w}</div>`).join('');
  const cells = [];
  const startMontag = new Date(erstes); startMontag.setDate(1 - startOffset);
  for (let i = 0; i < 42; i++) {
    const d = new Date(startMontag); d.setDate(startMontag.getDate() + i);
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const evs = calTermine.filter((t) => t.datum === iso);
    cells.push(`<div class="day ${d.getMonth() !== mon ? 'other' : ''} ${iso === heutigesISO() ? 'today' : ''}" data-d="${iso}">
      <div class="dnum">${d.getDate()}</div>
      ${evs.map((t) => `<div class="ev ${t.status}" title="${esc(t.kurs.titel)}">${esc(t.beginn)} ${esc(t.kurs.titel)}</div>`).join('')}
    </div>`);
    if (i >= 34 && d.getMonth() !== mon && i % 7 === 6) break;
  }
  grid.innerHTML = html + cells.join('');
  $$('#kalender-grid .day').forEach((el) => { el.onclick = () => zeigeTag(el.dataset.d); });
}

async function teileIcsDatei() {
  try {
    const d = await api('GET', '/api/state');
    const token = d.settings.kalender.token;
    const r = await api('GET', `/api/calendar/${token}.ics`);
    const ics = r.ics || r;
    await dateiTeilen('rheasport-kalender.ics', ics, 'text/calendar');
  } catch (e) { toast(`Kalender-Export fehlgeschlagen: ${e.message}`, 'err'); }
}
window.teileIcsDatei = teileIcsDatei;

$('#cal-prev').onclick = () => { calMon.setMonth(calMon.getMonth() - 1); renderKalender(); };
$('#cal-next').onclick = () => { calMon.setMonth(calMon.getMonth() + 1); renderKalender(); };
$('#chk-share').onchange = async () => { await api('PUT', '/api/settings', { kalender: { geteilt: $('#chk-share').checked } }); await reload(false); };
$('#btn-share-copy').onclick = async () => {
  try { await navigator.clipboard.writeText($('#share-url').textContent); toast('Kalender-Link kopiert.', 'ok'); }
  catch (_) { toast('Bitte Link manuell markieren/kopieren.', 'err'); }
};
$('#btn-share-rotate').onclick = async () => {
  if (!confirm('Link erneuern? Bestehende Abonnements müssen aktualisiert werden.')) return;
  await api('POST', '/api/kalender/rotate'); await renderKalender(); toast('Neuer Kalender-Link erzeugt.', 'ok');
};

function zeigeTag(iso) {
  const tag = termineCache.filter((t) => t.datum === iso);
  $('#cal-day-box').hidden = false;
  $('#cal-day-title').textContent = new Date(`${iso}T12:00:00`).toLocaleDateString('de-DE', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' });
  $('#cal-day-list').innerHTML = tag.length ? tag.map((t) => `
    <div class="tn-row">
      <div class="nm"><strong>${esc(t.beginn)} Uhr</strong> · ${esc(t.kurs.titel)}</div>
      <div class="st">${esc((S.regeln.arten[t.kurs.art] || {}).label || '')} · ${esc(t.kurs.ort || '')} · ${t.dauerMin} Min.</div>
      <span class="chip ${t.status === 'stattgefunden' ? 'green' : t.status === 'ausgefallen' ? 'gray' : t.status === 'verschoben' ? 'amber' : 'blue'}">${esc(t.status)}</span>
      <span class="chip ${t.leiterBestaetigung ? 'green' : 'amber'}">Leitung ${t.leiterBestaetigung ? '✓' : 'offen'}</span>
      <button class="btn small" onclick="oeffneTermin('${t.id}')">Verwalten &amp; unterschreiben</button>
    </div>`).join('') : '<div class="muted">Keine Termine an diesem Tag.</div>';
}

/** Frühere, bereits stattgefundene Einheiten des Patienten ohne Unterschrift und ohne dokumentierten Grund. */
function fehlendeUnterschriften(pid, ausser) {
  const res = [], heute = heutigesISO();
  for (const z of (S.zuordnungen || []).filter((x) => x.patientId === pid)) {
    const v = (S.verordnungen || []).find((x) => x.id === z.verordnungId);
    for (const t of (S.termine || [])) {
      if (t.kursId !== z.kursId || t.id === ausser || t.status !== 'stattgefunden' || t.datum > heute) continue;
      if (z.aktiv === false && !(z.abgebrochenAm && t.datum <= z.abgebrochenAm)) continue;
      if (v && ((v.von && t.datum < v.von) || (v.bis && t.datum > v.bis))) continue;
      const a = (t.anwesenheit || []).find((x) => x.patientId === pid);
      if (a && (a.unterschriftPng || a.unterschriftPapier || a.fehlGrund)) continue;
      res.push(t);
    }
  }
  return res.sort((a, b) => a.datum.localeCompare(b.datum));
}

/** Dialog: fehlende Unterschrift nachholen oder Grund des Fehlens festhalten. */
function fehlendeDialog(pid, name, zurueck, ausser) {
  const liste = fehlendeUnterschriften(pid, ausser);
  const gruende = ['Nicht erschienen / entschuldigt', 'Krank', 'Urlaub', 'Unterschrift vergessen (Papierliste folgt)', 'Sonstiges'];
  openModal(`Fehlende Unterschriften – ${name}`, liste.length ? liste.map((t) => `
    <div class="tn-row" data-t="${t.id}">
      <div class="nm">${fmt(t.datum)} ${esc(t.beginn || '')} Uhr<div class="muted small">${esc(kursname(t.kursId))}</div></div>
      <button class="btn small primary fd-sig">✍ Nachholen</button>
      <select class="fd-sel">${gruende.map((g) => `<option>${esc(g)}</option>`).join('')}</select>
      <input class="fd-txt" placeholder="Details (optional)" style="flex:1;min-width:120px">
      <button class="btn small fd-grund">Grund speichern</button>
    </div>`).join('') + '<p class="hint">Nachgeholte Unterschriften erhalten den aktuellen Zeitstempel und werden im Audit-Log als nachgeholt gekennzeichnet.</p>'
    : '<div class="muted">Alles erledigt – keine fehlenden Unterschriften.</div>',
  [{ label: 'Zurück', cls: 'btn primary', onClick: () => { closeModal(); if (zurueck) zurueck(); } }], { wide: true });
  $$('#modal-body .tn-row[data-t]').forEach((row) => {
    const tid = row.dataset.t;
    row.querySelector('.fd-sig').onclick = async () => {
      const png = await openSigPad(`Nachgeholte Unterschrift – ${name}`, `${fmt((S.termine.find((x) => x.id === tid) || {}).datum)} · wird mit heutigem Zeitstempel gespeichert`);
      if (!png) return;
      try { await api('POST', `/api/termine/${tid}/anwesenheit`, { patientId: pid, wahrgenommen: true, unterschriftPng: png }); await reload(false); toast('Unterschrift nachgeholt.', 'ok'); fehlendeDialog(pid, name, zurueck, ausser); }
      catch (e) { toast(e.message, 'err'); }
    };
    row.querySelector('.fd-grund').onclick = async () => {
      const txt = row.querySelector('.fd-txt').value.trim();
      const grund = row.querySelector('.fd-sel').value + (txt ? ' – ' + txt : '');
      try { await api('POST', `/api/termine/${tid}/anwesenheit`, { patientId: pid, fehlGrund: grund }); await reload(false); toast('Grund dokumentiert.', 'ok'); fehlendeDialog(pid, name, zurueck, ausser); }
      catch (e) { toast(e.message, 'err'); }
    };
  });
}

window.oeffneTermin = async (tid) => {
  let t = termineCache.find((x) => x.id === tid);
  if (!t) { const r = await api('GET', `/api/termine?von=${heutigesISO()}&bis=${new Date(Date.now() + 400 * 86400000).toISOString().slice(0, 10)}`); termineCache = r.termine; t = termineCache.find((x) => x.id === tid); }
  if (!t) { try { await ladeTermine(heutigesISO(), new Date(Date.now() + 400 * 86400000).toISOString().slice(0, 10)); t = termineCache.find((x) => x.id === tid); } catch (_) {} }
  if (!t) { toast('Termin nicht gefunden (ggf. erst nach Erzeugen der Termine).', 'err'); return; }

  const [h, m] = String(t.beginn || '00:00').split(':').map(Number);
  const ende = new Date(`${t.datum}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`);
  ende.setMinutes(ende.getMinutes() + (t.dauerMin || 45));
  const vorbei = new Date() >= ende;
  const startZ = new Date(ende.getTime() - (t.dauerMin || 45) * 60000);
  const vorabMin = Math.max(0, Number((S.settings.unterschrift || {}).vorabMinuten ?? 20));
  const fensterOffen = () => new Date() >= new Date(startZ.getTime() - vorabMin * 60000);
  const darfUnterschreiben = () => vorbei || t.status === 'stattgefunden' || fensterOffen();

  const zeichne = () => {
    const tn = (t.teilnehmer || []).map((p) => {
      const hatSig = p.unterschrift;
      return `<div class="tn-row" data-p="${p.patientId}">
        <div class="nm">${esc(p.name)}</div>
        <label class="check" style="margin:0"><input type="checkbox" class="tn-w" ${p.wahrgenommen ? 'checked' : ''}> teilgenommen</label>
        <div class="st">${p.zeitstempel ? `⏱ ${new Date(p.zeitstempel).toLocaleString('de-DE')}` : '–'}</div>
        ${hatSig ? `<img class="sig" src="${p.unterschrift || ''}" alt="Sig">` : (p.papier ? '<span class="chip green">Papierliste</span>' : (p.wahrgenommen ? '<span class="chip amber">ohne Unterschrift</span>' : ''))}
        ${p.vorab ? '<span class="chip amber" title="Vor Kursbeginn geleistet – Teilnahme von der Leitung bestätigen, sonst stornieren">vorab</span>' : ''}
        ${p.fehlGrund ? `<span class="chip gray" title="${esc(p.fehlGrund.grund)}">Grund: ${esc(p.fehlGrund.grund.slice(0, 40))}</span>` : ''}
        <button class="btn small tn-sig" ${!darfUnterschreiben() ? `disabled title="Frühestens ${vorabMin} Min. vor Kursbeginn"` : ''}>✍ ${hatSig ? 'korrigieren' : 'unterschreiben'}</button>
        <button class="btn small tn-papier" ${p.wahrgenommen ? '' : 'disabled'}>Papierliste</button>
        ${hatSig ? '<button class="btn small danger tn-del" title="Unterschrift stornieren">✕ Storno</button>' : ''}
        ${(() => { const f = fehlendeUnterschriften(p.patientId, t.id); return f.length ? `<div style="flex-basis:100%"><span class="chip red">⚠ ${f.length} frühere Einheit(en) ohne Unterschrift: ${f.slice(-3).map((x) => fmt(x.datum).slice(0, 5)).join(', ')}${f.length > 3 ? ' …' : ''}</span> <button class="btn small tn-fehlt">Nachholen / Grund</button></div>` : ''; })()}
      </div>`;
    }).join('') || '<div class="muted">Keine Teilnehmer dieser festen Gruppe.</div>';

    const body = `
      <div class="grid2">
        <div>
          <div class="hint">${esc(t.kurs.titel)} · ${esc((S.regeln.arten[t.kurs.art] || {}).label || '')}<br>
          ${esc(t.kurs.ort || '')} · Übungsleitung: ${esc(t.kurs.trainerName || '')} · ${t.dauerMin} Min. · <strong>${esc(t.status)}</strong>
          ${!darfUnterschreiben() && t.status === 'geplant' ? `<br>⚠ Unterschriften sind ab ${vorabMin} Min. vor Kursbeginn möglich.` : ''}</div>
          <div class="row">
            <button class="btn small" id="tm-statt">✔ als durchgeführt</button>
            <button class="btn small danger" id="tm-aus">Als ausgefallen</button>
          </div>
          <div class="row" style="margin-top:8px">
            <input type="date" id="tm-neudat" value="${t.datum}">
            <input type="time" id="tm-neuzeit" value="${t.beginn}">
            <button class="btn small" id="tm-versch">Termin verschieben</button>
          </div>
          <label style="margin-top:10px">Dokumentation / besondere Vorkommnisse<textarea id="tm-doku" rows="3">${esc(t.dokumentation || '')}</textarea></label>
          <button class="btn small" id="tm-doku-sav">Dokumentation speichern</button>
          ${(t.kurs.art === 'herzgruppe' || t.kurs.art === 'herzinsuffizienz') ? `
            <label style="margin-top:10px">Arztvisitation (mind. alle 6 Wochen, Rahmenvereinbarung)<input type="date" id="tm-visdat" value="${esc((t.arztvisitation || {}).datum || '')}"></label>
            <label>Ärztin/Arzt<input id="tm-visarzt" value="${esc((t.arztvisitation || {}).arzt || (t.kurs.betreuungsArzt || {}).name || '')}"></label>
            <button class="btn small" id="tm-vis-sav">Visitation dokumentieren</button>` : ''}
        </div>
        <div>
          <h2 style="font-size:15px">Teilnahmebestätigung (Unterschriften)</h2>
          ${tn}
          <div class="hint" style="margin-top:10px">Die/der Versicherte quittiert <strong>unmittelbar vor oder nach</strong> der Übungseinheit. Unterschriften sind ab ${vorabMin} Min. vor Kursbeginn möglich und können bis zur Leitungsbestätigung storniert werden; als „vorab“ gekennzeichnete Unterschriften zählen erst nach der Bestätigung der Leitung. Zeitstempel ersetzt Datumsstempel (kein Vordatieren).</div>
          <div class="tn-row">
            <div class="nm">Bestätigung Übungsleitung</div>
            <div class="st">${t.leiterBestaetigung ? `✔ ${esc(t.leiterBestaetigung.name)} · ${new Date(t.leiterBestaetigung.ts).toLocaleString('de-DE')}` : 'offen – wird nach der Einheit benötigt (Abrechnungsvoraussetzung)'}</div>
            ${t.leiterBestaetigung && t.leiterBestaetigung.unterschriftPng ? `<img class="sig" src="${t.leiterBestaetigung.unterschriftPng}" alt="Sig">` : ''}
            <button class="btn small primary" id="tm-leiter" ${(!vorbei && t.status !== 'stattgefunden') ? 'disabled title="Erst nach der Übungseinheit"' : ''}>✍ Leitungs-Unterschrift</button>
          </div>
        </div>
      </div>`;

    openModal(`Termin ${fmt(t.datum)} – ${t.beginn} Uhr`, body, [
      { label: 'Schließen', cls: 'btn primary', onClick: async () => { closeModal(); await renderKalender(); if (aktuelleView === 'dashboard') renderDashboard(); } },
    ], { wide: true });

    const refresh = async () => { await api('GET', `/api/termine?von=${t.datum}&bis=${t.datum}`).then((r) => { const n = r.termine.find((x) => x.id === t.id); if (n) t = n; }).catch(() => {}); };

    $('#tm-statt').onclick = async () => { try { await api('PUT', `/api/termine/${t.id}`, { status: 'stattgefunden' }); await refresh(); zeichne(); toast('Als durchgeführt markiert.', 'ok'); } catch (e) { toast(e.message, 'err'); } };
    $('#tm-aus').onclick = async () => { try { await api('PUT', `/api/termine/${t.id}`, { status: 'ausgefallen' }); await refresh(); zeichne(); toast('Als ausgefallen markiert.'); } catch (e) { toast(e.message, 'err'); } };
    $('#tm-versch').onclick = async () => {
      try { await api('PUT', `/api/termine/${t.id}`, { neuesDatum: $('#tm-neudat').value, neueBeginn: $('#tm-neuzeit').value }); await refresh(); zeichne(); toast('Termin verschoben (Kalender-Feed aktualisiert).', 'ok'); } catch (e) { toast(e.message, 'err'); }
    };
    $('#tm-doku-sav').onclick = async () => { try { await api('PUT', `/api/termine/${t.id}`, { dokumentation: $('#tm-doku').value }); await refresh(); toast('Dokumentation gespeichert.', 'ok'); } catch (e) { toast(e.message, 'err'); } };
    const vsav = $('#tm-vis-sav');
    if (vsav) vsav.onclick = async () => {
      try { await api('PUT', `/api/termine/${t.id}`, { arztvisitation: { datum: $('#tm-visdat').value, arzt: $('#tm-visarzt').value } }); await refresh(); zeichne(); toast('Visitation dokumentiert.', 'ok'); } catch (e) { toast(e.message, 'err'); }
    };

    $$('#modal-body .tn-row[data-p]').forEach((row) => {
      const pid = row.dataset.p;
      const w = row.querySelector('.tn-w');
      if (w) w.onchange = async () => {
        try { await api('POST', `/api/termine/${t.id}/anwesenheit`, { patientId: pid, wahrgenommen: w.checked }); await refresh(); } catch (e) { toast(e.message, 'err'); w.checked = !w.checked; }
      };
      const sig = row.querySelector('.tn-sig');
      if (sig) sig.onclick = async () => {
        const name = (t.teilnehmer.find((p) => p.patientId === pid) || {}).name || '';
        const png = await openSigPad(`Teilnahmebestätigung – ${name}`, `${fmt(t.datum)} ${t.beginn} Uhr · ${t.kurs.titel}`);
        if (!png) return;
        try { await api('POST', `/api/termine/${t.id}/anwesenheit`, { patientId: pid, wahrgenommen: true, unterschriftPng: png }); await refresh(); zeichne(); toast('Unterschrift gespeichert (Zeitstempel).', 'ok'); } catch (e) { toast(e.message, 'err'); }
      };
      const pap = row.querySelector('.tn-papier');
      if (pap) pap.onclick = async () => {
        try { await api('POST', `/api/termine/${t.id}/anwesenheit`, { patientId: pid, wahrgenommen: true, unterschriftPapier: true }); await refresh(); zeichne(); toast('Papier-Unterschrift vermerkt.', 'ok'); } catch (e) { toast(e.message, 'err'); }
      };
      const fehlt = row.querySelector('.tn-fehlt');
      if (fehlt) fehlt.onclick = () => fehlendeDialog(pid, (t.teilnehmer.find((x) => x.patientId === pid) || {}).name || '', () => window.oeffneTermin(t.id), t.id);
      const del = row.querySelector('.tn-del');
      if (del) del.onclick = async () => {
        if (!confirm('Unterschrift stornieren? Das Storno wird im Audit-Log protokolliert.')) return;
        try { await api('POST', `/api/termine/${t.id}/anwesenheit`, { patientId: pid, unterschriftStorno: true }); await refresh(); zeichne(); } catch (e) { toast(e.message, 'err'); }
      };
    });
    $('#tm-leiter').onclick = async () => {
      const name = (t.kurs.trainerName && t.kurs.trainerName !== '–') ? t.kurs.trainerName : prompt('Name der/des Übungsleitenden:') || '';
      const png = await openSigPad('Bestätigung der/des Übungsleitenden', `${name} · ${fmt(t.datum)} – Bestätigung der Teilnahme`);
      if (!png) return;
      try { await api('PUT', `/api/termine/${t.id}`, { leiterBestaetigung: { name, unterschriftPng: png } }); await refresh(); zeichne(); toast('Leitungs-Bestätigung gespeichert – Einheit gilt als durchgeführt.', 'ok'); } catch (e) { toast(e.message, 'err'); }
    };
  };
  zeichne();
};

/* ============================== DOKUMENTE (Scans, Doku, Teilnehmerlisten, Vorlagen) ============================== */
let DOK_TAB = 'scans';
const DOK_KATEGORIEN = ['Verordnung', 'Kostenübernahme / Genehmigung', 'Einwilligung / Datenschutz', 'Arztbericht', 'Teilnehmerliste (Papier)', 'Sonstiges'];
const MONATE = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
const monatTitel = (m) => `${MONATE[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}`;
const patientName = (p) => `${p.nachname}, ${p.vorname}`;

async function blobTeilen(name, blob) {
  try {
    const file = new File([blob], name, { type: blob.type });
    if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: name }); return; }
  } catch (e) { if (e && e.name === 'AbortError') return; }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 8000);
}

/** Foto verkleinern, optional als Scan (Graustufen + Kontrast) aufbereiten. */
async function bildAufbereiten(file, scanModus) {
  if (file.type === 'application/pdf') return file;
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('Bild konnte nicht gelesen werden.')); i.src = url; });
    const r = Math.min(1, 1800 / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement('canvas');
    c.width = Math.round(img.naturalWidth * r); c.height = Math.round(img.naturalHeight * r);
    const ctx = c.getContext('2d');
    if (scanModus) ctx.filter = 'grayscale(1) contrast(1.7) brightness(1.08)';
    ctx.drawImage(img, 0, 0, c.width, c.height);
    return await new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('Bild konnte nicht gespeichert werden.'))), 'image/jpeg', 0.82));
  } finally { URL.revokeObjectURL(url); }
}

/** Scan-Bedienelemente + Dateiliste. pid fest (Patienten-Reiter) oder null (Gesamtansicht mit Auswahl). */
async function dokScansInto(el, pid) {
  if (!window.RheaStore) { el.innerHTML = '<div class="muted">Dateiablage nicht verfügbar.</div>'; return; }
  const pats = (S.patienten || []).slice().sort((a, b) => patientName(a).localeCompare(patientName(b), 'de'));
  const sel = pid ? '' : `<label>Patient/in *<select id="dk-pat"><option value="">– wählen –</option>${pats.map((p) => `<option value="${p.id}">${esc(patientName(p))}</option>`).join('')}</select></label>`;
  el.innerHTML = `
    <div class="card" style="margin-bottom:10px"><div class="form2">${sel}
      <label>Art<select id="dk-kat">${DOK_KATEGORIEN.map((k) => `<option>${esc(k)}</option>`).join('')}</select></label></div>
      <label class="check"><input type="checkbox" id="dk-scan" checked> Scan-Optimierung (Graustufen, mehr Kontrast, verkleinert)</label>
      <div class="row" style="margin-top:8px">
        <label class="btn primary" for="dk-cam">📷 Mit Kamera scannen</label><input type="file" id="dk-cam" accept="image/*" capture="environment" hidden>
        <label class="btn" for="dk-gal">🖼 Aus Galerie/Dateien</label><input type="file" id="dk-gal" accept="image/*,application/pdf" multiple hidden>
      </div>
      <p class="hint">Ablage automatisch im Ordner <code>Patienten/Nachname_Vorname/</code> (lokal auf dem Gerät). Mehrseitige Dokumente: einfach mehrere Seiten nacheinander scannen.</p></div>
    <div id="dk-liste"></div>`;
  const liste = $('#dk-liste', el) || el.querySelector('#dk-liste');
  const zeige = async () => {
    const docs = await RheaStore.listDocs(pid || undefined);
    const gruppen = new Map();
    for (const d of docs) { if (!gruppen.has(d.patientId)) gruppen.set(d.patientId, []); gruppen.get(d.patientId).push(d); }
    if (!docs.length) { liste.innerHTML = '<div class="muted">Noch keine Dokumente gescannt.</div>'; return; }
    liste.innerHTML = [...gruppen.entries()].map(([id, ds]) => {
      const p = (S.patienten || []).find((x) => x.id === id);
      return `<h2 style="font-size:15px;margin:12px 0 6px">📁 ${esc(p ? patientName(p) : ds[0].ordner)} <span class="muted small">(${ds.length})</span></h2>
        <div class="dok-grid">${ds.map((d) => `<button class="dok-card" data-d="${d.id}"><div class="dok-th" data-th="${d.id}">${d.mime === 'application/pdf' ? '📄' : ''}</div><div class="small"><strong>${esc(d.kategorie)}</strong><br>${fmt(d.ts.slice(0, 10))} · ${Math.round(d.size / 1024)} KB</div></button>`).join('')}</div>`;
    }).join('');
    for (const d of docs.filter((x) => x.mime !== 'application/pdf')) {
      RheaStore.getBlob(d.id).then((b) => { const th = liste.querySelector(`[data-th="${d.id}"]`); if (b && th) th.innerHTML = `<img alt="" src="${URL.createObjectURL(b)}">`; });
    }
    $$('.dok-card', liste).forEach((b) => { b.onclick = () => dokOeffnen(docs.find((x) => x.id === b.dataset.d), zeige); });
  };
  const aufnehmen = async (files) => {
    const patientId = pid || ($('#dk-pat', el) || el.querySelector('#dk-pat')).value;
    const p = (S.patienten || []).find((x) => x.id === patientId);
    if (!p) { toast('Bitte zuerst eine Patientin/einen Patienten wählen.', 'err'); return; }
    let n = 0;
    try {
      for (const f of files) {
        const blob = await bildAufbereiten(f, el.querySelector('#dk-scan').checked);
        await RheaStore.addDoc({ patientId, patientName: `${p.nachname}_${p.vorname}`, kategorie: el.querySelector('#dk-kat').value }, blob);
        n++;
      }
      toast(`${n} Dokument(e) gespeichert.`, 'ok');
    } catch (e) { toast(`Speichern fehlgeschlagen: ${e.message}`, 'err'); }
    await zeige();
  };
  el.querySelector('#dk-cam').onchange = (e) => { const f = [...e.target.files]; e.target.value = ''; if (f.length) aufnehmen(f); };
  el.querySelector('#dk-gal').onchange = (e) => { const f = [...e.target.files]; e.target.value = ''; if (f.length) aufnehmen(f); };
  await zeige();
}

async function dokOeffnen(d, nachher) {
  const blob = await RheaStore.getBlob(d.id);
  if (!blob) { toast('Datei nicht gefunden.', 'err'); return; }
  const url = URL.createObjectURL(blob);
  openModal(`${d.kategorie} – ${fmt(d.ts.slice(0, 10))}`,
    d.mime === 'application/pdf' ? `<iframe src="${url}" style="width:100%;height:70vh;border:0"></iframe>` : `<img src="${url}" alt="" style="max-width:100%;display:block;margin:0 auto">`,
    [
      { label: 'Löschen', cls: 'btn danger', onClick: async () => { if (!confirm('Dokument endgültig löschen?')) return; await RheaStore.delDoc(d.id); closeModal(); if (nachher) nachher(); } },
      { label: 'Teilen/Speichern', cls: 'btn', onClick: () => blobTeilen(d.datei, blob) },
      { label: 'Schließen', cls: 'btn primary', onClick: closeModal },
    ], { wide: true, onClose: () => URL.revokeObjectURL(url) });
}

/* ---- Trainingsdokumentation & Teilnehmerlisten (Ansicht + Druck) ---- */
function kursTermine(kid, monat) {
  return (S.termine || []).filter((t) => t.kursId === kid && t.datum.startsWith(monat) && t.status !== 'ausgefallen' && t.status !== 'verschoben')
    .sort((a, b) => (a.datum + a.beginn).localeCompare(b.datum + b.beginn));
}
function kursKopfHtml(k, monat) {
  const an = S.settings.anbieter || {};
  const t = (S.trainer || []).find((x) => x.id === k.trainerId);
  return `<div class="sub">${esc(an.name || '')}${an.ik ? ' · IK ' + esc(an.ik) : ''}</div>
    <table class="kopf"><tr><td>Gruppe:</td><td><strong>${esc(k.titel)}</strong> (${esc((S.regeln.arten[k.art] || {}).label || '')})</td></tr>
    <tr><td>Ort / Zeit:</td><td>${esc(k.ort || '')} · ${esc(k.beginn || '')} Uhr · ${k.dauerMin || 45} Min.</td></tr>
    <tr><td>Übungsleitung:</td><td>${esc(t ? `${t.vorname} ${t.nachname}` : '')}</td></tr>
    <tr><td>Monat:</td><td>${monat ? esc(monatTitel(monat)) : '____________________'}</td></tr></table>`;
}
function teilnehmerlisteHtml(k, monat, leer) {
  const termine = leer ? [] : kursTermine(k.id, monat);
  const spalten = Math.max(termine.length, leer ? 12 : 0);
  const von = `${monat}-01`;
  const zu = (S.zuordnungen || []).filter((z) => z.kursId === k.id && (z.aktiv !== false || (z.abgebrochenAm && z.abgebrochenAm >= von)));
  const pats = zu.map((z) => (S.patienten || []).find((p) => p.id === z.patientId)).filter(Boolean)
    .sort((a, b) => patientName(a).localeCompare(patientName(b), 'de'));
  const zeilenAnz = leer ? Math.max(pats.length, 15) : pats.length;
  let kopf = '<th style="width:4%">Nr.</th><th style="min-width:130px">Name</th>';
  for (let i = 0; i < spalten; i++) kopf += `<th style="text-align:center;font-size:10.5px">${termine[i] ? fmt(termine[i].datum).slice(0, 5) : ''}</th>`;
  let body = '';
  for (let r = 0; r < zeilenAnz; r++) {
    const p = leer ? null : pats[r];
    body += `<tr><td>${r + 1}</td><td>${p ? esc(patientName(p)) : ''}</td>`;
    for (let i = 0; i < spalten; i++) {
      const a = termine[i] && p ? (termine[i].anwesenheit || []).find((x) => x.patientId === p.id) : null;
      body += `<td style="text-align:center;height:26px">${a ? (a.unterschriftPng ? '✔' : a.unterschriftPapier ? 'P' : a.wahrgenommen ? '○' : '–') : ''}</td>`;
    }
    body += '</tr>';
  }
  body += `<tr><td></td><td><strong>Bestätigung Übungsleitung</strong></td>${Array.from({ length: spalten }, (_, i) => `<td style="text-align:center">${termine[i] && termine[i].leiterBestaetigung ? '✔' : ''}</td>`).join('')}</tr>`;
  return `<style>${PRINT_CSS}</style><div class="pr-page" style="max-width:1100px"><h1>Teilnehmerliste${leer ? ' (Vorlage)' : ''}</h1>${kursKopfHtml(k, leer ? '' : monat)}
    <table><thead><tr>${kopf}</tr></thead><tbody>${body}</tbody></table>
    <div class="fine">✔ = digital unterschrieben · P = Papierliste · ○ = teilgenommen ohne Unterschrift · – = nicht teilgenommen. Teilnahme wird je Übungseinheit von der/dem Versicherten unmittelbar vor/nach der Einheit bestätigt.</div>
    <div class="foot"><div>Ort, Datum</div><div>Unterschrift Übungsleitung</div></div></div>`;
}
function trainingsdokuHtml(k, monat, leer) {
  const termine = leer ? [] : kursTermine(k.id, monat);
  const n = leer ? 12 : Math.max(termine.length, 1);
  let zeilen = '';
  for (let i = 0; i < n; i++) {
    const t = termine[i];
    const anz = t ? (t.anwesenheit || []).filter((a) => a.wahrgenommen).length : '';
    zeilen += `<tr><td style="width:11%">${t ? fmt(t.datum) : ''}</td><td style="width:8%">${t ? esc(t.beginn || '') : ''}</td><td style="width:7%;text-align:center">${anz}</td><td style="height:44px">${t ? esc(t.dokumentation || '') : ''}</td><td style="width:20%"></td><td style="width:8%;text-align:center">${t && t.leiterBestaetigung ? '✔' : ''}</td></tr>`;
  }
  return `<style>${PRINT_CSS}</style><div class="pr-page" style="max-width:1100px"><h1>Trainingsdokumentation${leer ? ' (Vorlage)' : ''}</h1>${kursKopfHtml(k, leer ? '' : monat)}
    <table><thead><tr><th>Datum</th><th>Beginn</th><th>TN</th><th>Inhalt / Schwerpunkt der Übungseinheit (Übungen, Belastung)</th><th>Besonderheiten / Vorkommnisse</th><th>Leitung</th></tr></thead><tbody>${zeilen}</tbody></table>
    <div class="fine">Dokumentation je Übungseinheit durch die Übungsleitung (Rahmenvereinbarung Rehabilitationssport/Funktionstraining): Datum, Dauer, Teilnehmerzahl, Inhalte, besondere Vorkommnisse. Aufbewahrung gemäß Vorgaben des Kostenträgers/DSGVO.</div>
    <div class="foot"><div>Ort, Datum</div><div>Unterschrift Übungsleitung</div></div></div>`;
}
function vorkommnisHtml() {
  const an = S.settings.anbieter || {};
  const zeile = (l) => `<tr><td style="width:30%">${l}</td><td style="height:30px"></td></tr>`;
  return `<style>${PRINT_CSS}</style><div class="pr-page"><h1>Vorkommnis- / Notfallprotokoll</h1><div class="sub">${esc(an.name || '')}</div>
    <table>${['Datum, Uhrzeit', 'Gruppe / Ort', 'Betroffene Person', 'Übungsleitung', 'Was ist passiert?', 'Erste Hilfe / Maßnahmen', 'Rettungsdienst gerufen (Uhrzeit)', 'Ärztliche Weiterbehandlung', 'Zeugen'].map(zeile).join('')}</table>
    <div class="foot"><div>Ort, Datum</div><div>Unterschrift Übungsleitung</div></div>
    <div class="fine">Vorlage zur Dokumentation besonderer Vorkommnisse; Herzgruppen: zusätzlich Notfallmeldung gemäß Notfallplan.</div></div>`;
}

function dokKursOptionen(sel) { return (S.kurse || []).map((k) => `<option value="${k.id}" ${k.id === sel ? 'selected' : ''}>${esc(k.titel)}</option>`).join(''); }

function renderDokumente() {
  $$('#view-dokumente .ptab').forEach((b) => {
    b.classList.toggle('active', b.dataset.dt === DOK_TAB);
    b.onclick = () => { DOK_TAB = b.dataset.dt; renderDokumente(); };
  });
  const el = $('#dok-body');
  const heute = heutigesISO();
  if (DOK_TAB === 'scans') { dokScansInto(el, null); return; }
  const kurse = S.kurse || [];
  if (!kurse.length) { el.innerHTML = '<div class="muted">Noch keine Kurse angelegt.</div>'; return; }
  if (DOK_TAB === 'doku' || DOK_TAB === 'tl') {
    const st = renderDokumente[DOK_TAB] || (renderDokumente[DOK_TAB] = { kurs: kurse[0].id, monat: heute.slice(0, 7) });
    if (!kurse.some((k) => k.id === st.kurs)) st.kurs = kurse[0].id;
    el.innerHTML = `<div class="filterbar"><label class="small">Gruppe <select id="dd-kurs">${dokKursOptionen(st.kurs)}</select></label>
      <label class="small">Monat <input type="month" id="dd-monat" value="${st.monat}"></label>
      <button class="btn" id="dd-print">🖨 Drucken / Teilen</button></div><div id="dd-inhalt"></div>`;
    const zeichne = () => {
      const k = kurse.find((x) => x.id === st.kurs);
      if (DOK_TAB === 'tl') {
        $('#dd-inhalt').innerHTML = `<div class="table-wrap">${teilnehmerlisteHtml(k, st.monat, false).replace(/<style>[\s\S]*?<\/style>/, '')}</div>`;
      } else {
        const ts = kursTermine(k.id, st.monat);
        $('#dd-inhalt').innerHTML = ts.map((t) => {
          const anz = (t.anwesenheit || []).filter((a) => a.wahrgenommen).length;
          const vorbei = t.datum <= heute;
          return `<div class="item"><div><strong>${fmt(t.datum)}</strong> ${esc(t.beginn || '')} Uhr · <span class="muted">${anz} Teilnehmende · ${t.leiterBestaetigung ? 'Leitung bestätigt' : 'Leitung offen'}</span>
            <div class="small">${t.dokumentation ? esc(t.dokumentation) : (vorbei && t.status === 'stattgefunden' ? '<span class="chip amber">Dokumentation fehlt</span>' : '<span class="muted">–</span>')}</div></div>
            <button class="btn small" onclick="oeffneTermin('${t.id}')">Öffnen</button></div>`;
        }).join('') || '<div class="muted">Keine Termine in diesem Monat.</div>';
      }
    };
    $('#dd-kurs').onchange = (e) => { st.kurs = e.target.value; zeichne(); };
    $('#dd-monat').onchange = (e) => { if (e.target.value) { st.monat = e.target.value; zeichne(); } };
    $('#dd-print').onclick = () => {
      const k = kurse.find((x) => x.id === st.kurs);
      const html = DOK_TAB === 'tl' ? teilnehmerlisteHtml(k, st.monat, false) : trainingsdokuHtml(k, st.monat, false);
      zeigeDruckansicht(html, `${DOK_TAB === 'tl' ? 'Teilnehmerliste' : 'Trainingsdokumentation'}_${RheaStore.sanit(k.titel)}_${st.monat}.html`);
    };
    zeichne();
    return;
  }
  // Vorlagen
  const st = renderDokumente.vorl || (renderDokumente.vorl = { kurs: kurse[0].id });
  el.innerHTML = `<p class="hint">Leere Vorlagen zum Ausdrucken (Papierdokumentation / Ausfall der Technik). Orientiert an den Anforderungen der Rahmenvereinbarung – im Zweifel mit dem Kostenträger bzw. RSD abgleichen.</p>
    <div class="filterbar"><label class="small">Gruppe vorausfüllen <select id="dv-kurs">${dokKursOptionen(st.kurs)}</select></label></div>
    <div class="row"><button class="btn" data-v="doku">🖨 Trainingsdokumentation</button><button class="btn" data-v="tl">🖨 Teilnehmerliste</button><button class="btn" data-v="vork">🖨 Vorkommnis-/Notfallprotokoll</button></div>`;
  $('#dv-kurs').onchange = (e) => { st.kurs = e.target.value; };
  $$('#dok-body [data-v]').forEach((b) => { b.onclick = () => {
    const k = kurse.find((x) => x.id === st.kurs);
    const v = b.dataset.v;
    zeigeDruckansicht(v === 'doku' ? trainingsdokuHtml(k, '', true) : v === 'tl' ? teilnehmerlisteHtml(k, '', true) : vorkommnisHtml(), `Vorlage_${v}.html`);
  }; });
}

/* ------------------- Backups & Speicherort (Einstellungen) ------------------- */
async function renderBackupCard() {
  const el = $('#cfg-backup');
  if (!el) return;
  const lokal = Boolean(S.lokalModus || window.LOCAL_MODE);
  if (!lokal || !window.RheaStore) { el.innerHTML = '<p class="hint">Automatische Backups mit Wiederherstellung stehen im Lokalmodus (APK) zur Verfügung. Im Servermodus: <code>data/db.json</code> sichern.</p>'; return; }
  let bks = [], os = { moeglich: false };
  try { [bks, os] = await Promise.all([RheaStore.listBackups(), RheaStore.ordnerStatus()]); } catch (_) { /* leer */ }
  const ordnerHtml = os.moeglich
    ? `<div class="row"><span>${os.name ? `📁 Ordner: <strong>${esc(os.name)}</strong> ${os.zugriff ? '<span class="chip green">Zugriff ok</span>' : '<span class="chip amber">Zugriff erneuern</span>'}` : 'Kein Ordner gewählt – Daten bleiben nur im Gerätespeicher der App.'}</span></div>
       <div class="row" style="margin-top:6px"><button class="btn small" id="bk-ordner">Ordner wählen</button>
       ${os.name && !os.zugriff ? '<button class="btn small" id="bk-zugriff">Zugriff erneuern</button>' : ''}
       ${os.name ? '<button class="btn small" id="bk-dok">Alle Dokumente in Ordner sichern</button><button class="btn small danger" id="bk-ordner-weg">Ordner entfernen</button>' : ''}</div>`
    : `<p class="hint">Eine freie Ordnerwahl (z. B. Netzwerkordner) bietet dieses Gerät/diese App nicht. Nutzen Sie stattdessen <strong>Backup teilen/speichern</strong> und wählen Sie im Teilen-Dialog Ihren Netzwerkordner (Dateien-App/NAS). Dokumente lassen sich einzeln über „Teilen/Speichern“ ablegen.</p>`;
  el.innerHTML = `${ordnerHtml}
    <div class="row" style="margin-top:10px"><button class="btn primary" id="bk-jetzt">Backup jetzt anlegen</button><button class="btn" id="bk-teilen">Aktuellen Stand teilen/speichern</button></div>
    <p class="hint">Nach jeder Änderung wird automatisch ein Backup im Gerätespeicher angelegt (die letzten 40 plus ein Stand pro Tag der letzten 60 Tage). Vor jeder Wiederherstellung wird der aktuelle Stand zusätzlich gesichert. Scans (Dokumente) sind nicht Teil der Backup-Dateien.</p>
    <div class="list">${bks.slice(0, 15).map((b) => `<div class="item"><div><strong>${new Date(b.ts).toLocaleString('de-DE')}</strong> <span class="chip ${b.grund === 'automatisch' ? 'gray' : 'blue'}">${esc(b.grund)}</span><div class="muted small">${Math.round(b.size / 1024)} KB</div></div>
      <div class="row"><button class="btn small" data-bk-r="${b.id}">Wiederherstellen</button><button class="btn small" data-bk-t="${b.id}">Teilen</button></div></div>`).join('') || '<div class="muted">Noch keine Backups.</div>'}</div>`;
  const neu = () => renderBackupCard();
  const on = (id, fn) => { const b = el.querySelector(id); if (b) b.onclick = fn; };
  on('#bk-ordner', async () => { try { const n = await RheaStore.waehleOrdner(); toast(`Ordner „${n}“ gewählt.`, 'ok'); neu(); } catch (e) { if (e.name !== 'AbortError') toast(e.message, 'err'); } });
  on('#bk-zugriff', async () => { try { await RheaStore.zugriffErneuern(); } catch (e) { toast(e.message, 'err'); } neu(); });
  on('#bk-ordner-weg', async () => { await RheaStore.ordnerVergessen(); neu(); });
  on('#bk-dok', async () => { const n = await RheaStore.alleDokumenteInOrdner(); toast(`${n} Dokument(e) in den Ordner geschrieben.`, n ? 'ok' : ''); });
  on('#bk-jetzt', async () => { try { const r = await api('GET', '/api/export'); await RheaStore.snapshot(r.json, 'manuell', true); toast('Backup angelegt.', 'ok'); neu(); } catch (e) { toast(e.message, 'err'); } });
  on('#bk-teilen', async () => { try { const r = await api('GET', '/api/export'); await dateiTeilen(r.dateiname || 'rheasport-backup.json', r.json, 'application/json'); } catch (e) { toast(e.message, 'err'); } });
  el.querySelectorAll('[data-bk-t]').forEach((b) => { b.onclick = async () => { const rec = await RheaStore.getBackup(Number(b.dataset.bkT)); if (rec) await dateiTeilen(`rheasport-backup-${rec.ts.slice(0, 19).replace(/[:T]/g, '-')}.json`, rec.json, 'application/json'); }; });
  el.querySelectorAll('[data-bk-r]').forEach((b) => { b.onclick = async () => {
    const rec = await RheaStore.getBackup(Number(b.dataset.bkR));
    if (!rec) return;
    if (!confirm(`Stand vom ${new Date(rec.ts).toLocaleString('de-DE')} wiederherstellen?\nDer aktuelle Stand wird vorher automatisch gesichert.`)) return;
    try {
      const cur = await api('GET', '/api/export');
      const ok = await RheaStore.snapshot(cur.json, 'vor Wiederherstellung', true);
      if (!ok) throw new Error('Sicherung des aktuellen Stands fehlgeschlagen – Wiederherstellung abgebrochen.');
      await api('POST', '/api/import', JSON.parse(rec.json));
      await reload(true); toast('Backup wiederhergestellt.', 'ok');
    } catch (e) { toast(e.message, 'err'); }
  }; });
}

/* ============================== ABRECHNUNG ============================== */
let ABR_MONAT = heutigesISO().slice(0, 7);
function verschiebeMonat(m, delta) {
  const [j, mo] = m.split('-').map(Number);
  const d = new Date(j, mo - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
async function renderStatistik() {
  const st = await api('GET', `/api/statistik?monat=${ABR_MONAT}`);
  const g = st.gesamt;
  const [j, mo] = st.monat.split('-').map(Number);
  const titel = new Date(j, mo - 1, 1).toLocaleDateString('de-DE', { month: 'long', year: 'numeric' });
  $('#abr-stat').innerHTML = `<div class="card">
    <div class="row between"><h2 style="margin:0">Statistik ${esc(titel)}</h2>
      <div class="row"><button class="btn small" id="st-prev">‹</button><button class="btn small" id="st-heute">Heute</button><button class="btn small" id="st-next">›</button></div></div>
    <div class="stats" style="margin-top:8px">
      <div class="stat"><div class="n">${g.termine}</div><div class="t">Einheiten durchgeführt</div></div>
      <div class="stat"><div class="n">${g.geplantTermine}</div><div class="t">noch geplant</div></div>
      <div class="stat"><div class="n">${g.teilnahmen}</div><div class="t">Teilnahmen</div></div>
      <div class="stat"><div class="n">${g.ausgefallen}</div><div class="t">ausgefallen</div></div>
      <div class="stat"><div class="n">${g.abbrueche}</div><div class="t">Abbrüche</div></div>
    </div>
    <div class="table-wrap"><table><thead><tr><th>Trainer/in</th><th>Stundenlohn €/Std.</th><th>Std. bisher</th><th>Verdienst bisher</th><th>Std. geplant</th><th>Voraussichtlich</th></tr></thead><tbody>
      ${st.trainer.map((t) => `<tr><td><strong>${esc(t.name)}</strong>${t.unbestaetigt ? `<div class="muted small">${t.unbestaetigt} vergangene Termine noch unbestätigt</div>` : ''}</td>
        <td><input type="number" step="0.01" min="0" class="tr-lohn" data-tid="${t.id}" value="${t.stundenlohn || ''}" style="width:90px"></td>
        <td>${t.stunden.toString().replace('.', ',')} <span class="muted small">(${t.termine} Termine)</span></td><td>${euroFmt(t.verdienst)}</td>
        <td>${t.geplantStunden.toString().replace('.', ',')}</td><td><strong>${euroFmt(t.prognose)}</strong></td></tr>`).join('') || '<tr><td colspan="6" class="muted">Keine Trainer/innen.</td></tr>'}
    </tbody></table></div>
    <div class="grid2" style="margin-top:8px">
      <div class="item"><span class="muted">Trainerkosten bisher / voraussichtlich</span><strong>${euroFmt(g.trainerkosten)} / ${euroFmt(g.trainerkostenPrognose)}</strong></div>
      <div class="item"><span class="muted">Einnahmen bisher / voraussichtlich*</span><strong>${euroFmt(g.einnahmen)} / ${euroFmt(g.einnahmenPrognose)}</strong></div>
    </div>
    <div class="item"><span class="muted">Voraussichtliches Ergebnis (Einnahmen − Trainerkosten)</span><strong>${euroFmt(g.ergebnisPrognose)}</strong></div>
    <p class="muted small">*Einnahmen = Vergütungssatz × Teilnahmen (Satz je Verordnung bzw. aus den Einstellungen). Voraussichtlich enthält alle noch geplanten Termine mit zugeordneten Teilnehmern.</p>
  </div>`;
  $('#st-prev').onclick = () => { ABR_MONAT = verschiebeMonat(ABR_MONAT, -1); renderStatistik(); };
  $('#st-next').onclick = () => { ABR_MONAT = verschiebeMonat(ABR_MONAT, 1); renderStatistik(); };
  $('#st-heute').onclick = () => { ABR_MONAT = heutigesISO().slice(0, 7); renderStatistik(); };
  $$('.tr-lohn').forEach((inp) => {
    inp.onchange = async () => {
      try { await api('PUT', `/api/trainer/${inp.dataset.tid}`, { stundenlohn: inp.value }); await reload(false); await renderStatistik(); toast('Stundenlohn gespeichert.', 'ok'); }
      catch (e) { toast(e.message, 'err'); }
    };
  });
}

async function renderAbrechnung() {
  renderStatistik().catch((e) => toast(e.message, 'err'));
  const r = await api('GET', '/api/abrechnung');
  const filter = $('#abr-filter').value, sort = $('#abr-sort').value;
  const filterKt = ($('#abr-filter-kt') || {}).value || '';
  const filterBezahlt = ($('#abr-filter-bezahlt') || {}).value || '';
  const zeilen = r.zeilen.filter((z) => {
    if (filter === 'bereit') { if (!(z.fertig && z.status !== 'abgerechnet' && z.status !== 'bezahlt' && z.erbrachteUee > 0)) return false; }
    else if (filter === 'laeuft') { if (z.fertig) return false; }
    else if (filter === 'offen') { if (!z.offen) return false; }
    else if (filter && filter !== 'alle') { if (z.status !== filter) return false; }
    if (filterKt && z.kostentraegerArt !== filterKt) return false;
    if (filterBezahlt === 'ja' && !z.bezahlt) return false;
    if (filterBezahlt === 'nein' && z.bezahlt) return false;
    return true;
  }).sort({
    name: (x, y) => x.patient.localeCompare(y.patient, 'de'),
    betrag: (x, y) => (y.betrag || 0) - (x.betrag || 0),
    status: (x, y) => x.status.localeCompare(y.status),
    ende: (x, y) => String(x.bis || '').localeCompare(String(y.bis || '')),
  }[sort] || (() => 0));
  const summeBetrag = zeilen.reduce((a, z) => a + (z.betrag || 0), 0);
  const summeOffen = zeilen.filter((z) => z.offen).reduce((a, z) => a + (z.betrag || 0), 0);
  const summeBezahlt = zeilen.filter((z) => z.bezahlt).reduce((a, z) => a + (z.betrag || 0), 0);
  const sumBar = $('#abr-summen');
  if (sumBar) sumBar.innerHTML = `<div class="row" style="gap:16px;flex-wrap:wrap;margin:8px 0">
    <span class="chip blue">Gesamt: ${euroFmt(summeBetrag)}</span>
    <span class="chip amber">Offene Posten: ${euroFmt(summeOffen)}</span>
    <span class="chip green">Bezahlt: ${euroFmt(summeBezahlt)}</span>
    <span class="chip gray">${zeilen.length} Einträge</span>
  </div>`;
  const rows = zeilen.map((z) => `<tr class="${z.fertig ? '' : 'muted'}">
    <td><button class="link" onclick="oeffnePatient('${esc(z.patientId || '')}')" style="font-weight:700;text-align:left">${esc(z.patient)}</button>${z.letzterTermin ? `<div class="muted small">letzter Termin ${fmt(z.letzterTermin)}</div>` : ''}</td>
    <td>${z.trainerName ? `<button class="link" onclick="zeigeView('trainer')" style="text-align:left">${esc(z.trainerName)}</button>` : '–'}</td>
    <td>${esc(z.kostentraeger || '–')} <span class="chip gray">${esc(z.kostentraegerArt)}</span></td>
    <td>${esc(z.artLabel)}</td>
    <td>${fmt(z.von)} – ${fmt(z.bis)}${z.abbruch ? `<div class="errline">Abbruch ${fmt(z.abbruch.datum)}: ${esc(z.abbruch.grund)}</div>` : ''}${z.hinweis ? `<div class="muted small">${esc(z.hinweis)}</div>` : ''}</td>
    <td><strong>${z.erbrachteUee}</strong> / ${z.geplanteUee} ${z.status === 'abgebrochen' ? '<span class="chip red">abgebrochen</span>' : z.fertig ? '<span class="chip green">bereit</span>' : '<span class="chip amber">läuft</span>'}</td>
    <td><input type="number" step="0.01" min="0" value="${z.satz || ''}" data-vid="${z.id}" class="abr-satz" style="width:90px">
      <div class="muted small"><a href="https://verguetungssaetze.rehasport-deutschland.de/" target="_blank" rel="noopener">Sätze suchen</a></div></td>
    <td>${z.betrag != null ? `<strong>${z.betrag.toFixed(2).replace('.', ',')} €</strong>` : '–'}</td>
    <td>${statusChip(z.status)}${z.bezahlt ? '<span class="chip green">bezahlt</span>' : ''}${z.abrechnung && z.abrechnung.rechnungsNr ? `<div class="muted small">Nr. ${esc(z.abrechnung.rechnungsNr)}</div>` : ''}</td>
    <td class="row" style="flex-wrap:wrap">
      ${z.status !== 'abgerechnet' && z.status !== 'bezahlt' ? `<button class="btn small ${z.fertig ? 'primary' : ''}" ${z.erbrachteUee > 0 ? '' : 'disabled'} onclick="setzeAbrechnung('${z.id}', true)">Abrechnen</button>` : ''}
      ${z.offen ? `<button class="btn small primary" onclick="markiereBezahlt('${z.id}')">💰 Bezahlt</button>` : ''}
      ${z.fertig && z.erbrachteUee > 0 ? `<button class="btn small" onclick="druckeRechnung('${z.id}')">🖨 Rechnung</button>` : ''}
    </td>
  </tr>`).join('');
  $('#abr-tabelle tbody').innerHTML = rows || '<tr><td colspan="10" class="muted">Keine Verordnungen in der Abrechnung.</td></tr>';
  $$('.abr-satz').forEach((inp) => {
    inp.onchange = async () => {
      try { await api('POST', `/api/verordnungen/${inp.dataset.vid}/abrechnung`, { satz: inp.value, satzQuelle: 'manuell (RSD-Vergütungssätze)' }); await renderAbrechnung(); toast('Vergütungssatz gespeichert.', 'ok'); } catch (e) { toast(e.message, 'err'); }
    };
  });
}
['#abr-filter', '#abr-sort', '#abr-filter-kt', '#abr-filter-bezahlt'].forEach((id) => { const el = $(id); if (el) el.addEventListener('change', renderAbrechnung); });

window.markiereBezahlt = async (vid) => {
  const v = (S.verordnungen || []).find((x) => x.id === vid);
  if (!v) return;
  const notiz = prompt('Zahlungsnotiz (optional, z.B. Datum, Betrag, Referenz):', '');
  if (notiz === null) return;
  try {
    await api('POST', `/api/verordnungen/${vid}/abrechnung`, { bezahlt: true, bezahltNotiz: notiz });
    await reload(true); renderAbrechnung(); toast('Als bezahlt markiert.', 'ok');
  } catch (e) { toast(e.message, 'err'); }
};

/* ---- Rechnungsdruck mit Terminübersicht ---- */
window.druckeRechnung = (vid) => {
  const v = (S.verordnungen || []).find((x) => x.id === vid);
  if (!v) return;
  const p = (S.patienten || []).find((x) => x.id === v.patientId) || {};
  const an = S.settings.anbieter || {};
  const kids = (S.zuordnungen || []).filter((z) => z.verordnungId === v.id).map((z) => z.kursId);
  const kurse = kids.map((k) => (S.kurse || []).find((x) => x.id === k)).filter(Boolean);
  const trainer = [...new Set(kurse.map((k) => { const t = (S.trainer || []).find((x) => x.id === k.trainerId); return t ? `${t.vorname} ${t.nachname}` : ''; }).filter(Boolean))].join(', ');
  const termine = (S.termine || []).filter((t) => kids.includes(t.kursId) && t.status === 'stattgefunden'
    && (!v.von || t.datum >= v.von) && (!v.bis || t.datum <= v.bis)).sort((a, b) => (a.datum + a.beginn).localeCompare(b.datum + b.beginn));
  const teilnahmen = termine.filter((t) => {
    const a = (t.anwesenheit || []).find((x) => x.patientId === v.patientId);
    return a && a.wahrgenommen && (a.unterschriftPng || a.unterschriftPapier);
  });
  const artLabel = (S.regeln.arten[v.art] || {}).label || v.art;
  const satz = (v.abrechnung && v.abrechnung.satz) || 0;
  const uee = teilnahmen.length;
  const betrag = satz ? Math.round(satz * uee * 100) / 100 : 0;
  const rechnungsNr = (v.abrechnung && v.abrechnung.rechnungsNr) || `RE-${heutigesISO().replace(/-/g, '')}-${v.id.slice(-4)}`;
  /* Terminübersicht */
  const terminZeilen = termine.map((t, i) => {
    const a = (t.anwesenheit || []).find((x) => x.patientId === v.patientId);
    const teilgenommen = a && a.wahrgenommen;
    const sig = a && (a.unterschriftPng || a.unterschriftPapier);
    return `<tr><td>${i + 1}</td><td>${fmt(t.datum)}</td><td>${esc(t.beginn || '')}</td><td>${esc((S.kurse || []).find((k) => k.id === t.kursId)?.titel || '')}</td>
      <td>${teilgenommen ? '✓' : '–'}</td><td>${sig ? (a.unterschriftPng ? '<img src="' + a.unterschriftPng + '" style="max-height:24px">' : 'Papier') : '–'}</td></tr>`;
  }).join('');
  const kostenstelleLabel = { gkv: 'Gesetzliche Krankenversicherung', rv: 'Rentenversicherung', uv: 'Unfallversicherung (BG/DGUV)', sonstige: 'Sonstiger Träger' }[v.kostentraegerArt || 'gkv'] || v.kostentraegerArt;
  const vorlagen = ((S.settings.abrechnung || {}).vorlagen) || {};
  const vorlageText = vorlagen[v.kostentraegerArt || 'gkv'] || vorlagen.gkv || 'Es werden nur tatsächlich erbrachte Übungseinheiten abgerechnet.';
  const html = `<style>${PRINT_CSS}</style><div class="pr-page">
    <table class="kopf"><tr><td style="width:60%">
      <strong style="font-size:16px">${esc(an.name || '')}</strong><br>
      ${esc(an.strasse || '')}<br>${esc(an.plz || '')} ${esc(an.ort || '')}<br>
      ${an.telefon ? 'Tel. ' + esc(an.telefon) + '<br>' : ''}${an.email ? esc(an.email) + '<br>' : ''}
      ${an.ik ? 'IK: ' + esc(an.ik) : ''}
    </td><td>
      <strong>RECHNUNG</strong><br>
      Nr.: ${esc(rechnungsNr)}<br>
      Datum: ${fmt(heutigesISO())}<br>
      ${an.iban ? 'IBAN: ' + esc(an.iban) : ''}
    </td></tr></table>
    <div style="margin:18px 0;padding:12px;border:1px solid #000;border-radius:6px">
      <strong>${esc(p.nachname || v.name || '')}, ${esc(p.vorname || '')}</strong><br>
      ${esc(p.strasse || '')} ${esc(p.plz || '')} ${esc(p.ort || '')}<br>
      ${p.geburtsdatum ? 'Geb.: ' + fmt(p.geburtsdatum) : ''}
    </div>
    <h1>Rechnung ${esc(rechnungsNr)}</h1>
    <table>
      <tr><td>Kostenträger:</td><td><strong>${esc(v.kostentraeger || '')}</strong> (${esc(kostenstelleLabel)})</td></tr>
      <tr><td>Versicherten-Nr.:</td><td>${esc(v.versichertenNr || '–')}</td></tr>
      <tr><td>Verordnungszeitraum:</td><td>${fmt(v.von)} – ${fmt(v.bis)}</td></tr>
      <tr><td>Maßnahme:</td><td>${esc(artLabel)}</td></tr>
      <tr><td>Übungsleitung:</td><td>${esc(trainer || '–')}</td></tr>
      <tr><td>Gruppe:</td><td>${esc(kurse.map((k) => k.titel).join(', ') || '–')}</td></tr>
    </table>
    <h2 style="font-size:15px;margin-top:16px">Leistungsübersicht</h2>
    <table>
      <thead><tr><th>Pos.</th><th>Beschreibung</th><th>Menge</th><th>Einzelsatz</th><th>Gesamt</th></tr></thead>
      <tbody>
        <tr><td>1</td><td>${esc(artLabel)} – erbrachte Übungseinheiten gemäß Verordnung und Teilnahmenachweis</td>
          <td style="text-align:center">${uee} ÜE</td><td style="text-align:right">${euroFmt(satz)}</td><td style="text-align:right"><strong>${euroFmt(betrag)}</strong></td></tr>
      </tbody>
      <tfoot><tr><td colspan="4" style="text-align:right;font-weight:700">Rechnungsbetrag:</td><td style="text-align:right;font-weight:700;font-size:16px">${euroFmt(betrag)}</td></tr></tfoot>
    </table>
    <h2 style="font-size:15px;margin-top:16px">Terminübersicht (Teilnahmenachweis)</h2>
    <table>
      <thead><tr><th>Nr.</th><th>Datum</th><th>Uhrzeit</th><th>Gruppe</th><th>Teilnahme</th><th>Unterschrift</th></tr></thead>
      <tbody>${terminZeilen || '<tr><td colspan="6">Keine Termine dokumentiert.</td></tr>'}</tbody>
    </table>
    <div class="fine">${esc(vorlageText)}</div>
    <div class="foot"><div>${esc(an.ort || '')}, ${fmt(heutigesISO())}</div><div>Unterschrift / Stempel</div></div>
  </div>`;
  zeigeDruckansicht(html, `Rechnung_${rechnungsNr}_${(p.nachname || 'Patient').replace(/\W+/g, '_')}.html`);
};

window.setzeAbrechnung = async (vid, offen) => {
  const v = (S.verordnungen || []).find((x) => x.id === vid);
  const satz = ($(`.abr-satz[data-vid="${vid}"]`) || {}).value || (v && v.abrechnung && v.abrechnung.satz) || '';
  const nr = prompt('Rechnungsnummer (optional):', '');
  if (nr === null) return;
  try {
    await api('POST', `/api/verordnungen/${vid}/abrechnung`, { satz, satzQuelle: 'manuell (RSD-Vergütungssätze)', rechnungsNr: nr, abrechnen: true });
    await reload(true); renderAbrechnung();
    toast('Als abgerechnet markiert – nur erbrachte ÜE mit Verordnung/Kostenübernahme!', 'ok');
  } catch (e) { toast(e.message, 'err'); }
};
/** E-Mail mit Anhang: Teilen-Dialog (Gmail-App wählbar) – Fallback: Datei speichern + mailto. */
async function mailMitAnhang({ an, betreff, text, dateien }) {
  const files = dateien.map((d) => new File([d.inhalt], d.name, { type: d.mime }));
  try {
    if (navigator.canShare && navigator.canShare({ files })) {
      if (an) { try { await navigator.clipboard.writeText(an); toast(`Empfänger ${an} in die Zwischenablage kopiert – in Gmail einfügen.`, 'ok'); } catch (_) { /* egal */ } }
      await navigator.share({ files, title: betreff, text });
      return;
    }
  } catch (e) { if (e && e.name === 'AbortError') return; }
  for (const f of files) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(f); a.download = f.name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 8000);
  }
  toast('Anhang wurde gespeichert – bitte in der Mail manuell anhängen.', '');
  window.location.href = `mailto:${an || ''}?subject=${encodeURIComponent(betreff)}&body=${encodeURIComponent(text)}`;
}

$('#btn-abr-mail').onclick = async () => {
  if (!confirm('Die Abrechnungsliste enthält personenbezogene Daten (Namen, Kostenträger). Nur an berechtigte Empfänger senden. Fortfahren?')) return;
  try {
    const r = await api('GET', '/api/abrechnung/export.csv');
    const l = await api('GET', '/api/abrechnung');
    const summe = (l.zeilen || []).reduce((a, z) => a + (z.betrag || 0), 0);
    const an = (S.settings.google || {}).abrechnungEmpfaenger || '';
    const an0 = S.settings.anbieter || {};
    await mailMitAnhang({
      an, betreff: `Abrechnung ${an0.name || 'RheaSport'} – Stand ${fmt(heutigesISO())}`,
      text: ['Guten Tag,', '', `anbei die Abrechnungsliste (Stand ${fmt(heutigesISO())}): ${(l.zeilen || []).length} Verordnungen, Summe ${euroFmt(summe)}.`, '', 'Mit freundlichen Grüßen', an0.name || ''].join('\n'),
      dateien: [{ name: r.dateiname || 'rehasport-abrechnung.csv', inhalt: r.csv, mime: 'text/csv' }],
    });
  } catch (e) { toast(`E-Mail fehlgeschlagen: ${e.message}`, 'err'); }
};

$('#btn-csv').onclick = async () => {
  if (window.LOCAL_MODE) {
    try {
      const r = await api('GET', '/api/abrechnung/export.csv');
      await dateiTeilen(r.dateiname || 'rehasport-abrechnung.csv', r.csv, 'text/csv');
    } catch (e) { toast(`CSV-Export fehlgeschlagen: ${e.message}`, 'err'); }
    return;
  }
  window.location.href = '/api/abrechnung/export.csv';
};

/* ============================== POSTFACH ============================== */
function renderPostfach() {
  $('#smtp-hinweis').innerHTML = (S.lokalModus || window.LOCAL_MODE)
    ? `<span class="chip blue">APK-Lokalmodus</span> Nachrichten werden als Entwurf angelegt und über das <strong>E-Mail-Programm des Geräts</strong> versendet (Öffnen-Button → Mail-App mit Empfänger, Betreff und Text). Automatischer SMTP-Versand ist nur in der Server-Version möglich.`
    : S.mailKonfiguriert
      ? `<span class="chip green">SMTP konfiguriert</span> Nachrichten werden automatisch versendet. <button class="link" onclick="zeigeView('einstellungen')">Einstellungen</button>`
      : `<strong>SMTP noch nicht konfiguriert.</strong> Patienten-Termine- und Vollständigkeits-E-Mails werden als Entwurf vorgehalten und können per Mail-Programm geöffnet werden. <button class="link" onclick="zeigeView('einstellungen')">Jetzt konfigurieren</button>`;
  if (googleAktiv() && RheaGoogle.status().angemeldet) $('#smtp-hinweis').innerHTML += ` <span class="chip green">Gmail verbunden</span> Nachrichten können direkt über Gmail gesendet werden. <button class="btn small primary" onclick="mailGmailAlle()">Alle offenen senden</button>`;
  const statusChipFn = (m) => {
    if (m.status === 'mailto-bereit') return '<span class="chip amber">Entwurf (Gerät)</span>';
    return `<span class="chip ${m.status === 'gesendet' ? 'green' : m.status === 'fehler' ? 'red' : 'amber'}">${m.status === 'konfiguration-offen' ? 'Entwurf (SMTP offen)' : esc(m.status)}</span>`;
  };
  const rows = (S.outbox || []).map((m) => `<tr>
    <td>${new Date(m.ts).toLocaleString('de-DE')}</td>
    <td><span class="chip ${m.typ === 'patient-termine' ? 'blue' : 'purple'}">${m.typ === 'patient-termine' ? 'Patient: Termine' : m.typ === 'verordnung-vollstaendig' ? 'Führungspersonal: vollständig' : m.typ}</span></td>
    <td>${esc((m.an || []).join(', '))}</td>
    <td>${esc(m.betreff)}</td>
    <td>${statusChipFn(m)}${m.fehler ? `<div class="muted small">${esc(m.fehler)}</div>` : ''}</td>
    <td class="row">
      <button class="btn small" onclick="mailVorschau('${m.id}')">Vorschau</button>
      ${googleAktiv() && RheaGoogle.status().angemeldet && m.status !== 'gesendet' ? `<button class="btn small primary" onclick="mailGmail('${m.id}')">Per Gmail senden</button>` : ''}
      <button class="btn small" onclick="mailMailto('${m.id}')">Öffnen</button>
      <button class="btn small" onclick="mailErneut('${m.id}')">Erneut</button>
    </td></tr>`).join('');
  $('#outbox-tabelle tbody').innerHTML = rows || '<tr><td colspan="6" class="muted">Noch keine Nachrichten erzeugt.</td></tr>';
}
window.mailVorschau = (id) => {
  const m = (S.outbox || []).find((x) => x.id === id);
  if (!m) return;
  openModal(`Vorschau: ${m.betreff}`, `<div class="outbox-preview">${m.html ? `<iframe srcdoc="${esc(m.html)}"></iframe>` : `<pre>${esc(m.text)}</pre>`}</div>`,
    [{ label: 'Schließen', cls: 'btn primary', onClick: closeModal }], { wide: true });
};
window.mailMailto = async (id) => {
  const r = await api('GET', `/api/outbox/${id}/mailto`);
  window.location.href = r.mailto;
};
window.mailErneut = async (id) => {
  try { const r = await api('POST', `/api/outbox/${id}/erneut`); await reload(true); toast(mailStatusText(r.outbox), r.outbox.status === 'gesendet' ? 'ok' : 'err'); }
  catch (e) { toast(e.message, 'err'); }
};

/* ============================== GOOGLE (Gmail & Kalender) ============================== */
const googleAktiv = () => Boolean(window.RheaGoogle) && Boolean(S.lokalModus || window.LOCAL_MODE);
let googleSendet = false;

async function gmailSendeEintrag(m) {
  try {
    await RheaGoogle.gmailSenden({ an: m.an, betreff: m.betreff, text: m.text, html: m.html });
    await api('POST', `/api/outbox/${m.id}/status`, { status: 'gesendet', via: 'gmail' });
    return true;
  } catch (e) {
    await api('POST', `/api/outbox/${m.id}/status`, { status: 'fehler', fehler: String(e.message || e).slice(0, 200), via: 'gmail' }).catch(() => {});
    throw e;
  }
}
/** Sendet alle noch offenen Entwürfe über Gmail (nur wenn angemeldet). */
async function gmailOffeneSenden(still) {
  if (googleSendet || !googleAktiv() || !RheaGoogle.status().angemeldet) return 0;
  const offen = (S.outbox || []).filter((m) => m.status === 'mailto-bereit' || m.status === 'konfiguration-offen');
  if (!offen.length) { if (!still) toast('Keine offenen Nachrichten.', ''); return 0; }
  googleSendet = true;
  let ok = 0, fehler = '';
  try {
    for (const m of offen.slice().reverse()) {
      try { if (await gmailSendeEintrag(m)) ok++; } catch (e) { fehler = e.message; }
    }
  } finally { googleSendet = false; }
  await reload(true);
  if (!still || fehler) toast(fehler ? `${ok} gesendet, Fehler: ${fehler}` : `${ok} Nachricht(en) über Gmail gesendet.`, fehler ? 'err' : 'ok');
  return ok;
}
window.mailGmail = async (id) => {
  const m = (S.outbox || []).find((x) => x.id === id);
  if (!m) return;
  try { await gmailSendeEintrag(m); await reload(true); toast('Über Gmail gesendet.', 'ok'); }
  catch (e) { await reload(true); toast(e.message, 'err'); }
};
window.mailGmailAlle = () => gmailOffeneSenden(false);

async function renderGoogleCard() {
  const el = $('#cfg-google');
  if (!el) return;
  if (!googleAktiv()) { el.innerHTML = '<p class="hint">Die Google-Anbindung steht im Lokalmodus (APK) zur Verfügung.</p>'; return; }
  const c = await RheaGoogle.config();
  const st = RheaGoogle.status(), op = RheaGoogle.optionen();
  if (!c.clientId) {
    el.innerHTML = `<p class="hint"><strong>Noch nicht eingerichtet.</strong> Trage deine Google-Client-ID in <code>public/google-config.json</code> ein und baue die App neu (die ID wird auch für den Rücksprung in die App benötigt). Anleitung: README, Abschnitt „Google einrichten“.</p>`;
    return;
  }
  el.innerHTML = `<div class="row">${st.angemeldet ? `<span class="chip green">angemeldet</span> <strong>${esc(st.email || 'Google-Konto')}</strong>` : '<span class="chip gray">nicht angemeldet</span>'}</div>
    <div class="row" style="margin-top:8px">
      ${st.angemeldet
        ? '<button class="btn small" id="g-abmelden">Abmelden</button><button class="btn small primary" id="g-kal">Kalender abgleichen &amp; teilen</button><button class="btn small" id="g-test">Testmail an mich</button>'
        : '<button class="btn primary" id="g-anmelden">Mit Google anmelden</button>'}
    </div>
    ${st.angemeldet ? `<label class="check" style="margin-top:8px"><input type="checkbox" id="g-auto" ${op.autoMail ? 'checked' : ''}> Neue Nachrichten (Termine, Abrechnungen, Vollständigkeit) automatisch über Gmail senden</label>` : ''}
    <p class="hint">Die Anmeldung öffnet den Browser des Geräts (Google erlaubt sie nicht innerhalb der App). Der Kalender „${esc((S.settings.kalender || {}).titel || 'RheaSport Kurse')}“ enthält die kommenden 60 Tage (nur Gruppe, Ort, Zeit, Übungsleitung – keine Patientendaten) und wird für Trainer mit E-Mail-Adresse zum Lesen freigegeben.</p>
    <div id="g-ergebnis" class="muted small"></div>`;
  const on = (id, fn) => { const b = el.querySelector(id); if (b) b.onclick = fn; };
  on('#g-anmelden', async (ev) => {
    ev.target.disabled = true;
    try { toast('Browser öffnet sich – bitte bei Google anmelden …', ''); const r = await RheaGoogle.anmelden(); toast(`Angemeldet als ${r.email || 'Google-Konto'}.`, 'ok'); }
    catch (e) { toast(e.message, 'err'); }
    renderGoogleCard();
  });
  on('#g-abmelden', () => { RheaGoogle.abmelden(); renderGoogleCard(); });
  on('#g-test', async () => {
    try { await RheaGoogle.gmailSenden({ an: st.email, betreff: 'RheaSport Test-E-Mail', text: 'Gmail-Versand funktioniert ✔' }); toast('Testmail gesendet.', 'ok'); }
    catch (e) { toast(e.message, 'err'); }
  });
  on('#g-kal', async (ev) => {
    ev.target.disabled = true;
    try {
      const r = await RheaGoogle.kalenderAbgleichen({ termine: S.termine || [], kurse: S.kurse || [], trainer: S.trainer || [], titel: (S.settings.kalender || {}).titel, heute: heutigesISO(), tage: 60 });
      $('#g-ergebnis').textContent = `Kalender abgeglichen: ${r.neu} neu, ${r.aktualisiert} aktualisiert, ${r.entfernt} entfernt, ${r.geteilt} Trainer freigegeben.`;
      toast('Google-Kalender abgeglichen.', 'ok');
    } catch (e) { toast(e.message, 'err'); }
    ev.target.disabled = false;
  });
  const auto = el.querySelector('#g-auto');
  if (auto) auto.onchange = () => { RheaGoogle.setzeOptionen({ autoMail: auto.checked }); if (auto.checked) gmailOffeneSenden(true); };
}
window.addEventListener('rhea-google', () => { if (aktuelleView === 'einstellungen') renderGoogleCard(); });

$('#btn-csv-gmail').onclick = async () => {
  if (!googleAktiv() || !RheaGoogle.status().angemeldet) { toast('Bitte zuerst unter Einstellungen → Google anmelden.', 'err'); return; }
  const ziel = prompt('Abrechnung (CSV) per Gmail senden an:', (S.settings.google || {}).abrechnungEmpfaenger || '');
  if (!ziel) return;
  try {
    const r = await api('GET', '/api/abrechnung/export.csv');
    const base64 = btoa(unescape(encodeURIComponent('\ufeff' + r.csv)));
    await RheaGoogle.gmailSenden({ an: ziel.trim(), betreff: `Abrechnung RheaSport ${fmt(heutigesISO())}`, text: 'Im Anhang die aktuelle Abrechnung (CSV).', anhaenge: [{ name: r.dateiname || 'rehasport-abrechnung.csv', mime: 'text/csv', base64 }] });
    toast('Abrechnung per Gmail gesendet.', 'ok');
  } catch (e) { toast(e.message, 'err'); }
};

/* ============================== EINSTELLUNGEN ============================== */
function renderEinstellungen() {
  const lokal = Boolean(S.lokalModus || window.LOCAL_MODE);
  const smtpHint = $('#smtp-hint-text');
  if (smtpHint) {
    smtpHint.innerHTML = lokal
      ? '<strong>APK-Lokalmodus:</strong> Auf dem Gerät wird kein SMTP-Versand verwendet – jede Nachricht wird als Entwurf angelegt und über die <strong>Mail-App des Geräts</strong> versendet (E-Mail-Journal → „Öffnen“). SMTP-Felder gelten für die Server-Version.'
      : 'Ohne SMTP-Konfiguration werden alle Nachrichten im Journal vorgehalten und können als Entwurf (mailto:) geöffnet werden. Beispiel GMX: <code>mail.gmx.net</code> (Port 587, TLS).';
  }
  const exp = $('#btn-export');
  if (exp && lokal) {
    exp.removeAttribute('href');
    exp.onclick = async (ev) => {
      ev.preventDefault();
      try { const r = await api('GET', '/api/export'); await dateiTeilen(r.dateiname || 'rheasport-backup.json', r.json, 'application/json'); }
      catch (e) { toast(`Export fehlgeschlagen: ${e.message}`, 'err'); }
    };
  } else if (exp) { exp.setAttribute('href', '/api/export'); exp.onclick = null; }
  const a = S.settings.anbieter || {};
  $$('#cfg-anbieter [data-a]').forEach((el) => { el.value = a[el.dataset.a] ?? ''; });
  const s = S.settings.smtp || {};
  $$('#cfg-smtp [data-s]').forEach((el) => {
    if (el.type === 'checkbox') el.checked = Boolean(s[el.dataset.s]);
    else el.value = s[el.dataset.s] ?? '';
  });
  const ds = S.settings.datenschutz || {};
  $$('#cfg-ds [data-d]').forEach((el) => { el.value = ds[el.dataset.d] ?? ''; });

  $('#cfg-bundesland').innerHTML = (S.regeln.bundeslaender || []).map(([id, name]) =>
    `<option value="${id}" ${S.settings.bundesland === id ? 'selected' : ''}>${name}</option>`).join('');
  $('#cfg-laendlich').checked = Boolean(S.settings.ortLändlich);
  zeichneHilfsfrist();

  const fp = S.settings.fuehrungspersonal || [];
  $('#cfg-fuehrung').innerHTML = fp.map((f, i) => `
    <div class="row" data-i="${i}" style="margin-bottom:6px">
      <input value="${esc(f.name)}" data-fp="name" placeholder="Name" style="flex:1">
      <input value="${esc(f.email)}" data-fp="email" type="email" placeholder="E-Mail" style="flex:1.4">
      <button class="btn small danger" data-fp-del="${i}">✕</button>
    </div>`).join('') || '<div class="muted small">Noch keine Empfänger – ohne Eintrag erfolgt kein Versand der Vollständigkeits-Bestätigung.</div>';
  $$('#cfg-fuehrung [data-fp-del]').forEach((b) => {
    b.onclick = () => { S.settings.fuehrungspersonal.splice(Number(b.dataset.fpDel), 1); renderEinstellungen(); };
  });

  $('#cfg-kal-titel').value = (S.settings.kalender || {}).titel || '';
  $('#cfg-gruppen').value = (S.settings.gruppennamen || []).join('\n');
  $('#cfg-gmail').value = (S.settings.google || {}).adresse || '';
  $('#cfg-abr-mail').value = (S.settings.google || {}).abrechnungEmpfaenger || '';
  $('#cfg-vorab').value = Number((S.settings.unterschrift || {}).vorabMinuten ?? 20);
  $('#cfg-autoabr').checked = (S.settings.abrechnung || {}).automatisch !== false;
  /* Rechnungsvorladen laden */
  const vorl = ((S.settings.abrechnung || {}).vorlagen) || {};
  const setVorl = (id, key) => { const el = $(id); if (el) el.value = vorl[key] || ''; };
  setVorl('#cfg-vorlage-gkv', 'gkv'); setVorl('#cfg-vorlage-rv', 'rv');
  setVorl('#cfg-vorlage-uv', 'uv'); setVorl('#cfg-vorlage-sonstige', 'sonstige');
  $('#smtp-status').textContent = S.mailKonfiguriert ? '✔ konfiguriert' : '○ nicht konfiguriert';

  zeichneSatzMap();
  renderBackupCard();
  renderGoogleCard();
  renderScanKontrolle();
}

function zeichneHilfsfrist() {
  const bl = $('#cfg-bundesland').value || 'NW';
  const hf = (S.regeln.hilfsfristen || {})[bl] || {};
  const name = ((S.regeln.bundeslaender || []).find(([id]) => id === bl) || [])[1] || bl;
  $('#cfg-hilfsfrist').innerHTML = `<strong>${esc(name)}:</strong> Hilfsfrist ${esc(hf.text || '–')} ${$('#cfg-laendlich').checked && bl === 'NW' ? '– Einsatzgebiet als <em>ländlich</em> markiert (12 Min.)' : ''}<br>
    <span class="muted small">Empfehlung BAR: Eintreffen „unverzüglich“, Orientierung 8 Minuten.</span>`;
}
$('#cfg-bundesland').addEventListener('change', zeichneHilfsfrist);
$('#cfg-laendlich').addEventListener('change', zeichneHilfsfrist);

function zeichneSatzMap() {
  const map = (S.settings.abrechnung && S.settings.abrechnung.satzMap) || {};
  const eintraege = Object.entries(map);
  $('#cfg-satz').innerHTML = eintraege.map(([key, val], i) => {
    const [kt, art] = key.split(':');
    return `<div class="row" style="margin-bottom:6px" data-key="${esc(key)}">
      <select data-sm="kt" style="flex:1">${[['gkv', 'GKV'], ['rv', 'Rentenversicherung'], ['uv', 'Unfallversicherung'], ['sonstige', 'sonstiger']].map(([v, l]) => `<option value="${v}" ${kt === v ? 'selected' : ''}>${l}</option>`).join('')}</select>
      <select data-sm="art" style="flex:1.6">${Object.entries(S.regeln.arten).map(([v, x]) => `<option value="${v}" ${art === v ? 'selected' : ''}>${esc(x.label)}</option>`).join('')}</select>
      <input type="number" step="0.01" data-sm="satz" value="${val}" placeholder="€/ÜE" style="width:90px">
      <button class="btn small danger" data-sm-del="${i}">✕</button>
    </div>`;
  }).join('') || '<div class="muted small">Noch keine Sätze hinterlegt.</div>';
  $$('#cfg-satz [data-sm-del]').forEach((b) => {
    b.onclick = () => {
      const key = $$('#cfg-satz [data-key]')[Number(b.dataset.smDel)].dataset.key;
      delete map[key]; S.settings.abrechnung.satzMap = map; zeichneSatzMap();
    };
  });
}
$('#btn-satz-plus').onclick = () => {
  const map = (S.settings.abrechnung && S.settings.abrechnung.satzMap) || {};
  map['gkv:rs'] = map['gkv:rs'] ?? '';
  S.settings.abrechnung = { ...(S.settings.abrechnung || {}), satzMap: map };
  zeichneSatzMap();
};

$('#btn-save-anbieter').onclick = async () => {
  const anbieter = {};
  $$('#cfg-anbieter [data-a]').forEach((el) => { anbieter[el.dataset.a] = el.value.trim(); });
  try { await api('PUT', '/api/settings', { anbieter }); await reload(false); toast('Anbieterdaten gespeichert.', 'ok'); } catch (e) { toast(e.message, 'err'); }
};
$('#btn-save-ort').onclick = async () => {
  const fuehrungspersonal = $$('#cfg-fuehrung .row').map((row) => ({
    name: row.querySelector('[data-fp=name]').value.trim(),
    email: row.querySelector('[data-fp=email]').value.trim(),
  })).filter((f) => f.email);
  try {
    await api('PUT', '/api/settings', { bundesland: $('#cfg-bundesland').value, ortLändlich: $('#cfg-laendlich').checked, fuehrungspersonal });
    await reload(false); toast('Gespeichert.', 'ok');
  } catch (e) { toast(e.message, 'err'); }
};
$('#btn-fuehrung-plus').onclick = () => {
  (S.settings.fuehrungspersonal = S.settings.fuehrungspersonal || []).push({ name: '', email: '' });
  renderEinstellungen();
};
$('#btn-save-smtp').onclick = async () => {
  const smtp = {};
  $$('#cfg-smtp [data-s]').forEach((el) => { smtp[el.dataset.s] = el.type === 'checkbox' ? el.checked : (el.dataset.s === 'port' ? Number(el.value) : el.value.trim()); });
  try { await api('PUT', '/api/settings', { smtp }); await reload(false); toast('SMTP gespeichert.', 'ok'); } catch (e) { toast(e.message, 'err'); }
};
$('#btn-testmail').onclick = async () => {
  try {
    const r = await api('POST', '/api/testmail', { an: (S.settings.anbieter || {}).email });
    toast(mailStatusText(r.outbox), r.outbox.status === 'gesendet' ? 'ok' : 'err');
    await reload(false);
  } catch (e) { toast(e.message, 'err'); }
};
$('#btn-save-ds').onclick = async () => {
  const datenschutz = {};
  $$('#cfg-ds [data-d]').forEach((el) => { datenschutz[el.dataset.d] = el.value.trim(); });
  const satzMap = {};
  $$('#cfg-satz [data-key]').forEach((row) => {
    const key = `${row.querySelector('[data-sm=kt]').value}:${row.querySelector('[data-sm=art]').value}`;
    const v = Number(row.querySelector('[data-sm=satz]').value);
    if (v > 0) satzMap[key] = v;
  });
  try {
    const vorlagen = { gkv: ($('#cfg-vorlage-gkv') || {}).value || '', rv: ($('#cfg-vorlage-rv') || {}).value || '', uv: ($('#cfg-vorlage-uv') || {}).value || '', sonstige: ($('#cfg-vorlage-sonstige') || {}).value || '' };
    await api('PUT', '/api/settings', { datenschutz, kalender: { titel: $('#cfg-kal-titel').value.trim() }, abrechnung: { satzMap, automatisch: $('#cfg-autoabr').checked, vorlagen }, unterschrift: { vorabMinuten: Number($('#cfg-vorab').value) || 0 }, google: { adresse: $('#cfg-gmail').value.trim(), abrechnungEmpfaenger: $('#cfg-abr-mail').value.trim() }, gruppennamen: $('#cfg-gruppen').value.split('\n') });
    await reload(false); toast('Gespeichert.', 'ok');
  } catch (e) { toast(e.message, 'err'); }
};
$('#import-file').addEventListener('change', async (e) => {
  const f = e.target.files[0];
  if (!f) return;
  if (!confirm('Backup importieren? Der aktuelle Datenbestand wird ersetzt (Vorher-Backup wird angelegt).')) { e.target.value = ''; return; }
  try {
    const text = await f.text();
    const neu = JSON.parse(text);
    if ((S.lokalModus || window.LOCAL_MODE) && window.RheaStore) {
      const cur = await api('GET', '/api/export');
      await RheaStore.snapshot(cur.json, 'vor Import', true);
    }
    await api('POST', '/api/import', neu);
    await reload(true); toast('Backup importiert.', 'ok');
  } catch (err) { toast(`Import fehlgeschlagen: ${err.message}`, 'err'); }
  e.target.value = '';
});
$('#btn-demo-reset').onclick = async () => {
  if (!confirm('Alle Stammdaten (Trainer, Kurse, Patienten, Verordnungen, Termine) löschen?')) return;
  try { await api('POST', '/api/demo-reset'); await reload(true); toast('Stammdaten gelöscht.', 'ok'); } catch (e) { toast(e.message, 'err'); }
};

/* ---- Scan-Kontrolle ---- */
function renderScanKontrolle() {
  const filter = ($('#scan-ctrl-filter') || {}).value || '';
  const vs = (S.verordnungen || []).filter((v) => !filter || v.status === filter);
  const box = $('#scan-ctrl-liste');
  if (!box) return;
  box.innerHTML = vs.length ? vs.map((v) => {
    const pr = v.pruefung || {};
    const p = (S.patienten || []).find((x) => x.id === v.patientId);
    const felder = pr.felder || [];
    const fehlend = felder.filter((f) => f.blockiert && !f.ok);
    const ok = felder.filter((f) => f.blockiert && f.ok);
    return `<div class="item" style="flex-direction:column;align-items:flex-start">
      <div class="row between" style="width:100%">
        <div>
          <strong>${esc(v.name || (p ? `${p.nachname}, ${p.vorname}` : 'Unbekannt'))}</strong>
          ${statusChip(v.status)}
          <span class="muted small">· ${fmt(v.von)} – ${fmt(v.bis)} · ${esc((S.regeln.arten[v.art] || {}).label || v.art)}</span>
        </div>
        <div class="row">
          <span class="chip ${fehlend.length ? 'red' : 'green'}">${ok.length}/${felder.filter((f) => f.blockiert).length} Prüfungen bestanden</span>
          <button class="btn small" onclick="fortsetzeAbgleich('${v.id}')">Öffnen</button>
        </div>
      </div>
      <div style="margin-top:6px;font-size:13px">
        <div class="muted small">Quelle: ${esc(v.codeFormat || 'manuell')} · angelegt: ${fmt((v.angelegtAm || '').slice(0, 10))}</div>
        ${v.kostentraeger ? `<div>Kostenträger: <strong>${esc(v.kostentraeger)}</strong> · Vers.-Nr.: ${esc(v.versichertenNr || '–')}</div>` : ''}
        ${fehlend.length ? `<div style="color:var(--red);margin-top:4px">Offene Pflichtpunkte: ${fehlend.map((f) => esc(f.name)).join(', ')}</div>` : '<div style="color:var(--green);margin-top:4px">✓ Alle Pflichtprüfungen bestanden</div>'}
      </div>
    </div>`;
  }).join('') : '<div class="muted">Keine Verordnungen gefunden.</div>';
}
const scanCtrlFilter = $('#scan-ctrl-filter');
if (scanCtrlFilter) scanCtrlFilter.addEventListener('change', renderScanKontrolle);
const scanCtrlRefresh = $('#btn-scan-ctrl-refresh');
if (scanCtrlRefresh) scanCtrlRefresh.addEventListener('click', () => reload(true));

/* ============================== START ============================== */
(async function start() {
  try {
    await reload(false);
    zeigeView('dashboard');
  } catch (e) {
    document.body.innerHTML = `<div style="padding:40px;font-family:sans-serif"><h2>Verbindung zum lokalen Server fehlgeschlagen</h2><p>${esc(e.message)}</p></div>`;
  }
})();
