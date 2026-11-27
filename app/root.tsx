import "@mantine/core/styles.layer.css";
import {
  ColorSchemeScript,
  Box,
  Button,
  Container,
  Drawer,
  Group,
  Image,
  MantineProvider,
  createTheme,
  mantineHtmlProps,
  useComputedColorScheme,
  useMantineColorScheme,
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import {
  Link,
  Links,
  Meta,
  NavLink,
  Outlet,
  Scripts,
  ScrollRestoration,
} from "react-router";
import { comicsContext } from "./comic-runtime.server";
import { DownloadTasks } from "./download-tasks";
import { useTaskUpdates } from "./use-task-updates";
import type { Route } from "./+types/root";
import styles from "./routes/home.module.css";

const theme = createTheme({
  primaryColor: "blue",
  defaultRadius: "md",
});

export const links = () => [
  { rel: "icon", type: "image/png", href: "/comic-icon.png" },
];

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN" {...mantineHtmlProps}>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <ColorSchemeScript defaultColorScheme="auto" />
        <Meta />
        <Links />
      </head>
      <body>
        <MantineProvider theme={theme} defaultColorScheme="auto">
          {children}
        </MantineProvider>
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export function loader({ context }: Route.LoaderArgs) {
  return { tasks: context.get(comicsContext).downloadQueue.snapshot() };
}

function ThemeToggle() {
  const { setColorScheme } = useMantineColorScheme();
  const colorScheme = useComputedColorScheme("light", {
    getInitialValueInEffect: true,
  });
  return (
    <Button
      variant="subtle"
      onClick={() => setColorScheme(colorScheme === "dark" ? "light" : "dark")}
    >
      <Box component="span" darkHidden>
        夜间模式
      </Box>
      <Box component="span" lightHidden>
        日间模式
      </Box>
    </Button>
  );
}

export default function App({ loaderData }: Route.ComponentProps) {
  const [opened, drawer] = useDisclosure(false);
  const live = useTaskUpdates("tasks");
  const tasks = live?.scope === "tasks" ? live.tasks : loaderData.tasks;
  const active = tasks.filter(
    ({ status }) =>
      status === "queued" || status === "running" || status === "cancelling",
  ).length;
  return (
    <>
      <header className={styles.header}>
        <Container size="lg">
          <Group justify="space-between" gap="xs">
            <Link to="/" aria-label="comic-dl-web 首页">
              <Image src="/comic-icon.png" alt="" w={40} h={40} />
            </Link>
            <Group component="nav" aria-label="主导航" gap={4}>
              <Button component={NavLink} to="/" end variant="subtle">
                书架
              </Button>
              <Button component={NavLink} to="/catalog" variant="subtle">
                浏览来源
              </Button>
              <Button component={NavLink} to="/extensions" variant="subtle">
                扩展市场
              </Button>
              <Button component={NavLink} to="/downloads" variant="subtle">
                手动下载
              </Button>
              <Button component={NavLink} to="/settings" variant="subtle">
                设置
              </Button>
            </Group>
            <Group gap={4} aria-label="快捷操作">
              <Button
                variant="light"
                onClick={drawer.open}
                aria-haspopup="dialog"
              >
                下载{active > 0 ? ` (${active})` : ""}
              </Button>
              <ThemeToggle />
              <Button
                variant="subtle"
                disabled
                title="多语言支持待加入"
                aria-label="语言（暂未开放）"
              >
                语言
              </Button>
            </Group>
          </Group>
        </Container>
      </header>
      <Drawer
        opened={opened}
        onClose={drawer.close}
        position="right"
        size="lg"
        title="下载管理"
        closeButtonProps={{ "aria-label": "关闭下载管理" }}
      >
        <DownloadTasks tasks={tasks} compact />
      </Drawer>
      <Outlet context={tasks} />
    </>
  );
}
