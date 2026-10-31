#!/usr/bin/env bash
# Android-Capture für mimic (https://github.com/littledivy/mimic)
#
# Startet den mitmweb-Proxy, verbindet ein Android-Gerät damit, verteilt das
# Proxy-Zertifikat und reicht `mimic hosts|learn|gen` durch.
#
#   ./scripts/mimic-android.sh check            Setup prüfen (adb, Proxy, Gerät)
#   ./scripts/mimic-android.sh capture          Proxy starten + Gerät verbinden (USB)
#   ./scripts/mimic-android.sh proxy start|stop|status
#   ./scripts/mimic-android.sh connect [--usb|--wlan|--emulator]   Geräte-Proxy setzen
#   ./scripts/mimic-android.sh disconnect       Geräte-Proxy wieder entfernen
#   ./scripts/mimic-android.sh ca [push|install]       Zertifikat aufs Gerät
#   ./scripts/mimic-android.sh nsc print|apply DIR     Network-Security-Config
#   ./scripts/mimic-android.sh hosts|learn|gen ...     an mimic weiterreichen
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
STATE="$ROOT/.mimic-state"
VENV="$ROOT/.mimic-venv"
MIMIC="$ROOT/bin/mimic"

PROXY_PORT="${MIMIC_PROXY_PORT:-8080}"
WEB_PORT="${MIMIC_WEB_PORT:-8081}"
WEB_HOST="127.0.0.1"

PROXY_LOG="$STATE/proxy.log"
PROXY_PID="$STATE/proxy.pid"

bold() { printf '\033[1m%s\033[0m\n' "$*"; }
ok()   { printf '  [\033[32mok \033[0m] %s\n' "$*"; }
bad()  { printf '  [\033[31m-- \033[0m] %s\n' "$*"; }
warn() { printf '  [\033[33m!!\033[0m] %s\n' "$*"; }
die()  { printf 'Fehler: %s\n' "$*" >&2; exit 1; }

# ---------------------------------------------------------------- Hilfsfunktionen

adb_cmd() { # adb mit optionalem -s <serial>
  if [ -n "${ADB_SERIAL:-}" ]; then adb -s "$ADB_SERIAL" "$@"; else adb "$@"; fi
}

have_device() {
  command -v adb >/dev/null 2>&1 || return 1
  local n
  n="$(adb devices | awk 'NR>1 && $2=="device"' | wc -l | tr -d ' ')"
  [ "$n" -ge 1 ]
}

device_prop() { adb_cmd shell getprop "$1" 2>/dev/null | tr -d '\r'; }

lan_ip() {
  local ip
  ip="$(ip route get 1.1.1.1 2>/dev/null | awk '{for(i=1;i<=NF;i++) if($i=="src"){print $(i+1); exit}}')" || true
  [ -n "${ip:-}" ] && { echo "$ip"; return; }
  ip="$(hostname -I 2>/dev/null | awk '{print $1}')" || true
  [ -n "${ip:-}" ] && { echo "$ip"; return; }
  echo "127.0.0.1"
}

proxy_pid() { [ -f "$PROXY_PID" ] && cat "$PROXY_PID" 2>/dev/null || true; }

proxy_alive() {
  local pid; pid="$(proxy_pid)"
  [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null
}

web_reachable() {
  curl -fs -o /dev/null --max-time 2 "http://$WEB_HOST:$WEB_PORT/flows?token=test" 2>/dev/null
}

require_adb() {
  command -v adb >/dev/null 2>&1 || die "adb nicht gefunden. Installiere die Android Platform-Tools:
  https://developer.android.com/tools/releases/platform-tools
  (Debian/Ubuntu: sudo apt install android-tools-adb)"
  have_device || die "Kein Android-Gerät verbunden. USB-Kabel anstecken und USB-Debugging aktivieren
  (Einstellungen → Über das Telefon → 7× Build-Nummer → Entwickleroptionen → USB-Debugging)."
}

# ---------------------------------------------------------------- check

cmd_check() {
  bold "mimic + Android – Setup-Check"; echo
  if [ -x "$VENV/bin/mimic" ]; then ok "mimic-client $("$VENV/bin/pip" show mimic-client 2>/dev/null | awk '/^Version:/{print $2}')"; else bad "mimic nicht installiert → sh scripts/install-mimic.sh --capture"; fi
  if [ -x "$VENV/bin/mitmweb" ]; then ok "mitmproxy ($("$VENV/bin/mitmweb" --version 2>/dev/null | head -1))"; else bad "mitmproxy fehlt → sh scripts/install-mimic.sh --capture"; fi
  if command -v adb >/dev/null 2>&1; then ok "adb ($(command -v adb))"; else bad "adb fehlt (Android Platform-Tools)"; fi
  if command -v openssl >/dev/null 2>&1; then ok "openssl"; else warn "openssl fehlt (nur für System-Zertifikatsinstallation nötig)"; fi
  if command -v claude >/dev/null 2>&1 || command -v opencode >/dev/null 2>&1; then ok "AI-Generator (claude/opencode)"; else warn "kein claude/opencode → 'mimic gen --prompt-only' nutzen"; fi
  echo
  if proxy_alive; then ok "Proxy läuft (PID $(proxy_pid), Port $PROXY_PORT)"; elif web_reachable; then warn "Port $WEB_PORT antwortet, aber nicht von diesem Skript gestartet"; else bad "Proxy läuft nicht → ./scripts/mimic-android.sh proxy start"; fi
  echo
  bold "Geräte"; echo
  if command -v adb >/dev/null 2>&1 && have_device; then
    while read -r serial state; do
      [ "$state" = "device" ] || { bad "$serial ($state) – USB-Debugging bestätigen?"; continue; }
      local api model arch
      api="$(adb -s "$serial" shell getprop ro.build.version.sdk 2>/dev/null | tr -d '\r')"
      model="$(adb -s "$serial" shell getprop ro.product.model 2>/dev/null | tr -d '\r')"
      arch="$(adb -s "$serial" shell getprop ro.product.cpu.abi 2>/dev/null | tr -d '\r')"
      ok "$model – Android API $api, $arch ($serial)"
      if [ "${api:-0}" -ge 24 ] 2>/dev/null; then
        warn "  API ≥ 24: Nutzer-Zertifikate gelten nur für Apps, die es erlauben (NSC, siehe 'nsc apply')"
      fi
    done < <(adb devices | awk 'NR>1 && NF>=2 {print $1, $2}')
    echo
    echo "  Host-IP im WLAN: $(lan_ip):$PROXY_PORT   (USB-Modus braucht keine IP)"
  else
    bad "kein Gerät verbunden"
  fi
  echo
  bold "Nächste Schritte"; echo "  1) ./scripts/mimic-android.sh proxy start"
  echo "  2) ./scripts/mimic-android.sh ca push        # Zertifikat aufs Gerät"
  echo "  3) ./scripts/mimic-android.sh connect --usb  # Geräte-Proxy (USB-Kabel)"
  echo "     alternativ: connect --wlan (gleiches WLAN) oder connect --emulator (AVD)"
  echo "  4) App am Telefon benutzen, dann: ./scripts/mimic-android.sh hosts"
}

# ---------------------------------------------------------------- proxy

cmd_proxy() {
  local action="${1:-status}"
  case "$action" in
    start)
      [ -x "$VENV/bin/mitmweb" ] || die "mitmweb fehlt → sh scripts/install-mimic.sh --capture"
      if proxy_alive; then echo "Proxy läuft bereits (PID $(proxy_pid))."; return 0; fi
      if web_reachable; then die "Port $WEB_PORT ist schon belegt – läuft ein anderer Proxy?"; fi
      mkdir -p "$STATE"
      nohup "$VENV/bin/mitmweb" \
        --listen-host 0.0.0.0 --listen-port "$PROXY_PORT" \
        --web-host "$WEB_HOST" --web-port "$WEB_PORT" \
        --no-web-open-browser -q >"$PROXY_LOG" 2>&1 &
      echo $! >"$PROXY_PID"
      for _ in $(seq 1 40); do web_reachable && break; sleep 0.25; done
      web_reachable || { tail -20 "$PROXY_LOG" >&2 || true; die "Proxy startet nicht (Log: $PROXY_LOG)"; }
      ok "Proxy läuft auf 0.0.0.0:$PROXY_PORT (PID $(proxy_pid))"
      echo "     Web-UI: http://$WEB_HOST:$WEB_PORT   Log: $PROXY_LOG"
      echo "     Zertifikat: ${HOME}/.mitmproxy/mitmproxy-ca-cert.cer"
      ;;
    stop)
      if proxy_alive; then kill "$(proxy_pid)" 2>/dev/null || true; rm -f "$PROXY_PID"; ok "Proxy gestoppt"; else rm -f "$PROXY_PID"; echo "Proxy läuft nicht."; fi
      ;;
    status)
      if proxy_alive; then ok "Proxy läuft (PID $(proxy_pid), Port $PROXY_PORT)"; elif web_reachable; then warn "Port $WEB_PORT belegt (fremder Prozess)"; else echo "Proxy läuft nicht."; fi
      ;;
    *) die "proxy start|stop|status" ;;
  esac
}

# ---------------------------------------------------------------- Geräte-Proxy

cmd_connect() {
  require_adb
  local mode="usb"
  case "${1:-}" in
    --wlan|wlan) mode="wlan" ;;
    --emulator|emulator) mode="emulator" ;;
    --usb|usb|"") mode="usb" ;;
    *) die "connect [--usb|--wlan|--emulator]" ;;
  esac
  if ! proxy_alive && ! web_reachable; then die "Proxy läuft nicht → ./scripts/mimic-android.sh proxy start"; fi

  local target
  if [ "$mode" = "usb" ]; then
    adb_cmd reverse "tcp:$PROXY_PORT" "tcp:$PROXY_PORT" >/dev/null
    target="127.0.0.1:$PROXY_PORT"
    ok "adb reverse aktiv (USB): Gerät → $target"
  elif [ "$mode" = "emulator" ]; then
    # Im Emulator zeigt 10.0.2.2 auf den Host-Rechner.
    target="10.0.2.2:$PROXY_PORT"
    ok "Emulator-Proxy: $target (Host-Alias)"
  else
    target="$(lan_ip):$PROXY_PORT"
    ok "WLAN-Proxy: $target (Telefon muss im selben Netz sein)"
  fi
  adb_cmd shell settings put global http_proxy "$target" >/dev/null
  ok "Geräte-Proxy gesetzt: $target"
  echo
  echo "  Jetzt das Zertifikat installieren (einmalig):"
  echo "    ./scripts/mimic-android.sh ca push"
  echo "  Danach die App öffnen und benutzen. Aufzeichnung: ./scripts/mimic-android.sh hosts"
}

cmd_disconnect() {
  require_adb
  adb_cmd shell settings put global http_proxy ":0" >/dev/null || true
  adb_cmd reverse --remove "tcp:$PROXY_PORT" >/dev/null 2>&1 || true
  ok "Geräte-Proxy entfernt (http_proxy=:0) und adb reverse gelöst"
  echo "     Zum Prüfen: adb shell settings get global http_proxy"
}

# ---------------------------------------------------------------- Zertifikat

CA_PEM="$HOME/.mitmproxy/mitmproxy-ca-cert.pem"
CA_CER="$HOME/.mitmproxy/mitmproxy-ca-cert.cer"

ensure_ca() {
  [ -f "$CA_CER" ] && return 0
  [ -x "$VENV/bin/python" ] || die "mimic-venv fehlt → sh scripts/install-mimic.sh --capture"
  "$VENV/bin/python" - "$HOME/.mitmproxy" <<'PY'
import sys, pathlib
from mitmproxy import certs
p = pathlib.Path(sys.argv[1]); p.mkdir(parents=True, exist_ok=True)
certs.CertStore.from_store(str(p), "mitmproxy", key_size=2048)
print("CA erzeugt:", p / "mitmproxy-ca-cert.cer")
PY
}

cmd_ca() {
  local action="${1:-push}"
  ensure_ca
  case "$action" in
    push)
      require_adb
      adb_cmd push "$CA_CER" /sdcard/Download/mitmproxy-ca-cert.cer >/dev/null
      ok "Zertifikat auf das Gerät kopiert: /sdcard/Download/mitmproxy-ca-cert.cer"
      local api; api="$(device_prop ro.build.version.sdk)"
      echo
      bold "  Am Telefon installieren"
      if [ "${api:-0}" -ge 30 ] 2>/dev/null; then
        echo "    Einstellungen → Sicherheit → Weitere Sicherheitseinstellungen → Verschlüsselung & Anmeldedaten"
        echo "      → Zertifikat installieren → CA-Zertifikat → Warnung bestätigen → Datei auswählen"
      else
        echo "    Einstellungen → Sicherheit → Verschlüsselung & Anmeldedaten → Von Speicher installieren"
        echo "      → CA-Zertifikat → Warnung bestätigen → mitmproxy-ca-cert.cer wählen"
      fi
      echo "    Datei: Downloads/mitmproxy-ca-cert.cer"
      echo
      if [ "${api:-0}" -ge 24 ] 2>/dev/null; then
        bold "  Android 7+ ($api): wichtig"
        echo "    Nutzer-CAs werden von Apps nur akzeptiert, wenn die App es erlaubt."
        echo "    Für deine eigene App: ./scripts/mimic-android.sh nsc apply <android-projekt>"
        echo "    Für fremde Apps: nur mit gepatchtem APK / Frida-Unpinning (siehe docs/MIMIC.md)."
      fi
      ;;
    install)
      # System-Store: braucht root und funktioniert nur auf entsperrten/gerooteten Geräten
      require_adb
      command -v openssl >/dev/null 2>&1 || die "openssl fehlt"
      [ -f "$CA_PEM" ] || die "$CA_PEM fehlt"
      local hash
      hash="$(openssl x509 -inform PEM -subject_hash_old -in "$CA_PEM" -noout)"
      adb_cmd root >/dev/null 2>&1 || true
      sleep 1
      adb_cmd remount >/dev/null 2>&1 || adb_cmd shell mount -o rw,remount /system >/dev/null 2>&1 || true
      adb_cmd push "$CA_PEM" "/system/etc/security/cacerts/$hash.0" >/dev/null
      adb_cmd shell chmod 644 "/system/etc/security/cacerts/$hash.0" || true
      adb_cmd shell settings put global http_proxy ":0" >/dev/null || true
      adb_cmd reboot || true
      ok "CA als System-Zertifikat installiert ($hash.0) – Neustart läuft"
      ;;
    *) die "ca [push|install]" ;;
  esac
}

# ---------------------------------------------------------------- Network Security Config

nsc_xml() {
  cat <<'EOF'
<?xml version="1.0" encoding="utf-8"?>
<!-- Nur für Debug-Builds mit eigenem Proxy: erlaubt Nutzer-Zertifikate (mitmproxy-CA).
     Nicht in Release-Builds ausliefern. -->
<network-security-config>
    <base-config cleartextTrafficPermitted="true">
        <trust-anchors>
            <certificates src="system" />
            <certificates src="user" />
        </trust-anchors>
    </base-config>
    <debug-overrides>
        <trust-anchors>
            <certificates src="user" />
            <certificates src="system" />
        </trust-anchors>
    </debug-overrides>
</network-security-config>
EOF
}

cmd_nsc() {
  local action="${1:-print}"
  case "$action" in
    print) nsc_xml ;;
    apply)
      local project="${2:-$ROOT/android}"
      [ -d "$project/app/src/main" ] || die "kein Android-Projekt in '$project' (erst 'npx cap add android' bzw. Gradle-Sync)"
      local dir="$project/app/src/main/res/xml"
      local manifest="$project/app/src/main/AndroidManifest.xml"
      mkdir -p "$dir"
      nsc_xml >"$dir/network_security_config.xml"
      ok "geschrieben: ${dir#"$project"/}/network_security_config.xml"
      if grep -q "networkSecurityConfig" "$manifest"; then
        ok "AndroidManifest.xml verweist bereits darauf"
      else
        local py; py="$(command -v python3 || echo "$VENV/bin/python")"
        "$py" - "$manifest" <<'PYEOF'
import pathlib, re, sys
p = pathlib.Path(sys.argv[1]); s = p.read_text()
attr = 'android:networkSecurityConfig="@xml/network_security_config"'
s2, n = re.subn(r"<application\b", "<application\n        " + attr, s, count=1)
if not n:
    sys.exit("kein <application>-Element im Manifest gefunden")
p.write_text(s2)
PYEOF
        ok "AndroidManifest.xml gepatcht"
      fi
      echo
      echo "  Nativer Debug-Build:"
      echo "    npm run build:android      # oder: npx cap sync android && cd android && ./gradlew installDebug"
      echo "  Alternative ohne Quellcode (fremde App): apktool zerlegen, NSC + Manifest-Attribut"
      echo "  einfügen, neu bauen und signieren – oder Frida-Unpinning (docs/MIMIC.md)."
      ;;
    *) die "nsc print|apply [projekt-dir]" ;;
  esac
}

# ---------------------------------------------------------------- capture + mimic

cmd_capture() {
  cmd_proxy start
  cmd_connect "${1:-}"
  cmd_ca push
  echo
  bold "Ablauf"; echo "  App am Telefon öffnen und normal benutzen, dann:"
  echo "    ./scripts/mimic-android.sh hosts"
  echo "    ./scripts/mimic-android.sh learn <host>"
  echo "    ./scripts/mimic-android.sh gen   <host> -o client.py"
  echo "  Aufräumen: ./scripts/mimic-android.sh disconnect && ./scripts/mimic-android.sh proxy stop"
}

passthrough() {
  [ -x "$MIMIC" ] || die "mimic nicht installiert → sh scripts/install-mimic.sh"
  if ! proxy_alive && ! web_reachable; then
    warn "Proxy läuft nicht – starte ihn für dich"; cmd_proxy start >/dev/null
  fi
  MIMIC_URL="http://$WEB_HOST:$WEB_PORT" MIMIC_TOKEN=test "$MIMIC" "$@"
}

main() {
  local cmd="${1:-check}"; shift || true
  case "$cmd" in
    check) cmd_check ;;
    capture) cmd_capture "${1:-}" ;;
    proxy) cmd_proxy "${1:-status}" ;;
    connect) cmd_connect "${1:-}" ;;
    disconnect) cmd_disconnect ;;
    ca) cmd_ca "${1:-push}" ;;
    nsc) cmd_nsc "${1:-print}" "${2:-$ROOT/android}" ;;
    hosts|learn|gen) passthrough "$cmd" "$@" ;;
    -h|--help|help) awk 'NR==1{next} /^#/{sub(/^# ?/,""); print; next} {exit}' "${BASH_SOURCE[0]}" ;;
    *) die "unbekannt: $cmd (check|capture|proxy|connect|disconnect|ca|nsc|hosts|learn|gen)" ;;
  esac
}

main "$@"
