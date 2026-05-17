import "dotenv/config";

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

function optional(name: string, fallback: string): string {
  return process.env[name] || fallback;
}

const gemmaBaseUrl = optional("GEMMA_BASE_URL", "http://localhost:11434");
const gemmaAllowRemote = optional("GEMMA_ALLOW_REMOTE", "false").toLowerCase() === "true";

/** Every briefing/review/recommend call ships task + inbox text to Ollama.
 *  Default is localhost (privacy-safe). If the user points at a remote host,
 *  refuse to boot unless they've explicitly opted in via `GEMMA_ALLOW_REMOTE`
 *  — closes the data-exfiltration vector where a misconfigured env points
 *  every prompt at an attacker-controlled URL. */
function assertGemmaUrlSafe(url: string): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`Invalid GEMMA_BASE_URL: ${url}`);
  }
  const host = parsed.hostname.toLowerCase();
  const isLocal =
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "::1" ||
    host === "0.0.0.0";
  if (!isLocal && !gemmaAllowRemote) {
    throw new Error(
      `GEMMA_BASE_URL=${url} is not localhost. ` +
        `Refusing to boot — every briefing ships your tasks to that host. ` +
        `Set GEMMA_ALLOW_REMOTE=true to opt in if this is intentional.`,
    );
  }
}
assertGemmaUrlSafe(gemmaBaseUrl);

export const env = {
  DATABASE_URL: required("DATABASE_URL"),
  API_PORT: Number(optional("API_PORT", "4000")),
  APP_URL: optional("APP_URL", "http://localhost:5173"),
  BETTER_AUTH_SECRET: required("BETTER_AUTH_SECRET"),
  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID ?? "",
  GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET ?? "",
  GEMMA_BASE_URL: gemmaBaseUrl,
  GEMMA_MODEL: optional("GEMMA_MODEL", "gemma2:2b"),
};

export const googleConfigured = !!(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);
