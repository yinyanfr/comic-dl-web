import {
  Alert,
  Badge,
  Button,
  Container,
  Group,
  NativeSelect,
  Paper,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { useEffect, useRef } from "react";
import { Link, useFetcher, useRevalidator } from "react-router";
import { comicsContext } from "../comic-runtime.server";
import { handleShelfAction, readShelf, shelfPage } from "../shelf.server";
import { readSources } from "../downloader.server";
import { useTaskUpdates } from "../use-task-updates";
import type { Route } from "./+types/shelf";
import styles from "./home.module.css";

export function meta() {
  return [{ title: "书架 · comic-dl-web" }];
}

export async function loader({ context, request, url }: Route.LoaderArgs) {
  const comics = context.get(comicsContext);
  const requestedPage = shelfPage(url);
  const [shelf, sources] = await Promise.all([
    readShelf(requestedPage).catch(() => null),
    readSources(comics.withDownloader, request.signal),
  ]);
  return {
    requestedPage,
    shelf,
    sources,
    watcher: comics.shelfWatcher.snapshot(),
  };
}

export function action({ request, context }: Route.ActionArgs) {
  return handleShelfAction(request, context.get(comicsContext));
}

const checkResults = {
  ok: "成功",
  "source-unavailable": "来源不可用",
  "authorization-failed": "来源认证失败",
  "temporary-failure": "来源暂时不可用",
  "catalog-failed": "无法读取章节",
  "wrong-work": "输入指向其他作品",
  "invalid-catalog": "章节目录无效",
  "empty-catalog": "章节目录为空",
  "check-conflict": "检查冲突，请重试",
};
const watcherLabels = {
  starting: "追更服务正在启动",
  running: "追更服务运行中",
  locked: "书架追更锁已被占用",
  stopped: "追更服务未运行",
};
const dateFormat = new Intl.DateTimeFormat("zh-CN", {
  dateStyle: "medium",
  timeStyle: "medium",
  timeZone: "UTC",
});

function ActionFeedback({
  fetcher,
}: {
  fetcher: ReturnType<typeof useFetcher<typeof action>>;
}) {
  if (fetcher.state !== "idle") return null;
  if (fetcher.data?.error)
    return (
      <Alert color="red" role="alert">
        {fetcher.data.error}
      </Alert>
    );
  if (fetcher.data?.message)
    return (
      <Text role="status" size="sm">
        {fetcher.data.message}
      </Text>
    );
  return null;
}

type ShelfItem = NonNullable<
  Awaited<ReturnType<typeof loader>>["shelf"]
>["entries"][number];

function ShelfEntry({
  entry,
  sourceAvailable,
}: {
  entry: ShelfItem;
  sourceAvailable: boolean;
}) {
  const edit = useFetcher<typeof action>();
  const command = useFetcher<typeof action>();
  const { status, attention } = entry;
  const disabled = command.state !== "idle" || edit.state !== "idle";

  return (
    <Paper
      component="article"
      aria-label={`${entry.title} · ${entry.sourceId}`}
      p="lg"
      withBorder
    >
      <Stack gap="sm">
        <Group>
          <Title order={2} size="h4">
            {entry.input ? (
              <Link to={`/work?entry=${entry.id}`} className={styles.workLink}>
                {entry.title}
              </Link>
            ) : (
              entry.title
            )}
          </Title>
          <Badge variant="light">{entry.sourceId}</Badge>
          <Badge variant="light" color={entry.following ? "teal" : "gray"}>
            {entry.following ? "自动检查并下载" : "未开启自动追更"}
          </Badge>
          {!sourceAvailable && (
            <Badge color="yellow" variant="light">
              来源不可用
            </Badge>
          )}
        </Group>
        <Text size="sm">
          最近检查：
          {status?.lastCheck == null
            ? "尚未检查"
            : `${dateFormat.format(status.lastCheck)} UTC`}
        </Text>
        <Text size="sm">
          检查结果：{status?.result ? checkResults[status.result] : "—"}
        </Text>
        <Text size="sm">
          最近成功：
          {status?.lastSuccess == null
            ? "—"
            : `${dateFormat.format(status.lastSuccess)} UTC`}
        </Text>
        <Text size="sm">
          待处理 {status?.pending ?? 0} 章 · 已完成 {status?.complete ?? 0} 章
        </Text>

        <details>
          <summary>编辑作品输入</summary>
          <edit.Form method="post" action="/shelf">
            <input type="hidden" name="intent" value="edit" />
            <input type="hidden" name="entryId" value={entry.id} />
            <Group align="end">
              <TextInput
                key={entry.input}
                name="input"
                label="作品输入"
                defaultValue={entry.input}
                maxLength={4096}
                required
                disabled={!sourceAvailable}
              />
              <Button
                type="submit"
                variant="light"
                disabled={disabled || !sourceAvailable}
              >
                保存作品输入
              </Button>
            </Group>
          </edit.Form>
          <ActionFeedback fetcher={edit} />
        </details>

        <command.Form method="post" action="/shelf">
          <input type="hidden" name="entryId" value={entry.id} />
          <Group>
            <Button
              type="submit"
              name="intent"
              value={entry.following ? "pause" : "follow"}
              disabled={disabled}
            >
              {entry.following ? "暂停自动追更" : "开启自动追更"}
            </Button>
            {entry.following && (
              <>
                <Button
                  type="submit"
                  name="intent"
                  value="check"
                  variant="light"
                  disabled={disabled}
                >
                  检查更新
                </Button>
                <Button
                  type="submit"
                  name="intent"
                  value="history"
                  variant="light"
                  disabled={disabled}
                >
                  补下载历史
                </Button>
              </>
            )}
            <Button
              type="submit"
              name="intent"
              value="remove"
              variant="subtle"
              color="red"
              disabled={disabled}
            >
              从书架移除
            </Button>
          </Group>
        </command.Form>

        {attention.length > 0 && (
          <Stack component="section" aria-label="需处理章节" gap="xs">
            <Title order={3} size="h6">
              需处理章节
            </Title>
            {attention.map((chapter) => (
              <command.Form key={chapter.id} method="post" action="/shelf">
                <input type="hidden" name="intent" value="retry" />
                <input type="hidden" name="entryId" value={entry.id} />
                <input type="hidden" name="chapterId" value={chapter.id} />
                <Group>
                  <Text size="sm" className={styles.taskId}>
                    {chapter.id} ·{" "}
                    {chapter.state === "restricted" ? "受限" : "下载失败"}
                  </Text>
                  <Button
                    type="submit"
                    size="compact-sm"
                    variant="light"
                    disabled={disabled || !entry.following}
                  >
                    重试
                  </Button>
                </Group>
              </command.Form>
            ))}
          </Stack>
        )}
        <ActionFeedback fetcher={command} />
      </Stack>
    </Paper>
  );
}

export default function Shelf({ loaderData }: Route.ComponentProps) {
  return <ShelfPage key={loaderData.requestedPage} {...loaderData} />;
}

function ShelfPage({
  requestedPage,
  shelf,
  sources,
  watcher: initialWatcher,
}: Route.ComponentProps["loaderData"]) {
  const add = useFetcher<typeof action>();
  const check = useFetcher<typeof action>();
  const live = useTaskUpdates("shelf", requestedPage);
  const updated =
    live?.scope === "shelf" && live.requestedPage === requestedPage
      ? live
      : undefined;
  const watcher = updated?.watcher ?? initialWatcher;
  const current = updated ? updated.shelf : shelf;
  const { revalidate } = useRevalidator();
  const generation = useRef(initialWatcher.generation);
  useEffect(() => {
    if (watcher.generation === generation.current) return;
    generation.current = watcher.generation;
    if (watcher.generation !== initialWatcher.generation) void revalidate();
  }, [watcher.generation, initialWatcher.generation, revalidate]);

  return (
    <Container component="main" size="lg" className={styles.main}>
      <Stack gap="lg">
        <Group component="header" justify="space-between">
          <Title order={1}>书架</Title>
          <Button component={Link} to="/catalog" variant="light">
            发现漫画
          </Button>
        </Group>
        <Group>
          <Badge
            color={watcher.state === "running" ? "teal" : "yellow"}
            variant="light"
          >
            {watcherLabels[watcher.state]}
          </Badge>
          {!watcher.outputReady && (
            <Text size="sm" c="orange">
              漫画输出目录或挂载标记不可用，追更下载会等待恢复。
            </Text>
          )}
        </Group>
        {current == null ? (
          <Alert color="red" role="alert">
            无法打开书架，请检查服务端存储配置。
          </Alert>
        ) : (
          <>
            <check.Form method="post" action="/shelf">
              <Button
                type="submit"
                name="intent"
                value="check-all"
                variant="light"
                disabled={check.state !== "idle" || !current.hasSubscriptions}
              >
                检查已开启追更的作品
              </Button>
            </check.Form>
            {current.entries.length > 0 && (
              <Text size="sm" c="dimmed">
                当前版本仅支持检查已开启追更的作品，发现新章节后会自动加入下载队列。
              </Text>
            )}
            <ActionFeedback fetcher={check} />
            {current.entries.length === 0 && (
              <Paper withBorder p="xl" ta="center">
                <Text fw={600}>书架暂无作品。</Text>
                <Text c="dimmed" size="sm" mt="xs">
                  打开一个漫画源，找到喜欢的漫画后加入书架。
                </Text>
                <Button component={Link} to="/catalog" mt="md">
                  浏览漫画源
                </Button>
              </Paper>
            )}
            <SimpleGrid cols={{ base: 1, md: 2 }}>
              {current.entries.map((entry) => (
                <ShelfEntry
                  key={entry.id}
                  entry={entry}
                  sourceAvailable={sources.ids.includes(entry.sourceId)}
                />
              ))}
            </SimpleGrid>
            {current.pages > 1 && (
              <Group aria-label="书架分页">
                {current.page > 1 && (
                  <Button
                    component={Link}
                    to={`/?page=${current.page - 1}`}
                    variant="light"
                  >
                    上一页
                  </Button>
                )}
                <Text size="sm">
                  第 {current.page} / {current.pages} 页
                </Text>
                {current.page < current.pages && (
                  <Button
                    component={Link}
                    to={`/?page=${current.page + 1}`}
                    variant="light"
                  >
                    下一页
                  </Button>
                )}
              </Group>
            )}
          </>
        )}
        <Paper component="details" withBorder p="md">
          <summary>通过链接添加作品</summary>
          <Stack gap="sm" mt="sm">
            {sources.unavailable && (
              <Alert color="yellow">部分或全部漫画源无法加载。</Alert>
            )}
            <add.Form method="post" action="/shelf">
              <input type="hidden" name="intent" value="add" />
              <Group align="end">
                <NativeSelect
                  name="source"
                  label="漫画源"
                  data={[
                    { value: "", label: "使用默认源或按链接识别" },
                    ...sources.ids,
                  ]}
                />
                <TextInput
                  name="input"
                  label="作品链接 / 短 ID"
                  maxLength={4096}
                  required
                  placeholder={
                    sources.ids.includes("fixture")
                      ? "离线测试可输入 demo"
                      : "https://…"
                  }
                />
                <Button
                  type="submit"
                  disabled={
                    add.state !== "idle" || !sources.ids.length || !current
                  }
                >
                  加入书架
                </Button>
              </Group>
            </add.Form>
            <ActionFeedback fetcher={add} />
          </Stack>
        </Paper>
      </Stack>
    </Container>
  );
}
