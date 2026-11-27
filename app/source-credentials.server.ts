import { z } from "zod";
import { reusableWebUrl } from "./source-input.server.ts";

export const credentialSources = z.enum(["zerobyw", "komga", "kavita"]);

const variableNames = {
  zerobyw: ["COMIC_DL_ZEROBYW_COOKIE", "COMIC_DL_ZEROBYW_COOKIE_ORIGIN"],
  komga: ["COMIC_DL_KOMGA_API_KEY", "COMIC_DL_KOMGA_API_KEY_URL"],
  kavita: ["COMIC_DL_KAVITA_API_KEY", "COMIC_DL_KAVITA_API_KEY_URL"],
} as const;

export const credentialTarget = z.string().max(2048).refine(reusableWebUrl);
export const sourceCredential = z.object({
  target: credentialTarget,
  value: z
    .string()
    .min(1)
    .max(8192)
    .regex(/^[\x20-\x7e]+$/),
});
export const sourceCredentials = z.partialRecord(
  credentialSources,
  sourceCredential,
);
export type SourceCredentials = z.infer<typeof sourceCredentials>;

export function normalizeCredentialTarget(source: string, value: unknown) {
  const parsed = credentialTarget.safeParse(value);
  if (!parsed.success) return;
  const url = new URL(parsed.data);
  if (url.search || url.hash) return;
  if (source === "zerobyw")
    return url.protocol === "https:" && url.pathname === "/"
      ? url.origin
      : undefined;
  url.pathname = `${url.pathname.replace(/\/+$/, "")}/`;
  return url.href;
}

export function hasSourceCredential(
  source: string,
  credentials: SourceCredentials,
  target?: string,
) {
  const parsed = credentialSources.safeParse(source);
  if (!parsed.success) return false;
  const saved = credentials[parsed.data];
  if (saved) return target ? saved.target === target : true;
  const [secret, binding] = variableNames[parsed.data];
  if (!process.env[secret]?.trim()) return false;
  if (!target) return true;
  const base =
    process.env[binding] ??
    process.env[
      source === "komga" ? "COMIC_DL_KOMGA_URL" : "COMIC_DL_KAVITA_URL"
    ];
  return normalizeCredentialTarget(source, base) === target;
}

// The published adapters read these variables synchronously when creating the source.
// Restore them before any I/O, including npm child processes.
export function withSourceCredential<T>(
  id: string,
  credentials: SourceCredentials,
  create: () => T,
): T {
  const parsed = credentialSources.safeParse(id);
  const credential = parsed.success ? credentials[parsed.data] : undefined;
  if (!credential || !parsed.success) return create();
  const [secret, binding] = variableNames[parsed.data];
  const previousSecret = process.env[secret];
  const previousBinding = process.env[binding];
  try {
    process.env[secret] = credential.value;
    process.env[binding] = credential.target;
    return create();
  } finally {
    if (previousSecret === undefined) delete process.env[secret];
    else process.env[secret] = previousSecret;
    if (previousBinding === undefined) delete process.env[binding];
    else process.env[binding] = previousBinding;
  }
}
