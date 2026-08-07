#!/usr/bin/env bash
#
# Patente Pro installer for macOS and Linux.
#
#   curl -fsSL https://raw.githubusercontent.com/vlntddn/application-for-vercel-/main/install.sh | bash
#
# Installs into ~/.patente-pro, puts a `patente-pro` command on PATH and
# registers a desktop entry (a real .app bundle on macOS, a .desktop file
# on Linux). No npm packages, no build step, no sudo.
#
# Options (also accepted as environment variables):
#   --ref <git-ref>   branch/tag to install        (PP_REF, default: main)
#   --dir <path>      install location             (PP_HOME)
#   --no-desktop      skip the desktop/menu entry  (PP_NO_DESKTOP=1)

set -euo pipefail

REPO_SLUG="${PP_REPO:-vlntddn/application-for-vercel-}"
REF="${PP_REF:-main}"
APP_HOME="${PP_HOME:-$HOME/.patente-pro}"
NO_DESKTOP="${PP_NO_DESKTOP:-}"

while [ $# -gt 0 ]; do
  case "$1" in
    --ref) REF="$2"; shift 2 ;;
    --ref=*) REF="${1#*=}"; shift ;;
    --dir) APP_HOME="$2"; shift 2 ;;
    --dir=*) APP_HOME="${1#*=}"; shift ;;
    --no-desktop) NO_DESKTOP=1; shift ;;
    -h|--help) sed -n '2,20p' "$0" 2>/dev/null || true; exit 0 ;;
    *) echo "Unknown option: $1" >&2; exit 2 ;;
  esac
done

BOLD=$'\033[1m'; DIM=$'\033[2m'; RED=$'\033[31m'; GREEN=$'\033[32m'; RESET=$'\033[0m'
say()  { printf '%s\n' "$*"; }
step() { printf '%s==>%s %s\n' "$BOLD" "$RESET" "$*"; }
warn() { printf '%s!%s   %s\n' "$RED" "$RESET" "$*"; }
die()  { warn "$*"; exit 1; }

case "$(uname -s)" in
  Darwin) OS=mac ;;
  Linux)  OS=linux ;;
  *) die "Unsupported OS: $(uname -s). Windows users: use install.ps1." ;;
esac

# ---------------------------------------------------------------- Node check
step "Checking Node.js"
if ! command -v node >/dev/null 2>&1; then
  warn "Node.js is not installed (version 18 or newer is required)."
  if [ "$OS" = mac ]; then
    say "  Install it with:  brew install node        ${DIM}(or from https://nodejs.org)${RESET}"
  else
    say "  Debian/Ubuntu:    sudo apt install nodejs"
    say "  Fedora:           sudo dnf install nodejs"
    say "  Arch:             sudo pacman -S nodejs"
    say "  Or download from https://nodejs.org"
  fi
  exit 1
fi
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
[ "$NODE_MAJOR" -ge 18 ] || die "Node.js 18+ required, found $(node -v)."
say "    Node $(node -v) — ok"

# ------------------------------------------------------------------- Download
TMP_DIR="$(mktemp -d)"
cleanup() { rm -rf "$TMP_DIR"; }
trap cleanup EXIT

step "Downloading Patente Pro ($REF)"
SRC="$TMP_DIR/src"
if command -v git >/dev/null 2>&1; then
  git clone --depth 1 --branch "$REF" --quiet \
    "https://github.com/$REPO_SLUG.git" "$SRC" \
    || die "Could not clone $REPO_SLUG at ref '$REF'."
  rm -rf "$SRC/.git"
elif command -v curl >/dev/null 2>&1 && command -v tar >/dev/null 2>&1; then
  mkdir -p "$SRC"
  curl -fsSL "https://codeload.github.com/$REPO_SLUG/tar.gz/$REF" \
    | tar -xz -C "$SRC" --strip-components=1 \
    || die "Could not download $REPO_SLUG at ref '$REF'."
else
  die "Need either git, or curl and tar, to download the app."
fi
if [ ! -f "$SRC/server/index.js" ] || [ ! -f "$SRC/bin/patente-pro.js" ]; then
  warn "Ref '$REF' does not contain the current application."
  say  "  Pick a ref that does, for example:"
  say  "    --ref claude/vibrant-gates-b12x31"
  exit 1
fi

# -------------------------------------------------------------------- Install
step "Installing to $APP_HOME"
# Progress lives in the per-user data dir, so replacing the app folder is
# safe. An older in-app storage/ directory is carried over just in case.
if [ -d "$APP_HOME/storage" ]; then
  cp -R "$APP_HOME/storage" "$TMP_DIR/storage-backup"
fi
rm -rf "$APP_HOME"
mkdir -p "$(dirname "$APP_HOME")"
mv "$SRC" "$APP_HOME"
if [ -d "$TMP_DIR/storage-backup" ]; then
  cp -R "$TMP_DIR/storage-backup" "$APP_HOME/storage"
fi
chmod +x "$APP_HOME/bin/patente-pro.js"

# ------------------------------------------------------------ CLI on the PATH
BIN_DIR="$HOME/.local/bin"
mkdir -p "$BIN_DIR"
cat > "$BIN_DIR/patente-pro" <<EOF
#!/usr/bin/env bash
exec node "$APP_HOME/bin/patente-pro.js" "\$@"
EOF
chmod +x "$BIN_DIR/patente-pro"
say "    Command: $BIN_DIR/patente-pro"

case ":$PATH:" in
  *":$BIN_DIR:"*) PATH_OK=1 ;;
  *) PATH_OK="" ;;
esac

# -------------------------------------------------------- Desktop integration
if [ -z "$NO_DESKTOP" ]; then
  step "Creating the desktop entry"
  if [ "$OS" = mac ]; then
    APP_BUNDLE="$HOME/Applications/Patente Pro.app"
    rm -rf "$APP_BUNDLE"
    mkdir -p "$APP_BUNDLE/Contents/MacOS" "$APP_BUNDLE/Contents/Resources"
    cat > "$APP_BUNDLE/Contents/Info.plist" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleName</key><string>Patente Pro</string>
  <key>CFBundleDisplayName</key><string>Patente Pro</string>
  <key>CFBundleIdentifier</key><string>dev.patentepro.app</string>
  <key>CFBundleVersion</key><string>$(node -p "require('$APP_HOME/package.json').version")</string>
  <key>CFBundleExecutable</key><string>patente-pro</string>
  <key>CFBundleIconFile</key><string>appicon</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>LSMinimumSystemVersion</key><string>10.13</string>
  <key>LSUIElement</key><true/>
</dict>
</plist>
EOF
    cat > "$APP_BUNDLE/Contents/MacOS/patente-pro" <<EOF
#!/usr/bin/env bash
# Launch through the user's login shell so a Node installed by brew/nvm
# is on PATH even when Finder starts us with a minimal environment.
exec "\$SHELL" -l -c 'exec node "$APP_HOME/bin/patente-pro.js"'
EOF
    chmod +x "$APP_BUNDLE/Contents/MacOS/patente-pro"

    # macOS ships sips and iconutil, so the .icns needs no extra tooling.
    if command -v sips >/dev/null 2>&1 && command -v iconutil >/dev/null 2>&1; then
      ICONSET="$TMP_DIR/appicon.iconset"
      mkdir -p "$ICONSET"
      for size in 16 32 64 128 256 512; do
        sips -z $size $size "$APP_HOME/public/icons/icon-512.png" \
          --out "$ICONSET/icon_${size}x${size}.png" >/dev/null 2>&1 || true
      done
      cp "$ICONSET/icon_512x512.png" "$ICONSET/icon_256x256@2x.png" 2>/dev/null || true
      iconutil -c icns "$ICONSET" -o "$APP_BUNDLE/Contents/Resources/appicon.icns" >/dev/null 2>&1 \
        || cp "$APP_HOME/public/icons/icon-512.png" "$APP_BUNDLE/Contents/Resources/appicon.png"
    fi
    say "    $APP_BUNDLE"
  else
    DESKTOP_DIR="$HOME/.local/share/applications"
    ICON_DIR="$HOME/.local/share/icons"
    mkdir -p "$DESKTOP_DIR" "$ICON_DIR"
    cp "$APP_HOME/public/icons/icon-512.png" "$ICON_DIR/patente-pro.png"
    cat > "$DESKTOP_DIR/patente-pro.desktop" <<EOF
[Desktop Entry]
Type=Application
Name=Patente Pro
GenericName=Italian Driving Theory Trainer
Comment=Practice the Italian patente B theory exam offline
Exec=$BIN_DIR/patente-pro
Icon=$ICON_DIR/patente-pro.png
Terminal=false
Categories=Education;
StartupNotify=true
EOF
    chmod +x "$DESKTOP_DIR/patente-pro.desktop"
    command -v update-desktop-database >/dev/null 2>&1 \
      && update-desktop-database "$DESKTOP_DIR" >/dev/null 2>&1 || true
    say "    $DESKTOP_DIR/patente-pro.desktop"
  fi
fi

# ----------------------------------------------------------------------- Done
say ""
printf '%s%s Patente Pro installed.%s\n' "$GREEN" "✓" "$RESET"
say ""
if [ -z "$NO_DESKTOP" ] && [ "$OS" = mac ]; then
  say "  Launch it from ${BOLD}Launchpad / ~/Applications${RESET}, or run:"
elif [ -z "$NO_DESKTOP" ]; then
  say "  Launch it from your ${BOLD}application menu${RESET}, or run:"
fi
say "    ${BOLD}patente-pro${RESET}"
say ""
if [ -z "$PATH_OK" ]; then
  warn "$BIN_DIR is not on your PATH. Add this to your shell profile:"
  say "    export PATH=\"\$HOME/.local/bin:\$PATH\""
  say "  Until then, start it with:  $BIN_DIR/patente-pro"
  say ""
fi
say "${DIM}  Update:    re-run this installer${RESET}"
say "${DIM}  Uninstall: $APP_HOME/uninstall.sh${RESET}"
