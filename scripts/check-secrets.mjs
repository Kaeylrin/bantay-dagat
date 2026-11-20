import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const staged = process.argv.includes("--staged");
const args = staged ? ["diff", "--cached", "--name-only", "--diff-filter=ACMR", "-z"] : ["ls-files", "-z"];
const files = execFileSync("git", args, { encoding: "utf8" }).split("\0").filter(Boolean);
const issues = [];
const privatePath = /(^|\/)\.env(?:\..*)?$|service[-_]account.*\.json$|\.(?:pem|key|p12|pfx)$/i;
const patterns = [
  ["private key", /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
  ["service account credential", /"type"\s*:\s*"service_account"/],
  ["Resend API secret", /\bre_[A-Za-z0-9]{20,}\b/],
  ["GitHub token", /\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/],
  ["AWS access key", /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/],
];
const knownSecrets = [];
try {
  for (const line of readFileSync(".env", "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (!match || !/(?:SECRET|PASSWORD|TOKEN|PRIVATE_KEY|RESEND_API_KEY)/.test(match[1])) continue;
    const value = match[2].replace(/^(['"])(.*)\1$/, "$2");
    if (value.length >= 12 && !value.startsWith("replace-with-")) knownSecrets.push(value);
  }
} catch { /* A local .env is optional. */ }

for (const file of files) {
  if (file === ".env.example") continue;
  if (privatePath.test(file)) {
    issues.push(`${file}: private file must not be tracked`);
    continue;
  }
  const buffer = staged ? execFileSync("git", ["show", `:${file}`], { maxBuffer: 30 * 1024 * 1024 }) : readFileSync(file);
  if (buffer.includes(0)) continue;
  const content = buffer.toString("utf8");
  for (const [label, pattern] of patterns) if (pattern.test(content)) issues.push(`${file}: possible ${label}`);
  if (knownSecrets.some((secret) => content.includes(secret))) issues.push(`${file}: contains a server secret from local environment`);
}

if (issues.length) {
  console.error(issues.join("\n"));
  process.exitCode = 1;
} else {
  console.log(`Secret check passed for ${files.length} ${staged ? "staged" : "tracked"} files. No credential values are printed.`);
}
