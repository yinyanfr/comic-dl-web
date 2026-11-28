import { useI18n } from "../i18n-context";
import { pageTitle, readLocale } from "../i18n";
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

export function meta({ matches }: Route.MetaArgs) {
  return [{ title: pageTitle(matches, "扩展市场") }];
}

export function loader({ request, context }: Route.LoaderArgs) {
  return loadExtensions(
    context.get(comicsContext),
    request.signal,
    readLocale(request.headers.get("cookie")),
  );
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
  const { t } = useI18n();
  if (result.state !== "idle")
    return (
      <Text size="sm" role="status">
        {t(pending)}
      </Text>
    );
  if (result.data?.error)
    return (
      <Alert color="red" role="alert">
        {t(result.data.error)}
      </Alert>
    );
  if (result.data?.message)
    return (
      <Text size="sm" role="status">
        {t(result.data.message)}
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
  const { t } = useI18n();
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
            label={t("npm 包名")}
            name="name"
            placeholder="@scope/package"
            maxLength={214}
            required
          />
        )}
        {!packageName && (
          <TextInput
            label={t("版本范围或标签（可选）")}
            name="version"
            placeholder={t("^1.2.0 或 latest")}
            maxLength={100}
          />
        )}
        {packageName && <input type="hidden" name="version" value="" />}
        <Checkbox
          name="trust"
          value="yes"
          label={t("我信任此发布者")}
          required
        />
        <Group>
          <Button name="intent" value="add" type="submit" loading={pending}>
            {pending
              ? t("正在安装…")
              : packageName
                ? t("安装托管版本")
                : t("安装")}
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
  const { t } = useI18n();
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
            label={t("已安装的 npm 包名")}
            name="name"
            placeholder="@scope/package"
            maxLength={214}
            required
          />
        )}
        <Group gap="xs">
          <Button
            name="intent"
            value="check-updates"
            type="submit"
            variant="light"
            formNoValidate
            loading={intent === "check-updates"}
          >
            {t("检查更新")}
          </Button>
          <Button
            name="intent"
            value="update"
            type="submit"
            variant="light"
            loading={intent === "update"}
          >
            {intent === "update" ? t("正在更新…") : t("更新")}
          </Button>
          <Button
            name="intent"
            value="remove"
            type="submit"
            variant="subtle"
            color="red"
            loading={intent === "remove"}
            formNoValidate
          >
            {intent === "remove" ? t("正在卸载…") : t("卸载")}
          </Button>
        </Group>
        <Checkbox
          name="confirm"
          value="yes"
          label={t("确认按保存范围应用更新")}
          required
        />
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
  const { t } = useI18n();
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
    saved: t("已保存网页凭证。"),
    environment: t("部署环境已提供凭证。"),
    changed: t("来源地址已变更，请为新地址重新保存凭证。"),
    missing: t("尚未配置凭证。"),
  };
  return (
    <Stack component="section" aria-label={t("来源凭证")} gap="xs">
      <Text fw={600}>{t("来源凭证")}</Text>
      <Text size="sm" c="dimmed">
        {status[auth.status]}
      </Text>
      {!auth.supported && (
        <Text size="sm">
          {t("当前加载的是外部扩展版本，请按扩展文档配置凭证。")}
        </Text>
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
              {t("在新标签页登录 Zerobyw")}
            </Button>
          </Group>
          <Text size="sm" c="dimmed">
            {t(
              "登录后打开一部作品，在浏览器开发者工具的「网络」面板刷新页面，复制发往 Zerobyw 的作品请求中 Cookie 请求头的值，再粘贴到下方。",
            )}
          </Text>
        </>
      )}
      {writable && auth.supported && !auth.target && (
        <Text size="sm">{t("请先保存有效的服务器地址。")}</Text>
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
                  description={t("仅用于 {target}", { target: auth.target })}
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
                    {t("保存凭证")}
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
                  {t("清除网页凭证")}
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
  packages,
  controls,
}: {
  source: LoadedSource;
  writable: boolean;
  packageBusy: boolean;
  packages: Route.ComponentProps["loaderData"]["packages"];
  controls: PackageControls;
}) {
  const { t } = useI18n();
  const save = useFetcher<typeof action>();
  return (
    <Paper
      component="article"
      id={`source-${source.id}`}
      aria-label={t("来源 {id}", { id: source.id })}
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
            {source.settingsInvalid ? t("设置无效") : t("已加载")}
          </Badge>
          <Button
            component={Link}
            to={`/catalog?source=${source.id}`}
            variant="light"
            size="compact-sm"
          >
            {t("打开目录")}
          </Button>
        </Group>
        {packages
          .filter((item) => item.sourceId === source.id)
          .map((item) => (
            <Stack key={item.package} gap="xs">
              <Text size="xs">
                {item.package} · {item.version ?? t("未知版本")} ·{" "}
                {item.requested}
              </Text>
              {writable && (
                <ManageForm packageName={item.package} controls={controls} />
              )}
            </Stack>
          ))}
        {source.options.length === 0 && (
          <Text size="sm" c="dimmed">
            {t("没有声明可编辑的设置。")}
          </Text>
        )}
        {(source.options.length > 0 || source.hasSaved) && (
          <save.Form method="post" action="/extensions">
            <fieldset
              disabled={!writable || packageBusy || save.state !== "idle"}
              className={styles.chapterList}
            >
              <legend>{t("来源设置")}</legend>
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
                          ? t("沿用部署设置或默认值")
                          : fallback === undefined
                            ? t("沿用默认值")
                            : t("默认：{value}", { value: String(fallback) })
                      }
                    />
                  ),
                )}
                {writable && (
                  <Group>
                    <Button type="submit" name="intent" value="settings">
                      {t("保存设置")}
                    </Button>
                    <Button
                      type="submit"
                      name="intent"
                      value="reset"
                      variant="subtle"
                      disabled={!source.hasSaved}
                    >
                      {t("恢复默认")}
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
  const { t } = useI18n();
  const { sources, issues, installed, packages, deploymentPackages, writable } =
    loaderData;
  const command = useFetcher<typeof action>();
  const fetchers = useFetchers();
  const packageBusy = command.state !== "idle";
  const activeForm = packageBusy ? command.formData : undefined;
  const bulkPending = activeForm?.get("intent") === "update-all";
  const checkPending =
    activeForm?.get("intent") === "check-updates" && !activeForm.get("name");
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
        <Title order={1}>{t("扩展市场")}</Title>
        <Alert color={writable ? "yellow" : "blue"}>
          {writable
            ? t(
                "扩展代码会在本服务中运行。安装或更新前请确认你信任包的发布者。",
              )
            : t(
                "当前为只读模式。部署者可开启扩展管理来安装扩展和编辑来源设置。",
              )}
        </Alert>
        {writable && (
          <Paper
            component="section"
            aria-label={t("全局扩展管理")}
            withBorder
            p="md"
          >
            <Stack gap="xs">
              <command.Form
                method="post"
                action="/extensions"
                aria-busy={checkPending}
              >
                <Button
                  type="submit"
                  name="intent"
                  value="check-updates"
                  loading={checkPending}
                  disabled={busy}
                >
                  {checkPending
                    ? t("正在检查更新…")
                    : t("检查全部托管扩展更新")}
                </Button>
              </command.Form>
              {command.data?.updates && (
                <Stack gap="xs">
                  {command.data.updates.map((item) => (
                    <Text size="sm" key={item.package}>
                      {item.package} · {item.version ?? t("未知")} →{" "}
                      {item.updateStatus === "failed"
                        ? t("检查失败")
                        : item.updateStatus === "current"
                          ? t("已是范围内最新版本")
                          : item.availableVersion}
                    </Text>
                  ))}
                  {command.data.updates.some(
                    (item) => item.updateStatus === "available",
                  ) && (
                    <command.Form method="post" action="/extensions">
                      <Checkbox
                        name="confirm"
                        value="yes"
                        label={t("确认应用全部托管扩展更新")}
                        required
                        disabled={busy}
                      />
                      <Button
                        type="submit"
                        name="intent"
                        value="update-all"
                        loading={bulkPending}
                        disabled={busy}
                      >
                        {t("应用全部更新")}
                      </Button>
                    </command.Form>
                  )}
                </Stack>
              )}
              <Text size="sm" c="dimmed">
                {t(
                  "检查不会安装或切换版本。应用时按保存范围重新解析；固定版本不会自动跨版本升级。内置扩展随应用更新，卸载托管包后恢复内置版本。",
                )}
              </Text>
              <Feedback
                result={command}
                pending={
                  bulkPending
                    ? t("正在应用全部托管扩展更新…")
                    : activeForm?.get("intent") === "check-updates"
                      ? t("正在检查更新，当前版本保持不变…")
                      : activeForm?.get("intent") === "remove"
                        ? t("正在卸载扩展…")
                        : activeForm?.get("intent") === "update"
                          ? t("正在更新扩展…")
                          : t("正在安装扩展…")
                }
              />
            </Stack>
          </Paper>
        )}
        <section aria-labelledby="official-heading">
          <Title id="official-heading" order={2} size="h4" mb="sm">
            {t("推荐扩展")}
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
                    <Badge variant="light">{t(extension.category)}</Badge>
                  </Group>
                  <Text size="sm" className={styles.taskId}>
                    {extension.name}
                  </Text>
                  <Text size="sm">{t(extension.description)}</Text>
                  {packages
                    .filter((item) => item.package === extension.name)
                    .map((item) => (
                      <Text size="xs" key={item.package}>
                        {t("版本 {version} · 范围 {range} · 来源 {source}", {
                          version: item.version ?? t("未知"),
                          range: item.requested,
                          source: item.sourceId ?? t("未知"),
                        })}{" "}
                        ·{" "}
                        {item.status === "loaded"
                          ? t("定义可加载")
                          : t("加载失败")}
                      </Text>
                    ))}
                  <Group gap="xs">
                    <Badge variant="light">{t("随应用提供")}</Badge>
                    {loaded.has(extension.id) && (
                      <Badge color="teal" variant="light">
                        {t("来源已加载")}
                      </Badge>
                    )}
                    {managed.has(extension.name) && (
                      <Badge variant="light">{t("托管包")}</Badge>
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
                          {t("打开目录")}
                        </Button>
                        <Button
                          component="a"
                          href={`#source-${extension.id}`}
                          variant="subtle"
                          size="compact-sm"
                        >
                          {t("来源设置")}
                        </Button>
                      </>
                    )}
                    <Button
                      component="a"
                      href={extension.docs}
                      variant="subtle"
                      size="compact-sm"
                    >
                      {t("使用文档")}
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
              {t("托管扩展")}
            </Title>
            <Text size="sm" c="dimmed">
              {t(
                "清单来自当前托管目录。定义可加载不代表账号或站点可用；从 CLI 变更扩展后请重启服务。",
              )}
            </Text>
            {deploymentPackages.length > 0 && (
              <Text size="sm">
                {t("由部署环境加载：{packages}", {
                  packages: deploymentPackages.join(", "),
                })}
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
                  {packages
                    .filter((item) => item.package === name)
                    .map((item) => (
                      <Text key={name} size="xs">
                        {t("版本 {version} · 范围 {range} · 来源 {source}", {
                          version: item.version ?? t("未知"),
                          range: item.requested,
                          source: item.sourceId ?? t("未知"),
                        })}{" "}
                        ·{" "}
                        {item.status === "loaded"
                          ? t("定义可加载")
                          : t("加载失败")}
                      </Text>
                    ))}
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
                    {t("按 npm 包名安装")}
                  </Title>
                  <InstallForm controls={controls} />
                </Stack>
                <Stack gap="xs">
                  <Title order={3} size="h6">
                    {t("按 npm 包名更新或卸载")}
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
              {t("已加载来源")}
            </Title>
            {issues.length > 0 && (
              <Alert color="yellow" title={t("扩展加载问题")}>
                <Stack gap="xs">
                  {issues.map((issue) => (
                    <Text key={issue} size="sm">
                      {t(issue)}
                    </Text>
                  ))}
                </Stack>
              </Alert>
            )}
            {sources.length === 0 && (
              <Text c="dimmed">{t("尚未加载漫画源。")}</Text>
            )}
            {sources.map((source) => (
              <SourceSettings
                key={source.id}
                source={source}
                writable={writable}
                packageBusy={packageBusy}
                packages={packages}
                controls={controls}
              />
            ))}
          </Stack>
        </section>
      </Stack>
    </Container>
  );
}
