# Patienten-app
## Nutzung ohne APK (HTML/Web)
- **Direkt ohne Server:** Ordner `public/` öffnen und `index.html` doppelklicken – die App läuft vollständig im Browser (Lokalmodus, Daten bleiben im Browser-Gerätespeicher).
- **Statisches Hosting** (beliebiger Webserver, GitHub Pages, Netzlaufwerk/USB-Stick): Inhalt von `public/` hochladen/kopieren. Fehlt die Server-API, schaltet die App automatisch in den Lokalmodus um.
- **Lokaler Node-Server:** `npm start` → http://localhost:3000 (wechselt automatisch zu `?local=1`).
- **Als Web-App installieren (PWA):** Seite über https oder localhost öffnen und im Browser-Menü „App installieren“ / „Zum Startbildschirm hinzufügen“ wählen (Manifest + Offline-Service-Worker liegen bei). Danach Icon wie eine native App, ohne APK.
- Alle Daten liegen lokal im Browser/Gerät (localStorage/IndexedDB); Sicherung über Einstellungen → Backup exportieren.
