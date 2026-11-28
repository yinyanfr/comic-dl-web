import { useI18n } from "./i18n-context";
import {
  Alert,
  Badge,
  Button,
  Checkbox,
  Group,
  Paper,
  Stack,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { useFetcher } from "react-router";
import type { readWork } from "./download-actions.server";
import type { action as downloadAction } from "./routes/downloads";
import type { action as shelfAction } from "./routes/shelf";
import styles from "./routes/home.module.css";

export function WorkChapters({
  input,
  title,
  series,
  onShelf = false,
}: {
  input: string;
  title?: string;
  series: Awaited<ReturnType<typeof readWork>>["series"];
  onShelf?: boolean;
}) {
  const { t } = useI18n();
  const download = useFetcher<typeof downloadAction>();
  const collect = useFetcher<typeof shelfAction>();
  const submitting = download.state !== "idle";
  return (
    <Paper
      component="section"
      aria-labelledby="chapters-heading"
      withBorder
      p="lg"
    >
      <Stack gap="sm">
        <Group justify="space-between">
          <Title id="chapters-heading" order={2} size="h4">
            {t("章节列表")}
          </Title>
          <Badge variant="light">
            {t("{source} · {count} 章", {
              source: series.source,
              count: series.chapters.length,
            })}
          </Badge>
        </Group>
        {onShelf || collect.data?.message ? (
          <Text role="status" size="sm">
            {collect.data?.message ? t(collect.data.message) : t("已在书架中")}
          </Text>
        ) : (
          <collect.Form method="post" action="/shelf">
            <input type="hidden" name="source" value={series.source} />
            <input type="hidden" name="input" value={input} />
            {title && <input type="hidden" name="title" value={title} />}
            <Button
              type="submit"
              name="intent"
              value="add"
              variant="light"
              loading={collect.state !== "idle"}
            >
              {t("加入书架")}
            </Button>
          </collect.Form>
        )}
        {collect.state === "idle" && collect.data?.error && (
          <Alert color="red" role="alert">
            {t(collect.data.error)}
          </Alert>
        )}
        {series.chapters.length === 0 ? (
          <Text c="dimmed">{t("这个作品没有可选章节。")}</Text>
        ) : (
          <download.Form method="post" action="/downloads">
            <input type="hidden" name="input" value={input} />
            <input type="hidden" name="source" value={series.source} />
            <input type="hidden" name="catalog" value={series.catalog} />
            {title && <input type="hidden" name="title" value={title} />}
            <fieldset className={styles.chapterList} disabled={submitting}>
              <legend>{t("选择章节")}</legend>
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
                label={t("章节范围（可选）")}
                description={t(
                  "按列表序号，两端都包含。可与勾选的章节一同提交。",
                )}
                placeholder="2-4"
                pattern="[0-9]+-[0-9]+"
                maxLength={41}
              />
              <Group>
                <Button
                  type="submit"
                  name="intent"
                  value="series"
                  disabled={submitting}
                >
                  {t("提交下载")}
                </Button>
                <Button
                  type="submit"
                  name="intent"
                  value="missing"
                  variant="light"
                  formNoValidate
                  disabled={submitting}
                >
                  {onShelf ? t("下载全部未下载章节") : t("下载全部章节")}
                </Button>
              </Group>
              <Text size="sm" c="dimmed">
                {t("已有的 CBZ 会自动跳过。")}
              </Text>
            </Stack>
          </download.Form>
        )}
        {!submitting && download.data?.error && (
          <Alert color="red" role="alert">
            {t(download.data.error)}
          </Alert>
        )}
        {!submitting && download.data?.taskId && (
          <Text role="status" size="sm">
            {t("已提交任务：{id}", { id: download.data.taskId })}
          </Text>
        )}
      </Stack>
    </Paper>
  );
}
