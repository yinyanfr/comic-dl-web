import { index, route, type RouteConfig } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("shelf", "routes/shelf.tsx"),
  route("extensions", "routes/extensions.tsx"),
  route("catalog", "routes/catalog.tsx"),
  route("tasks/events", "routes/task-events.ts"),
  route("tasks/status", "routes/task-status.ts"),
  route("tasks/:id/results", "routes/task-results.ts"),
] satisfies RouteConfig;
