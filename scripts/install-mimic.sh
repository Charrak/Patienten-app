#!/usr/bin/env sh
# Installiert mimic (https://github.com/littledivy/mimic) in eine isolierte
# venv unter .mimic-venv/. Aufruf danach über ./bin/mimic
#
#   sh scripts/install-mimic.sh              # nur mimic (HAR / cURL / Codegen)
#   sh scripts/install-mimic.sh --capture    # + mitmproxy für `mimic record` (~120 MB)
#
# Hinweis: "mimic-client" ist nicht auf PyPI veröffentlicht (404), deshalb wird
# direkt aus dem Git-Repository installiert.
set -e
cd "$(dirname "$0")/.."
ROOT="$(pwd)"
PY="${PYTHON:-python3}"

"$PY" -m venv "$ROOT/.mimic-venv"
"$ROOT/.mimic-venv/bin/pip" install --upgrade pip >/dev/null

if [ "$1" = "--capture" ]; then
  "$ROOT/.mimic-venv/bin/pip" install "mimic-client[capture] @ git+https://github.com/littledivy/mimic.git"
else
  "$ROOT/.mimic-venv/bin/pip" install "mimic-client @ git+https://github.com/littledivy/mimic.git"
fi

echo
echo "mimic installiert. Test:  ./bin/mimic doctor"
echo "Doku: docs/MIMIC.md"
