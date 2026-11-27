import { data } from "react-router";
import { z } from "zod";
import type { ComicRuntime } from "./comic-runtime.server";
import {
  isAdminRequest,
  deploymentPackages,
  extensionManagementEnabled,
  packageName,
} from "./downloader.server";
import { readOptionFields } from "./option-fields.server";
import { reusableWebUrl, sourceId } from "./source-input.server";
import {
  credentialSources,
  credentialTarget,
  hasSourceCredential,
  normalizeCredentialTarget,
  sourceCredential,
} from "./source-credentials.server";

const version = z
  .string()
  .max(100)
  .regex(/^[a-zA-Z0-9^~][a-zA-Z0-9._^~+-]*$/);
const operation = z.discriminatedUnion("intent", [
  z.object({
    intent: z.literal("add"),
    name: packageName,
    version: z.union([z.literal(""), version]),
    trust: z.literal("yes"),
  }),
  z.object({ intent: z.enum(["update", "remove"]), name: packageName }),
  z.object({ intent: z.literal("update-all") }),
  z.object({ intent: z.enum(["settings", "reset"]), source: sourceId }),
  z.object({
    intent: z.literal("save-credential"),
    source: credentialSources,
    target: credentialTarget,
    credential: sourceCredential.shape.value,
  }),
  z.object({
    intent: z.literal("clear-credential"),
    source: credentialSources,
  }),
]);
const respond = data<{ message?: string; error?: string }>;

function loadIssue(cause: unknown) {
  const message = cause instanceof Error ? cause.message : "";
  // Show only validated identifiers from the core's messages, never paths or causes.
  const missing = /^Could not load extension (\S+)$/.exec(message)?.[1];
  if (packageName.safeParse(missing).success) return `${missing} 无法加载。`;
  const invalid = /^Invalid source extension (\S+): expected API version /.exec(
    message,
  )?.[1];
  if (packageName.safeParse(invalid).success)
    return `${invalid} 不兼容当前扩展 API。`;
  const duplicate = /^Duplicate source ID: ([a-z0-9-]+) \(/.exec(message)?.[1];
  if (sourceId.safeParse(duplicate).success)
    return `来源 ID ${duplicate} 冲突。`;
  return "有扩展无法加载，请检查扩展目录或部署配置。";
}

export async function loadExtensions(
  comics: ComicRuntime,
  signal: AbortSignal,
) {
  const issues: string[] = [];
  const snapshot = await comics
    .inspect(
      async (downloader, { settings, installed, credentials }) => {
        const sources = downloader.sources().map((id) => {
          const saved = Object.hasOwn(settings, id) ? settings[id] : {};
          const options = Object.entries(downloader.sourceSettings(id)).map(
            ([key, definition]) => {
              const { env, default: declaredDefault, ...field } = definition;
              const show = (value: typeof declaredDefault) =>
                field.type !== "url" ||
                (typeof value === "string" && reusableWebUrl(value))
                  ? value
                  : undefined;
              return {
                key,
                field,
                value: show(saved[key]),
                fallback: show(declaredDefault),
                hasEnvironment: Boolean(env),
              };
            },
          );
          let settingsInvalid = false;
          let target: string | undefined;
          try {
            const effective = downloader.validateSourceSettings(id);
            target = normalizeCredentialTarget(
              id,
              effective[id === "zerobyw" ? "site-url" : "server-url"],
            );
          } catch {
            settingsInvalid = true;
          }
          const credentialSource = credentialSources.safeParse(id).data;
          const savedCredential =
            credentialSource && credentials[credentialSource];
          return {
            id,
            options,
            settingsInvalid,
            hasSaved: Object.keys(saved).length > 0,
            auth:
              credentialSource &&
              ({
                target,
                loginUrl:
                  id === "zerobyw" && target
                    ? new URL("/member.php?mod=logging&action=login", target)
                        .href
                    : undefined,
                supported: comics.usesBundledSource(downloader, id),
                saved: Boolean(savedCredential),
                status: savedCredential
                  ? savedCredential.target === target
                    ? "saved"
                    : "changed"
                  : hasSourceCredential(id, {})
                    ? "environment"
                    : "missing",
              } as const),
          };
        });
        return { sources, installed };
      },
      signal,
      (cause) => {
        issues.push(loadIssue(cause));
      },
    )
    .catch(() => {
      issues.push("无法读取扩展配置或托管目录。");
      return { sources: [], installed: comics.lastManagedPackages() };
    });
  return {
    ...snapshot,
    issues: [...new Set(issues)],
    deploymentPackages,
    writable: extensionManagementEnabled,
  };
}

export async function handleExtensionAction(
  request: Request,
  comics: ComicRuntime,
) {
  if (!extensionManagementEnabled) {
    return respond({ error: "部署者尚未开启扩展管理。" }, { status: 403 });
  }
  if (!isAdminRequest(request)) {
    return respond(
      { error: "请从扩展市场页面发起管理操作。" },
      { status: 403 },
    );
  }
  const form = await request.formData().catch(() => null);
  if (!form) return respond({ error: "无法读取表单。" }, { status: 400 });
  const parsed = operation.safeParse(Object.fromEntries(form));
  if (!parsed.success) {
    return respond({ error: "提交的扩展操作或字段无效。" }, { status: 400 });
  }
  const command = parsed.data;
  const { intent } = command;
  let failedMessage =
    "扩展操作失败。请确认包名、版本、npm 仓库及来源兼容性。下方显示当前加载结果。";
  try {
    if (intent === "save-credential" || intent === "clear-credential") {
      failedMessage = "无法保存凭证。请确认来源地址、凭证格式和服务端存储。";
      const value =
        intent === "save-credential" ? command.credential.trim() : undefined;
      if (
        intent === "save-credential" &&
        (!value ||
          (command.source === "zerobyw" &&
            !/^[^=;\s]+=[^;]*(?:;.*)?$/.test(value.replace(/^Cookie: */i, ""))))
      )
        return respond({ error: failedMessage }, { status: 422 });
      await comics.saveCredential(
        command.source,
        value,
        intent === "save-credential" ? command.target : undefined,
      );
      return respond({
        message:
          intent === "save-credential"
            ? "凭证已保存。"
            : "已清除网页保存的凭证。",
      });
    }
    if ("source" in command) {
      failedMessage = "无法保存来源设置。请检查字段值和服务端存储。";
      await comics.saveSettings(command.source, (downloader) =>
        intent === "reset"
          ? {}
          : readOptionFields(downloader.sourceSettings(command.source), form),
      );
      return respond({
        message:
          intent === "reset" ? "已恢复部署配置与默认值。" : "来源设置已生效。",
      });
    }
    const result =
      intent === "add"
        ? await comics.manage(
            intent,
            command.version
              ? `${command.name}@${command.version}`
              : command.name,
          )
        : intent === "update-all"
          ? await comics.manage("update", undefined)
          : await comics.manage(command.intent, command.name);
    if (!result) {
      return respond(
        { error: "已有扩展操作正在执行，请等待完成。" },
        { status: 409 },
      );
    }
    if (!result.saved) {
      return respond({
        message: "扩展操作已完成，但无法保存包清单；请检查 Web 配置目录。",
      });
    }
    return respond({
      message: result.changed ? "扩展操作已完成。" : "没有需要变更的扩展。",
    });
  } catch {
    return respond({ error: failedMessage }, { status: 422 });
  }
}
