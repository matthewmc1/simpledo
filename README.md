# Simple Do

A focused task manager with a local-first stack and an opinionated **Briefing Room** UI. Think of it as a daily editorial: one card that summarises today's work, a clean Today list, an Inbox that's actually short, and a Friday review you'll do because it doesn't feel like data entry.

> Single-user, local-first by default. Postgres + an LLM (Ollama / Gemini / OpenAI / Anthropic) run alongside the app so your tasks and your AI-generated briefings stay on your machine if you want them to.

---

## Highlights

- **Briefing Room** layout — a 240px dark rail + editorial-main shell shared across Today, Inbox, Project, Task Detail, Calendar, and Weekly Review.
- **Live AI briefing** — your Today card streams a 1–2 sentence headline + summary from a local Gemma model via Ollama (default). One env var swaps in Gemini, OpenAI, or Anthropic (cheap models only).
- **Capture → process flow** — Capture (`⌘K` from anywhere) → Inbox → process to Today / Next / Waiting / Someday / Done. Weekly Review is a real ritual with live wins, project health, and stale-item triage.
- **Projects** — create, rename, recolor, describe, archive, delete. Inline-edit on the project page. Quick-add tasks scoped to a project from a single click.
- **Optimistic UI** — every mutation updates locally first, rolls back on error, surfaces failures as toasts.
- **Keyboard-first** — `⌘K` to capture, `j/k` to navigate the inbox, `⏎` to send-to-next, `d` to delete, inline-edit-on-click for titles and descriptions.
- **Three sign-in modes** — Google OAuth, local email-only (single-user dev), or a sandboxed demo account with seed data.
- **Tweaks panel** — accent color, density, AI prominence (`quiet | balanced | loud`). Settings persist to `localStorage`.

---

## Stack

| Layer | Choice | Why |
| --- | --- | --- |
| Client | **Vite + React 19 + TypeScript** | Fast dev loop, tight types, no framework lock-in |
| State | **Zustand** stores + **Zod** schemas | One pattern per concern; schemas shared with the server |
| Routing | **react-router-dom** v7 | Six routes, one shell |
| Hotkeys | **react-hotkeys-hook** | `⌘K`, `j/k`, `⏎`, `d` |
| Server | **Hono** on Node (`tsx watch`) | Tiny, fast, zero ceremony |
| Auth | **Better Auth** (Google OAuth) + custom local-session cookie (demo / email) | OAuth + local-only modes side-by-side |
| DB | **Postgres 16** (Docker) + **Drizzle ORM** | Drizzle-kit `push --force` is enough for dev |
| AI | **Ollama** default (`gemma3:4b`), with pluggable provider abstraction for Gemini / OpenAI / Anthropic | Local-first, but trivially swappable |

The server proxies AI requests so the model can change with one env var (`AI_PROVIDER`) without touching the client.

---

## Quick start

> Prereqs: Node 20+, Docker Desktop (for Postgres), and (optionally) Ollama for the briefing.

```bash
git clone https://github.com/matthewmc1/simpledo.git
cd simpledo
npm install
cp .env.example .env.local
# fill in BETTER_AUTH_SECRET at minimum (openssl rand -base64 32)

npm run db:up          # start Postgres in Docker
npm run db:push        # create the schema in the fresh DB
npm run dev            # client on :5173, api on :4000
```

Open <http://localhost:5173>. Pick **Try the demo** for a seeded sandbox, or **Continue with email** for a clean account, or **Continue with Google** if you've wired up OAuth (see `docs/setup.md`).

### Optional: real AI briefing

```bash
brew install ollama
ollama pull gemma3:4b
OLLAMA_ORIGINS="http://localhost:4000" ollama serve
```

Restart `npm run dev:api` after starting Ollama. The Today briefing card will now stream a live read of your tasks.

To use a hosted provider instead, set the relevant block in `.env.local`:

```bash
AI_PROVIDER=gemini       # gemini | openai | anthropic | ollama
GEMINI_API_KEY=...       # or OPENAI_API_KEY / ANTHROPIC_API_KEY
# AI_MODEL=...           # optional — cheap defaults are picked per provider
```

Cheap defaults: `gemini-2.5-flash-lite`, `gpt-4o-mini`, `claude-haiku-4-5`, `gemma3:4b`. The app never defaults to a flagship model.

---

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Vite + Hono together via `concurrently` |
| `npm run dev:web` | Client only (port `5173`) |
| `npm run dev:api` | API only (port `4000`) |
| `npm run db:up` / `db:down` | Start / stop the Postgres container |
| `npm run db:push` | Sync `server/db/schema.ts` into the DB (`drizzle-kit push --force`) |
| `npm run db:studio` | Open Drizzle Studio to inspect tables |
| `npm run typecheck` | Typecheck client and server projects |
| `npm run build` | Production build of the client |
| `npm run lint` | ESLint over the repo |

---

## Project layout

```
simply-do/
├── docs/                       Plans, setup, AI provider notes
├── server/
│   ├── index.ts                Hono entry; mounts /api/* routes
│   ├── auth.ts                 Better Auth (Google OAuth) wiring
│   ├── env.ts                  Validated env loader
│   ├── db/
│   │   ├── schema.ts           Drizzle table definitions
│   │   └── client.ts           Postgres pool
│   ├── middleware/session.ts   resolveSession + HTTPError helpers
│   ├── routes/
│   │   ├── auth.ts             Demo + local-email + Better Auth catch-all
│   │   ├── me.ts               Current user
│   │   ├── projects.ts         CRUD (Zod-validated, owner-scoped)
│   │   ├── tasks.ts            CRUD + project-scoped quick-add
│   │   ├── subtasks.ts         Toggle + edit + delete
│   │   ├── inbox.ts            Capture + process → task / delete
│   │   └── briefing.ts         Ollama NDJSON pass-through (pluggable provider)
│   └── seed/demo.ts            Sandbox seed for the demo account
├── shared/
│   └── types.ts                Zod schemas + inferred types used both sides
├── src/
│   ├── App.tsx                 Router + SessionProvider + global modals
│   ├── main.tsx                React root
│   ├── auth/                   LoginScreen, SessionProvider, api client
│   ├── api/                    Thin fetch wrappers (http, projects, tasks, inbox)
│   ├── stores/                 Zustand stores (task, project, inbox, briefing, capture, projectModal)
│   ├── components/             Briefing shell + LeftRail + ViewHeader + form modals + primitives
│   ├── views/
│   │   ├── TodayView.tsx       Greeting, briefing card, Today + Inbox lanes
│   │   ├── InboxView.tsx       Process-the-day's-catch surface (j/k/⏎/d)
│   │   ├── ProjectView.tsx     Live project page with inline edit + quick-add
│   │   ├── TaskDetailView.tsx  Single-task detail (in progress for v2)
│   │   ├── WeekView.tsx        Mon–Fri calendar grid
│   │   └── WeeklyReviewView.tsx Live wins, project health, stale items + 8-step ritual
│   ├── tweaks/                 TweaksProvider + floating panel + controls
│   └── styles/globals.css      Editorial design tokens (paper / ink / accent / fonts)
├── public/                     Static assets
├── docker-compose.yml          Postgres 16
├── drizzle.config.ts
├── vite.config.ts
├── tsconfig*.json
└── package.json
```

---

## Design language

A warm-paper, editorial UI — closer to a newspaper than a SaaS dashboard.

- Background `--paper` `#f6f3eb`, text `--ink` `#15140f`, accent (default) `--accent` `#a85a2c` (copper).
- Display: **Newsreader** serif (italic for AI voice). Body: **Geist** sans. Code/meta: **Geist Mono**.
- Inline styles + CSS variables only — no Tailwind, no CSS-in-JS, no component library. The visual system is small enough to keep readable, and tokens are easy to retheme via the Tweaks panel.

---

## Auth modes

| Mode | When to use | What you need |
| --- | --- | --- |
| **Demo** | Try the app with seed data; no commitment | Nothing |
| **Local email** | Single-user dev on your machine | Just an email — no password, no SMTP |
| **Google OAuth** | Real personal use | `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`; see `docs/setup.md` |

Sessions are cookie-based (`simply-do.session` for the local flows; Better Auth's session cookie for OAuth). Auth state hydrates once at app load via `/api/me`.

---

## Roadmap

Tracked in `docs/plan-v1.md` (Done) and `docs/plan-v2.md` (in progress). Current phase order:

- ✅ **v1** — Today + Inbox + capture/process + task mutations + real Gemma + local email auth + error toasts + keyboard nav.
- ✅ **v2-1** — Projects CRUD (server + store + modal + LeftRail + ProjectView).
- ⏳ **v2-2** — Task Detail real (editable title/notes/priority/status/due/project picker/subtasks; drop fake panels).
- ⏳ **v2-3** — AI provider abstraction (Gemini default + OpenAI + Anthropic + Ollama, all behind one stream interface).
- ✅ **v2-4** — Weekly Review real (live wins, project health, stale items, 8-step ritual; first-run order-of-play for new users).
- ⏳ **v2-5** — Onboarding polish (welcome banner on empty Today, FAQ in LoginScreen).

Out of scope for now: real Linear / Jira / Gmail / Slack integrations, drag-to-reorder, mobile/responsive (the design is desktop-only at 1320px artboards), multi-device sync.

---

## Contributing & development notes

- `npm run typecheck` and `npm run build` must stay clean before commits. There's no CI yet, but the typecheck script doubles for client + server tsconfigs.
- Shared types live in `shared/types.ts` as Zod schemas; both client and server import from there.
- Mutations follow an **optimistic-with-rollback** pattern in the Zustand stores. Don't add server round-trips before updating local state unless you genuinely need the server's value (e.g., a newly-generated UUID).
- The server proxies Ollama; don't reach into the browser-to-Ollama path directly — it lets us swap providers without touching the client.

---

## License

Personal project; no license specified yet.
