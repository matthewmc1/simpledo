import { boolean, index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

// ── Better Auth tables ─────────────────────────────────────────────────────
// Field names match Better Auth's default expectations so its Drizzle adapter
// (configured with provider: "pg") binds without overrides.

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  isDemo: boolean("is_demo").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const session = pgTable("session", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  token: text("token").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const account = pgTable("account", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ── App tables ─────────────────────────────────────────────────────────────

export const project = pgTable(
  "project",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    color: text("color").notNull().default("#807d72"),
    description: text("description").notNull().default(""),
    source: text("source"), // linear | jira | gmail | slack | calendar | null
    archived: boolean("archived").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    // Almost every project query filters by user_id + archived.
    byUserArchived: index("project_user_archived_idx").on(t.userId, t.archived),
  }),
);

export const release = pgTable(
  "release",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id").notNull().references(() => project.id, { onDelete: "cascade" }),
    version: text("version").notNull(), // MAJOR.MINOR.PATCH
    name: text("name"), // optional codename
    notes: text("notes").notNull().default(""),
    releasedAt: timestamp("released_at", { withTimezone: true }), // null = planned
    // Optional customer tags — who was waiting for this release. Empty array
    // by default. Stored as a Postgres text[] (Drizzle .array()).
    customers: text("customers").array().notNull().default([]),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    // Listing releases per project + uniqueness check on (project, version).
    byProject: index("release_project_idx").on(t.projectId),
  }),
);

export const task = pgTable(
  "task",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    notes: text("notes").notNull().default(""),
    priority: text("priority").notNull().default("P3"), // P1 | P2 | P3 | P4
    status: text("status").notNull().default("inbox"), // inbox | today | next | waiting | someday | done
    due: timestamp("due", { withTimezone: true }),
    dueText: text("due_text"),
    projectId: uuid("project_id").references(() => project.id, { onDelete: "set null" }),
    releaseId: uuid("release_id").references(() => release.id, { onDelete: "set null" }),
    /** The release this task was *previously* attached to before being moved.
     *  Lets the release detail page surface "items originally planned for
     *  this release but moved to a later one". Set automatically server-side
     *  whenever releaseId changes. */
    previousReleaseId: uuid("previous_release_id").references(() => release.id, { onDelete: "set null" }),
    // Client-facing one-line summary used in changelogs. Falls back to title if blank.
    clientDescription: text("client_description").notNull().default(""),
    integration: text("integration"),
    integrationId: text("integration_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    // Per-status list queries (Today, Next, Waiting, Someday, Inbox, Done).
    byUserStatus: index("task_user_status_idx").on(t.userId, t.status),
    // ProjectView scoped list.
    byUserProject: index("task_user_project_idx").on(t.userId, t.projectId),
    // Release timelines (tasks-in-release).
    byUserRelease: index("task_user_release_idx").on(t.userId, t.releaseId),
    // Weekly review stale + wins (range scans over updated_at).
    byUserUpdated: index("task_user_updated_idx").on(t.userId, t.updatedAt),
    // Calendar range queries.
    byUserDue: index("task_user_due_idx").on(t.userId, t.due),
  }),
);

export const subtask = pgTable(
  "subtask",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    taskId: uuid("task_id").notNull().references(() => task.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    done: boolean("done").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    // Subtask fan-out on task detail + cascade delete.
    byTask: index("subtask_task_idx").on(t.taskId),
  }),
);

export const inboxItem = pgTable(
  "inbox_item",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    text: text("text").notNull(),
    source: text("source").notNull().default("manual"),
    fromLabel: text("from_label"),
    capturedAt: timestamp("captured_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    byUserCaptured: index("inbox_user_captured_idx").on(t.userId, t.capturedAt),
  }),
);

export type User = typeof user.$inferSelect;
export type Project = typeof project.$inferSelect;
export type Release = typeof release.$inferSelect;
export type Task = typeof task.$inferSelect;
export type Subtask = typeof subtask.$inferSelect;
export type InboxItem = typeof inboxItem.$inferSelect;
