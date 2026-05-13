import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "./db/client";
import * as schema from "./db/schema";
import { env, googleConfigured } from "./env";

export const auth = betterAuth({
  baseURL: `http://localhost:${env.API_PORT}`,
  basePath: "/api/auth",
  secret: env.BETTER_AUTH_SECRET,
  trustedOrigins: [env.APP_URL],
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: {
      user: schema.user,
      session: schema.session,
      account: schema.account,
      verification: schema.verification,
    },
  }),
  user: {
    additionalFields: {
      isDemo: {
        type: "boolean",
        defaultValue: false,
        input: false,
      },
    },
  },
  socialProviders: googleConfigured
    ? {
        google: {
          clientId: env.GOOGLE_CLIENT_ID,
          clientSecret: env.GOOGLE_CLIENT_SECRET,
        },
      }
    : {},
  advanced: {
    defaultCookieAttributes: {
      sameSite: "lax",
      secure: false, // dev only — flip to true behind HTTPS
    },
  },
});

export type Auth = typeof auth;
