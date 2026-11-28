import { index, route, type RouteConfig } from "@react-router/dev/routes";

export default [
  index("routes/shelf.tsx"),
  route("shelf", "routes/shelf-legacy.ts"),
  route("downloads", "routes/downloads.tsx"),
  route("work", "routes/work.tsx"),
  route("extensions", "routes/extensions.tsx"),
  route("settings", "routes/settings.tsx"),
  route("settings/archive-migration", "routes/archive-migration.tsx"),
  route("catalog", "routes/catalog.tsx"),
  route("covers", "routes/covers.ts"),
  route("tasks/events", "routes/task-events.ts"),
  route("tasks/status", "routes/task-status.ts"),
  route("tasks/:id/results", "routes/task-results.ts"),
] satisfies RouteConfig;
