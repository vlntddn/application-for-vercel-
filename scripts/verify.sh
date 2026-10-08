#!/usr/bin/env bash
# Single pre-commit gate for autonomous agents (OpenHands) and humans.
# Usage: scripts/verify.sh [BASE]   (BASE defaults to HEAD = uncommitted changes)
# Exit 0 = safe to commit. Any other exit = do NOT commit; read the FAIL lines.
set -u
cd "$(dirname "$0")/.." || exit 2
BASE="${1:-HEAD}"
FAILS=0
pass() { echo "PASS  $1"; }
fail() { echo "FAIL  $1"; FAILS=$((FAILS + 1)); }

CHANGED="$( { git diff --name-only "$BASE"; git ls-files --others --exclude-standard; } | sort -u)"

# 1. Zero runtime/dev dependencies (same check as CI).
if node -e "const p=require('./package.json');process.exit(Object.keys({...p.dependencies,...p.devDependencies}).length?1:0)"; then
  pass "zero dependencies"
else
  fail "package.json has dependencies — forbidden until Phase 3"
fi

# 1b. No secrets in changed files, unpushed commit messages or the origin URL (SEC4).
if node scripts/scan-secrets.mjs $CHANGED; then
  pass "secret scan: changed files, commit messages, origin URL"
else
  fail "secret scan found something above — remove it (and revoke the secret if it was real)"
fi

# 2. Protected paths must stay untouched.
PROTECTED="$(echo "$CHANGED" | grep -E '^(data/questions/|legacy/|THIRD-PARTY-NOTICES\.md$|public/credits\.html$)' || true)"
if [ -z "$PROTECTED" ]; then
  pass "protected paths untouched"
else
  fail "protected paths changed (revert them): $(echo $PROTECTED)"
fi

# 3. Any change under public/ requires a VERSION bump in public/sw.js.
if echo "$CHANGED" | grep -qE '^public/' && [ "$(echo "$CHANGED" | grep -E '^public/' | grep -v '^public/sw\.js$')" != "" ]; then
  if git diff "$BASE" -- public/sw.js | grep -qE "^\+const VERSION = "; then
    pass "public/ changed and sw.js VERSION bumped"
  else
    fail "public/ changed but VERSION in public/sw.js not bumped"
  fi
else
  pass "no public/ changes needing a sw.js bump"
fi

# 4. Overlay files: never lose an existing (question id, lang) entry.
LOST="$(BASE="$BASE" node -e '
const fs = require("fs"), { execSync } = require("child_process");
const base = process.env.BASE; let lost = [];
let files = [];
try { files = execSync(`git ls-tree --name-only ${base} data/translations/`, { encoding: "utf8" }).split("\n").filter(Boolean); } catch {}
for (const f of files) {
  const old = JSON.parse(execSync(`git show ${base}:${f}`, { encoding: "utf8", maxBuffer: 64e6 })).translations || {};
  let cur = {};
  try { cur = JSON.parse(fs.readFileSync(f, "utf8")).translations || {}; } catch { lost.push(f + " (missing or invalid JSON)"); continue; }
  for (const [id, langs] of Object.entries(old))
    for (const l of Object.keys(langs))
      if (!cur[id] || !cur[id][l]) lost.push(`${f}: ${id}.${l}`);
}
console.log(lost.slice(0, 20).join("\n") + (lost.length > 20 ? `\n...and ${lost.length - 20} more` : ""));
')"
if [ -z "$LOST" ]; then
  pass "overlay: no existing translation entries lost"
else
  fail "overlay entries lost vs $BASE (restore them, merge instead of overwrite):"; echo "$LOST"
fi

# 4b. Explanations: never lose an existing question id (same merge-only rule as the overlay).
EXPL_LOST="$(BASE="$BASE" node -e '
const fs = require("fs"), { execSync } = require("child_process");
const base = process.env.BASE; let lost = [];
let files = [];
try { files = execSync(`git ls-tree --name-only ${base} data/explanations/`, { encoding: "utf8" }).split("\n").filter(Boolean); } catch {}
for (const f of files) {
  const old = (JSON.parse(execSync(`git show ${base}:${f}`, { encoding: "utf8", maxBuffer: 64e6 })).items) || {};
  let cur = {};
  try { cur = JSON.parse(fs.readFileSync(f, "utf8")).items || {}; } catch { lost.push(f + " (missing or invalid JSON)"); continue; }
  for (const id of Object.keys(old))
    if (!cur[id]) lost.push(`${f}: ${id}`);
}
console.log(lost.slice(0, 20).join("\n") + (lost.length > 20 ? `\n...and ${lost.length - 20} more` : ""));
')"
if [ -z "$EXPL_LOST" ]; then
  pass "explanations: no existing entries lost"
else
  fail "explanation entries lost vs $BASE (restore them, merge instead of overwrite):"; echo "$EXPL_LOST"
fi

# 4c. Q8 causal-word advisory: print the counter (never a FAIL — owner proofread).
CAUSAL_COUNT="$(node scripts/check-explanations.mjs 2>/dev/null | awk -F': ' '/^causal-word warnings: /{print $2; exit}')"
if [ -n "$CAUSAL_COUNT" ]; then
  echo "INFO  explanations causal-word warnings: $CAUSAL_COUNT (advisory — node scripts/sample-explanations.mjs)"
fi

# 5. Unit tests.
if npm test --silent >/tmp/pp-verify-test.log 2>&1; then
  pass "npm test ($(grep -E '^# pass' /tmp/pp-verify-test.log | awk '{print $3}') passed)"
else
  fail "npm test — see /tmp/pp-verify-test.log:"; grep -E '^not ok|^# (pass|fail)' /tmp/pp-verify-test.log | head -20
fi

# 6. Smoke test on an isolated port + throwaway storage (never touches a running dev server).
PORT_SMOKE="${VERIFY_PORT:-3917}"
TMP_STORE="$(mktemp -d)"
PORT="$PORT_SMOKE" STORAGE_DIR="$TMP_STORE" node server/index.js >/tmp/pp-verify-server.log 2>&1 &
SRV=$!
for _ in $(seq 1 30); do curl -sf "http://127.0.0.1:$PORT_SMOKE/api/health" >/dev/null 2>&1 && break; sleep 0.3; done
SMOKE_BAD=""
for p in / /api/health /api/manifest /api/theory /api/lessons /api/dictionary /api/progress /manifest.webmanifest; do
  code="$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$PORT_SMOKE$p")"
  [ "$code" = "200" ] || SMOKE_BAD="$SMOKE_BAD $p=$code"
done
kill "$SRV" 2>/dev/null; wait "$SRV" 2>/dev/null; rm -rf "$TMP_STORE"
if [ -z "$SMOKE_BAD" ]; then
  pass "smoke: 8 endpoints 200 on :$PORT_SMOKE"
else
  fail "smoke:$SMOKE_BAD (server log: /tmp/pp-verify-server.log)"
fi

# 7. UI changed → end-to-end new-user scenario in headless Chrome (own server on :3919).
CHROME_BIN="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
if echo "$CHANGED" | grep -qE '^public/'; then
  if [ -x "$CHROME_BIN" ]; then
    if node qa-new-user.mjs >/tmp/pp-verify-qa.log 2>&1; then
      pass "qa-new-user: $(grep -o '[0-9]* PASS, [0-9]* FAIL' /tmp/pp-verify-qa.log)"
    else
      fail "qa-new-user — see /tmp/pp-verify-qa.log:"; grep -E 'FAIL|ОШИБКА' /tmp/pp-verify-qa.log | head -10
    fi
  else
    echo "SKIP  qa-new-user (Chrome not found)"
  fi
fi

echo "----"
if [ "$FAILS" -eq 0 ]; then echo "VERIFY OK"; exit 0; else echo "VERIFY FAILED ($FAILS)"; exit 1; fi
