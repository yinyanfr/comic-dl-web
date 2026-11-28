import "@mantine/core/styles.layer.css";
import {
  ColorSchemeScript,
  ActionIcon,
  Box,
  Button,
  Container,
  Drawer,
  Group,
  Image,
  Indicator,
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
import { Icon, type IconName } from "./icons";
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

export async function loader({ context }: Route.LoaderArgs) {
  return { tasks: await context.get(comicsContext).tasks() };
}

function ThemeToggle() {
  const { setColorScheme } = useMantineColorScheme();
  const colorScheme = useComputedColorScheme("light", {
    getInitialValueInEffect: true,
  });
  return (
    <ActionIcon
      size={36}
      variant="subtle"
      aria-label={colorScheme === "dark" ? "日间模式" : "夜间模式"}
      title={colorScheme === "dark" ? "日间模式" : "夜间模式"}
      onClick={() => setColorScheme(colorScheme === "dark" ? "light" : "dark")}
    >
      <Box component="span" darkHidden>
        <Icon name="moon" />
      </Box>
      <Box component="span" lightHidden>
        <Icon name="sun" />
      </Box>
    </ActionIcon>
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
          <Group
            justify="space-between"
            gap="xs"
            wrap="nowrap"
            className={styles.headerRow}
          >
            <Link to="/" aria-label="comic-dl-web 首页">
              <Image
                src="/comic-icon.png"
                alt=""
                className={styles.brandIcon}
              />
            </Link>
            <Group
              component="nav"
              aria-label="主导航"
              gap={4}
              wrap="nowrap"
              className={styles.navigation}
            >
              {(
                [
                  ["/", "书架", "shelf"],
                  ["/catalog", "浏览来源", "search"],
                  ["/extensions", "扩展市场", "extensions"],
                  ["/downloads", "手动下载", "download"],
                  ["/settings", "设置", "settings"],
                ] satisfies [string, string, IconName][]
              ).map(([to, label, icon]) => (
                <Button
                  key={to}
                  component={NavLink}
                  to={to}
                  end={to === "/"}
                  variant="subtle"
                  aria-label={label}
                  title={label}
                  className={styles.navButton}
                >
                  <span className={styles.navIcon}>
                    <Icon name={icon} />
                  </span>
                  <span className={styles.navLabel}>{label}</span>
                </Button>
              ))}
            </Group>
            <Group gap={4} aria-label="快捷操作" wrap="nowrap">
              <Indicator disabled={active === 0} label={active} size={16}>
                <ActionIcon
                  size={36}
                  variant="light"
                  onClick={drawer.open}
                  aria-haspopup="dialog"
                  aria-label={active > 0 ? `下载 (${active})` : "下载"}
                  title="下载管理"
                >
                  <Icon name="download" />
                </ActionIcon>
              </Indicator>
              <ThemeToggle />
              <ActionIcon
                size={36}
                variant="subtle"
                disabled
                title="多语言支持待加入"
                aria-label="语言（暂未开放）"
              >
                <Icon name="language" />
              </ActionIcon>
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
