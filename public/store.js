/* RheaStore – lokale Dateiablage (IndexedDB) für Dokumenten-Scans und Backups.
 * Optional: Spiegelung in einen vom Nutzer gewählten Ordner (File System Access API,
 * nur wo der Browser/WebView sie bietet – auf Android-WebView meist nicht; dort „Teilen“ nutzen). */
(function () {
  const DB_NAME = 'rheasport-files';
  let dbp = null;

  function open() {
    if (dbp) return dbp;
    dbp = new Promise((resolve, reject) => {
      if (!window.indexedDB) { reject(new Error('IndexedDB nicht verfügbar')); return; }
      const rq = indexedDB.open(DB_NAME, 1);
      rq.onupgradeneeded = () => {
        const d = rq.result;
        d.createObjectStore('docs', { keyPath: 'id' }).createIndex('patientId', 'patientId');
        d.createObjectStore('blobs');
        d.createObjectStore('backups', { keyPath: 'id' });
        d.createObjectStore('kv');
      };
      rq.onsuccess = () => resolve(rq.result);
      rq.onerror = () => reject(rq.error);
    });
    return dbp;
  }
  async function tx(stores, mode, fn) {
    const d = await open();
    return new Promise((resolve, reject) => {
      const t = d.transaction(stores, mode);
      let out;
      Promise.resolve(fn(t)).then((r) => { out = r; }, reject);
      t.oncomplete = () => resolve(out);
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error);
    });
  }
  const req = (r) => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });

  const sanit = (s) => String(s || '').normalize('NFKD').replace(/[^\w\- äöüÄÖÜß.]/g, '').trim().replace(/\s+/g, '_').slice(0, 60) || 'unbenannt';
  const pad = (n) => String(n).padStart(2, '0');
  const stamp = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`;
  const hash = (str) => { let h = 5381; for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) | 0; return `${str.length}:${h}`; };

  /* ---------------------------- Ordner-Ziel (optional) ---------------------------- */
  let dirHandle = null;
  const ordnerMoeglich = () => typeof window.showDirectoryPicker === 'function';
  async function ladeHandle() {
    if (dirHandle) return dirHandle;
    try { dirHandle = await tx(['kv'], 'readonly', (t) => req(t.objectStore('kv').get('dirHandle'))) || null; } catch (_) { dirHandle = null; }
    return dirHandle;
  }
  async function waehleOrdner() {
    if (!ordnerMoeglich()) throw new Error('Die Ordnerauswahl wird auf diesem Gerät/in dieser App nicht unterstützt. Bitte „Teilen/Speichern“ nutzen.');
    const h = await window.showDirectoryPicker({ mode: 'readwrite' });
    dirHandle = h;
    await tx(['kv'], 'readwrite', (t) => { t.objectStore('kv').put(h, 'dirHandle'); });
    return h.name;
  }
  async function ordnerVergessen() { dirHandle = null; await tx(['kv'], 'readwrite', (t) => { t.objectStore('kv').delete('dirHandle'); }); }
  async function ordnerStatus() {
    const h = await ladeHandle();
    if (!h) return { moeglich: ordnerMoeglich(), name: null, zugriff: false };
    let zugriff = false;
    try { zugriff = (await h.queryPermission({ mode: 'readwrite' })) === 'granted'; } catch (_) { /* egal */ }
    return { moeglich: true, name: h.name, zugriff };
  }
  async function zugriffErneuern() {
    const h = await ladeHandle();
    if (!h) return false;
    return (await h.requestPermission({ mode: 'readwrite' })) === 'granted';
  }
  async function schreibeInOrdner(segmente, dateiname, inhalt) {
    const h = await ladeHandle();
    if (!h) return false;
    try {
      if ((await h.queryPermission({ mode: 'readwrite' })) !== 'granted') return false;
      let dir = h;
      for (const seg of segmente) dir = await dir.getDirectoryHandle(sanit(seg), { create: true });
      const fh = await dir.getFileHandle(dateiname, { create: true });
      const w = await fh.createWritable();
      await w.write(inhalt);
      await w.close();
      return true;
    } catch (e) { console.warn('Ordner-Schreiben fehlgeschlagen', e); return false; }
  }

  /* ---------------------------- Dokumente ---------------------------- */
  /** Speichert ein Dokument im Patientenordner. meta: {patientId, patientName, titel, kategorie} */
  async function addDoc(meta, blob) {
    const id = `doc_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    const ordner = sanit(meta.patientName);
    const ext = blob.type === 'application/pdf' ? 'pdf' : 'jpg';
    const datei = `${new Date().toISOString().slice(0, 10)}_${sanit(meta.kategorie || 'Dokument')}_${id.slice(-4)}.${ext}`;
    const rec = { id, patientId: meta.patientId, ordner, titel: meta.titel || meta.kategorie || 'Dokument', kategorie: meta.kategorie || 'Sonstiges', datei, mime: blob.type, size: blob.size, ts: new Date().toISOString() };
    await tx(['docs', 'blobs'], 'readwrite', (t) => { t.objectStore('docs').put(rec); t.objectStore('blobs').put(blob, id); });
    rec.imOrdner = await schreibeInOrdner(['Patienten', ordner], datei, blob);
    return rec;
  }
  const listDocs = (patientId) => tx(['docs'], 'readonly', async (t) => {
    const st = t.objectStore('docs');
    const all = patientId ? await req(st.index('patientId').getAll(patientId)) : await req(st.getAll());
    return all.sort((a, b) => b.ts.localeCompare(a.ts));
  });
  const getBlob = (id) => tx(['blobs'], 'readonly', (t) => req(t.objectStore('blobs').get(id)));
  const delDoc = (id) => tx(['docs', 'blobs'], 'readwrite', (t) => { t.objectStore('docs').delete(id); t.objectStore('blobs').delete(id); });
  async function alleDokumenteInOrdner() {
    let n = 0;
    for (const r of await listDocs()) {
      const b = await getBlob(r.id);
      if (b && await schreibeInOrdner(['Patienten', r.ordner], r.datei, b)) n++;
    }
    return n;
  }

  /* ---------------------------- Backups ---------------------------- */
  async function pruneBackups() {
    const all = await tx(['backups'], 'readonly', (t) => req(t.objectStore('backups').getAll()));
    all.sort((a, b) => b.id - a.id);
    const behalten = new Set(all.slice(0, 40).map((b) => b.id));
    const tage = new Set();
    const grenze = Date.now() - 60 * 86400000;
    for (const b of all) {
      const tag = b.ts.slice(0, 10);
      if (!tage.has(tag) && b.id > grenze) { tage.add(tag); behalten.add(b.id); }
      if (b.grund !== 'automatisch' && behalten.size < 80) behalten.add(b.id); // manuelle/Vorher-Backups länger halten
    }
    const weg = all.filter((b) => !behalten.has(b.id));
    if (weg.length) await tx(['backups'], 'readwrite', (t) => { for (const b of weg) t.objectStore('backups').delete(b.id); });
  }
  /** Legt einen Snapshot an. force = auch bei unverändertem Inhalt (z. B. vor Wiederherstellung). */
  async function snapshot(json, grund, force) {
    const h = hash(json);
    const letzte = await tx(['backups'], 'readonly', (t) => req(t.objectStore('backups').getAll()));
    letzte.sort((a, b) => b.id - a.id);
    if (!force && letzte[0] && letzte[0].hash === h) return null;
    const jetzt = new Date();
    const rec = { id: Date.now(), ts: jetzt.toISOString(), grund: grund || 'automatisch', json, hash: h, size: json.length };
    await tx(['backups'], 'readwrite', (t) => { t.objectStore('backups').put(rec); });
    await pruneBackups();
    // Ordner: immer „aktuell“, einmal je Tag (und bei manuell/Vorher) eine datierte Datei
    const dateiname = grund && grund !== 'automatisch' ? `Backup_${stamp(jetzt)}.json` : `Backup_${jetzt.toISOString().slice(0, 10)}.json`;
    schreibeInOrdner(['Backups'], 'rheasport-aktuell.json', json);
    schreibeInOrdner(['Backups'], dateiname, json);
    return { id: rec.id, ts: rec.ts };
  }
  const listBackups = () => tx(['backups'], 'readonly', async (t) => {
    const all = await req(t.objectStore('backups').getAll());
    return all.sort((a, b) => b.id - a.id).map(({ id, ts, grund, size }) => ({ id, ts, grund, size }));
  });
  const getBackup = (id) => tx(['backups'], 'readonly', (t) => req(t.objectStore('backups').get(id)));

  /* Automatik: nach jeder Änderung (entprellt) */
  let timer = null;
  window.rheaOnSave = function (json) {
    clearTimeout(timer);
    timer = setTimeout(() => { snapshot(json, 'automatisch').catch((e) => console.warn('Auto-Backup fehlgeschlagen', e)); }, 1500);
  };

  window.RheaStore = {
    sanit, ordnerMoeglich, waehleOrdner, ordnerVergessen, ordnerStatus, zugriffErneuern, alleDokumenteInOrdner,
    addDoc, listDocs, getBlob, delDoc, snapshot, listBackups, getBackup,
  };
})();
