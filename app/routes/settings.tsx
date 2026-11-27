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
  useMantineColorScheme,
} from "@mantine/core";
import { useMounted } from "@mantine/hooks";
import { data, Link, useFetcher } from "react-router";
import { comicsContext } from "../comic-runtime.server";
import {
  extensionManagementEnabled,
  isAdminRequest,
  librarySettings,
  readSources,
  watchOptions,
} from "../downloader.server";
import { extensionCatalog } from "../extension-catalog";
import type { Route } from "./+types/settings";
import styles from "./home.module.css";

export function meta() {
  return [{ title: "设置 · comic-dl-web" }];
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const comics = context.get(comicsContext);
  const { ids } = await readSources(comics.withDownloader, request.signal);
  return {
    library: comics.library(),
    sources: ids,
    writable: extensionManagementEnabled,
    hasOutputMarker: Boolean(watchOptions.outputMarker),
  };
}

export async function action({ context, request }: Route.ActionArgs) {
  const respond = data<{ message?: string; error?: string }>;
  if (!extensionManagementEnabled || !isAdminRequest(request))
    return respond(
      { error: "请从已开启管理功能的设置页面发起操作。" },
      { status: 403 },
    );
  const form = await request.formData().catch(() => null);
  const intent = form?.get("intent");
  const comics = context.get(comicsContext);
  try {
    if (intent === "reset") {
      await comics.saveLibrary(undefined);
    } else if (intent === "save" && form) {
      const settings = librarySettings.safeParse({
        folder: form.get("folder"),
        intervalSeconds: form.get("intervalSeconds"),
        defaultSource: form.get("defaultSource") || undefined,
      });
      if (!settings.success)
        return respond(
          { error: "请检查子目录、检查间隔和默认来源。" },
          { status: 400 },
        );
      if (settings.data.folder && watchOptions.outputMarker)
        return respond(
          { error: "已启用挂载标记，下载子目录必须留空。" },
          { status: 422 },
        );
      await comics.saveLibrary(settings.data);
    } else {
      return respond({ error: "无法识别设置操作。" }, { status: 400 });
    }
    return respond({
      message: intent === "reset" ? "已恢复部署默认值。" : "服务设置已生效。",
    });
  } catch {
    return respond(
      { error: "无法保存设置。请确认子目录已存在、来源可用且配置文件可写。" },
      { status: 422 },
    );
  }
}

function AppearanceSettings() {
  const { colorScheme, setColorScheme } = useMantineColorScheme();
  const mounted = useMounted();
  return (
    <Paper component="section" p="lg" withBorder>
      <Stack gap="sm">
        <Title order={2} size="h4">
          外观
        </Title>
        <NativeSelect
          label="颜色模式"
          description="仅保存在当前浏览器"
          disabled={!mounted}
          value={mounted ? colorScheme : "auto"}
          data={[
            { value: "auto", label: "跟随系统" },
            { value: "light", label: "日间模式" },
            { value: "dark", label: "夜间模式" },
          ]}
          onChange={({ currentTarget }) => {
            const value = currentTarget.value;
            if (value === "auto" || value === "light" || value === "dark")
              setColorScheme(value);
          }}
        />
      </Stack>
    </Paper>
  );
}

export default function Settings({ loaderData }: Route.ComponentProps) {
  const { library, sources, writable, hasOutputMarker } = loaderData;
  const save = useFetcher<typeof action>();
  const choices = [
    ...new Set([
      ...sources,
      ...(library.defaultSource ? [library.defaultSource] : []),
    ]),
  ];
  return (
    <Container component="main" size="lg" className={styles.main}>
      <Stack gap="lg">
        <Title order={1}>设置</Title>
        <AppearanceSettings />
        <Paper component="section" p="lg" withBorder>
          <Stack gap="sm">
            <Title order={2} size="h4">
              下载与追更
            </Title>
            {!writable && (
              <Text size="sm" c="dimmed">
                部署者尚未开启网页管理；以下为当前设置。
              </Text>
            )}
            <save.Form method="post" key={JSON.stringify(library)}>
              <Stack gap="sm">
                <TextInput
                  label="下载子目录"
                  name="folder"
                  defaultValue={library.folder}
                  description={
                    hasOutputMarker
                      ? "部署者已启用挂载标记，只能使用下载根目录。请将子目录留空。"
                      : "已存在的相对路径，例如 Manga/新作。留空则写入部署者配置的下载根目录。"
                  }
                  maxLength={512}
                  disabled={!writable}
                />
                <TextInput
                  label="追更间隔（秒）"
                  description="已有追更作品会保留已排定的检查时间；下次成功的自动检查后使用新间隔。也可在书架手动检查，让追更服务提前检查。"
                  name="intervalSeconds"
                  type="number"
                  min={1}
                  max={31_536_000}
                  required
                  defaultValue={library.intervalSeconds}
                  disabled={!writable}
                />
                <NativeSelect
                  label="默认下载来源"
                  name="defaultSource"
                  disabled={!writable}
                  description="没有明确选源时使用；选择自动识别可由作品地址决定。"
                  defaultValue={library.defaultSource ?? ""}
                  data={[
                    { value: "", label: "自动识别" },
                    ...choices.map((id) => ({
                      value: id,
                      label:
                        extensionCatalog.find((source) => source.id === id)
                          ?.title ?? id,
                      disabled: !sources.includes(id),
                    })),
                  ]}
                />
                {writable && (
                  <Group>
                    <Button
                      type="submit"
                      name="intent"
                      value="save"
                      disabled={save.state !== "idle"}
                    >
                      保存设置
                    </Button>
                    <Button
                      type="submit"
                      name="intent"
                      value="reset"
                      variant="subtle"
                      formNoValidate
                      disabled={save.state !== "idle"}
                    >
                      恢复部署默认值
                    </Button>
                  </Group>
                )}
                {save.data?.error && (
                  <Alert color="red" role="alert">
                    {save.data.error}
                  </Alert>
                )}
                {save.data?.message && (
                  <Text size="sm" role="status">
                    {save.data.message}
                  </Text>
                )}
              </Stack>
            </save.Form>
          </Stack>
        </Paper>
        <Paper component="section" p="lg" withBorder>
          <Stack gap="sm">
            <Title order={2} size="h4">
              漫画来源
            </Title>
            <Text size="sm">
              网站地址、Cookie 和 API Key 在对应来源的设置中管理。
            </Text>
            <Group>
              <Button component={Link} variant="light" to="/extensions">
                打开来源设置
              </Button>
            </Group>
          </Stack>
        </Paper>
      </Stack>
    </Container>
  );
}
