import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { env } from "./env";
import { authRoutes } from "./routes/auth";
import { briefingRoutes } from "./routes/briefing";
import { googleRoutes } from "./routes/google";
import { inboxRoutes } from "./routes/inbox";
import { meRoutes } from "./routes/me";
import { projectRoutes } from "./routes/projects";
import { releaseRoutes } from "./routes/releases";
import { subtaskRoutes } from "./routes/subtasks";
import { taskRoutes } from "./routes/tasks";
import { HTTPError, resolveSession, type Env } from "./middleware/session";

const app = new Hono<Env>();

app.use(
  "*",
  cors({
    origin: env.APP_URL,
    credentials: true,
  }),
);

app.use("*", resolveSession);

app.route("/api", authRoutes);
app.route("/api", meRoutes);
app.route("/api", projectRoutes);
app.route("/api", releaseRoutes);
app.route("/api", taskRoutes);
app.route("/api", subtaskRoutes);
app.route("/api", inboxRoutes);
app.route("/api", briefingRoutes);
app.route("/api", googleRoutes);

app.onError((err, c) => {
  if (err instanceof HTTPError) {
    return c.json({ error: err.message }, err.status as 400 | 401 | 403 | 404 | 500);
  }
  console.error(err);
  return c.json({ error: "Internal Server Error" }, 500);
});

app.notFound((c) => c.json({ error: "Not Found" }, 404));

serve({ fetch: app.fetch, port: env.API_PORT }, (info) => {
  console.log(`[api] listening on http://localhost:${info.port}`);
});
