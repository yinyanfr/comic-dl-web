import { index, route, type RouteConfig } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("shelf", "routes/shelf.tsx"),
  route("tasks/events", "routes/task-events.ts"),
] satisfies RouteConfig;
