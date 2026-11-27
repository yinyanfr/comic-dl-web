import {
  Alert,
  Badge,
  Button,
  Checkbox,
  Container,
  Group,
  Paper,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { Link, useFetcher } from "react-router";
import { extensionCatalog } from "../extension-catalog";
import { handleExtensionAction, loadExtensions } from "../extensions.server";
import { OptionField } from "../option-field";
import type { Route } from "./+types/extensions";
import styles from "./home.module.css";

export function meta() {
  return [{ title: "扩展市场 · comic-dl-web" }];
}

export function loader({ request, context }: Route.LoaderArgs) {
  return loadExtensions(context.comics, request.signal);
}

export function action({ request, context }: Route.ActionArgs) {
  return handleExtensionAction(request, context.comics);
}

type Command = ReturnType<typeof useFetcher<typeof action>>;

function Feedback({ result }: { result: Command }) {
  if (result.state !== "idle")
    return (
      <Text size="sm" role="status">
        正在应用变更…
      </Text>
    );
  if (result.data?.error)
    return (
      <Alert color="red" role="alert">
        {result.data.error}
      </Alert>
    );
  if (result.data?.message)
    return (
      <Text size="sm" role="status">
        {result.data.message}
      </Text>
    );
  return null;
}

function InstallForm({ packageName }: { packageName?: string }) {
  const install = useFetcher<typeof action>();
  return (
    <install.Form method="post">
      <Stack gap="xs">
        {packageName ? (
          <input type="hidden" name="name" value={packageName} />
        ) : (
          <TextInput
            label="npm 包名"
            name="name"
            placeholder="@scope/package"
            maxLength={214}
            required
          />
        )}
        {!packageName && (
          <TextInput
            label="版本范围或标签（可选）"
            name="version"
            placeholder="^1.2.0 或 latest"
            maxLength={100}
          />
        )}
        {packageName && <input type="hidden" name="version" value="" />}
        <Checkbox name="trust" value="yes" label="我信任此发布者" required />
        <Group>
          <Button
            name="intent"
            value="add"
            type="submit"
            disabled={install.state !== "idle"}
          >
            安装
          </Button>
        </Group>
        <Feedback result={install} />
      </Stack>
    </install.Form>
  );
}

function ManageForm({ packageName }: { packageName?: string }) {
  const manage = useFetcher<typeof action>();
  return (
    <manage.Form method="post">
      <Stack gap="xs">
        {packageName ? (
          <input type="hidden" name="name" value={packageName} />
        ) : (
          <TextInput
            label="已安装的 npm 包名"
            name="name"
            placeholder="@scope/package"
            maxLength={214}
            required
          />
        )}
        <Group gap="xs">
          <Button
            name="intent"
            value="update"
            type="submit"
            variant="light"
            disabled={manage.state !== "idle"}
          >
            更新
          </Button>
          <Button
            name="intent"
            value="remove"
            type="submit"
            variant="subtle"
            color="red"
            disabled={manage.state !== "idle"}
          >
            卸载
          </Button>
        </Group>
        <Feedback result={manage} />
      </Stack>
    </manage.Form>
  );
}

type LoadedSource = Awaited<ReturnType<typeof loader>>["sources"][number];

function SourceSettings({
  source,
  writable,
}: {
  source: LoadedSource;
  writable: boolean;
}) {
  const save = useFetcher<typeof action>();
  return (
    <Paper
      component="article"
      aria-label={`来源 ${source.id}`}
      withBorder
      p="md"
    >
      <Stack gap="sm">
        <Group>
          <Title order={3} size="h6">
            {source.id}
          </Title>
          <Badge
            variant="light"
            color={source.settingsInvalid ? "yellow" : "teal"}
          >
            {source.settingsInvalid ? "设置无效" : "已加载"}
          </Badge>
        </Group>
        {source.options.length === 0 && (
          <Text size="sm" c="dimmed">
            没有声明可编辑的设置。
          </Text>
        )}
        {(source.options.length > 0 || source.hasSaved) && (
          <save.Form method="post">
            <fieldset
              disabled={!writable || save.state !== "idle"}
              className={styles.chapterList}
            >
              <legend>来源设置</legend>
              <input type="hidden" name="source" value={source.id} />
              <Stack gap="sm">
                {source.options.map(
                  ({ key, field, value, fallback, hasEnvironment }) => (
                    <OptionField
                      key={JSON.stringify([key, field, value])}
                      name={key}
                      definition={field}
                      value={value}
                      emptyLabel={
                        hasEnvironment
                          ? "沿用部署设置或默认值"
                          : fallback === undefined
                            ? "沿用默认值"
                            : `默认：${String(fallback)}`
                      }
                    />
                  ),
                )}
                {writable && (
                  <Group>
                    <Button type="submit" name="intent" value="settings">
                      保存设置
                    </Button>
                    <Button
                      type="submit"
                      name="intent"
                      value="reset"
                      variant="subtle"
                      disabled={!source.hasSaved}
                    >
                      恢复默认
                    </Button>
                  </Group>
                )}
              </Stack>
            </fieldset>
          </save.Form>
        )}
        <Feedback result={save} />
      </Stack>
    </Paper>
  );
}

export default function Extensions({ loaderData }: Route.ComponentProps) {
  const { sources, issues, installed, deploymentPackages, writable } =
    loaderData;
  const bulk = useFetcher<typeof action>();
  const loaded = new Set(sources.map(({ id }) => id));
  const managed = new Set(installed ?? []);
  const outsideCatalog = [...managed].filter(
    (name) => !extensionCatalog.some((item) => item.name === name),
  );

  return (
    <Container component="main" size="lg" className={styles.main}>
      <Stack gap="lg">
        <Group component="header" justify="space-between">
          <Title order={1}>扩展市场</Title>
          <Group gap="xs">
            <Button component={Link} to="/" variant="subtle">
              手动下载
            </Button>
            <Button component={Link} to="/catalog" variant="subtle">
              漫画目录
            </Button>
          </Group>
        </Group>
        <Alert color={writable ? "yellow" : "blue"}>
          {writable
            ? "扩展代码会在本服务中运行。安装或更新前请确认你信任包的发布者。站点凭据由部署环境提供。"
            : "当前为只读模式。部署者可开启扩展管理来安装扩展和编辑来源设置。"}
        </Alert>
        <section aria-labelledby="official-heading">
          <Title id="official-heading" order={2} size="h4" mb="sm">
            推荐扩展
          </Title>
          <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }}>
            {extensionCatalog.map((extension) => (
              <Paper
                component="article"
                aria-label={extension.title}
                key={extension.id}
                withBorder
                p="md"
              >
                <Stack gap="xs">
                  <Group>
                    <Title order={3} size="h5">
                      {extension.title}
                    </Title>
                    <Badge variant="light">{extension.category}</Badge>
                  </Group>
                  <Text size="sm" className={styles.taskId}>
                    {extension.name}
                  </Text>
                  <Text size="sm">{extension.description}</Text>
                  <Group gap="xs">
                    {loaded.has(extension.id) && (
                      <Badge color="teal" variant="light">
                        来源已加载
                      </Badge>
                    )}
                    {managed.has(extension.name) && (
                      <Badge variant="light">托管包</Badge>
                    )}
                  </Group>
                  <Group gap="xs">
                    <Button
                      component="a"
                      href={extension.docs}
                      variant="subtle"
                      size="compact-sm"
                    >
                      使用文档
                    </Button>
                    <Button
                      component="a"
                      href={`https://www.npmjs.com/package/${extension.name}`}
                      variant="subtle"
                      size="compact-sm"
                    >
                      npm
                    </Button>
                  </Group>
                  {writable && managed.has(extension.name) && (
                    <ManageForm packageName={extension.name} />
                  )}
                  {writable &&
                    !managed.has(extension.name) &&
                    !deploymentPackages.includes(extension.name) && (
                      <InstallForm packageName={extension.name} />
                    )}
                </Stack>
              </Paper>
            ))}
          </SimpleGrid>
        </section>
        <Paper
          component="section"
          aria-labelledby="managed-heading"
          withBorder
          p="lg"
        >
          <Stack gap="md">
            <Title id="managed-heading" order={2} size="h4">
              托管扩展
            </Title>
            <Text size="sm" c="dimmed">
              包清单来自上次管理操作。若通过 CLI
              安装或更新过扩展，可按包名管理；当前加载状态以下方来源列表为准。
            </Text>
            {deploymentPackages.length > 0 && (
              <Text size="sm">
                由部署环境加载：{deploymentPackages.join("、")}
              </Text>
            )}
            {outsideCatalog.map((name) => (
              <Paper key={name} withBorder p="sm">
                <Stack gap="xs">
                  <Text size="sm" fw={600}>
                    {name}
                  </Text>
                  {writable && <ManageForm packageName={name} />}
                </Stack>
              </Paper>
            ))}
            {writable && (
              <>
                <bulk.Form method="post">
                  <Button
                    type="submit"
                    name="intent"
                    value="update-all"
                    variant="light"
                    disabled={bulk.state !== "idle"}
                  >
                    更新全部托管扩展
                  </Button>
                </bulk.Form>
                <Feedback result={bulk} />
                <SimpleGrid cols={{ base: 1, sm: 2 }}>
                  <Stack gap="xs">
                    <Title order={3} size="h6">
                      按 npm 包名安装
                    </Title>
                    <InstallForm />
                  </Stack>
                  <Stack gap="xs">
                    <Title order={3} size="h6">
                      按 npm 包名更新或卸载
                    </Title>
                    <ManageForm />
                  </Stack>
                </SimpleGrid>
              </>
            )}
          </Stack>
        </Paper>
        <section aria-labelledby="sources-heading">
          <Stack gap="sm">
            <Title id="sources-heading" order={2} size="h4">
              已加载来源
            </Title>
            {issues.length > 0 && (
              <Alert color="yellow" title="扩展加载问题">
                <Stack gap="xs">
                  {issues.map((issue) => (
                    <Text key={issue} size="sm">
                      {issue}
                    </Text>
                  ))}
                </Stack>
              </Alert>
            )}
            {sources.length === 0 && <Text c="dimmed">尚未加载漫画源。</Text>}
            {sources.map((source) => (
              <SourceSettings
                key={source.id}
                source={source}
                writable={writable}
              />
            ))}
          </Stack>
        </section>
      </Stack>
    </Container>
  );
}
