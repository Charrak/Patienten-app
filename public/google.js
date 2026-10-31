/* RheaGoogle – Anmeldung bei Google (OAuth 2.0 + PKCE über den System-Browser),
 * Mailversand über die Gmail-API und Kalender-Abgleich/-Freigabe über die Calendar-API.
 *
 * Wichtig: Google sperrt die Anmeldung in eingebetteten WebViews. Deshalb wird die Anmeldeseite im
 * System-Browser (Custom Tab) geöffnet; Google leitet danach über ein benutzerdefiniertes URL-Schema
 * (umgekehrte Client-ID) zurück in die App (@capacitor/app, Ereignis „appUrlOpen“).
 * Client-ID: public/google-config.json  ->  { "clientId": "123-abc.apps.googleusercontent.com" } */
(function () {
  const SCOPES = ['openid', 'email', 'https://www.googleapis.com/auth/gmail.send', 'https://www.googleapis.com/auth/calendar'];
  const KEY = 'rheasport.google.v1';
  const OPT_KEY = 'rheasport.google.opts.v1';
  const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
  const TOKEN_URL = 'https://oauth2.googleapis.com/token';
  let cfg = null;
  let wartend = null; // { verifier, state, resolve, reject }

  const lies = (k) => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (_) { return null; } };
  const schreibe = (k, v) => { try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch (_) { /* voll */ } };
  const meldeAenderung = () => { try { window.dispatchEvent(new CustomEvent('rhea-google')); } catch (_) { /* egal */ } };

  async function config() {
    if (cfg) return cfg;
    try { const r = await fetch('google-config.json', { cache: 'no-store' }); cfg = r.ok ? await r.json() : {}; } catch (_) { cfg = {}; }
    cfg.clientId = String(cfg.clientId || '').trim();
    return cfg;
  }
  const redirectUri = (clientId) => `com.googleusercontent.apps.${clientId.replace(/\.apps\.googleusercontent\.com$/, '')}:/oauth2redirect`;

  /* ---------------------------- PKCE-Helfer ---------------------------- */
  const b64url = (bytes) => { const u = new Uint8Array(bytes); let bin = ''; for (let i = 0; i < u.length; i += 0x8000) bin += String.fromCharCode(...u.subarray(i, i + 0x8000)); return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
  const zufall = (n) => b64url(crypto.getRandomValues(new Uint8Array(n)));
  async function challenge(verifier) { return b64url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))); }
  function jwtPayload(t) { try { return JSON.parse(decodeURIComponent(escape(atob(t.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))))); } catch (_) { return {}; } }

  /* ---------------------------- Plugins (nur in der installierten App) ---------------------------- */
  function plugin(name) {
    try { const c = window.Capacitor; return c && c.isNativePlatform && c.isNativePlatform() ? c.registerPlugin(name) : null; } catch (_) { return null; }
  }
  let listenerOk = false;
  function starteListener() {
    if (listenerOk) return;
    const App = plugin('App');
    if (!App || !App.addListener) return;
    listenerOk = true;
    App.addListener('appUrlOpen', (ev) => { if (ev && ev.url) behandleRueckleitung(ev.url); });
  }

  /* ---------------------------- Anmeldung ---------------------------- */
  async function anmelden() {
    const c = await config();
    if (!c.clientId) throw new Error('Keine Google-Client-ID hinterlegt (public/google-config.json).');
    const App = plugin('App');
    if (!App && !window.__RHEA_GOOGLE_TEST) throw new Error('Die Google-Anmeldung funktioniert nur in der installierten App (Android).');
    starteListener();
    const verifier = zufall(48), state = zufall(16);
    const url = `${AUTH_URL}?${new URLSearchParams({
      client_id: c.clientId, redirect_uri: redirectUri(c.clientId), response_type: 'code', scope: SCOPES.join(' '),
      code_challenge: await challenge(verifier), code_challenge_method: 'S256', state, access_type: 'offline', prompt: 'consent',
    })}`;
    const fertig = new Promise((resolve, reject) => { wartend = { verifier, state, resolve, reject }; });
    const Browser = plugin('Browser');
    if (window.__RHEA_GOOGLE_TEST) window.__RHEA_GOOGLE_TEST.url = url;
    else if (Browser && Browser.open) await Browser.open({ url });
    else window.open(url, '_blank');
    return fertig;
  }

  async function behandleRueckleitung(url) {
    const w = wartend;
    if (!w) return;
    try {
      const q = new URL(url.replace(/^[^:]+:\//, 'https://x/')).searchParams;
      if (q.get('error')) throw new Error(q.get('error') === 'access_denied' ? 'Anmeldung abgebrochen.' : `Google: ${q.get('error')}`);
      if (q.get('state') !== w.state) throw new Error('Ungültige Antwort (state) – bitte erneut anmelden.');
      const c = await config();
      const tok = await tokenAnfrage({ grant_type: 'authorization_code', code: q.get('code'), code_verifier: w.verifier, redirect_uri: redirectUri(c.clientId), client_id: c.clientId });
      const email = (jwtPayload(tok.id_token || '').email) || '';
      schreibe(KEY, { access: tok.access_token, exp: Date.now() + (tok.expires_in || 3600) * 1000, refresh: tok.refresh_token || null, email });
      wartend = null;
      const Browser = plugin('Browser'); if (Browser && Browser.close) { try { await Browser.close(); } catch (_) { /* egal */ } }
      meldeAenderung();
      w.resolve({ email });
    } catch (e) { wartend = null; w.reject(e); }
  }

  async function tokenAnfrage(params) {
    const r = await fetch(TOKEN_URL, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(params) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error_description || j.error || `Token-Anfrage fehlgeschlagen (${r.status})`);
    return j;
  }

  async function accessToken() {
    const t = lies(KEY);
    if (!t) throw new Error('Nicht bei Google angemeldet (Einstellungen → Google).');
    if (t.exp > Date.now() + 60000) return t.access;
    if (!t.refresh) { schreibe(KEY, null); meldeAenderung(); throw new Error('Google-Anmeldung abgelaufen – bitte erneut anmelden.'); }
    const c = await config();
    try {
      const j = await tokenAnfrage({ grant_type: 'refresh_token', refresh_token: t.refresh, client_id: c.clientId });
      const neu = { ...t, access: j.access_token, exp: Date.now() + (j.expires_in || 3600) * 1000 };
      schreibe(KEY, neu);
      return neu.access;
    } catch (e) { schreibe(KEY, null); meldeAenderung(); throw new Error('Google-Anmeldung abgelaufen – bitte erneut anmelden.'); }
  }

  function abmelden() {
    const t = lies(KEY);
    schreibe(KEY, null); schreibe(`${KEY}.cal`, null);
    if (t && t.access) fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(t.refresh || t.access)}`, { method: 'POST' }).catch(() => {});
    meldeAenderung();
  }
  const status = () => { const t = lies(KEY); return { angemeldet: Boolean(t), email: t ? t.email : '' }; };
  const optionen = () => Object.assign({ autoMail: false }, lies(OPT_KEY) || {});
  const setzeOptionen = (o) => { schreibe(OPT_KEY, Object.assign(optionen(), o)); meldeAenderung(); };

  async function api(url, opts) {
    const r = await fetch(url, Object.assign({}, opts, { headers: Object.assign({ Authorization: `Bearer ${await accessToken()}`, 'Content-Type': 'application/json' }, (opts || {}).headers) }));
    if (r.status === 204) return {};
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { const e = new Error((j.error && (j.error.message || j.error)) || `Google-Fehler ${r.status}`); e.status = r.status; throw e; }
    return j;
  }

  /* ---------------------------- Gmail ---------------------------- */
  const utf8b64 = (s) => { const b = new TextEncoder().encode(s); let bin = ''; for (let i = 0; i < b.length; i += 0x8000) bin += String.fromCharCode(...b.subarray(i, i + 0x8000)); return btoa(bin); };
  const umbruch = (b64) => b64.replace(/(.{76})/g, '$1\r\n');
  const kopfText = (s) => (/^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${utf8b64(s)}?=`);

  /** Baut eine RFC-822-Nachricht (text + optional html + Anhänge als {name,mime,base64}). */
  function mimeBauen({ an, betreff, text, html, anhaenge }) {
    const gr = `rs_${Math.random().toString(36).slice(2)}`, gr2 = `alt_${Math.random().toString(36).slice(2)}`;
    const teile = (txt, ht) => ht
      ? `Content-Type: multipart/alternative; boundary="${gr2}"\r\n\r\n--${gr2}\r\nContent-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n${umbruch(utf8b64(txt || ''))}\r\n--${gr2}\r\nContent-Type: text/html; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n${umbruch(utf8b64(ht))}\r\n--${gr2}--`
      : `Content-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n${umbruch(utf8b64(txt || ''))}`;
    let kopf = `To: ${[].concat(an).join(', ')}\r\nSubject: ${kopfText(betreff || '')}\r\nMIME-Version: 1.0\r\n`;
    if (!anhaenge || !anhaenge.length) return `${kopf}${teile(text, html)}`;
    let m = `${kopf}Content-Type: multipart/mixed; boundary="${gr}"\r\n\r\n--${gr}\r\n${teile(text, html)}\r\n`;
    for (const a of anhaenge) {
      m += `--${gr}\r\nContent-Type: ${a.mime || 'application/octet-stream'}; name="${kopfText(a.name)}"\r\nContent-Disposition: attachment; filename="${kopfText(a.name)}"\r\nContent-Transfer-Encoding: base64\r\n\r\n${umbruch(a.base64)}\r\n`;
    }
    return `${m}--${gr}--`;
  }
  async function gmailSenden(msg) {
    const roh = b64url(new TextEncoder().encode(mimeBauen(msg)));
    return api('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', { method: 'POST', body: JSON.stringify({ raw: roh }) });
  }

  /* ---------------------------- Kalender ---------------------------- */
  // deterministische, für Google gültige Ereignis-ID (Zeichen 0-9 a-f) aus der Termin-ID
  function eventId(tid) {
    let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
    for (let i = 0; i < tid.length; i++) { const c = tid.charCodeAt(i); h1 = Math.imul(h1 ^ c, 2654435761); h2 = Math.imul(h2 ^ c, 1597334677); }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return `rs${(h2 >>> 0).toString(16).padStart(8, '0')}${(h1 >>> 0).toString(16).padStart(8, '0')}`;
  }
  const pad2 = (n) => String(n).padStart(2, '0');
  function terminEvent(t, kurs, trainer, tz) {
    const [h, m] = String(t.beginn || '00:00').split(':').map(Number);
    const ende = new Date(2000, 0, 1, h, m + (t.dauerMin || (kurs && kurs.dauerMin) || 45));
    const endeStr = `${pad2(ende.getHours())}:${pad2(ende.getMinutes())}`;
    return {
      id: eventId(t.id),
      summary: kurs ? kurs.titel : 'Kurs',
      location: (kurs && kurs.ort) || '',
      description: `Übungsleitung: ${trainer ? `${trainer.vorname} ${trainer.nachname}` : '–'}\n(automatisch aus RheaSport – keine Patientendaten)`,
      start: { dateTime: `${t.datum}T${t.beginn}:00`, timeZone: tz },
      end: { dateTime: `${t.datum}T${endeStr}:00`, timeZone: tz },
      extendedProperties: { private: { rheaTerminId: t.id } },
    };
  }
  /** Gleicht kommende Termine (60 Tage) mit einem eigenen Google-Kalender ab und gibt ihn für die Trainer frei. */
  async function kalenderAbgleichen({ termine, kurse, trainer, titel, heute, tage }) {
    const tz = 'Europe/Berlin';
    let calId = (lies(`${KEY}.cal`) || {}).id;
    if (calId) { try { await api(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calId)}`); } catch (e) { if (e.status === 404 || e.status === 410) calId = null; else throw e; } }
    if (!calId) { calId = (await api('https://www.googleapis.com/calendar/v3/calendars', { method: 'POST', body: JSON.stringify({ summary: titel || 'RheaSport Kurse', timeZone: tz }) })).id; schreibe(`${KEY}.cal`, { id: calId }); }
    const base = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calId)}`;
    const bis = new Date(new Date(`${heute}T00:00:00`).getTime() + (tage || 60) * 86400000).toISOString().slice(0, 10);
    let neu = 0, aktualisiert = 0, entfernt = 0;
    for (const t of termine.filter((x) => x.datum >= heute && x.datum <= bis)) {
      const kurs = kurse.find((k) => k.id === t.kursId);
      const ev = terminEvent(t, kurs, kurs && trainer.find((x) => x.id === kurs.trainerId), tz);
      if (t.status === 'ausgefallen' || t.status === 'verschoben') {
        try { await api(`${base}/events/${ev.id}`, { method: 'DELETE' }); entfernt++; } catch (e) { if (e.status !== 404 && e.status !== 410) throw e; }
        continue;
      }
      try { await api(`${base}/events/${ev.id}`, { method: 'PUT', body: JSON.stringify(ev) }); aktualisiert++; }
      catch (e) { if (e.status !== 404) throw e; await api(`${base}/events`, { method: 'POST', body: JSON.stringify(ev) }); neu++; }
    }
    // Freigabe für Trainer mit E-Mail (nur Lesezugriff)
    let geteilt = 0;
    const acl = await api(`${base}/acl`);
    const vorhanden = new Set((acl.items || []).map((a) => (a.scope && a.scope.value || '').toLowerCase()));
    for (const tr of trainer.filter((x) => x.email && !vorhanden.has(x.email.toLowerCase()))) {
      try { await api(`${base}/acl?sendNotifications=true`, { method: 'POST', body: JSON.stringify({ role: 'reader', scope: { type: 'user', value: tr.email } }) }); geteilt++; } catch (_) { /* ungültige Adresse o. ä. */ }
    }
    return { kalenderId: calId, neu, aktualisiert, entfernt, geteilt };
  }

  starteListener();
  window.RheaGoogle = { config, anmelden, abmelden, status, optionen, setzeOptionen, gmailSenden, kalenderAbgleichen, mimeBauen, eventId, _behandle: behandleRueckleitung };
})();
