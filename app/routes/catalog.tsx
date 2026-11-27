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
import { Form, Link, useFetcher } from "react-router";
import { loadCatalog } from "../catalog.server";
import { OptionField } from "../option-field";
import type { Route } from "./+types/catalog";
import type { action as shelfAction } from "./shelf";
import styles from "./home.module.css";

export function meta() {
  return [{ title: "漫画目录 · comic-dl-web" }];
}

export function loader({ request, context }: Route.LoaderArgs) {
  return loadCatalog(request, context.comics);
}

function Result({
  source,
  result,
}: {
  source: string;
  result: { title: string; input: string };
}) {
  const collect = useFetcher<typeof shelfAction>();
  const download = new URLSearchParams({ source, input: result.input });
  return (
    <Paper component="article" p="md" withBorder>
      <Stack gap="xs">
        <Title order={3} size="h6">
          {result.title}
        </Title>
        <Group>
          <Button component={Link} to={`/?${download}`} variant="light">
            查看与下载
          </Button>
          <collect.Form method="post" action="/shelf">
            <input type="hidden" name="source" value={source} />
            <input type="hidden" name="input" value={result.input} />
            <input type="hidden" name="title" value={result.title} />
            <Button
              type="submit"
              name="intent"
              value="add"
              variant="subtle"
              disabled={collect.state !== "idle"}
            >
              加入书架
            </Button>
          </collect.Form>
        </Group>
        {collect.state === "idle" && collect.data?.error && (
          <Alert role="alert" color="red">
            {collect.data.error}
          </Alert>
        )}
        {collect.state === "idle" && collect.data?.message && (
          <Text role="status" size="sm">
            {collect.data.message}
          </Text>
        )}
      </Stack>
    </Paper>
  );
}

export default function Catalog({ loaderData }: Route.ComponentProps) {
  const {
    source,
    sources,
    query,
    sort,
    page,
    options,
    filters,
    results,
    hasNext,
    error,
  } = loaderData;
  const choices = Object.entries(options?.filters ?? {});
  const sorts = options?.sorts ?? [];

  function pageLink(number: number) {
    const params = new URLSearchParams({
      source: source ?? "",
      q: query,
      page: String(number),
    });
    if (sort) params.set("sort", sort);
    for (const [name, value] of Object.entries(filters))
      params.set(`option.${name}`, String(value));
    return `/catalog?${params}`;
  }

  return (
    <Container component="main" size="lg" className={styles.main}>
      <Stack gap="lg">
        <Group component="header" justify="space-between">
          <Title order={1}>漫画目录</Title>
          <Group gap="xs">
            <Button component={Link} to="/" variant="subtle">
              手动下载
            </Button>
            <Button component={Link} to="/shelf" variant="subtle">
              书架
            </Button>
            <Button component={Link} to="/extensions" variant="subtle">
              扩展市场
            </Button>
          </Group>
        </Group>
        <Paper
          component="section"
          aria-labelledby="catalog-heading"
          p="lg"
          withBorder
        >
          <Stack gap="md">
            <Title id="catalog-heading" order={2} size="h4">
              浏览与搜索
            </Title>
            {sources.length === 0 && (
              <Text c="dimmed">还没有可用来源。请先到扩展市场安装来源。</Text>
            )}
            <Form method="get" key={JSON.stringify([source, query])}>
              <Group align="end">
                <NativeSelect
                  name="source"
                  label="漫画源"
                  required
                  defaultValue={source ?? ""}
                  data={[{ value: "", label: "请选择来源" }, ...sources]}
                />
                <TextInput
                  name="q"
                  label="关键词"
                  placeholder="留空浏览目录"
                  maxLength={200}
                  defaultValue={query}
                />
                <Button type="submit" disabled={sources.length === 0}>
                  浏览 / 搜索
                </Button>
              </Group>
            </Form>
            {source && (sorts.length > 0 || choices.length > 0) && (
              <Form
                method="get"
                key={JSON.stringify([source, query, sort, filters, options])}
              >
                <input type="hidden" name="source" value={source} />
                <input type="hidden" name="q" value={query} />
                <Group align="end">
                  {sorts.length > 0 && (
                    <NativeSelect
                      name="sort"
                      label="排序"
                      defaultValue={sort ?? ""}
                      data={[
                        { value: "", label: "来源默认排序" },
                        ...sorts.map(({ id, label }) => ({ value: id, label })),
                      ]}
                    />
                  )}
                  {choices.map(([name, definition]) => (
                    <OptionField
                      key={name}
                      name={name}
                      definition={definition}
                      value={filters[name]}
                      emptyLabel="不限"
                    />
                  ))}
                  <Button type="submit" variant="light">
                    应用排序与筛选
                  </Button>
                </Group>
              </Form>
            )}
            {error && (
              <Alert color="yellow" role="alert">
                {error}
              </Alert>
            )}
          </Stack>
        </Paper>
        {source && results && (
          <Stack component="section" aria-label="目录结果" gap="sm">
            <Title order={2} size="h4">
              {query ? "搜索结果" : "浏览结果"}
            </Title>
            {results.length === 0 && <Text c="dimmed">没有找到作品。</Text>}
            {results.map((result, index) => (
              <Result
                key={`${result.input}:${index}`}
                source={source}
                result={result}
              />
            ))}
            <Group aria-label="目录分页">
              {page > 1 && (
                <Button
                  component={Link}
                  to={pageLink(page - 1)}
                  variant="light"
                >
                  上一页
                </Button>
              )}
              <Text size="sm">第 {page} 页</Text>
              {hasNext && (
                <Button
                  component={Link}
                  to={pageLink(page + 1)}
                  variant="light"
                >
                  下一页
                </Button>
              )}
            </Group>
          </Stack>
        )}
      </Stack>
    </Container>
  );
}
