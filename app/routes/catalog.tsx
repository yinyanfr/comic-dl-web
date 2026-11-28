import { useI18n } from "../i18n-context";
import { pageTitle } from "../i18n";
import {
  Alert,
  Anchor,
  Button,
  Container,
  Group,
  NativeSelect,
  Paper,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { Form, Link, useLocation, useNavigation } from "react-router";
import { loadCatalog, type CatalogWork } from "../catalog.server";
import { comicsContext } from "../comic-runtime.server";
import { Cover } from "../cover";
import { extensionCatalog } from "../extension-catalog";
import { OptionField } from "../option-field";
import type { Route } from "./+types/catalog";
import styles from "./home.module.css";

export function meta({ matches }: Route.MetaArgs) {
  return [{ title: pageTitle(matches, "浏览来源") }];
}

export function loader({ request, context, url }: Route.LoaderArgs) {
  return loadCatalog(url, request, context.get(comicsContext));
}

function WorkGrid({
  results,
  source,
}: {
  results: CatalogWork[];
  source: string;
}) {
  const { t } = useI18n();
  const { search } = useLocation();
  if (!results.length) return <Text c="dimmed">{t("没有找到作品。")}</Text>;
  return (
    <SimpleGrid cols={{ base: 2, xs: 3, sm: 4, md: 6 }}>
      {results.map(({ input, title, coverUrl }, index) => (
        <Paper
          component="article"
          withBorder
          key={`${input}:${index}`}
          className={styles.workCard}
        >
          <Link
            className={styles.workLink}
            to={`/work?${new URLSearchParams({ source, input, title })}`}
            state={{ catalog: `/catalog${search}` }}
          >
            <Cover src={coverUrl} />
            <Title order={3} size="h6" p="xs">
              {title}
            </Title>
          </Link>
        </Paper>
      ))}
    </SimpleGrid>
  );
}

export default function Catalog({ loaderData }: Route.ComponentProps) {
  const { t } = useI18n();
  const {
    source,
    sources,
    query,
    sort,
    page,
    options,
    filters,
    results,
    groups,
    hasNext,
    error,
  } = loaderData;
  const { search } = useLocation();
  const navigation = useNavigation();
  const pending = navigation.location?.pathname === "/catalog";
  const choices = Object.entries(options?.filters ?? {});
  const sorts = options?.sorts ?? [];
  const selected = extensionCatalog.find(({ id }) => id === source);
  const settingsUrl = `/extensions#source-${source}`;

  function pageLink(number: number) {
    const params = new URLSearchParams(search);
    params.set("page", String(number));
    return `/catalog?${params}`;
  }

  return (
    <Container component="main" size="lg" className={styles.main}>
      <Stack gap="lg">
        {!source ? (
          <>
            <Title order={1}>{t("浏览来源")}</Title>
            {error && (
              <Alert role="alert" color="yellow">
                {t(error)}
              </Alert>
            )}
            {sources.length === 0 && (
              <Text c="dimmed">
                {t("还没有可用来源。请打开扩展市场检查设置。")}
              </Text>
            )}
            <Paper
              component="section"
              aria-label={t("聚合搜索")}
              p="lg"
              withBorder
            >
              <Form method="get" key={query}>
                <Group align="end">
                  <TextInput
                    name="q"
                    label={t("搜索全部来源")}
                    placeholder={t("输入漫画名称")}
                    maxLength={200}
                    defaultValue={query}
                    required
                  />
                  <Button type="submit" disabled={pending}>
                    {t("聚合搜索")}
                  </Button>
                </Group>
              </Form>
            </Paper>
            {groups ? (
              <Stack
                component="section"
                aria-label={t("聚合搜索结果")}
                aria-busy={pending}
              >
                {groups.map(({ source, results, issue, hasNext }) => {
                  const params = new URLSearchParams({
                    source,
                    q: query,
                    page: "2",
                  });
                  return (
                    <Stack
                      key={source}
                      gap="xs"
                      component="section"
                      aria-label={source}
                    >
                      <Title order={2} size="h4">
                        {extensionCatalog.find(({ id }) => id === source)
                          ?.title ?? source}
                      </Title>
                      {issue && (
                        <Text size="sm" c="dimmed">
                          {issue === "unconfigured"
                            ? t("尚未配置服务器地址或密钥。")
                            : t("此来源暂时无法搜索。")}{" "}
                          <Link to={`/extensions#source-${source}`}>
                            {t("来源设置")}
                          </Link>
                        </Text>
                      )}
                      {results && (
                        <WorkGrid results={results} source={source} />
                      )}
                      {hasNext && (
                        <Anchor
                          component={Link}
                          to={`/catalog?${params}`}
                          size="sm"
                        >
                          {t("查看此来源的下一页")}
                        </Anchor>
                      )}
                    </Stack>
                  );
                })}
                <Anchor component={Link} to="/catalog">
                  {t("返回全部来源目录")}
                </Anchor>
              </Stack>
            ) : (
              <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }}>
                {sources.map((id) => {
                  const extension = extensionCatalog.find(
                    (item) => item.id === id,
                  );
                  return (
                    <Paper key={id} component="article" withBorder p="lg">
                      <Stack gap="sm" justify="space-between" h="100%">
                        <div>
                          <Title order={2} size="h4">
                            <Link
                              className={styles.workLink}
                              to={`/catalog?source=${id}`}
                            >
                              {extension?.title ?? id}
                            </Link>
                          </Title>
                          {extension && (
                            <Text size="sm" c="dimmed" mt="xs">
                              {t(extension.description)}
                            </Text>
                          )}
                        </div>
                        <Group gap="xs">
                          <Button
                            component={Link}
                            to={`/catalog?source=${id}`}
                            variant="light"
                          >
                            {t("打开目录")}
                          </Button>
                          <Button
                            component={Link}
                            to={`/extensions#source-${id}`}
                            variant="subtle"
                          >
                            {t("来源设置")}
                          </Button>
                        </Group>
                      </Stack>
                    </Paper>
                  );
                })}
              </SimpleGrid>
            )}
          </>
        ) : (
          <>
            <Group justify="space-between">
              <div>
                <Anchor component={Link} to="/catalog" size="sm">
                  {t("全部来源")}
                </Anchor>
                <Title order={1}>{selected?.title ?? source}</Title>
              </div>
              <Button component={Link} to={settingsUrl} variant="subtle">
                {t("来源设置")}
              </Button>
            </Group>
            <Paper
              component="section"
              aria-label={t("搜索与筛选")}
              p="lg"
              withBorder
            >
              <Stack gap="md">
                <Form method="get" key={JSON.stringify([source, query])}>
                  <input type="hidden" name="source" value={source} />
                  <Group align="end">
                    <TextInput
                      name="q"
                      label={t("关键词")}
                      placeholder={t("留空浏览目录")}
                      maxLength={200}
                      defaultValue={query}
                    />
                    <Button type="submit" disabled={pending}>
                      {t("浏览 / 搜索")}
                    </Button>
                  </Group>
                </Form>
                {(sorts.length > 0 || choices.length > 0) && (
                  <Form
                    method="get"
                    key={JSON.stringify([
                      source,
                      query,
                      sort,
                      filters,
                      options,
                    ])}
                  >
                    <input type="hidden" name="source" value={source} />
                    <input type="hidden" name="q" value={query} />
                    <Group align="end">
                      {sorts.length > 0 && (
                        <NativeSelect
                          name="sort"
                          label={t("排序")}
                          defaultValue={sort ?? ""}
                          data={[
                            { value: "", label: t("来源默认排序") },
                            ...sorts.map(({ id, label }) => ({
                              value: id,
                              label,
                            })),
                          ]}
                        />
                      )}
                      {choices.map(([name, definition]) => (
                        <OptionField
                          key={name}
                          name={name}
                          definition={definition}
                          value={filters[name]}
                          emptyLabel={t("不限")}
                        />
                      ))}
                      <Button type="submit" variant="light" disabled={pending}>
                        {t("应用排序与筛选")}
                      </Button>
                    </Group>
                  </Form>
                )}
              </Stack>
            </Paper>
            {error && (
              <Alert color="yellow" role="alert">
                {t(error)} {selected && t(selected.description)}{" "}
                <Link to={settingsUrl}>{t("查看来源设置")}</Link>
              </Alert>
            )}
            {results && (
              <Stack
                component="section"
                aria-label={t("目录结果")}
                gap="sm"
                aria-busy={pending}
              >
                <Title order={2} size="h4">
                  {query ? t("搜索结果") : t("浏览结果")}
                </Title>
                <WorkGrid results={results} source={source} />
                <Group aria-label={t("目录分页")}>
                  {page > 1 && (
                    <Button
                      component={Link}
                      to={pageLink(page - 1)}
                      variant="light"
                    >
                      {t("上一页")}
                    </Button>
                  )}
                  <Text size="sm">{t("第 {page} 页", { page })}</Text>
                  {hasNext && (
                    <Button
                      component={Link}
                      to={pageLink(page + 1)}
                      variant="light"
                    >
                      {t("下一页")}
                    </Button>
                  )}
                </Group>
              </Stack>
            )}
          </>
        )}
      </Stack>
    </Container>
  );
}
