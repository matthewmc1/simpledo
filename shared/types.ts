import { z } from "zod";

export const PrioritySchema = z.enum(["P1", "P2", "P3", "P4"]);
export type Priority = z.infer<typeof PrioritySchema>;

export const StatusSchema = z.enum([
  "inbox",
  "today",
  "next",
  "waiting",
  "someday",
  "done",
]);
export type Status = z.infer<typeof StatusSchema>;

export const TaskKindSchema = z.enum(["feature", "bug", "chore"]);
export type TaskKind = z.infer<typeof TaskKindSchema>;

export const IntegrationSchema = z.enum([
  "linear",
  "jira",
  "gmail",
  "email",
  "slack",
  "calendar",
  "manual",
]);
export type Integration = z.infer<typeof IntegrationSchema>;

// ── Entities (response shapes — JSON-safe; timestamps are ISO strings) ──

export const ProjectSchema = z.object({
  id: z.string(),
  name: z.string(),
  color: z.string(),
  description: z.string(),
  source: z.string().nullable(),
  archived: z.boolean(),
  /** Definition-of-done items every release in this project should satisfy. */
  releaseChecklist: z.array(z.string()),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Project = z.infer<typeof ProjectSchema>;

export const SubtaskSchema = z.object({
  id: z.string(),
  taskId: z.string(),
  title: z.string(),
  done: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Subtask = z.infer<typeof SubtaskSchema>;

export const TaskSchema = z.object({
  id: z.string(),
  title: z.string(),
  notes: z.string(),
  priority: PrioritySchema,
  status: StatusSchema,
  due: z.string().nullable(),
  dueText: z.string().nullable(),
  projectId: z.string().nullable(),
  releaseId: z.string().nullable(),
  /** Last release this task was tagged to before being moved. Lets a release
   *  detail page show "items originally planned but moved out". */
  previousReleaseId: z.string().nullable(),
  clientDescription: z.string(),
  /** feature / bug / chore — used for release quality rollups. */
  kind: TaskKindSchema,
  /** Legacy regression boolean. Prefer `regressionOfReleaseId` (an explicit
   *  link to the release this bug regresses against). */
  isRegression: z.boolean(),
  /** When set on a bug, identifies the earlier release whose shipped
   *  behaviour broke. */
  regressionOfReleaseId: z.string().nullable(),
  integration: z.string().nullable(),
  integrationId: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  subtasks: z.array(SubtaskSchema),
});
export type Task = z.infer<typeof TaskSchema>;

// ── Releases ───────────────────────────────────────────────────────────────

/** MAJOR.MINOR.PATCH — no pre-release suffix yet. */
export const SemverSchema = z.string().regex(/^\d+\.\d+\.\d+$/, "Version must be MAJOR.MINOR.PATCH");
export type Semver = z.infer<typeof SemverSchema>;

export const ReleaseSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  version: z.string(),
  name: z.string().nullable(),
  notes: z.string(),
  releasedAt: z.string().nullable(),
  /** Optional customer tags — who was waiting for this release. */
  customers: z.array(z.string()),
  /** Definition-of-done items for this release. Must all appear in
   *  `checklistCompleted` before the release can be marked released. */
  checklistItems: z.array(z.string()),
  /** Subset of `checklistItems` that's been ticked off. */
  checklistCompleted: z.array(z.string()),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Release = z.infer<typeof ReleaseSchema>;

export const ReleasesResponseSchema = z.object({ releases: z.array(ReleaseSchema) });

export const CreateReleaseInputSchema = z.object({
  version: SemverSchema,
  name: z.string().max(120).optional(),
  notes: z.string().max(5000).optional(),
  releasedAt: z.string().datetime().nullable().optional(),
  customers: z.array(z.string().min(1).max(120)).max(50).optional(),
});
export type CreateReleaseInput = z.infer<typeof CreateReleaseInputSchema>;

export const UpdateReleaseInputSchema = z
  .object({
    version: SemverSchema,
    name: z.string().max(120).nullable(),
    notes: z.string().max(5000),
    releasedAt: z.string().datetime().nullable(),
    customers: z.array(z.string().min(1).max(120)).max(50),
    checklistItems: z.array(z.string().min(1).max(200)).max(30),
    checklistCompleted: z.array(z.string().min(1).max(200)).max(30),
  })
  .partial();
export type UpdateReleaseInput = z.infer<typeof UpdateReleaseInputSchema>;

export const InboxItemSchema = z.object({
  id: z.string(),
  text: z.string(),
  source: z.string(),
  fromLabel: z.string().nullable(),
  capturedAt: z.string(),
  createdAt: z.string(),
});
export type InboxItem = z.infer<typeof InboxItemSchema>;

// ── Response envelopes ────────────────────────────────────────────────────

export const ProjectsResponseSchema = z.object({ projects: z.array(ProjectSchema) });
export const TasksResponseSchema = z.object({ tasks: z.array(TaskSchema) });
export const InboxResponseSchema = z.object({ items: z.array(InboxItemSchema) });

// ── Project inputs ────────────────────────────────────────────────────────

export const CreateProjectInputSchema = z.object({
  name: z.string().min(1).max(120),
  color: z.string().max(40).optional(),
  description: z.string().max(2000).optional(),
});
export type CreateProjectInput = z.infer<typeof CreateProjectInputSchema>;

export const UpdateProjectInputSchema = z
  .object({
    name: z.string().min(1).max(120),
    color: z.string().max(40),
    description: z.string().max(2000),
    archived: z.boolean(),
    releaseChecklist: z.array(z.string().min(1).max(200)).max(30),
  })
  .partial();
export type UpdateProjectInput = z.infer<typeof UpdateProjectInputSchema>;

// ── Query / input schemas ─────────────────────────────────────────────────

/** Pagination + filter query for GET /api/tasks. Defaults are conservative
 *  so unbounded clients can't accidentally pull millions of rows. */
export const TasksQuerySchema = z.object({
  status: StatusSchema.optional(),
  projectId: z.string().uuid().nullable().optional(),
  releaseId: z.string().uuid().nullable().optional(),
  /** ISO timestamps bracketing the `due` column. Used by the calendar. */
  dueFrom: z.string().datetime().optional(),
  dueTo: z.string().datetime().optional(),
  /** Page size (server caps it). */
  limit: z.coerce.number().int().min(1).max(500).optional(),
  /** Cursor = ISO timestamp of the last `created_at` seen, descending. */
  cursor: z.string().datetime().optional(),
});
export type TasksQuery = z.infer<typeof TasksQuerySchema>;

export const TasksPaginatedResponseSchema = z.object({
  tasks: z.array(TaskSchema),
  nextCursor: z.string().nullable(),
});

export const UpdateTaskInputSchema = z
  .object({
    title: z.string().min(1).max(500),
    notes: z.string().max(10_000),
    priority: PrioritySchema,
    status: StatusSchema,
    due: z.string().datetime().nullable(),
    dueText: z.string().max(80).nullable(),
    projectId: z.string().uuid().nullable(),
    releaseId: z.string().uuid().nullable(),
    clientDescription: z.string().max(500),
    kind: TaskKindSchema,
    isRegression: z.boolean(),
    regressionOfReleaseId: z.string().uuid().nullable(),
  })
  .partial();
export type UpdateTaskInput = z.infer<typeof UpdateTaskInputSchema>;

export const CreateTaskInputSchema = z.object({
  title: z.string().min(1).max(500),
  status: StatusSchema.optional(),
  priority: PrioritySchema.optional(),
  projectId: z.string().uuid().nullable().optional(),
  releaseId: z.string().uuid().nullable().optional(),
  notes: z.string().max(10_000).optional(),
  clientDescription: z.string().max(500).optional(),
  kind: TaskKindSchema.optional(),
});
export type CreateTaskInput = z.infer<typeof CreateTaskInputSchema>;

export const UpdateSubtaskInputSchema = z
  .object({
    title: z.string().min(1).max(500),
    done: z.boolean(),
  })
  .partial();
export type UpdateSubtaskInput = z.infer<typeof UpdateSubtaskInputSchema>;

export const CreateSubtaskInputSchema = z.object({
  title: z.string().min(1).max(500),
});
export type CreateSubtaskInput = z.infer<typeof CreateSubtaskInputSchema>;

// ── Auth ──────────────────────────────────────────────────────────────────

export const EmailSignInSchema = z.object({
  email: z.string().email(),
});
export type EmailSignIn = z.infer<typeof EmailSignInSchema>;

// ── Inbox capture / processing ────────────────────────────────────────────

export const CaptureInputSchema = z.object({
  text: z.string().min(1).max(1000),
  source: IntegrationSchema.optional(),
});
export type CaptureInput = z.infer<typeof CaptureInputSchema>;

export const ProcessDestinationSchema = z.enum([
  "today",
  "next",
  "someday",
  "done",
  "delete",
]);
export type ProcessDestination = z.infer<typeof ProcessDestinationSchema>;

export const ProcessInputSchema = z.object({
  destination: ProcessDestinationSchema,
  priority: PrioritySchema.optional(),
  projectId: z.string().uuid().nullable().optional(),
});
export type ProcessInput = z.infer<typeof ProcessInputSchema>;
