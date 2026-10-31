#!/usr/bin/env node
'use strict';
/* Android-Assets injizieren (läuft lokal ODER in GitHub Actions, nach `npx cap add android`):
   1. App-Icons aus assets/res/ in das Capacitor-Android-Projekt kopieren
   2. CAMERA-Berechtigung für den QR-Scanner in den AndroidManifest eintragen */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const resSrc = path.join(root, 'assets', 'res');
const resDst = path.join(root, 'android', 'app', 'src', 'main', 'res');
const manifestPath = path.join(root, 'android', 'app', 'src', 'main', 'AndroidManifest.xml');

if (!fs.existsSync(resDst)) {
  console.error('FEHLER: android/ nicht vorhanden – zuerst `npx cap add android` ausführen.');
  process.exit(1);
}

/* --- 1) Icons kopieren --- */
let copied = 0;
for (const dir of fs.readdirSync(resSrc)) {
  const s = path.join(resSrc, dir);
  const d = path.join(resDst, dir);
  if (!fs.statSync(s).isDirectory()) continue;
  fs.mkdirSync(d, { recursive: true });
  for (const f of fs.readdirSync(s)) {
    fs.copyFileSync(path.join(s, f), path.join(d, f));
    copied++;
  }
}
console.log(`Icons kopiert: ${copied} Dateien (assets/res -> android res).`);

/* --- 2) CAMERA-Permission (QR-Scanner) eintragen --- */
let manifest = fs.readFileSync(manifestPath, 'utf8');
if (manifest.includes('android.permission.CAMERA')) {
  console.log('CAMERA-Permission bereits vorhanden.');
} else {
  const netz = '<uses-permission android:name="android.permission.INTERNET" />';
  if (!manifest.includes(netz)) {
    console.error('FEHLER: INTERNET-Permission nicht im Manifest gefunden – Template unerwartet.');
    process.exit(1);
  }
  manifest = manifest.replace(
    netz,
    netz +
      '\n    <uses-permission android:name="android.permission.CAMERA" />' +
      '\n\n    <uses-feature android:name="android.hardware.camera" android:required="false" />'
  );
  fs.writeFileSync(manifestPath, manifest);
  console.log('CAMERA-Permission eingetragen (Kamera optional, QR-Scanner nutzt sie).');
}

/* --- 3) Google-Rücksprung (OAuth): benutzerdefiniertes URL-Schema = umgekehrte Client-ID --- */
try {
  const gc = JSON.parse(fs.readFileSync(path.join(root, 'public', 'google-config.json'), 'utf8'));
  const cid = String(gc.clientId || '').replace(/\.apps\.googleusercontent\.com$/, '');
  manifest = fs.readFileSync(manifestPath, 'utf8');
  if (!cid) {
    console.log('Google: keine Client-ID in public/google-config.json – Rücksprung-Filter übersprungen.');
  } else if (manifest.includes(`com.googleusercontent.apps.${cid}`)) {
    console.log('Google-Rücksprung-Filter bereits vorhanden.');
  } else {
    const filter = '\n            <intent-filter>' +
      '\n                <action android:name="android.intent.action.VIEW" />' +
      '\n                <category android:name="android.intent.category.DEFAULT" />' +
      '\n                <category android:name="android.intent.category.BROWSABLE" />' +
      `\n                <data android:scheme="com.googleusercontent.apps.${cid}" />` +
      '\n            </intent-filter>\n        ';
    const ende = manifest.indexOf('</activity>');
    if (ende < 0) { console.error('FEHLER: <activity> nicht im Manifest gefunden.'); process.exit(1); }
    manifest = manifest.slice(0, ende).replace(/\s*$/, '') + filter + manifest.slice(ende);
    fs.writeFileSync(manifestPath, manifest);
    console.log('Google-Rücksprung-Filter eingetragen.');
  }
} catch (e) { console.warn('Google-Konfiguration nicht lesbar:', e.message); }

console.log('inject-android-assets: OK');
