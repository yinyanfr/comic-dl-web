import {
  Alert,
  Badge,
  Button,
  Container,
  Group,
  NativeSelect,
  Paper,
  Stack,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { Link, useFetcher } from "react-router";
import { handleShelfAction, readShelf } from "../shelf.server";
import { readSources } from "../downloader.server";
import { useTaskUpdates } from "../use-task-updates";
import type { Route } from "./+types/shelf";
import styles from "./home.module.css";

export function meta() {
  return [{ title: "书架 · comic-dl-web" }];
}

export async function loader({ context, request }: Route.LoaderArgs) {
  const [entries, sources] = await Promise.all([
    readShelf().catch(() => null),
    readSources(context.comics.withDownloader, request.signal),
  ]);
  return { entries, sources, watcher: context.comics.shelfWatcher.snapshot() };
}

export function action({ request, context }: Route.ActionArgs) {
  return handleShelfAction(request, context.comics);
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
  Awaited<ReturnType<typeof loader>>["entries"]
>[number];

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
            {entry.title}
          </Title>
          <Badge variant="light">{entry.sourceId}</Badge>
          <Badge variant="light" color={entry.following ? "teal" : "gray"}>
            {entry.following ? "已订阅" : "未订阅"}
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

        <edit.Form method="post">
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

        <command.Form method="post">
          <input type="hidden" name="entryId" value={entry.id} />
          <Group>
            <Button
              type="submit"
              name="intent"
              value={entry.following ? "pause" : "follow"}
              disabled={disabled}
            >
              {entry.following ? "暂停订阅" : "订阅"}
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
              <command.Form key={chapter.id} method="post">
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

export default function Shelf({
  loaderData: { entries, sources, watcher },
}: Route.ComponentProps) {
  const add = useFetcher<typeof action>();
  const check = useFetcher<typeof action>();
  useTaskUpdates("shelf");

  return (
    <Container component="main" size="lg" className={styles.main}>
      <Stack gap="lg">
        <Group component="header" justify="space-between">
          <Title order={1}>书架</Title>
          <Button component={Link} to="/" variant="subtle">
            手动下载
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
              漫画输出目录的挂载标记不可用，追更下载会等待恢复。
            </Text>
          )}
        </Group>
        <Paper
          component="section"
          aria-labelledby="collect-heading"
          withBorder
          p="lg"
        >
          <Stack gap="sm">
            <Title id="collect-heading" order={2} size="h4">
              收藏作品
            </Title>
            <Text size="sm" c="dimmed">
              收藏后可单独开启订阅。首次成功检查默认只记录已有章节。
            </Text>
            {sources.unavailable && (
              <Alert color="yellow">部分或全部漫画源无法加载。</Alert>
            )}
            <add.Form method="post">
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
                    add.state !== "idle" || !sources.ids.length || !entries
                  }
                >
                  加入书架
                </Button>
              </Group>
            </add.Form>
            <ActionFeedback fetcher={add} />
          </Stack>
        </Paper>
        {entries == null ? (
          <Alert color="red" role="alert">
            无法打开书架，请检查服务端存储配置。
          </Alert>
        ) : (
          <>
            <check.Form method="post">
              <Button
                type="submit"
                name="intent"
                value="check-all"
                variant="light"
                disabled={
                  check.state !== "idle" ||
                  !entries.some(({ following }) => following)
                }
              >
                检查全部订阅
              </Button>
            </check.Form>
            <ActionFeedback fetcher={check} />
            {entries.length === 0 && <Text c="dimmed">书架暂无作品。</Text>}
            {entries.map((entry) => (
              <ShelfEntry
                key={entry.id}
                entry={entry}
                sourceAvailable={sources.ids.includes(entry.sourceId)}
              />
            ))}
          </>
        )}
      </Stack>
    </Container>
  );
}
