import { useI18n } from "../i18n-context";
import { pageTitle } from "../i18n";
import {
  Alert,
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
import { useState } from "react";
import { useFetcher, useOutletContext } from "react-router";
import { comicsContext } from "../comic-runtime.server";
import { DownloadTasks } from "../download-tasks";
import type { DownloadTaskSnapshot } from "../download-queue.server";
import { handleDownloadAction } from "../download-actions.server";
import { readSources } from "../downloader.server";
import { reusableWebUrl, sourceInput } from "../source-input.server";
import { WorkChapters } from "../work-chapters";
import type { Route } from "./+types/downloads";
import styles from "./home.module.css";

export function meta({ matches }: Route.MetaArgs) {
  return [{ title: pageTitle(matches, "手动下载") }];
}

export async function loader({ request, context, url }: Route.LoaderArgs) {
  const comics = context.get(comicsContext);
  const sources = await readSources(comics.withDownloader, request.signal);
  const params = url.searchParams;
  const target = sourceInput.safeParse({
    input: params.get("input"),
    source: params.get("source") || undefined,
  }).data;
  const preset =
    target && (!URL.canParse(target.input) || reusableWebUrl(target.input))
      ? target
      : undefined;
  return { sources, preset };
}

export function action({ request, context }: Route.ActionArgs) {
  return handleDownloadAction(request, context.get(comicsContext));
}

export default function Downloads({ loaderData }: Route.ComponentProps) {
  return (
    <DownloadWorkspace
      key={JSON.stringify(loaderData.preset ?? null)}
      {...loaderData}
    />
  );
}

function DownloadWorkspace({
  sources,
  preset,
}: Route.ComponentProps["loaderData"]) {
  const { t } = useI18n();
  const lookup = useFetcher<typeof action>();
  const tasks = useOutletContext<DownloadTaskSnapshot[]>();
  const [listedInput, setListedInput] = useState("");
  const series = lookup.state === "idle" ? lookup.data?.series : undefined;
  const lookingUp = lookup.state !== "idle";
  const inputsDisabled = sources.ids.length === 0 || lookingUp;

  return (
    <Container component="main" size="lg" className={styles.main}>
      <Title order={1} mb="lg">
        {t("手动下载")}
      </Title>

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
              {t("下载漫画")}
            </Title>
            <Text size="sm" c="dimmed" mt={4} mb="md">
              {t("输入作品链接查看章节，或直接下载单个章节。")}
            </Text>
            {sources.unavailable ? (
              <Alert color="yellow" mb="md">
                {t("部分或全部漫画源无法加载，请检查扩展市场和服务端配置。")}
              </Alert>
            ) : sources.ids.length === 0 ? (
              <Alert mb="md">{t("尚未加载漫画源。")}</Alert>
            ) : null}
            <lookup.Form
              method="post"
              onChange={() => lookup.reset()}
              onSubmit={(event) => {
                setListedInput(
                  String(new FormData(event.currentTarget).get("input") ?? ""),
                );
              }}
            >
              <Stack gap="sm">
                <NativeSelect
                  name="source"
                  defaultValue={preset?.source ?? ""}
                  label={t("漫画源")}
                  data={[
                    { value: "", label: t("使用默认源或按链接识别") },
                    ...sources.ids,
                  ]}
                  disabled={sources.ids.length === 0}
                />
                <TextInput
                  name="input"
                  defaultValue={preset?.input ?? ""}
                  label={t("作品或章节链接 / 短 ID")}
                  placeholder={
                    sources.ids.includes("fixture")
                      ? t("离线测试可输入 demo")
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
                      ? t("正在读取…")
                      : t("查看章节")}
                  </Button>
                  <Button
                    type="submit"
                    name="intent"
                    value="chapter"
                    variant="light"
                    disabled={inputsDisabled}
                  >
                    {t("下载章节直链")}
                  </Button>
                </Group>
              </Stack>
            </lookup.Form>
            {!lookingUp && lookup.data?.error && (
              <Alert color="red" role="alert" mt="md">
                {t(lookup.data.error)}
              </Alert>
            )}
            {!lookingUp && lookup.data?.taskId && (
              <Text role="status" size="sm" c="dimmed" mt="md">
                {t("已提交任务：{id}", { id: lookup.data.taskId })}
              </Text>
            )}
          </Paper>

          {series && <WorkChapters input={listedInput} series={series} />}
        </Stack>

        <DownloadTasks tasks={tasks} />
      </div>
    </Container>
  );
}
