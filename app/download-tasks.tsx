import {
  Alert,
  Badge,
  Button,
  Group,
  Paper,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import { useEffect } from "react";
import { useFetcher, useRevalidator } from "react-router";
import type { DownloadTask } from "./download-queue.server";
import type { action } from "./routes/home";
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

export function DownloadTasks({ tasks }: { tasks: DownloadTask[] }) {
  const cancel = useFetcher<typeof action>();
  const { revalidate } = useRevalidator();

  useEffect(() => {
    const events = new EventSource("/tasks/events");
    let timer: ReturnType<typeof setTimeout> | undefined;
    events.addEventListener("tasks", () => {
      timer ??= setTimeout(() => {
        timer = undefined;
        void revalidate();
      }, 100);
    });
    return () => {
      clearTimeout(timer);
      events.close();
    };
  }, [revalidate]);

  return (
    <Paper
      component="section"
      aria-labelledby="tasks-heading"
      withBorder
      p="lg"
    >
      <Group justify="space-between" mb={4}>
        <Title id="tasks-heading" order={2} size="h4">
          下载任务
        </Title>
        <Badge variant="light">{tasks.length} 个任务</Badge>
      </Group>
      <Text size="sm" c="dimmed" mb="md">
        关闭页面后，下载仍会在服务端继续。
      </Text>
      {cancel.state === "idle" && cancel.data?.error && (
        <Alert color="red" role="alert" mb="md">
          {cancel.data.error}
        </Alert>
      )}
      {tasks.length === 0 && (
        <Text size="sm" c="dimmed">
          暂无下载任务。
        </Text>
      )}
      <Stack gap="sm">
        {tasks.map((task) => {
          const status = taskStatus[task.status];
          return (
            <Paper
              component="article"
              key={task.id}
              aria-label={`任务 ${task.id}`}
              withBorder
              p="sm"
            >
              <Group justify="space-between" gap="xs" mb={4}>
                <Text size="sm" fw={600}>
                  {task.source} · {task.kind === "series" ? "作品章节" : "单章"}
                </Text>
                <Badge color={status.color} variant="light">
                  {status.label}
                </Badge>
              </Group>
              <Text size="xs" c="dimmed" className={styles.taskId}>
                {task.id}
              </Text>
              {task.status === "failed" && (
                <Text size="sm" c="red" mt="xs">
                  请检查来源是否可用、章节是否仍有效，以及输出目录是否可写。
                </Text>
              )}
              {task.results.length > 0 && (
                <ul className={styles.results} aria-label="逐章结果">
                  {task.results.map((result) => (
                    <li key={result.chapterId}>
                      <Group justify="space-between" gap="xs">
                        <Text size="sm" className={styles.taskId}>
                          {result.chapterId}
                        </Text>
                        <Badge
                          size="sm"
                          color={chapterStatus[result.status].color}
                          variant="light"
                        >
                          {chapterStatus[result.status].label}
                        </Badge>
                      </Group>
                    </li>
                  ))}
                </ul>
              )}
              {(task.status === "queued" || task.status === "running") && (
                <cancel.Form method="post">
                  <input type="hidden" name="intent" value="cancel" />
                  <input type="hidden" name="taskId" value={task.id} />
                  <Button
                    type="submit"
                    size="compact-xs"
                    variant="subtle"
                    color="red"
                    mt="sm"
                    disabled={cancel.state !== "idle"}
                  >
                    取消任务
                  </Button>
                </cancel.Form>
              )}
            </Paper>
          );
        })}
      </Stack>
    </Paper>
  );
}
