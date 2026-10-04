#!/usr/bin/env node
// Secret scanner for verify.sh (SEC4).
// Usage: node scripts/scan-secrets.mjs [base]   (base defaults to HEAD)
// Scans (a) the working-tree diff against base for added lines and recent
// commit subjects (HEAD~3..HEAD), and (b) the origin remote URL for an
// embedded credential. Findings print as "found in <location>: <label>"
// WITHOUT echoing the secret; exit 1 if anything is found.
import { execSync } from "node:child_process";

const PATTERNS = [
  ["GitHub personal access token", /ghp_[A-Za-z0-9]{20,}/g],
  ["GitHub fine-grained token", /github_pat_[A-Za-z0-9]{20,}/g],
  ["OpenAI-style key", /sk-[A-Za-z0-9]{20,}/g],
  ["AWS access key", /\bAKIA[A-Z0-9]{16}\b/g],
  ["private key block", /-----BEGIN [A-Z0-9 ]*PRIVATE KEY( BLOCK)?-----/g],
];

function scanText(text, label, out) {
  for (const [name, re] of PATTERNS) {
    re.lastIndex = 0;
    if (re.test(text)) out.push(`found in ${label}: ${name}`);
  }
}

const base = process.argv[2] || "HEAD";
const findings = [];

try {
  const diff = execSync(`git diff -U0 ${base}`, {
    encoding: "utf8",
    maxBuffer: 64e6,
  });
  scanText(diff, `working-tree diff vs ${base}`, findings);
} catch (e) {
  if (e.status !== 0) console.error(`scan-secrets: git diff ${base} failed: ${e.message}`);
}

try {
  const msgs = execSync(`git log HEAD~10..HEAD --format=%s`, { encoding: "utf8" });
  scanText(msgs, "recent commit messages", findings);
} catch {}

try {
  const url = execSync("git remote get-url origin", { encoding: "utf8" }).trim();
  if (/^(https?|ssh|git\+https?)\/\//.test(url)) {
    // userinfo in URL = embedded login or token
    if (/@/.test(url)) findings.push("found in git remote origin URL: embedded credential");
  } else if (url.startsWith("git@") && /:.*@/.test(url.slice(4))) {
    findings.push("found in git remote origin URL: embedded credential");
  }
} catch {}

if (findings.length) {
  for (const f of findings) console.log(f);
  process.exit(1);
}
console.log("no secrets found");
