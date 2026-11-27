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
import { Link, useFetcher } from "react-router";
import { DownloadTasks } from "../download-tasks";
import { handleDownloadAction } from "../download-actions.server";
import { downloadQueue } from "../download-queue.server";
import { readSources } from "../downloader.server";
import { reusableWebUrl, sourceInput } from "../source-input.server";
import type { Route } from "./+types/home";
import type { action as shelfAction } from "./shelf";
import styles from "./home.module.css";

export function meta() {
  return [{ title: "comic-dl-web" }];
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const sources = await readSources(
    context.comics.withDownloader,
    request.signal,
  );
  const params = new URL(request.url).searchParams;
  const target = sourceInput.safeParse({
    input: params.get("input"),
    source: params.get("source") || undefined,
  }).data;
  const preset =
    target && (!URL.canParse(target.input) || reusableWebUrl(target.input))
      ? target
      : undefined;
  return { sources, tasks: downloadQueue.snapshot(), preset };
}

export function action({ request, context }: Route.ActionArgs) {
  return handleDownloadAction(request, context.comics.withDownloader);
}

export default function Home({
  loaderData: { sources, tasks, preset },
}: Route.ComponentProps) {
  const lookup = useFetcher<typeof action>();
  const download = useFetcher<typeof action>();
  const collect = useFetcher<typeof shelfAction>();
  const [listedInput, setListedInput] = useState("");
  const series = lookup.state === "idle" ? lookup.data?.series : undefined;
  const lookingUp = lookup.state !== "idle";
  const submittingDownload = download.state !== "idle";
  const inputsDisabled =
    sources.ids.length === 0 || lookingUp || submittingDownload;

  return (
    <Container component="main" size="lg" className={styles.main}>
      <Group component="header" gap="md" mb="xl">
        <Image src="/comic-icon.png" alt="" w={64} h={64} />
        <div>
          <Title order={1}>comic-dl-web</Title>
          <Text c="dimmed">自托管漫画下载 · 每章一个 CBZ</Text>
        </div>
        <Group ml="auto" gap="xs">
          <Button component={Link} to="/catalog" variant="subtle">
            漫画目录
          </Button>
          <Button component={Link} to="/shelf" variant="subtle">
            书架
          </Button>
          <Button component={Link} to="/extensions" variant="subtle">
            扩展市场
          </Button>
        </Group>
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
              <Alert color="yellow" mb="md">
                部分或全部漫画源无法加载，请检查扩展市场和服务端配置。
              </Alert>
            ) : sources.ids.length === 0 ? (
              <Alert mb="md">尚未加载漫画源。</Alert>
            ) : null}
            <lookup.Form
              key={JSON.stringify(preset ?? null)}
              method="post"
              onSubmit={(event) => {
                download.reset();
                collect.reset();
                setListedInput(
                  String(new FormData(event.currentTarget).get("input") ?? ""),
                );
              }}
            >
              <Stack gap="sm">
                <NativeSelect
                  name="source"
                  defaultValue={preset?.source ?? ""}
                  label="漫画源"
                  data={[
                    { value: "", label: "使用默认源或按链接识别" },
                    ...sources.ids,
                  ]}
                  disabled={sources.ids.length === 0}
                />
                <TextInput
                  name="input"
                  defaultValue={preset?.input ?? ""}
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
              <collect.Form method="post" action="/shelf">
                <input type="hidden" name="input" value={listedInput} />
                <input type="hidden" name="source" value={series.source} />
                <Button
                  type="submit"
                  name="intent"
                  value="add"
                  variant="light"
                  mb="sm"
                  disabled={collect.state !== "idle"}
                >
                  加入书架
                </Button>
              </collect.Form>
              {collect.state === "idle" && collect.data?.error && (
                <Alert color="red" role="alert" mb="sm">
                  {collect.data.error}
                </Alert>
              )}
              {collect.state === "idle" && collect.data?.message && (
                <Text role="status" size="sm" mb="sm">
                  {collect.data.message}
                </Text>
              )}
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
