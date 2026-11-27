import {
  Alert,
  Badge,
  Button,
  Checkbox,
  Container,
  Group,
  Paper,
  PasswordInput,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { useEffect, useRef } from "react";
import { Link, useFetcher, useFetchers } from "react-router";
import { comicsContext } from "../comic-runtime.server";
import { extensionCatalog } from "../extension-catalog";
import { handleExtensionAction, loadExtensions } from "../extensions.server";
import { OptionField } from "../option-field";
import type { Route } from "./+types/extensions";
import styles from "./home.module.css";

export function meta() {
  return [{ title: "扩展市场 · comic-dl-web" }];
}

export function loader({ request, context }: Route.LoaderArgs) {
  return loadExtensions(context.get(comicsContext), request.signal);
}

export function action({ request, context }: Route.ActionArgs) {
  return handleExtensionAction(request, context.get(comicsContext));
}

type Command = ReturnType<typeof useFetcher<typeof action>>;

function Feedback({
  result,
  pending = "正在应用变更…",
}: {
  result: Command;
  pending?: string;
}) {
  if (result.state !== "idle")
    return (
      <Text size="sm" role="status">
        {pending}
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

type PackageControls = {
  command: Command;
  busy: boolean;
  activeForm?: FormData;
};

function InstallForm({
  packageName,
  controls: { command, busy, activeForm },
}: {
  packageName?: string;
  controls: PackageControls;
}) {
  const surface = packageName ? `package:${packageName}` : "manual-install";
  const pending =
    activeForm?.get("intent") === "add" &&
    activeForm.get("surface") === surface;
  return (
    <command.Form
      method="post"
      action="/extensions"
      aria-busy={pending}
      className={styles.extensionCommand}
    >
      <input type="hidden" name="surface" value={surface} />
      <fieldset className={styles.extensionFields} disabled={busy}>
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
          <Button name="intent" value="add" type="submit" loading={pending}>
            {pending ? "正在安装…" : packageName ? "安装托管版本" : "安装"}
          </Button>
        </Group>
      </fieldset>
    </command.Form>
  );
}

function ManageForm({
  packageName,
  controls: { command, busy, activeForm },
}: {
  packageName?: string;
  controls: PackageControls;
}) {
  const surface = packageName ? `package:${packageName}` : "manual-manage";
  const intent =
    activeForm?.get("surface") === surface
      ? activeForm.get("intent")
      : undefined;
  return (
    <command.Form
      method="post"
      action="/extensions"
      aria-busy={Boolean(intent)}
      className={styles.extensionCommand}
    >
      <input type="hidden" name="surface" value={surface} />
      <fieldset className={styles.extensionFields} disabled={busy}>
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
            loading={intent === "update"}
          >
            {intent === "update" ? "正在更新…" : "更新"}
          </Button>
          <Button
            name="intent"
            value="remove"
            type="submit"
            variant="subtle"
            color="red"
            loading={intent === "remove"}
          >
            {intent === "remove" ? "正在卸载…" : "卸载"}
          </Button>
        </Group>
      </fieldset>
    </command.Form>
  );
}

type LoadedSource = Awaited<ReturnType<typeof loader>>["sources"][number];

function SourceCredentials({
  source,
  auth,
  writable,
  packageBusy,
}: {
  source: string;
  auth: NonNullable<LoadedSource["auth"]>;
  writable: boolean;
  packageBusy: boolean;
}) {
  const credential = useFetcher<typeof action>();
  const secret = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (
      credential.state === "idle" &&
      credential.data?.message &&
      secret.current
    )
      secret.current.value = "";
  }, [credential.state, credential.data]);
  const label =
    source === "zerobyw"
      ? "Cookie"
      : source === "kavita"
        ? "Auth Key"
        : "API Key";
  const status = {
    saved: "已保存网页凭证。",
    environment: "部署环境已提供凭证。",
    changed: "来源地址已变更，请为新地址重新保存凭证。",
    missing: "尚未配置凭证。",
  };
  return (
    <Stack component="section" aria-label="来源凭证" gap="xs">
      <Text fw={600}>来源凭证</Text>
      <Text size="sm" c="dimmed">
        {status[auth.status]}
      </Text>
      {!auth.supported && (
        <Text size="sm">当前加载的是外部扩展版本，请按扩展文档配置凭证。</Text>
      )}
      {auth.loginUrl && (
        <>
          <Group>
            <Button
              component="a"
              href={auth.loginUrl}
              target="_blank"
              rel="noopener noreferrer"
              variant="light"
            >
              在新标签页登录 Zerobyw
            </Button>
          </Group>
          <Text size="sm" c="dimmed">
            登录后打开一部作品，在浏览器开发者工具的「网络」面板刷新页面，复制发往
            Zerobyw 的作品请求中 Cookie 请求头的值，再粘贴到下方。
          </Text>
        </>
      )}
      {writable && auth.supported && !auth.target && (
        <Text size="sm">请先保存有效的服务器地址。</Text>
      )}
      {writable && (auth.supported || auth.saved) && (
        <credential.Form method="post" action="/extensions">
          <input type="hidden" name="source" value={source} />
          <input type="hidden" name="target" value={auth.target ?? ""} />
          <Stack gap="xs">
            {auth.target && auth.supported && (
              <>
                <PasswordInput
                  ref={secret}
                  name="credential"
                  label={label}
                  autoComplete="off"
                  description={`仅用于 ${auth.target}`}
                  maxLength={8192}
                  disabled={packageBusy}
                  required
                />
                <Group>
                  <Button
                    type="submit"
                    name="intent"
                    value="save-credential"
                    disabled={packageBusy || credential.state !== "idle"}
                  >
                    保存凭证
                  </Button>
                </Group>
              </>
            )}
            {auth.saved && (
              <Group>
                <Button
                  type="submit"
                  name="intent"
                  value="clear-credential"
                  variant="subtle"
                  formNoValidate
                  disabled={packageBusy || credential.state !== "idle"}
                >
                  清除网页凭证
                </Button>
              </Group>
            )}
            <Feedback result={credential} />
          </Stack>
        </credential.Form>
      )}
    </Stack>
  );
}

function SourceSettings({
  source,
  writable,
  packageBusy,
}: {
  source: LoadedSource;
  writable: boolean;
  packageBusy: boolean;
}) {
  const save = useFetcher<typeof action>();
  return (
    <Paper
      component="article"
      id={`source-${source.id}`}
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
          <Button
            component={Link}
            to={`/catalog?source=${source.id}`}
            variant="light"
            size="compact-sm"
          >
            打开目录
          </Button>
        </Group>
        {source.options.length === 0 && (
          <Text size="sm" c="dimmed">
            没有声明可编辑的设置。
          </Text>
        )}
        {(source.options.length > 0 || source.hasSaved) && (
          <save.Form method="post" action="/extensions">
            <fieldset
              disabled={!writable || packageBusy || save.state !== "idle"}
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
        {source.auth && (
          <SourceCredentials
            source={source.id}
            auth={source.auth}
            writable={writable}
            packageBusy={packageBusy}
          />
        )}
      </Stack>
    </Paper>
  );
}

export default function Extensions({ loaderData }: Route.ComponentProps) {
  const { sources, issues, installed, deploymentPackages, writable } =
    loaderData;
  const command = useFetcher<typeof action>();
  const fetchers = useFetchers();
  const packageBusy = command.state !== "idle";
  const activeForm = packageBusy ? command.formData : undefined;
  const bulkPending = activeForm?.get("intent") === "update-all";
  const busy =
    packageBusy ||
    fetchers.some(
      ({ formAction, formMethod }) =>
        formAction === "/extensions" && formMethod?.toUpperCase() === "POST",
    );
  const controls = { command, busy, activeForm };
  const loaded = new Set(sources.map(({ id }) => id));
  const managed = new Set(installed ?? []);
  const outsideCatalog = [...managed].filter(
    (name) => !extensionCatalog.some((item) => item.name === name),
  );

  return (
    <Container component="main" size="lg" className={styles.main}>
      <Stack gap="lg">
        <Title order={1}>扩展市场</Title>
        <Alert color={writable ? "yellow" : "blue"}>
          {writable
            ? "扩展代码会在本服务中运行。安装或更新前请确认你信任包的发布者。"
            : "当前为只读模式。部署者可开启扩展管理来安装扩展和编辑来源设置。"}
        </Alert>
        {writable && (
          <Paper
            component="section"
            aria-label="全局扩展管理"
            withBorder
            p="md"
          >
            <Stack gap="xs">
              <command.Form
                method="post"
                action="/extensions"
                aria-busy={bulkPending}
              >
                <Button
                  type="submit"
                  name="intent"
                  value="update-all"
                  loading={bulkPending}
                  disabled={busy}
                >
                  {bulkPending ? "正在检查并更新…" : "检查并更新全部托管扩展"}
                </Button>
              </command.Form>
              <Text size="sm" c="dimmed">
                按安装时的版本范围检查并应用更新。内置扩展随应用更新，也可安装托管版本；卸载后恢复内置版本。
              </Text>
              <Feedback
                result={command}
                pending={
                  bulkPending
                    ? "正在检查并更新全部托管扩展…"
                    : activeForm?.get("intent") === "remove"
                      ? "正在卸载扩展…"
                      : activeForm?.get("intent") === "update"
                        ? "正在更新扩展…"
                        : "正在安装扩展…"
                }
              />
            </Stack>
          </Paper>
        )}
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
                    <Badge variant="light">随应用提供</Badge>
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
                    {loaded.has(extension.id) && (
                      <>
                        <Button
                          component={Link}
                          to={`/catalog?source=${extension.id}`}
                          variant="light"
                          size="compact-sm"
                        >
                          打开目录
                        </Button>
                        <Button
                          component="a"
                          href={`#source-${extension.id}`}
                          variant="subtle"
                          size="compact-sm"
                        >
                          来源设置
                        </Button>
                      </>
                    )}
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
                    <ManageForm
                      packageName={extension.name}
                      controls={controls}
                    />
                  )}
                  {writable &&
                    !managed.has(extension.name) &&
                    !deploymentPackages.includes(extension.name) && (
                      <InstallForm
                        packageName={extension.name}
                        controls={controls}
                      />
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
              <Paper
                key={name}
                component="article"
                aria-label={name}
                withBorder
                p="sm"
              >
                <Stack gap="xs">
                  <Text size="sm" fw={600}>
                    {name}
                  </Text>
                  {writable && (
                    <ManageForm packageName={name} controls={controls} />
                  )}
                </Stack>
              </Paper>
            ))}
            {writable && (
              <SimpleGrid cols={{ base: 1, sm: 2 }}>
                <Stack gap="xs">
                  <Title order={3} size="h6">
                    按 npm 包名安装
                  </Title>
                  <InstallForm controls={controls} />
                </Stack>
                <Stack gap="xs">
                  <Title order={3} size="h6">
                    按 npm 包名更新或卸载
                  </Title>
                  <ManageForm controls={controls} />
                </Stack>
              </SimpleGrid>
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
                packageBusy={packageBusy}
              />
            ))}
          </Stack>
        </section>
      </Stack>
    </Container>
  );
}
