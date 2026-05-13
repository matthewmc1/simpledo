# Setup

## One-time

1. **Install Docker Desktop** (or any Postgres 16 you prefer; `docker-compose.yml` is the path of least resistance).
2. **Install Ollama and pull the model** — only needed for Phase 5+, but worth doing now so it's ready.
   ```bash
   brew install ollama
   ollama pull gemma2:2b
   # Launch Ollama with CORS allowed from the server origin:
   OLLAMA_ORIGINS="http://localhost:4000" ollama serve
   ```
3. **Create the Google OAuth client** (needed for the "Continue with Google" button — the "Try the demo" path works without it):
   1. Open <https://console.cloud.google.com/apis/credentials>.
   2. New project (or pick existing). Make sure billing is *not* required for this — OAuth credentials are free.
   3. *OAuth consent screen* → External → fill in app name "Simple Do", your email, save. Add yourself as a test user.
   4. *Credentials* → Create credentials → OAuth client ID → Web application.
   5. Authorized JavaScript origins: `http://localhost:5173`.
   6. Authorized redirect URIs: `http://localhost:4000/api/auth/callback/google`.
   7. Copy the **Client ID** and **Client secret** into `.env.local`:
      ```
      GOOGLE_CLIENT_ID=…
      GOOGLE_CLIENT_SECRET=…
      ```

## Every dev session

```bash
npm run db:up      # starts Postgres in Docker
npm run dev        # web on :5173, api on :4000
```

The first time only, also run `npm run db:push` to materialize the schema in the fresh database. Run it again whenever `server/db/schema.ts` changes.

## Useful commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Vite + Hono together (concurrently) |
| `npm run dev:web` | Just the client |
| `npm run dev:api` | Just the server |
| `npm run db:up` / `db:down` | Start / stop the Postgres container |
| `npm run db:push` | Sync `server/db/schema.ts` into the running DB (drizzle-kit push --force) |
| `npm run db:studio` | Open Drizzle Studio in the browser to inspect tables |
| `npm run typecheck` | Typecheck client and server |
| `npm run build` | Production build of the client |

## Troubleshooting

- **Port 5173 already in use** — kill the stale Vite (`lsof -iTCP:5173 -sTCP:LISTEN -t | xargs kill`) or restart your browser; Arc/Chrome occasionally hold the port open after a crashed dev server.
- **`/api/auth/demo` returns 404** — Better Auth's catch-all is matching first. Ensure the demo route is registered before `router.all("/auth/*", …)` in `server/routes/auth.ts`.
- **`Continue with Google` does nothing** — `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` are blank in `.env.local`. Fill them in and restart `dev:api`.
