import { useI18n } from "../i18n-context";
import { pageTitle } from "../i18n";
import {
  Alert,
  ActionIcon,
  Badge,
  Button,
  Container,
  Drawer,
  Group,
  NativeSelect,
  Paper,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
  Title,
  Tooltip,
} from "@mantine/core";
import { useDisclosure, useLocalStorage } from "@mantine/hooks";
import { useEffect, useRef } from "react";
import { Link, useFetcher, useRevalidator } from "react-router";
import { comicsContext } from "../comic-runtime.server";
import { handleShelfAction, readShelf, shelfPage } from "../shelf.server";
import { readSources } from "../downloader.server";
import { useTaskUpdates } from "../use-task-updates";
import { Cover } from "../cover";
import { Icon } from "../icons";
import type { Route } from "./+types/shelf";
import styles from "./home.module.css";

export function meta({ matches }: Route.MetaArgs) {
  return [{ title: pageTitle(matches, "书架") }];
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

function ActionFeedback({
  fetcher,
}: {
  fetcher: ReturnType<typeof useFetcher<typeof action>>;
}) {
  const { t } = useI18n();
  if (fetcher.state !== "idle") return null;
  if (fetcher.data?.error)
    return (
      <Alert color="red" role="alert">
        {t(fetcher.data.error)}
      </Alert>
    );
  if (fetcher.data?.message)
    return (
      <Text role="status" size="sm">
        {t(fetcher.data.message)}
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
  compact = false,
}: {
  entry: ShelfItem;
  sourceAvailable: boolean;
  compact?: boolean;
}) {
  const { t, locale } = useI18n();
  const dateFormat = new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "medium",
    timeZone: "UTC",
  });
  const edit = useFetcher<typeof action>();
  const command = useFetcher<typeof action>();
  const { status, attention } = entry;
  const disabled = command.state !== "idle" || edit.state !== "idle";
  const [opened, details] = useDisclosure(false);

  if (compact) {
    return (
      <Paper
        component="article"
        aria-label={`${entry.title} · ${entry.sourceId}`}
        withBorder
        className={styles.compactCard}
      >
        <Link to={`/work?entry=${entry.id}`} className={styles.workLink}>
          <Cover src={`/covers?entry=${entry.id}`} />
          <Text
            component="h2"
            size="sm"
            fw={600}
            lineClamp={2}
            m="xs"
            title={entry.title}
            className={styles.compactTitle}
          >
            {entry.title}
          </Text>
        </Link>
        <Group gap={4} px="xs" pb="xs" justify="space-between" wrap="nowrap">
          <Tooltip
            label={`${entry.sourceId} · ${sourceAvailable ? t("来源可用") : t("来源不可用")} · ${t("待处理 {pending} 章 · 已完成 {complete} 章", { pending: status?.pending ?? 0, complete: status?.complete ?? 0 })}`}
          >
            <ActionIcon
              variant="subtle"
              color={sourceAvailable && !attention.length ? "gray" : "orange"}
              aria-label={t("查看作品状态")}
              onClick={details.open}
            >
              <Icon
                name={
                  sourceAvailable && !attention.length ? "shelf" : "warning"
                }
              />
            </ActionIcon>
          </Tooltip>
          <command.Form method="post" action="/shelf">
            <input type="hidden" name="entryId" value={entry.id} />
            <Group gap={2} wrap="nowrap">
              <Tooltip
                label={entry.following ? t("暂停自动追更") : t("开启自动追更")}
              >
                <ActionIcon
                  type="submit"
                  name="intent"
                  value={entry.following ? "pause" : "follow"}
                  disabled={disabled}
                  variant="light"
                  color={entry.following ? "teal" : "gray"}
                  aria-label={
                    entry.following ? t("暂停自动追更") : t("开启自动追更")
                  }
                >
                  <Icon name={entry.following ? "pause" : "play"} />
                </ActionIcon>
              </Tooltip>
              <Tooltip label={t("检查更新")}>
                <ActionIcon
                  type="submit"
                  name="intent"
                  value="check"
                  disabled={disabled}
                  variant="subtle"
                  aria-label={t("检查更新")}
                >
                  <Icon name="refresh" />
                </ActionIcon>
              </Tooltip>
            </Group>
          </command.Form>
          <Tooltip label={t("作品管理与下载策略")}>
            <ActionIcon
              onClick={details.open}
              variant="subtle"
              aria-label={t("作品管理与下载策略")}
            >
              <Icon name="settings" />
            </ActionIcon>
          </Tooltip>
        </Group>
        <ActionFeedback fetcher={command} />
        <Drawer
          opened={opened}
          onClose={details.close}
          title={entry.title}
          position="right"
          size="lg"
        >
          <ShelfEntry entry={entry} sourceAvailable={sourceAvailable} />
        </Drawer>
      </Paper>
    );
  }

  return (
    <Paper
      component="article"
      aria-label={`${entry.title} · ${entry.sourceId}`}
      p="lg"
      withBorder
    >
      <Stack gap="sm">
        <Link
          to={`/work?entry=${entry.id}`}
          className={styles.shelfCover}
          aria-label={t("{title} 作品详情", { title: entry.title })}
        >
          <Cover src={`/covers?entry=${entry.id}`} />
        </Link>
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
          <Badge variant="light" color={entry.autoCheck ? "teal" : "gray"}>
            {t("自动检查{check} · 自动下载{download}", {
              check: entry.autoCheck ? t("开启") : t("关闭"),
              download: entry.autoDownload ? t("开启") : t("关闭"),
            })}
          </Badge>
          {!sourceAvailable && (
            <Badge color="yellow" variant="light">
              {t("来源不可用")}
            </Badge>
          )}
        </Group>
        <Text size="sm">
          {t("最近检查：")}
          {status?.lastCheck == null
            ? t("尚未检查")
            : `${dateFormat.format(status.lastCheck)} UTC`}
        </Text>
        <Text size="sm">
          {t("检查结果：")}
          {status?.result ? t(checkResults[status.result]) : "—"}
        </Text>
        <Text size="sm">
          {t("最近成功：")}
          {status?.lastSuccess == null
            ? "—"
            : `${dateFormat.format(status.lastSuccess)} UTC`}
        </Text>
        <Text size="sm">
          {t("待处理 {pending} 章 · 已完成 {complete} 章", {
            pending: status?.pending ?? 0,
            complete: status?.complete ?? 0,
          })}
        </Text>
        <Text size="sm">
          {t("下次检查：")}
          {status?.nextCheck == null
            ? t("未安排")
            : `${dateFormat.format(status.nextCheck)} UTC`}
          {" · "}
          {t("有效间隔 {seconds} 秒 · 新发现 {count} 章", {
            seconds: status?.intervalSeconds ?? "—",
            count: status?.discovered ?? 0,
          })}
        </Text>
        <details>
          <summary>{t("检查与下载策略")}</summary>
          <edit.Form
            method="post"
            action="/shelf"
            key={JSON.stringify([
              entry.autoCheck,
              entry.autoDownload,
              entry.intervalSeconds,
            ])}
          >
            <input type="hidden" name="intent" value="configure" />
            <input type="hidden" name="entryId" value={entry.id} />
            <Stack gap="xs" mt="sm">
              <NativeSelect
                label={t("自动检查")}
                name="autoCheck"
                defaultValue={entry.autoCheck ? "on" : "off"}
                data={[
                  { value: "on", label: t("开启") },
                  { value: "off", label: t("关闭") },
                ]}
              />
              <NativeSelect
                label={t("自动下载新章")}
                name="autoDownload"
                defaultValue={entry.autoDownload ? "on" : "off"}
                data={[
                  { value: "on", label: t("开启") },
                  { value: "off", label: t("关闭") },
                ]}
              />
              <TextInput
                label={t("作品检查间隔（秒）")}
                name="intervalSeconds"
                type="number"
                min={1}
                max={31_536_000}
                defaultValue={entry.intervalSeconds ?? ""}
                description={t(
                  "留空使用全局间隔。修改后重新排期，不清除基线。",
                )}
              />
              <Text size="xs" c="dimmed">
                {t(
                  "关闭开关不取消已有任务；开启自动下载不追溯下载之前发现的章节。",
                )}
              </Text>
              <Button type="submit" disabled={disabled}>
                {t("保存策略")}
              </Button>
            </Stack>
          </edit.Form>
        </details>

        <details>
          <summary>{t("编辑作品输入")}</summary>
          <edit.Form method="post" action="/shelf">
            <input type="hidden" name="intent" value="edit" />
            <input type="hidden" name="entryId" value={entry.id} />
            <Group align="end">
              <TextInput
                key={entry.input}
                name="input"
                label={t("作品输入")}
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
                {t("保存作品输入")}
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
              {entry.following ? t("暂停自动追更") : t("开启自动追更")}
            </Button>
            {
              <>
                <Button
                  type="submit"
                  name="intent"
                  value="check"
                  variant="light"
                  disabled={disabled}
                >
                  {t("检查更新")}
                </Button>
                <Button
                  type="submit"
                  name="intent"
                  value="history"
                  variant="light"
                  disabled={disabled}
                >
                  {t("补下载历史")}
                </Button>
              </>
            }
            <Button
              type="submit"
              name="intent"
              value="remove"
              variant="subtle"
              color="red"
              disabled={disabled}
            >
              {t("从书架移除")}
            </Button>
          </Group>
        </command.Form>

        {attention.length > 0 && (
          <Stack component="section" aria-label={t("需处理章节")} gap="xs">
            <Title order={3} size="h6">
              {t("需处理章节")}
            </Title>
            {attention.map((chapter) => (
              <command.Form key={chapter.id} method="post" action="/shelf">
                <input type="hidden" name="intent" value="retry" />
                <input type="hidden" name="entryId" value={entry.id} />
                <input type="hidden" name="chapterId" value={chapter.id} />
                <Group>
                  <Text size="sm" className={styles.taskId}>
                    {chapter.id} ·{" "}
                    {chapter.state === "restricted" ? t("受限") : t("下载失败")}
                  </Text>
                  <Button
                    type="submit"
                    size="compact-sm"
                    variant="light"
                    disabled={disabled}
                  >
                    {t("重试")}
                  </Button>
                </Group>
              </command.Form>
            ))}
          </Stack>
        )}
        {entry.chapters.some((chapter) =>
          ["discovered", "cancelled", "queued", "retry"].includes(
            chapter.state,
          ),
        ) && (
          <details>
            <summary>{t("新发现与待处理章节")}</summary>
            <Stack gap="xs" mt="sm">
              {entry.chapters
                .filter((chapter) =>
                  ["discovered", "cancelled", "queued", "retry"].includes(
                    chapter.state,
                  ),
                )
                .map((chapter) => (
                  <command.Form
                    method="post"
                    action="/shelf"
                    key={chapter.chapterId}
                  >
                    <input type="hidden" name="entryId" value={entry.id} />
                    <input
                      type="hidden"
                      name="chapterId"
                      value={chapter.chapterId}
                    />
                    <Group>
                      <Text size="sm">
                        {chapter.number ?? "?"}-{chapter.chapterTitle} ·{" "}
                        {chapter.state === "discovered"
                          ? t("新发现")
                          : chapter.state === "cancelled"
                            ? t("已取消")
                            : t("待下载")}
                      </Text>
                      {chapter.discoveredAt != null && (
                        <Text size="xs" c="dimmed">
                          {dateFormat.format(chapter.discoveredAt)} UTC
                        </Text>
                      )}
                      <Button
                        type="submit"
                        name="intent"
                        value={
                          ["queued", "retry"].includes(chapter.state)
                            ? "cancel-chapter"
                            : chapter.state === "cancelled"
                              ? "retry"
                              : "enqueue"
                        }
                        size="compact-xs"
                        disabled={disabled}
                      >
                        {["queued", "retry"].includes(chapter.state)
                          ? t("取消章节")
                          : t("下载章节")}
                      </Button>
                    </Group>
                  </command.Form>
                ))}
            </Stack>
          </details>
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
  const { t } = useI18n();
  const add = useFetcher<typeof action>();
  const [compact, setCompact] = useLocalStorage({
    key: "comic-dl-web-shelf-compact",
    defaultValue: false,
  });
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
          <Title order={1}>{t("书架")}</Title>
          <Group gap="xs">
            <Tooltip label={compact ? t("切换详细显示") : t("切换紧凑显示")}>
              <ActionIcon
                size={36}
                variant="light"
                aria-label={compact ? t("切换详细显示") : t("切换紧凑显示")}
                aria-pressed={compact}
                onClick={() => setCompact(!compact)}
              >
                <Icon name={compact ? "list" : "grid"} />
              </ActionIcon>
            </Tooltip>
            <Button component={Link} to="/catalog" variant="light">
              {t("发现漫画")}
            </Button>
          </Group>
        </Group>
        <Group>
          <Badge
            color={watcher.state === "running" ? "teal" : "yellow"}
            variant="light"
          >
            {t(watcherLabels[watcher.state])}
          </Badge>
          {!watcher.outputReady && (
            <Text size="sm" c="orange">
              {t("漫画输出目录或挂载标记不可用，追更下载会等待恢复。")}
            </Text>
          )}
        </Group>
        {current == null ? (
          <Alert color="red" role="alert">
            {t("无法打开书架，请检查服务端存储配置。")}
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
                {t("检查全部作品")}
              </Button>
            </check.Form>
            {current.entries.length > 0 && (
              <Text size="sm" c="dimmed">
                {t(
                  "手动检查包含未开启自动检查的作品；是否下载新章由各作品的自动下载设置决定。",
                )}
              </Text>
            )}
            <ActionFeedback fetcher={check} />
            {current.entries.length === 0 && (
              <Paper withBorder p="xl" ta="center">
                <Text fw={600}>{t("书架暂无作品。")}</Text>
                <Text c="dimmed" size="sm" mt="xs">
                  {t("打开一个漫画源，找到喜欢的漫画后加入书架。")}
                </Text>
                <Button component={Link} to="/catalog" mt="md">
                  {t("浏览漫画源")}
                </Button>
              </Paper>
            )}
            <SimpleGrid
              cols={
                compact ? { base: 2, xs: 3, sm: 4, md: 5 } : { base: 1, md: 2 }
              }
              spacing={compact ? "sm" : "md"}
            >
              {current.entries.map((entry) => (
                <ShelfEntry
                  key={entry.id}
                  entry={entry}
                  sourceAvailable={sources.ids.includes(entry.sourceId)}
                  compact={compact}
                />
              ))}
            </SimpleGrid>
            {current.pages > 1 && (
              <Group aria-label={t("书架分页")}>
                {current.page > 1 && (
                  <Button
                    component={Link}
                    to={`/?page=${current.page - 1}`}
                    variant="light"
                  >
                    {t("上一页")}
                  </Button>
                )}
                <Text size="sm">
                  {t("第 {page} / {pages} 页", {
                    page: current.page,
                    pages: current.pages,
                  })}
                </Text>
                {current.page < current.pages && (
                  <Button
                    component={Link}
                    to={`/?page=${current.page + 1}`}
                    variant="light"
                  >
                    {t("下一页")}
                  </Button>
                )}
              </Group>
            )}
          </>
        )}
        <Paper component="details" withBorder p="md">
          <summary>{t("通过链接添加作品")}</summary>
          <Stack gap="sm" mt="sm">
            {sources.unavailable && (
              <Alert color="yellow">{t("部分或全部漫画源无法加载。")}</Alert>
            )}
            <add.Form method="post" action="/shelf">
              <input type="hidden" name="intent" value="add" />
              <Group align="end">
                <NativeSelect
                  name="source"
                  label={t("漫画源")}
                  data={[
                    { value: "", label: t("使用默认源或按链接识别") },
                    ...sources.ids,
                  ]}
                />
                <TextInput
                  name="input"
                  label={t("作品链接 / 短 ID")}
                  maxLength={4096}
                  required
                  placeholder={
                    sources.ids.includes("fixture")
                      ? t("离线测试可输入 demo")
                      : "https://…"
                  }
                />
                <Button
                  type="submit"
                  disabled={
                    add.state !== "idle" || !sources.ids.length || !current
                  }
                >
                  {t("加入书架")}
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
