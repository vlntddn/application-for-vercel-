#!/usr/bin/env bash
#
# Removes Patente Pro from macOS or Linux.
#
# Study progress is kept by default — pass --purge to delete it too.

set -euo pipefail

APP_HOME="${PP_HOME:-$HOME/.patente-pro}"
PURGE=""
[ "${1:-}" = "--purge" ] && PURGE=1

case "$(uname -s)" in
  Darwin) DATA_DIR="$HOME/Library/Application Support/PatentePro" ;;
  *) DATA_DIR="${XDG_DATA_HOME:-$HOME/.local/share}/patente-pro" ;;
esac

rm -rf "$APP_HOME"
rm -f "$HOME/.local/bin/patente-pro"
rm -rf "$HOME/Applications/Patente Pro.app"
rm -f "$HOME/.local/share/applications/patente-pro.desktop"
rm -f "$HOME/.local/share/icons/patente-pro.png"

echo "Patente Pro removed."
if [ -n "$PURGE" ]; then
  rm -rf "$DATA_DIR"
  echo "Study progress deleted ($DATA_DIR)."
else
  echo "Study progress kept at: $DATA_DIR"
  echo "Delete it with: $0 --purge"
fi
