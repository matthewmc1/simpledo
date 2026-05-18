# Plan — Simple Do · v1 (functioning app with state)

> Living document. The current code is a static prototype of the Briefing Room
> views with hard-coded fixtures. This plan turns it into a usable single-user
> app: persistent state in Postgres, Google login, the core capture →
> inbox → today loop, and a real Gemma briefing.

## Decisions locked in

| | |
| --- | --- |
| **Persistence** | Local Postgres (Docker), schema-managed by Drizzle. Designed to be portable to hosted Postgres/Supabase later. |
| **Auth** | Google OAuth via Better Auth. Sessions stored in Postgres. |
| **v1 scope** | Capture → Inbox → Today (the core working loop). All other views keep their fixture data until v2. |
| **Integrations** | Mocked for v1 (fixture data stays editable). No Linear/Jira/Gmail/Slack/Calendar wiring. |
| **AI** | Real Gemma via local Ollama (`gemma2:2b`). Browser → `http://localhost:11434/api/generate` direct, with `OLLAMA_ORIGINS=http://localhost:5173` set when launching Ollama. |
| **Client state** | Zustand for UI + optimistic mirrors of server state. No TanStack Query in v1; we call `fetch` from typed client helpers. |
| **Validation** | Zod schemas in `shared/` consumed by both client and server. |
| **Shortcuts** | `react-hotkeys-hook` for ⌘N capture, j/k navigation in inbox, ⌘⏎ accept. |
| **Server** | Hono on Node, in-process during dev (Vite proxies `/api/*`). |
| **ORM** | Drizzle + `pg`. `drizzle-kit push` in dev, generated migrations for prod. |

## Repo layout (target)

```
simply-do/
├── src/                          # Vite client (already exists)
│   ├── views/                    # existing 6 views — Today + Inbox wired to API in v1
│   ├── components/
│   ├── stores/                   # NEW — Zustand stores (taskStore, inboxStore, captureStore)
│   ├── api/                      # NEW — typed fetch helpers (tasks.ts, inbox.ts, briefing.ts)
│   ├── auth/                     # NEW — login/logout + session hook
│   ├── tweaks/                   # existing
│   └── data/fixtures.ts          # existing — stays around for unwired views
├── server/                       # NEW — Hono API
│   ├── index.ts                  # app entry; mounts routes; in dev started by tsx
│   ├── routes/
│   │   ├── tasks.ts              # GET/POST/PATCH/DELETE /api/tasks
│   │   ├── inbox.ts              # GET/POST/PATCH/DELETE /api/inbox
│   │   ├── projects.ts           # GET /api/projects (read-only in v1)
│   │   └── auth.ts               # Better Auth handler mount
│   ├── db/
│   │   ├── client.ts             # drizzle(pg) singleton
│   │   └── schema.ts             # tables — see below
│   └── auth.ts                   # Better Auth config (google provider, drizzle adapter)
├── shared/                       # NEW — types + zod schemas
│   ├── task.ts
│   ├── inbox.ts
│   └── project.ts
├── drizzle/                      # NEW — generated SQL migrations
├── docker-compose.yml            # NEW — local postgres:16
├── drizzle.config.ts             # NEW
├── .env.example                  # NEW — DATABASE_URL, GOOGLE_CLIENT_*, BETTER_AUTH_SECRET
├── vite.config.ts                # MODIFIED — server.proxy /api → :4000
├── index.html
├── package.json                  # adds: hono, drizzle-orm, pg, better-auth, zustand, zod, react-hotkeys-hook, tsx, drizzle-kit, @types/pg
└── tsconfig.json                 # path alias `@shared/*` → `shared/*`
```

Dev workflow: two `npm` scripts in parallel.
- `npm run dev` — concurrently runs `dev:web` (Vite on 5173) and `dev:api` (tsx watch on 4000).
- `npm run db:up` — `docker compose up -d` for Postgres.
- `npm run db:push` — `drizzle-kit push` (dev) to sync schema.
- `npm run db:migrate` — for prod-style migrations (out of v1 scope but configured).

## Data model

All tables include `id uuid pk default gen_random_uuid()`, `created_at timestamptz default now()`, `updated_at timestamptz default now()`, and `user_id uuid references user(id) on delete cascade` (except `user` / Better Auth tables themselves).

| Table | Purpose | Notable columns |
| --- | --- | --- |
| `user`, `session`, `account`, `verification` | Better Auth managed | (per Better Auth's Drizzle schema — we don't hand-write) |
| `project` | Project label | `name text not null`, `color text`, `source text null` (linear/jira/…), `archived bool` |
| `task` | A doable item | `title text not null`, `notes text`, `priority text check in ('P1','P2','P3','P4')`, `status text check in ('inbox','today','next','waiting','someday','done')`, `due timestamptz null`, `due_text text null` (e.g. "Today · 12:00" for display), `project_id uuid null`, `integration text null`, `integration_id text null`. **Ordering by `created_at` only — no `position` column in v1.** |
| `subtask` | Nested under task | `task_id uuid not null`, `title text not null`, `done bool`. Ordered by `created_at`. |
| `inbox_item` | Raw capture before processing | `text text not null`, `source text` (manual/slack/gmail/…), `from text null`, `captured_at timestamptz` |

The fixture data in `src/data/fixtures.ts` defines the same shape — the Zod schemas in `shared/` are the single source of truth and the fixtures will be re-typed against them. When the user first logs in with an empty database, the API seeds Mira's day so the views aren't blank. (Optional — flag-gated.)

## API surface (v1)

All endpoints require an authenticated session. Bodies/responses validated with Zod.

| Method | Path | Body | Returns |
| --- | --- | --- | --- |
| `GET` | `/api/me` | — | `{ user }` |
| `GET` | `/api/projects` | — | `Project[]` |
| `GET` | `/api/tasks?status=today\|inbox\|…` | — | `Task[]` (with subtasks) |
| `POST` | `/api/tasks` | `CreateTaskInput` | `Task` |
| `PATCH` | `/api/tasks/:id` | `UpdateTaskInput` (partial) | `Task` |
| `DELETE` | `/api/tasks/:id` | — | `{ ok: true }` |
| `GET` | `/api/inbox` | — | `InboxItem[]` |
| `POST` | `/api/inbox` | `{ text, source? }` | `InboxItem` (capture) |
| `POST` | `/api/inbox/:id/process` | `{ destination: 'today'\|'next'\|'someday'\|'do-now'\|'delete', taskOverrides?: Partial<CreateTaskInput> }` | `{ task?: Task, deleted?: true }` (converts inbox item to a task or drops it) |
| `POST` | `/api/briefing` | `{ context?: 'today' }` | `{ headline, summary, signals[], recommend[] }` — streams from Ollama |

Briefing endpoint proxies the prompt to Ollama. **Decided: server-proxied** so the prompt is versioned in git and the provider (Ollama / Anthropic / OpenAI) can be swapped without touching the client. The server reads `GEMMA_BASE_URL` (default `http://localhost:11434`) and `GEMMA_MODEL` (default `gemma2:2b`); response is streamed (`text/event-stream`) so the headline appears progressively.

## Auth flow

1. Unauthenticated user lands on any route → `useSession()` returns null → app renders a minimal `LoginScreen` with two options:
   - **Continue with Google** → Better Auth Google flow.
   - **Try the demo** → `POST /api/auth/demo` creates a fresh demo user (`is_demo: true` on `user`), seeds Mira's fixtures, sets the same session cookie. No OAuth round-trip.
2. Google path: Better Auth redirects to Google → callback hits `/api/auth/callback/google` → creates `user`+`account`+`session` rows → sets HTTP-only `better-auth.session` cookie → redirects to `/`. **No seeding** — real users start with an empty inbox and Today list.
3. All subsequent `/api/*` requests carry the cookie; Hono middleware resolves the session and attaches `c.set('user', user)`.

`shared/auth.ts` exports a `useSession()` hook for the client and a `requireUser(c)` helper for the server. Demo users are otherwise indistinguishable from real users at the API layer; we may later add a TTL job to clean them up.

## What changes in the existing client code

- **`TodayView`** — replace `TODAY_TASKS.slice(0, 4)` with `useTaskStore(s => s.today)`; replace the `INBOX` map with `useInboxStore(s => s.items)`; checkbox click calls `taskStore.toggleDone(id)` which optimistically updates + PATCHes. Briefing card pulls from `useBriefingStore`.
- **`InboxView`** — items come from `useInboxStore`; the per-row ✓ button calls `inboxStore.process(id, suggestion.destination)`; "Apply all suggestions" iterates. Filter chips become real filters. Gemma suggestion text stays mocked in v1 (real Gemma per-item suggestions are a v2 task; the top-of-page Gemma banner uses the real model).
- **`ProjectView`, `TaskDetailView`, `WeekView`, `WeeklyReviewView`** — keep their current fixture-driven implementations in v1. They'll get wired up in v2 alongside the schema work for projects/calendar/review state.
- **`LeftRail`** — the Today / Inbox counts become live (`useTaskStore`, `useInboxStore`); other counts stay static.
- **Capture (⌘N)** — new floating `CaptureModal` component (variant A from the original prototype's `app.jsx:96` — inline-at-top), mounted at the app root, opened via `react-hotkeys-hook`. Posts to `/api/inbox`. Closes on `Esc` or `Enter`.
- **`App.tsx`** — wrap `BrowserRouter` in a `SessionProvider`. If no session → `<LoginScreen/>` instead of routes. Mount `<CaptureModal/>` outside `<Routes/>` so it works on any view.

## Implementation phases

Roughly in this order. Each phase is independently testable.

1. **Backend skeleton** — docker-compose Postgres, drizzle schema, Better Auth + Google OAuth, `GET /api/me` working, login screen on the client. *Definition of done: I can log in with Google and see my email in the UI.* ✅ **Done 2026-05-12.**
2. **Projects + Tasks read path** — `/api/projects`, `/api/tasks?status=today`, `/api/inbox`, Zustand stores, swap `TodayView` and `InboxView` (read only) to live data, LeftRail counts live. *Definition of done: Today view renders from Postgres.* ✅ **Done 2026-05-12** — verified end-to-end via Playwright: demo sign-in seeds Mira, TodayView shows 4 tasks (with subtasks) + 5 inbox items, LeftRail shows Today=4 / Inbox=5 / Next=1, InboxView shows all 5 items with text-matched Gemma suggestions.
3. **Task mutations** — toggle done, edit title, change priority. Optimistic UI through Zustand. (No drag-reorder in v1.) *Definition of done: I can check off a task and reload; it stays checked.* ✅ **Done 2026-05-12.** Endpoints: `PATCH/DELETE /api/tasks/:id`, `PATCH/DELETE /api/subtasks/:id` (Zod-validated, ownership-checked). Store mutations: `toggleDone`, `setTitle`, `cyclePriority`, `toggleSubtask` — all optimistic with rollback on failure. UI: checkbox toggles, click-to-edit title (Enter saves, Esc cancels, blur saves), priority pill cycles P1→P2→P3→P4. Verified via Playwright: priority cycled, title renamed, task checked off, subtask checked — all persisted across reload, LeftRail Today count dropped 3→2 correctly.
4. **Inbox path** — `/api/inbox` GET/POST/DELETE, `POST /api/inbox/:id/process`, capture modal triggered by ⌘N and the "Capture anything" sidebar pill, `InboxView` per-row actions wired (✓ accept Gemma's suggestion, → send to Next, × delete) plus an "Apply all suggestions" button. *Definition of done: ⌘N captures land in Inbox; processing them creates real Tasks.* ✅ **Done 2026-05-12.** Verified via curl + Playwright: captured "Prep for design review w/ Wren" via the modal (Inbox 5→6), accepted Gemma's suggestion on a single item (moved to Today), batch Apply-all converted all 5 demo items to their suggested destinations (3 today, 1 next, 1 someday) with LeftRail counts settling at Today 7, Inbox 0, Next 2, Someday 1. Optimistic UI rolls back on server failure; a safety re-fetch closes the LeftRail sync gap after batch ops.
5. **Real Gemma briefing** — `/api/briefing` proxies Ollama, prompt built from the user's actual Today + Inbox state. Streams into the briefing card on `TodayView`. AI-prominence "loud" mode triggers a re-brief on demand. *Definition of done: The headline + summary on Today actually describe today's tasks.* ✅ **Done 2026-05-12.** Server reads `GEMMA_BASE_URL`/`GEMMA_MODEL` (default `gemma3:4b` — what the user already had pulled). Endpoint joins tasks + projects, builds a `HEADLINE:` / `SUMMARY:` prompt, asks Ollama with `stream:true`, and pipes the NDJSON body straight back. Client `briefingStore` consumes the stream via `fetch().body.getReader()`, parses sections as tokens arrive, and updates the briefing card progressively. Offline path (Ollama down → 502) shows "Gemma offline · showing example" and falls back to the fixture text. Loud-mode "✦ Ask Gemma" button re-runs `generate()`. Verified via curl (52 stream events → coherent headline + summary naming real tasks) and Playwright (real briefing referencing the user's actual Today task list; click "Ask Gemma" produces a fresh, different summary). Signals + Order-of-play chips remain mocked from `AI_BRIEFING` — extending Gemma to produce those is a v2 task.
6. **Polish + local email auth** — keyboard nav in Inbox, error toasts, empty-state copy, plus a new local email-only sign-in path (no password, dev only). ✅ **Done 2026-05-12.** Added `POST /api/auth/email` (Zod-validated `{ email }` → upsert user → issue a session cookie). Cookie renamed from `simply-do.demo_session` → `simply-do.session` since demo and email-auth both produce local sessions. `LoginScreen` re-laid out: email field is primary (autofocus, submit on Enter), Google + Demo demoted under an "or" divider. Inbox keyboard nav (`j`/`k`/`↑`/`↓` to move, `Enter` to accept Gemma's suggestion, `d` to delete) wired with `react-hotkeys-hook`; selection rendered as an accent left-stripe + tinted background; an offscreen focus sink on mount pulls focus from any LeftRail link so `Enter` doesn't activate a stray anchor. `<ErrorToasts/>` mounted globally — subscribes to every store's `error` field and surfaces them as dismissible bottom-left toasts. Verified end-to-end: email sign-in (`matt@local.dev` → empty Today/Inbox), capture via ⌘N, j-press moves selection, Enter accepts, d deletes; error toast displays correctly when a store sets `error`.

Anything below this line is v2: real integrations, project view CRUD, task detail editor, calendar week real events, weekly review state, multi-device sync, mobile.

## Setup steps the user runs once

1. `brew install ollama && ollama pull gemma2:2b`
2. Launch Ollama with `OLLAMA_ORIGINS="http://localhost:5173,http://localhost:4000" ollama serve` (or set the env var permanently via launchctl).
3. Create a Google OAuth client in GCP (Web application, redirect `http://localhost:4000/api/auth/callback/google`); paste client ID + secret into `.env.local`.
4. `npm install`
5. `npm run db:up && npm run db:push`
6. `npm run dev`

I'll write a `docs/setup.md` covering these once we're building.

## Decisions resolved (2026-05-12)

- **Briefing endpoint:** server-proxied so we can swap providers later without touching the client.
- **Seeding:** demo users get Mira's fixtures via "Try the demo" on the login screen. Real (Google) accounts start empty.
- **Ordering:** creation-order only in v1. No drag-and-drop.
- **GCP OAuth:** code ships expecting `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in `.env.local`. `docs/setup.md` will walk through creating the OAuth client (Web application, redirect `http://localhost:4000/api/auth/callback/google`).

Ready to start Phase 1.
