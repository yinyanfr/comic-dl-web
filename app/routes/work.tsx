import {
  Alert,
  Badge,
  Button,
  Container,
  Group,
  Image,
  Paper,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import { Link, useLocation } from "react-router";
import { z } from "zod";
import { comicsContext } from "../comic-runtime.server";
import { readWork } from "../download-actions.server";
import { extensionCatalog } from "../extension-catalog";
import { findShelfWork } from "../shelf.server";
import { reusableWebUrl, sourceInput } from "../source-input.server";
import { WorkChapters } from "../work-chapters";
import type { Route } from "./+types/work";
import styles from "./home.module.css";

export function meta({ loaderData }: Route.MetaArgs) {
  return [{ title: `${loaderData?.title ?? "作品详情"} · comic-dl-web` }];
}

const titleParam = z.string().trim().min(1).max(512);

export async function loader({ context, request, url }: Route.LoaderArgs) {
  const comics = context.get(comicsContext);
  const params = url.searchParams;
  const rawEntry = params.get("entry");
  const entryId = z.uuid().safeParse(rawEntry).data;
  const entry = entryId
    ? await findShelfWork({ id: entryId }).catch(() => undefined)
    : undefined;
  const target = sourceInput.safeParse(
    rawEntry === null
      ? {
          source: params.get("source") ?? undefined,
          input: params.get("input"),
        }
      : entry && { source: entry.sourceId, input: entry.input },
  ).data;
  const safeInput =
    target && (!URL.canParse(target.input) || reusableWebUrl(target.input))
      ? target.input
      : undefined;
  const title =
    entry?.title ??
    titleParam.safeParse(params.get("title")).data ??
    safeInput ??
    "作品详情";
  const initial = {
    title,
    source: target?.source,
    fromShelf: Boolean(entry),
  };
  if (!target || !safeInput) {
    return {
      ...initial,
      error: "无法打开作品。请返回书架或来源目录重新选择。",
    };
  }
  const { input, source } = target;
  const work = await readWork(
    comics.withDownloader,
    input,
    source,
    request.signal,
  ).catch(() => undefined);
  if (!work || (entry && work.workId !== entry.workId)) {
    return {
      ...initial,
      error: "无法获取章节。请检查来源设置、访问权限，或在书架中更新作品链接。",
    };
  }
  const saved =
    entry ??
    (await findShelfWork({
      sourceId: work.series.source,
      workId: work.workId,
    }).catch(() => undefined));
  return {
    ...initial,
    source: work.series.source,
    title: saved?.title ?? work.metadata?.title ?? title,
    metadata: work.metadata,
    input,
    series: work.series,
    onShelf: Boolean(saved),
  };
}

export default function Work({ loaderData }: Route.ComponentProps) {
  const { title, source, fromShelf } = loaderData;
  const { state } = useLocation();
  const previous = state?.catalog;
  const sourceLink =
    typeof previous === "string" && previous.startsWith("/catalog?")
      ? previous
      : `/catalog?${new URLSearchParams(source ? { source } : {})}`;
  const label =
    extensionCatalog.find(({ id }) => id === source)?.title ?? source;
  return (
    <Container component="main" size="lg" className={styles.main}>
      <Stack gap="lg">
        <Group>
          <Button
            component={Link}
            to={fromShelf ? "/" : sourceLink}
            variant="subtle"
          >
            {fromShelf ? "返回书架" : "返回来源目录"}
          </Button>
          {label && <Badge variant="light">{label}</Badge>}
        </Group>
        {"error" in loaderData ? (
          <>
            <Title order={1}>{title}</Title>
            <Alert role="alert" color="yellow">
              {loaderData.error}{" "}
              {source && (
                <Link to={`/extensions#source-${source}`}>查看来源设置</Link>
              )}
            </Alert>
          </>
        ) : (
          <>
            <Paper component="section" withBorder p="lg" aria-label="作品信息">
              <Group align="flex-start" gap="lg">
                {loaderData.metadata?.coverUrl && (
                  <Image
                    src={loaderData.metadata.coverUrl}
                    w={128}
                    radius="sm"
                    alt=""
                    referrerPolicy="no-referrer"
                    onError={({ currentTarget }) => {
                      currentTarget.hidden = true;
                    }}
                  />
                )}
                <Stack gap="xs" className={styles.workInformation}>
                  <Title order={1}>{title}</Title>
                  {Boolean(loaderData.metadata?.authors?.length) && (
                    <Text size="sm">
                      作者：{loaderData.metadata?.authors?.join("、")}
                    </Text>
                  )}
                  {Boolean(loaderData.metadata?.tags?.length) && (
                    <Group gap={6} aria-label="标签">
                      {loaderData.metadata?.tags?.map((tag, index) => (
                        <Badge variant="light" key={`${index}:${tag}`}>
                          {tag}
                        </Badge>
                      ))}
                    </Group>
                  )}
                  {loaderData.metadata?.summary && (
                    <>
                      <Title order={2} size="h5">
                        简介
                      </Title>
                      <Text size="sm" className={styles.summary}>
                        {loaderData.metadata.summary}
                      </Text>
                    </>
                  )}
                </Stack>
              </Group>
            </Paper>
            <WorkChapters
              key={loaderData.series.catalog}
              input={loaderData.input}
              title={title}
              series={loaderData.series}
              onShelf={loaderData.onShelf}
            />
          </>
        )}
      </Stack>
    </Container>
  );
}
