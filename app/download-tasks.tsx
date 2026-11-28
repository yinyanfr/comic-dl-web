import { useI18n } from "./i18n-context";
import {
  Alert,
  Badge,
  Button,
  Group,
  Paper,
  Progress,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import { useState } from "react";
import { useFetcher } from "react-router";
import type { DownloadTaskSnapshot } from "./download-queue.server";
import type { action } from "./routes/downloads";
import type { loader as resultsLoader } from "./routes/task-results";
import styles from "./routes/home.module.css";

const taskStatus = {
  queued: { label: "排队中", color: "gray" },
  running: { label: "下载中", color: "blue" },
  cancelling: { label: "正在取消", color: "yellow" },
  cancelled: { label: "已取消", color: "gray" },
  completed: { label: "已结束", color: "teal" },
  failed: { label: "任务失败", color: "red" },
};
const chapterStatus = {
  downloaded: { label: "已下载", color: "teal" },
  skipped: { label: "已存在 · 跳过", color: "gray" },
  restricted: { label: "受限", color: "yellow" },
  failed: { label: "章节失败", color: "red" },
};

function ChapterResults({ task }: { task: DownloadTaskSnapshot }) {
  const { t } = useI18n();
  const history = useFetcher<typeof resultsLoader>();
  const [showHistory, setShowHistory] = useState(false);
  const page = showHistory ? history.data : undefined;
  const results = page?.results ?? task.results;

  function load(offset: number) {
    setShowHistory(true);
    void history.load(`/tasks/${task.id}/results?offset=${offset}`);
  }

  if (!results.length) return null;
  return (
    <>
      <ul className={styles.results} aria-label={t("逐章结果")}>
        {results.map((result) => (
          <li key={result.chapterId}>
            <Group justify="space-between" gap="xs">
              <Text size="sm" className={styles.taskId}>
                {result.number === undefined
                  ? result.chapterId
                  : `${result.number}-${result.title}`}
              </Text>
              <Badge
                size="sm"
                color={chapterStatus[result.status].color}
                variant="light"
              >
                {t(chapterStatus[result.status].label)}
              </Badge>
            </Group>
          </li>
        ))}
      </ul>
      {task.resultCount > task.results.length && (
        <Group gap="xs">
          {page ? (
            <>
              <Button
                type="button"
                size="compact-xs"
                variant="subtle"
                disabled={!page.offset || history.state !== "idle"}
                onClick={() => load(page.offset - task.results.length)}
              >
                {t("上一页")}
              </Button>
              <Button
                type="button"
                size="compact-xs"
                variant="subtle"
                disabled={
                  page.offset + page.results.length >= task.resultCount ||
                  history.state !== "idle"
                }
                onClick={() => load(page.offset + page.results.length)}
              >
                {t("下一页")}
              </Button>
              <Button
                type="button"
                size="compact-xs"
                variant="subtle"
                onClick={() => setShowHistory(false)}
              >
                {t("返回最新结果")}
              </Button>
            </>
          ) : (
            <Button
              type="button"
              size="compact-xs"
              variant="subtle"
              loading={history.state !== "idle"}
              onClick={() => load(0)}
            >
              {t("查看全部 {count} 章结果", { count: task.resultCount })}
            </Button>
          )}
        </Group>
      )}
    </>
  );
}

export function DownloadTasks({
  tasks,
  compact = false,
}: {
  tasks: DownloadTaskSnapshot[];
  compact?: boolean;
}) {
  const { t } = useI18n();
  const cancel = useFetcher<typeof action>();
  const heading = compact ? "drawer-tasks-heading" : "tasks-heading";
  const groups = new Map<string, DownloadTaskSnapshot[]>();
  for (const task of tasks) {
    const key = task.work
      ? JSON.stringify([task.source, task.work.id])
      : task.id;
    const group = groups.get(key);
    if (group) group.push(task);
    else groups.set(key, [task]);
  }
  const finished = tasks.some(
    ({ status }) =>
      status === "completed" || status === "failed" || status === "cancelled",
  );

  return (
    <Paper
      component="section"
      aria-labelledby={heading}
      withBorder={!compact}
      p={compact ? 0 : "lg"}
    >
      <Group justify="space-between" mb={4}>
        <Title id={heading} order={2} size="h4">
          {t("下载任务")}
        </Title>
        <Badge variant="light">
          {t("{count} 个任务", { count: tasks.length })}
        </Badge>
        {finished && (
          <cancel.Form method="post" action="/downloads">
            <Button
              variant="subtle"
              size="compact-xs"
              type="submit"
              name="intent"
              value="clear-finished"
              disabled={cancel.state !== "idle"}
            >
              {t("清除已结束记录")}
            </Button>
          </cancel.Form>
        )}
      </Group>
      <Text size="sm" c="dimmed" mb="md">
        {t(
          "关闭页面后，下载仍会在服务端继续。默认只展示有限的最近章节记录，手动任务完整结果可分页查看。",
        )}
      </Text>
      {cancel.state === "idle" && cancel.data?.error && (
        <Alert color="red" role="alert" mb="md">
          {t(cancel.data.error)}
        </Alert>
      )}
      {tasks.length === 0 && (
        <Text size="sm" c="dimmed">
          {t("暂无下载任务。")}
        </Text>
      )}
      <Stack gap="sm">
        {[...groups].map(([key, group]) => (
          <Stack
            key={key}
            gap="xs"
            component="section"
            aria-label={group[0].work?.title ?? t("未关联作品的任务")}
          >
            {group[0].work && (
              <Group gap="xs">
                <Title order={3} size="h5">
                  {group[0].work.title}
                </Title>
                <Badge variant="light">{group[0].source}</Badge>
              </Group>
            )}
            {group.map((task) => {
              const status = taskStatus[task.status];
              return (
                <Paper
                  component="article"
                  key={task.id}
                  aria-label={t("任务 {id}", { id: task.id })}
                  withBorder
                  p="sm"
                >
                  <Group justify="space-between" gap="xs" mb={4}>
                    <Text size="sm" fw={600}>
                      {task.origin === "shelf" ? t("追更") : t("手动")} ·{" "}
                      {task.source} ·{" "}
                      {task.kind === "series" ? t("作品章节") : t("单章")}
                    </Text>
                    <Badge color={status.color} variant="light">
                      {t(status.label)}
                    </Badge>
                  </Group>
                  <Text size="xs" c="dimmed" className={styles.taskId}>
                    {task.id}
                  </Text>
                  {Boolean(task.chapterCount) && (
                    <>
                      <Text size="xs" c="dimmed" mt="xs">
                        {t("已处理 {done} / {total} 章", {
                          done: task.resultCount,
                          total: task.chapterCount ?? 0,
                        })}
                      </Text>
                      <Progress
                        value={
                          (100 * task.resultCount) / (task.chapterCount ?? 1)
                        }
                        aria-label={t("章节处理进度")}
                        size="sm"
                      />
                    </>
                  )}
                  {task.status === "failed" && (
                    <Text size="sm" c="red" mt="xs">
                      {task.failure === "invalid-selection"
                        ? t("章节目录或选择已失效。请重新查看章节后再提交。")
                        : t(
                            "请检查来源是否可用、章节是否仍有效，以及输出目录是否可写。",
                          )}
                    </Text>
                  )}
                  {task.resultCount > 0 && <ChapterResults task={task} />}
                  {task.chapters?.map((chapter) => (
                    <Stack gap={4} key={chapter.id} mt="xs">
                      <Text size="sm">
                        {chapter.number === undefined
                          ? chapter.chapterTitle
                          : `${chapter.number}-${chapter.chapterTitle}`}{" "}
                        ·{" "}
                        {
                          {
                            queued: t("排队中"),
                            retry: t("等待重试"),
                            starting: t("开始下载"),
                            reading: t("下载图片"),
                            archiving: t("写入归档"),
                            downloaded: t("已下载"),
                            skipped: t("已存在"),
                            failed: t("失败"),
                            restricted: t("受限"),
                            cancelled: t("已取消"),
                          }[chapter.state]
                        }
                      </Text>
                      <Text size="xs" c="dimmed">
                        {chapter.totalPages === undefined
                          ? t("已下载 {count} 页", {
                              count: chapter.pagesDownloaded,
                            })
                          : t("已下载 {done} / {total} 页", {
                              done: chapter.pagesDownloaded,
                              total: chapter.totalPages,
                            })}
                      </Text>
                      {chapter.totalPages !== undefined &&
                        chapter.totalPages > 0 && (
                          <Progress
                            aria-label={t("章节页数进度")}
                            value={
                              (100 * chapter.pagesDownloaded) /
                              chapter.totalPages
                            }
                            size="sm"
                          />
                        )}
                    </Stack>
                  ))}
                  {Boolean(task.remaining?.length) && (
                    <Stack
                      gap={4}
                      mt="xs"
                      component="section"
                      aria-label={t("待处理章节")}
                    >
                      {task.remaining?.map(({ id, number, title }) => (
                        <Group key={id} justify="space-between" gap="xs">
                          <Text size="sm" className={styles.taskId}>
                            {number}-{title}
                          </Text>
                          <Badge variant="light" color="gray" size="sm">
                            {t("待完成")}
                          </Badge>
                        </Group>
                      ))}
                    </Stack>
                  )}
                  {(task.status === "queued" || task.status === "running") && (
                    <cancel.Form
                      method="post"
                      action={task.origin === "shelf" ? "/shelf" : "/downloads"}
                    >
                      <input
                        type="hidden"
                        name="intent"
                        value={
                          task.origin === "shelf" ? "cancel-chapter" : "cancel"
                        }
                      />
                      <input type="hidden" name="taskId" value={task.id} />
                      <input
                        type="hidden"
                        name="entryId"
                        value={task.entryId ?? ""}
                      />
                      <input
                        type="hidden"
                        name="chapterId"
                        value={task.chapters?.[0]?.chapterId ?? ""}
                      />
                      <Button
                        type="submit"
                        size="compact-xs"
                        variant="subtle"
                        color="red"
                        mt="sm"
                        disabled={cancel.state !== "idle"}
                      >
                        {t("取消任务")}
                      </Button>
                    </cancel.Form>
                  )}
                  {(task.retryable ??
                    task.chapters?.some((chapter) => chapter.retryable)) &&
                    !["queued", "running", "cancelling"].includes(
                      task.status,
                    ) && (
                      <cancel.Form
                        method="post"
                        action={
                          task.origin === "shelf" ? "/shelf" : "/downloads"
                        }
                      >
                        <input
                          type="hidden"
                          name="intent"
                          value={
                            task.origin === "shelf" ? "retry" : "retry-task"
                          }
                        />
                        <input type="hidden" name="taskId" value={task.id} />
                        <input
                          type="hidden"
                          name="entryId"
                          value={task.entryId ?? ""}
                        />
                        <input
                          type="hidden"
                          name="chapterId"
                          value={task.chapters?.[0]?.chapterId ?? ""}
                        />
                        <Button
                          type="submit"
                          size="compact-xs"
                          variant="light"
                          disabled={cancel.state !== "idle"}
                        >
                          {t("重试失败或取消章节")}
                        </Button>
                      </cancel.Form>
                    )}
                </Paper>
              );
            })}
          </Stack>
        ))}
      </Stack>
    </Paper>
  );
}
