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
| `scripts/install-mimic.sh` | reproduzierbare Neuinstallation |

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
  Vertrauen“ aktivieren). In dieser Sandbox ist das nicht möglich – hier sind
  HAR-Import, `Session.from_curl(...)` und die Client-Generierung der sinnvolle Weg.
- **Codegen** braucht eine KI-CLI (`claude` oder `opencode`). Fehlt sie, den Prompt mit
  `--prompt-only` ausgeben und anderswo verwenden.
- **Nur eigene Accounts/Daten** aufzeichnen und die Nutzungsbedingungen der jeweiligen
  App beachten. Zertifikat-Pinning (Banken, Instagram) und DPoP-Token verhindern
  Aufzeichnung bzw. Replay.
