# Plan — Simple Do · v2

> Builds on v1. v1 closed with: Today live, Inbox live with capture/process, task mutations, real Gemma briefing, local email auth, error toasts, keyboard nav. This document covers the next slice of work — making Projects, Task Detail, Weekly Review real, swapping the AI default to Gemini with OpenAI/Anthropic alternatives, and turning new-user empty states into useful guidance.

## Decisions locked in

| | |
| --- | --- |
| **AI default** | Google Gemini (`gemini-2.5-flash-lite` — cheapest/quickest in the Flash family). Provider abstracted so OpenAI and Anthropic can be swapped via `.env.local`. Ollama support stays for offline dev. |
| **Cheap-model policy** | Each provider has a baked-in cheap default. We never default to a flagship model. |
| **Project / Task-detail depth** | Edit the data we own (title, notes, priority, status, due, project link, subtasks, project name/color/description). Drop the design's fake Linear card / activity feed / "people involved" panel — those need real integrations and would be deceptive without them. |
| **Empty Projects in LeftRail** | Dashed "+ New project" CTA in place of the list when none exist, mirroring the "Capture anything" pill above. |
| **Out of scope** | Calendar week view, real integrations (Linear/Jira/Gmail/Slack), multi-device sync, drag-to-reorder. |

## Phase order

### v2-1 · Projects CRUD ✅ Done 2026-05-12

- **Server**: `POST /api/projects`, `PATCH /api/projects/:id`, `DELETE /api/projects/:id`. Zod inputs. `delete` cascades — DB `task.project_id` is already `ON DELETE SET NULL`. Returns the project.
- **Shared**: `CreateProjectInputSchema`, `UpdateProjectInputSchema`.
- **Client store**: `useProjectStore` gains `createProject(input)`, `setName(id, name)`, `setColor(id, color)`, `setDescription(id, desc)`, `archiveProject(id)`, `deleteProject(id)` — all optimistic with rollback.
- **Project create modal**: `<ProjectCreateModal/>` opened by the LeftRail "+" button and the empty-state CTA. Form: name (required), color (4-swatch picker matching tweaks-panel style), description (optional). Submit calls `createProject`.
- **LeftRail**: when `projects.length === 0`, render a dashed "+ New project" button in place of the list; otherwise existing list. "+" button next to the section header always opens the create modal.
- **ProjectView**: replace fixture data with live data via `useProjectStore` + filtered tasks via `useTaskStore`. Sections:
  - Header — editable name (click to edit), color swatch (cycle on click), eyebrow with creation timestamp.
  - Description — click-to-edit serif italic block.
  - Progress bar — done / total computed from tasks.
  - **Active** task list (statuses `today`/`next`/`waiting`).
  - **Waiting on others** — `status = waiting` only.
  - **Done · this week** — `status = done` AND `updated_at` within last 7 days.
  - Right column: drop Gemma read + linked items + activity. Keep the right column empty for now (or just show a "Quick add" form for tasks in this project — TBD during impl).
- **Schema migration**: `project` table needs a `description text not null default ''` column (no migration system yet — `drizzle-kit push --force` handles it in dev).

DoD: I can click "+ New project", create "Inbox cleanup", see it in the rail, click into it, see an empty task list, and create a task inside it via Quick add.

### v2-2 · Task Detail real

- Route `/task/:id` looks up the task in `useTaskStore` (load if missing). 404 → redirect to `/`.
- Editable on the detail page (each via `useTaskStore` mutations we already have, plus new ones):
  - Title (inline edit, same UX as `TodayView`).
  - Notes (block-level click-to-edit, multi-line `<textarea>` swap-in).
  - Priority pill (cycles).
  - Status — segmented select (Inbox / Today / Next / Waiting / Someday / Done).
  - Due — single date input. Server stores `due` timestamptz and the display `dueText`.
  - Project — searchable picker pulling from `useProjectStore`.
  - Subtasks — add (input at bottom), toggle done, edit title (click), delete (× on hover).
- **Server**: extend `PATCH /api/tasks/:id` (already exists) — no change needed for these fields. New endpoints: `POST /api/tasks/:taskId/subtasks` (create), `DELETE /api/subtasks/:id` (already there).
- Drop: fake Linear "In progress" card, the People Involved panel, the History timeline (or replace History with a minimal "Created" / "Last updated" line).

DoD: I can open a task, edit all the fields, add and remove subtasks, reload, and the changes stick.

### v2-3 · AI provider abstraction

- New module `server/ai/providers.ts` exposing a single `streamBriefing(prompt: string): ReadableStream<Uint8Array>` that emits Ollama-style NDJSON regardless of which provider runs. Client stays unchanged.
- Env-driven selection: `AI_PROVIDER=gemini | openai | anthropic | ollama`. Each provider has its own block reading provider-specific env vars and applying its cheap default if `AI_MODEL` isn't set.
- Cheap defaults:
  - `gemini` → `gemini-2.5-flash-lite` (Google AI Studio API, `https://generativelanguage.googleapis.com/v1beta/models/{model}:streamGenerateContent`). Auth: `?key=GEMINI_API_KEY`.
  - `openai` → `gpt-4o-mini`. Auth: `Authorization: Bearer ${OPENAI_API_KEY}`. Endpoint: `https://api.openai.com/v1/chat/completions` with `stream: true`.
  - `anthropic` → `claude-haiku-4-5`. Auth: `x-api-key`, endpoint: `https://api.anthropic.com/v1/messages` with `stream: true`.
  - `ollama` → `gemma3:4b` (current behavior). Local, free.
- Each provider's stream is normalized: server reads provider's SSE/JSON-lines chunks, extracts the text delta, emits `{"response": "<text>", "done": false}\n` per chunk and a final `{"done": true}` line. The client's existing parser keeps working.
- Default provider: **gemini**. The user supplies `GEMINI_API_KEY` in `.env.local`.
- `docs/ai-providers.md` — new — explains how to switch providers, what each one costs, the cheap defaults, and how to add a new provider (the seam in `providers.ts`).

DoD: With `AI_PROVIDER=gemini` and a Gemini key in `.env.local`, the Today briefing streams from Gemini. With `AI_PROVIDER=ollama`, it streams from Ollama. Swapping requires only an env edit + restarting the api process.

### v2-4 · Weekly Review real

- Replace fixture data on `WeeklyReviewView` with live data:
  - **Wins this week**: `task` rows where `status='done'` AND `updated_at >= now() - 7 days`. Display title + project name + when.
  - **Project health**: per project, compute counts by status. Heuristic for badge:
    - on-track — has open active tasks, last updated in 7d.
    - blocked — has `waiting` tasks but no `today`/`next` motion in 7d.
    - tight — has any task with `due` within the next 7 days.
    - stale — no task updates in 14+ days.
  - **Stale & needs decision**: `task` rows where `status in ('next','waiting','someday')` AND `updated_at < now() - 14 days`. Action buttons wire to existing PATCH (Do this week → today, Defer → someday, Drop → delete).
- **8-step checklist** stays UI-only with local React state. Steps 4–8 can advance via the "Next step →" button (just increments the active index).
- **Empty state** for new users: replace each section with editorial empty copy — e.g. "No wins yet — your first completed task will land here. Try checking one off in Today." Mind-sweep capture button (already wired to ⌘N).
- **Server**: one read endpoint `GET /api/review` that returns `{ wins, stale, projectHealth }` already computed. Or — simpler — derive everything from the stores we already load. Tendency is the latter, since `taskStore` + `projectStore` hold everything we need.

DoD: I can complete a task in Today, navigate to /review, and see it as a Win. Same for stale items and project health.

### v2-5 · Onboarding polish

- New `WelcomeBanner` shown on `TodayView` when the user has zero tasks, zero inbox, AND zero projects (first-time empty state). Editorial copy guiding to ⌘N capture and "+ New project". Auto-dismisses once they have any data.
- LeftRail "+ New project" dashed CTA (already in v2-1) is the primary entry point for project creation when projects are empty.
- LoginScreen footer copy already explains "local-first"; add a one-line "What can I do here?" mini-FAQ as a `<details>` element below the auth options. Drop if it adds clutter — judge during impl.
- Document the provider story in `docs/ai-providers.md` as part of v2-3.

DoD: A brand new email-auth user sees a clearly-guided empty Today view with one obvious next step (capture or create a project), and nothing pretends to be data they don't have.

## Files added / touched (preview)

```
server/
  ai/providers.ts             NEW — adapter for gemini/openai/anthropic/ollama
  routes/projects.ts          + create/patch/delete handlers
  routes/tasks.ts             + POST /:id/subtasks endpoint
  routes/briefing.ts          delegates to ai/providers.ts
  env.ts                      + AI_PROVIDER, *_API_KEY, AI_MODEL
  db/schema.ts                + project.description column
shared/types.ts               + CreateProject / UpdateProject / CreateSubtask schemas
src/
  api/projects.ts             + create, update, delete helpers
  api/tasks.ts                + addSubtask
  stores/projectStore.ts      + create/update/delete optimistic
  stores/taskStore.ts         + addSubtask / setNotes / setStatus / setDue / setProject / deleteSubtask
  components/ProjectCreateModal.tsx   NEW
  components/briefing/LeftRail.tsx    + empty-state CTA
  views/ProjectView.tsx               REPLACES fixture with live data
  views/TaskDetailView.tsx            REPLACES fixture with live data
  views/WeeklyReviewView.tsx          REPLACES fixture with live data
  views/TodayView.tsx                 + WelcomeBanner when fully empty
docs/
  ai-providers.md             NEW
```

## Verification

End of each phase: server smoke (curl), client smoke (Playwright covering the key flows), `npm run typecheck`, `npm run build`. Documented in this plan file as each phase closes.

Ready to start v2-1.

---

## v3 backlog (queued, not started)

### v3-1 · Calendar view ✅ Done 2026-05-17

- **`WeekView` rewrite** — replaced fixture timeline with live data from `useTaskStore`. Tasks with a `due` date land in their day cell, grouped by day. Today's cell gets a copper tint and "Today" tag.
- **Across-the-board view** — header `Day / Week` toggle. Week renders Mon–Sun (7 columns); Day collapses to a single-column view of the anchor day. `←` / `Today` / `→` step the anchor by 7 days (week mode) or 1 day (day mode).
- **Gemma recommendations overlay** — new `POST /api/calendar/recommend?from=…&to=…` streams narrative planning recommendations in the same NDJSON / RECOMMEND: format as `/review`. New `calendarRecommendStore` consumes the stream and surfaces it as a banner above the grid. Banner regenerates when the visible range changes (cheap dedupe via `lastKey`). Honours the `aiProminence === "quiet"` tweak.
- **Click-through** — every chip in the grid + every unscheduled tile is a `<Link/>` to `/task/:id`. Drag-to-reschedule still out of scope.
- **Unscheduled rail** — `today/next/waiting` tasks without a due date appear as dashed pills below the grid, sorted by priority then recency. Empty state: "Everything has a date — nothing waiting in the wings."

Did not ship: per-cell `{day, hourStart, taskId, reason}` recommendations (defer to v3-1.x — needs a time-of-day on tasks first; current DatePicker only stores dates).

DoD verified: set a task's due date via TaskDetail → opened Calendar → task appears on the correct day; banner returned a narrative referencing the real task by name.

### v3-2 · Project rollouts / release timelines ✅ Done 2026-05-17

Per-project timeline view that surfaces shipped/upcoming releases under semantic versioning, with auto-generated changelogs.

- **Schema additions**:
  - `release` table — `id`, `project_id` FK, `version` (string, validated as `MAJOR.MINOR.PATCH`), `name` (optional), `released_at` (nullable; null = planned), `notes` (optional client-facing description), `created_at`, `updated_at`.
  - `task` table gains a `release_id` FK (nullable, `ON DELETE SET NULL`) and a `client_description` text column (the client-facing copy used in release notes; falls back to task title if blank).
- **ProjectView additions**:
  - **Timeline panel** — horizontal milestone strip listing every release for this project in version order, with status dots (planned/in-progress/released). Click a release to expand.
  - **Per-release card** — shows `MAJOR.MINOR.PATCH`, optional codename, release date, narrative notes, and the list of tasks tagged to that release (grouped by Major→Minor→Patch lineage).
- **Changelog generation**:
  - `GET /api/projects/:id/releases/:version/changelog` — server compiles markdown from each task's `client_description` (or title), grouped by type if we add that later, ready to copy or download.
  - Client surfaces a **Copy as Markdown** button mirroring the Weekly Review pattern.
- **Semver enforcement** — Zod schema validates `MAJOR.MINOR.PATCH`; UI disallows reordering versions or creating duplicates.
- **Cheap LLM polish** (optional second pass) — same provider abstraction can rewrite the changelog to a customer-friendly paragraph if requested per-release.

DoD: I can create a project, define versions `0.1.0`, `0.2.0`, `1.0.0`, drag tasks (or pick from a dropdown) into each release, mark a release as "released" with a date, and copy a clean markdown changelog that uses each ticket's client-facing description. Older releases stay in the timeline forever.

Shipped:

- **Schema**: `release` table (`id`, `project_id`, `version`, `name`, `notes`, `released_at`, `created_at`, `updated_at`) with FK to `project ON DELETE CASCADE`. `task.release_id` FK with `ON DELETE SET NULL` and `task.client_description text NOT NULL DEFAULT ''`.
- **Server**: `GET/POST /api/projects/:projectId/releases`, `PATCH/DELETE /api/releases/:id`, `GET /api/releases/:id/changelog` (JSON + `?format=md` text). Semver validated in Zod (`/^\d+\.\d+\.\d+$/`); duplicates across the same project return `409`. Ownership enforced via project join.
- **Client store**: `useReleaseStore` lazy-loads per-projectId, sorts semver-ascending, optimistic mutations with rollback.
- **`<ReleaseTimeline/>`**: horizontal scrolling strip with status dots (`released` green, `in-progress` copper, `planned` muted). Click a "station" to expand a per-release card with editable narrative notes, **Copy changelog** button, Mark released / Mark planned toggle, Delete.
- **Create release modal**: validates semver client-side, rejects duplicates, optional codename + notes + "Mark as released today" checkbox.
- **Task detail**: new **Client-facing description** block under Notes; new **Release** picker in the sidebar (only shown when the task has a project; lists releases for that project). Changing project clears the release association so we don't end up with cross-project links.
- **Changelog markdown**: heading `# version — codename` + release date + narrative notes + bulleted list using each task's `client_description` (or `title` fallback). One-click clipboard copy from the release card.

DoD verified: created project, made `0.1.0` (with notes), tagged two tasks each with a client description, marked it released, copied the markdown — got `# 0.1.0 — first stab` plus `## What's new` bullets exactly as expected. Duplicate-version + bad-semver paths return `409` / `400`.

---

### v3-3 · Google Calendar (read-only) ✅ Done 2026-05-17

Pull read-only Google Calendar events into the Week view alongside tasks. Email/demo users see a Connect-Google CTA; Google users with old scopes see a Reconnect CTA.

Shipped:

- **Auth scopes** — `server/auth.ts` adds `calendar.readonly` + `calendar.events.readonly` to the Google provider, with `accessType: "offline"` + `prompt: "consent"` so we always receive a refresh token.
- **Token refresh** — `server/integrations/google.ts` reads the user's `account` row, refreshes the access_token via `oauth2.googleapis.com/token` when within 60s of expiry, persists the new token + expiry. `invalid_grant` from Google surfaces as `code: "needs_reconsent"` for the UI to handle.
- **Endpoints** (all under `requireUser`):
  - `GET /api/google/status` → `{ connected, calendarScopeGranted, code? }` (412-less probe — the status endpoint always returns 200 so the UI can decide what to show).
  - `GET /api/google/calendars` → user's calendars (primary first, sorted by name otherwise).
  - `GET /api/google/events?from=ISO&to=ISO&calendarIds=` → normalized events for one or more calendars; defaults to `primary`. Per-calendar fetch failures are logged and skipped rather than failing the whole request.
- **Client** — `src/api/google.ts` thin fetch helpers + `src/stores/googleCalendarStore.ts` (status + events with range-key dedupe).
- **WeekView**:
  - Real Google events render in their day column as **ink-filled chips** (distinct from project-coloured task chips) with time prefix, "Calendar" eyebrow, and a click-out to the event's `htmlLink`.
  - Banner above the grid: green dot + "Google Calendar · N events this range" when connected; accent banner with "Connect Google" / "Reconnect Google" CTA when scope is missing.
  - Demo accounts see a separate "demo accounts can't link Google Calendar" notice.
  - Email-only users see the same Connect-Google CTA; clicking re-runs `signInGoogle()` (Better Auth will link the account if the email matches).
- **Setup docs** — `docs/setup.md` updated with the consent-screen scope list, Calendar API enablement, and the "sign out/back in" note for existing users.

Out of scope (defer to v3-3.x):
- Calendar write (create/move events).
- Multi-calendar selection UI (currently always `primary` — the API supports the param already, UI not built).
- Settings/integrations page to manage connections (rely on the in-place banner for now).

DoD verified: hit `/api/google/status` as an email-only user → `{connected:false, code:"not_connected"}`; same endpoint with a Google user not yet granted Calendar → `{connected:true, calendarScopeGranted:false, code:"needs_reconsent"}`. UI banners render the right CTA in each state.

---

## v2 closing notes — Weekly review AI snippet (2026-05-17)

- `POST /api/review` streams a narrative recap + focus paragraphs from Ollama (same provider seam as `/api/briefing`).
- Banner on `WeeklyReviewView` shows both sections in italic serif for the "paste into a write-up" use case.
- **Copy as Markdown** button on the banner outputs `# Weekly review — <date>` heading + `## Recap` + `## Focus for next week` sections.
- Prompt rewritten to produce first-person-plural narrative suitable for a status update or performance review.
