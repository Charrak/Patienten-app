# mimic – Installation & Nutzung

[mimic](https://github.com/littledivy/mimic) zeichnet den Netzwerkverkehr einer App auf
(über deine eigene Sitzung) und erzeugt daraus einen Python-Client, mit dem du die
API der App wie eine Bibliothek aufrufen kannst:

```python
from patienten_client import PatientenApp

app = PatientenApp()          # nutzt die aufgezeichnete Sitzung
app.get_patienten()
```

## Was hier installiert wurde

| Pfad | Inhalt |
| --- | --- |
| `.mimic-venv/` | isolierte Python-venv mit `mimic-client` 0.1.0 (aus dem Git-Repo, nicht aus PyPI – dort ist das Paket nicht veröffentlicht) |
| `bin/mimic` | Startskript, das die venv benutzt (setzt auch `mitmweb` in den `PATH`, falls installiert) |
| `scripts/install-mimic.sh` | reproduzierbare Neuinstallation (`--capture` = mitmproxy dazu) |
| `scripts/mimic-android.sh` | Android-Capture: Proxy, adb-Verbindung, Zertifikat, NSC |
| `.mimic-state/` | PID/Log des Proxys (gitignored) |

`.mimic-venv/` ist in `.gitignore` eingetragen und gehört nicht ins Repository.

## Befehle

```bash
./bin/mimic doctor                     # Setup-Check
./bin/mimic hosts                      # aufgezeichnete Hosts (aus laufendem mitmweb)
./bin/mimic learn  <host>              # erkannte Endpunkte anzeigen
./bin/mimic gen    <host>              # Python-Client generieren (braucht claude/opencode)
./bin/mimic gen    <host> --prompt-only  # nur den Prompt ausgeben (ohne KI-CLI)
./bin/mimic record                     # Proxy starten + iPhone-Anleitung
```

Ohne live-Proxy geht es auch mit einer **HAR-Datei** (Chrome/Firefox: Netzwerk-Tab →
Rechtsklick → „Alle als HAR speichern…“):

```bash
./bin/mimic hosts api.example.com --har traffic.har
./bin/mimic learn api.example.com --har traffic.har
./bin/mimic gen   api.example.com --har traffic.har -o mein_client.py
```

Oder direkt in Python (mit der venv):

```bash
.mimic-venv/bin/python - <<'PY'
from mimic import Session
s = Session.from_har("traffic.har", "api.example.com")
print(s.get("/v1/patients"))
PY
```

## Android

`mimic record` ist auf iPhone zugeschnitten (gedruckte iOS-Anleitung, Apple-Profil).
Für Android macht `scripts/mimic-android.sh` denselben Ablauf über `adb` – der
mitmweb-Proxy im Hintergrund ist derselbe, `mimic hosts/learn/gen` funktionieren
unverändert.

### Voraussetzungen

- **Android Platform-Tools** (`adb`) im `PATH` – Debian/Ubuntu: `sudo apt install android-tools-adb`,
  sonst <https://developer.android.com/tools/releases/platform-tools>
- **USB-Debugging** am Telefon: Einstellungen → Über das Telefon → 7× „Build-Nummer“ →
  Entwickleroptionen → USB-Debugging. Kabel anstecken, Dialog am Telefon bestätigen.
- Einmalig: `sh scripts/install-mimic.sh --capture` (holt mitmproxy in die venv)

### Schnellstart (USB, ohne WLAN)

```bash
./scripts/mimic-android.sh check          # adb, Gerät, API-Level, Proxy-Status
./scripts/mimic-android.sh proxy start    # mitmweb auf 0.0.0.0:8080, Web-UI 127.0.0.1:8081
./scripts/mimic-android.sh ca push        # CA nach /sdcard/Download + Anleitung am Gerät
./scripts/mimic-android.sh connect --usb  # adb reverse + http_proxy 127.0.0.1:8080
# App am Telefon normal benutzen …
./scripts/mimic-android.sh hosts          # aufgezeichnete Hosts
./scripts/mimic-android.sh learn  api.example.com
./scripts/mimic-android.sh gen    api.example.com -o client.py
./scripts/mimic-android.sh disconnect     # http_proxy zurücksetzen, adb reverse lösen
./scripts/mimic-android.sh proxy stop
```

`connect` gibt es in drei Varianten:

| Variante | Wie | Wann |
| --- | --- | --- |
| `--usb` (Standard) | `adb reverse tcp:8080 tcp:8080`, Proxy `127.0.0.1:8080` | Kabel, kein WLAN nötig |
| `--wlan` | Proxy `<host-ip>:8080` | Telefon im selben WLAN, kein Kabel |
| `--emulator` | Proxy `10.0.2.2:8080` | Android-Emulator (AVD) |

Alles auf einmal: `./scripts/mimic-android.sh capture` (= Proxy starten + verbinden + CA pushen).

### Zertifikat: der entscheidende Unterschied zu iOS

Das mitmproxy-CA liegt unter `~/.mitmproxy/mitmproxy-ca-cert.cer` und wird per
`ca push` nach `/sdcard/Download` kopiert. Am Telefon installieren:
Einstellungen → Sicherheit → Verschlüsselung & Anmeldedaten → Zertifikat
installieren → **CA-Zertifikat**.

Ab **Android 7 (API 24)** gilt: Nutzer-Zertifikate werden von Apps nur akzeptiert,
wenn die App es ausdrücklich erlaubt (`network_security_config`). Drei Wege:

1. **Eigene App (hier: RheaSport)** – Debug-Konfiguration injizieren:
   ```bash
   npx cap add android                 # falls android/ noch nicht existiert
   ./scripts/mimic-android.sh nsc apply android
   cd android && ./gradlew installDebug
   ```
   Das schreibt `app/src/main/res/xml/network_security_config.xml` und setzt
   `android:networkSecurityConfig` im Manifest. **Nur für Debug-Builds** gedacht –
   nicht in Release ausliefern. `nsc print` zeigt die XML auch ohne Projekt.
2. **Gerootetes Gerät / Emulator mit Root** – CA als System-Zertifikat:
   `./scripts/mimic-android.sh ca install` (setzt `adb root` + Remount voraus,
   Reboot danach). Danach vertrauen alle Apps, ohne NSC.
3. **Fremde App ohne Root** – APK mit `apktool` zerlegen, NSC + Manifest-Attribut
   einfügen, neu bauen/signieren (`apksigner`), installieren. Oder das Pinning
   direkt aushebeln.

**Certificate Pinning** (Banken, Instagram, viele Große): der Proxy sieht dann gar
nichts. Lösung ist Frida-basiertes Unpinning – mimic bringt das nur für iOS mit
(`mimic unpin`), für Android nimmt man die Android-Skripte aus
[httptoolkit/frida-interception-and-unpinning](https://github.com/httptoolkit/frida-interception-and-unpinning)
(gleiches Repo, das `mimic unpin` für iOS nutzt) oder `objection patchapk`.
Auf einem gerooteten Gerät/Emulator ist das der zuverlässigste Weg.

### Client generieren

`gen` braucht `claude` oder `opencode` im `PATH`. Ohne KI-CLI:

```bash
./scripts/mimic-android.sh gen api.example.com --prompt-only > prompt.txt
```

… und den Prompt anderweitig verfüttern. Mit HAR/`--har` geht alles auch ohne Gerät.

### Typische Stolpersteine

| Symptom | Ursache / Lösung |
| --- | --- |
| `hosts`: „no traffic captured yet“ | Proxy-Zeile am Gerät prüfen: `adb shell settings get global http_proxy`; App neu starten |
| App meldet Netzwerkfehler | Zertifikat nicht (voll) installiert → `ca push` erneut, bzw. NSC nötig |
| `check` zeigt Gerät als `unauthorized` | Dialog „USB-Debugging zulassen“ am Telefon bestätigen |
| Nur `googleapis.com`, aber keine App-API | Pinning oder App nutzt eigene Socket-/gRPC-Verbindung |
| Proxy weg nach Reboot | `proxy start` + `connect` erneut; `http_proxy` ist global gesetzt |
| Emulator sieht nichts | `connect --emulator` nutzen (10.0.2.2), nicht 127.0.0.1 |

## Capture-Backend (mitmproxy) nachinstallieren

Für `mimic record`/`from_mitm` wird `mitmweb` gebraucht. Das Paket ist absichtlich
**nicht** dauerhaft installiert (mitmproxy + Abhängigkeiten ≈ 120 MB), sondern wird
bei Bedarf in dieselbe venv gelegt:

```bash
.mimic-venv/bin/pip install "mitmproxy>=10"
./bin/mimic doctor
```

`scripts/install-mimic.sh --capture` macht das direkt bei der Installation mit.

## Wichtige Hinweise

- **Kein PyPI-Release:** `pip install mimic-client` schlägt fehl (404). Immer aus dem
  Git-Repo installieren, so wie es `scripts/install-mimic.sh` tut.
- **iPhone-Aufzeichnung** funktioniert nur auf einem Rechner im selben WLAN wie das
  Telefon (Proxy `IP:8080` + mitmproxy-Zertifikat installieren und „vollständiges
  Vertrauen“ aktivieren). **Android** läuft auch über USB (`adb reverse`), siehe
  Abschnitt „Android“. In dieser Sandbox ist beides nicht möglich – hier sind
  HAR-Import, `Session.from_curl(...)` und die Client-Generierung der sinnvolle Weg.
- **Codegen** braucht eine KI-CLI (`claude` oder `opencode`). Fehlt sie, den Prompt mit
  `--prompt-only` ausgeben und anderswo verwenden.
- **Nur eigene Accounts/Daten** aufzeichnen und die Nutzungsbedingungen der jeweiligen
  App beachten. Zertifikat-Pinning (Banken, Instagram) und DPoP-Token verhindern
  Aufzeichnung bzw. Replay.
