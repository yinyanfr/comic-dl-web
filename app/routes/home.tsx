import {
  Alert,
  Badge,
  Button,
  Checkbox,
  Container,
  Group,
  Image,
  NativeSelect,
  Paper,
  Stack,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { useState } from "react";
import { useFetcher } from "react-router";
import { DownloadTasks } from "../download-tasks";
import { handleDownloadAction } from "../download-actions.server";
import { downloadQueue } from "../download-queue.server";
import { withAppDownloader } from "../downloader.server";
import type { Route } from "./+types/home";
import styles from "./home.module.css";

export function meta() {
  return [{ title: "comic-dl-web" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const sources: { ids: string[]; unavailable: boolean } =
    await withAppDownloader(
      async (downloader) => downloader.sources(),
      request.signal,
    )
      .then((ids) => ({ ids, unavailable: false }))
      .catch(() => ({ ids: [], unavailable: true }));
  return { sources, tasks: downloadQueue.snapshot() };
}

export function action({ request }: Route.ActionArgs) {
  return handleDownloadAction(request);
}

export default function Home({
  loaderData: { sources, tasks },
}: Route.ComponentProps) {
  const lookup = useFetcher<typeof action>();
  const download = useFetcher<typeof action>();
  const [listedInput, setListedInput] = useState("");
  const series = lookup.state === "idle" ? lookup.data?.series : undefined;
  const lookingUp = lookup.state !== "idle";
  const submittingDownload = download.state !== "idle";
  const inputsDisabled =
    sources.ids.length === 0 || lookingUp || submittingDownload;

  return (
    <Container component="main" size="lg" className={styles.main}>
      <Group component="header" gap="md" wrap="nowrap" mb="xl">
        <Image src="/comic-icon.png" alt="" w={64} h={64} />
        <div>
          <Title order={1}>comic-dl-web</Title>
          <Text c="dimmed">自托管漫画下载 · 每章一个 CBZ</Text>
        </div>
      </Group>

      <div className={styles.workspace}>
        <Stack gap="lg">
          <Paper
            component="section"
            aria-labelledby="sources-heading"
            withBorder
            p="lg"
            className={styles.sources}
          >
            <Title id="sources-heading" order={2} size="h4">
              下载漫画
            </Title>
            <Text size="sm" c="dimmed" mt={4} mb="md">
              输入作品链接查看章节，或直接下载单个章节。
            </Text>
            {sources.unavailable ? (
              <Alert color="red" mb="md">
                无法加载漫画源，请检查服务端配置。
              </Alert>
            ) : sources.ids.length === 0 ? (
              <Alert mb="md">尚未加载漫画源。</Alert>
            ) : null}
            <lookup.Form
              method="post"
              onSubmit={(event) => {
                download.reset();
                setListedInput(
                  String(new FormData(event.currentTarget).get("input") ?? ""),
                );
              }}
            >
              <Stack gap="sm">
                <NativeSelect
                  name="source"
                  label="漫画源"
                  data={[
                    { value: "", label: "使用默认源或按链接识别" },
                    ...sources.ids,
                  ]}
                  disabled={sources.ids.length === 0}
                />
                <TextInput
                  name="input"
                  label="作品或章节链接 / 短 ID"
                  placeholder={
                    sources.ids.includes("fixture")
                      ? "离线测试可输入 demo"
                      : "https://…"
                  }
                  maxLength={4096}
                  required
                />
                <Group mt="xs">
                  <Button
                    type="submit"
                    name="intent"
                    value="list"
                    disabled={inputsDisabled}
                  >
                    {lookup.formData?.get("intent") === "list"
                      ? "正在读取…"
                      : "查看章节"}
                  </Button>
                  <Button
                    type="submit"
                    name="intent"
                    value="chapter"
                    variant="light"
                    disabled={inputsDisabled}
                  >
                    下载章节直链
                  </Button>
                </Group>
              </Stack>
            </lookup.Form>
            {!lookingUp && lookup.data?.error && (
              <Alert color="red" role="alert" mt="md">
                {lookup.data.error}
              </Alert>
            )}
            {!lookingUp && lookup.data?.taskId && (
              <Text role="status" size="sm" c="dimmed" mt="md">
                已提交任务：{lookup.data.taskId}
              </Text>
            )}
          </Paper>

          {series && (
            <Paper
              component="section"
              aria-labelledby="chapters-heading"
              withBorder
              p="lg"
            >
              <Group justify="space-between" mb="xs">
                <Title id="chapters-heading" order={2} size="h4">
                  章节列表
                </Title>
                <Badge variant="light">
                  {series.source} · {series.chapters.length} 章
                </Badge>
              </Group>
              {series.chapters.length === 0 ? (
                <Text c="dimmed">这个作品没有可选章节。</Text>
              ) : (
                <download.Form method="post">
                  <input type="hidden" name="intent" value="series" />
                  <input type="hidden" name="input" value={listedInput} />
                  <input type="hidden" name="source" value={series.source} />
                  <fieldset className={styles.chapterList}>
                    <legend>选择章节</legend>
                    {series.chapters.map((chapter, index) => (
                      <Checkbox
                        key={chapter.id}
                        name="chapterId"
                        value={chapter.id}
                        label={`${index + 1}. ${chapter.title}`}
                        className={styles.chapter}
                      />
                    ))}
                  </fieldset>
                  <Stack mt="md" align="flex-start">
                    <TextInput
                      name="range"
                      label="章节范围（可选）"
                      description="按列表序号，两端都包含。可与勾选的章节一同提交。"
                      placeholder="2-4"
                      pattern="[0-9]+-[0-9]+"
                      maxLength={41}
                    />
                    <Button type="submit" disabled={submittingDownload}>
                      提交下载
                    </Button>
                  </Stack>
                </download.Form>
              )}
              {!submittingDownload && download.data?.error && (
                <Alert color="red" role="alert" mt="md">
                  {download.data.error}
                </Alert>
              )}
              {!submittingDownload && download.data?.taskId && (
                <Text role="status" size="sm" c="dimmed" mt="md">
                  已提交任务：{download.data.taskId}
                </Text>
              )}
            </Paper>
          )}
        </Stack>

        <DownloadTasks tasks={tasks} />
      </div>
    </Container>
  );
}
