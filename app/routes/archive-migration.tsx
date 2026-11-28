import {
  Alert,
  Button,
  Container,
  Group,
  NativeSelect,
  Paper,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
  Checkbox,
} from "@mantine/core";
import { data, Link, useFetcher } from "react-router";
import { z } from "zod";
import { comicsContext } from "../comic-runtime.server";
import {
  extensionManagementEnabled,
  isAdminRequest,
  readSources,
} from "../downloader.server";
import { sourceInput } from "../source-input.server";
import type { Route } from "./+types/archive-migration";

export async function loader({ request, context }: Route.LoaderArgs) {
  if (!extensionManagementEnabled) throw new Response(null, { status: 403 });
  return {
    sources: (
      await readSources(
        context.get(comicsContext).withDownloader,
        request.signal,
      )
    ).ids,
  };
}

export async function action({ request, context }: Route.ActionArgs) {
  const respond = (
    value: {
      error?: string;
      message?: string;
      preview?: {
        token: string;
        items: { from: string; to: string; status: string }[];
      };
    },
    status = 200,
  ) =>
    data(value, { status, headers: { "Cache-Control": "private, no-store" } });
  if (!extensionManagementEnabled || !isAdminRequest(request))
    return respond({ error: "请从管理页面操作。" }, 403);
  const form = await request.formData().catch(() => null);
  if (!form) return respond({ error: "无法读取表单。" }, 400);
  const comics = context.get(comicsContext);
  try {
    if (form.get("intent") === "preview") {
      const input = form.get("input");
      const target = input
        ? sourceInput.safeParse({
            input,
            source: form.get("source") || undefined,
          })
        : undefined;
      if (target && !target.success)
        return respond({ error: "作品输入无效。" }, 400);
      return respond({ preview: await comics.previewMigration(target?.data) });
    }
    const token = z.uuid().safeParse(form.get("token")).data;
    if (
      form.get("intent") !== "apply" ||
      !token ||
      form.get("confirm") !== "yes"
    )
      return respond({ error: "请预览并确认迁移。" }, 400);
    await comics.applyMigration(token);
    return respond({ message: "迁移已完成，冲突项不会移动。" });
  } catch {
    return respond(
      {
        error:
          "无法完成迁移。请等待手动下载结束，确认输出目录及挂载可用；预览超过十分钟、设置变更或服务重启后需重新预览。",
      },
      409,
    );
  }
}

export default function ArchiveMigration({ loaderData }: Route.ComponentProps) {
  const command = useFetcher<typeof action>();
  const busy = command.state !== "idle";
  return (
    <Container component="main" size="lg" py="xl">
      <Stack>
        <Button component={Link} to="/settings" variant="subtle">
          返回设置
        </Button>
        <Title order={1}>归档迁移</Title>
        <Alert color="yellow">
          先备份归档并停止其他写入工具。预览不修改文件；应用时暂停追更并阻止新的手动下载，运行中的手动任务须先结束。仅处理能匹配作品身份的归档，未列出的文件保持不变。
        </Alert>
        <Paper withBorder p="md">
          <command.Form method="post">
            <Stack>
              <NativeSelect
                label="漫画源"
                name="source"
                data={[{ value: "", label: "自动识别" }, ...loaderData.sources]}
                disabled={busy}
              />
              <TextInput
                label="作品链接 / 短 ID（可选）"
                name="input"
                description="留空为全书架生成迁移预览；按当前归档模板和格式迁移，不移动下载根或所选子目录。"
                maxLength={4096}
                disabled={busy}
              />
              <Button
                type="submit"
                name="intent"
                value="preview"
                loading={busy}
              >
                生成迁移预览
              </Button>
            </Stack>
          </command.Form>
        </Paper>
        {command.data?.error && (
          <Alert color="red" role="alert">
            {command.data.error}
          </Alert>
        )}
        {command.data?.message && (
          <Text role="status">{command.data.message}</Text>
        )}
        {command.data?.preview && (
          <Stack>
            <Text>预览有效期十分钟。冲突项不会覆盖。</Text>
            <Table.ScrollContainer minWidth={500}>
              <Table>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>原相对路径</Table.Th>
                    <Table.Th>目标相对路径</Table.Th>
                    <Table.Th>结果</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {command.data.preview.items.map((item, index) => (
                    <Table.Tr key={index}>
                      <Table.Td>{item.from}</Table.Td>
                      <Table.Td>{item.to}</Table.Td>
                      <Table.Td>
                        {item.status === "move"
                          ? "待移动"
                          : item.status === "conflict"
                            ? "冲突"
                            : "不变"}
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </Table.ScrollContainer>
            <command.Form method="post">
              <input
                type="hidden"
                name="token"
                value={command.data.preview.token}
              />
              <Checkbox
                name="confirm"
                value="yes"
                label="已备份归档，确认应用此预览"
                required
                disabled={busy}
              />
              <Group mt="sm">
                <Button
                  type="submit"
                  name="intent"
                  value="apply"
                  loading={busy}
                  disabled={
                    !command.data.preview.items.some(
                      (item) => item.status === "move",
                    )
                  }
                >
                  应用迁移
                </Button>
              </Group>
            </command.Form>
          </Stack>
        )}
      </Stack>
    </Container>
  );
}
