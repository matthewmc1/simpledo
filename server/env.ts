import "dotenv/config";

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

function optional(name: string, fallback: string): string {
  return process.env[name] || fallback;
}

export const env = {
  DATABASE_URL: required("DATABASE_URL"),
  API_PORT: Number(optional("API_PORT", "4000")),
  APP_URL: optional("APP_URL", "http://localhost:5173"),
  BETTER_AUTH_SECRET: required("BETTER_AUTH_SECRET"),
  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID ?? "",
  GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET ?? "",
  GEMMA_BASE_URL: optional("GEMMA_BASE_URL", "http://localhost:11434"),
  GEMMA_MODEL: optional("GEMMA_MODEL", "gemma2:2b"),
};

export const googleConfigured = !!(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);
