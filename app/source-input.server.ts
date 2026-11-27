import { z } from "zod";

const credentialParameter =
  /^(?:auth(?:orization)?|(?:access|auth|refresh|id)[_-]?token|token|api[_-]?key|key|password|passwd|cookie|session(?:[_-]?id)?|signature|sig|x-amz-.+|x-goog-.+)$/i;

export function reusableWebUrl(input: string) {
  const url = URL.parse(input);
  return Boolean(
    url &&
    /^https?:$/.test(url.protocol) &&
    !url.username &&
    !url.password &&
    !input.includes("\\") &&
    ![url.searchParams, new URLSearchParams(url.hash.slice(1))].some((params) =>
      [...params.keys()].some((name) => credentialParameter.test(name)),
    ),
  );
}

export const workInput = z
  .string()
  .trim()
  .min(1)
  .max(4096)
  .refine((input) => {
    const url = URL.parse(input);
    if (url) {
      return (
        (url.protocol === "http:" || url.protocol === "https:") &&
        !url.username &&
        !url.password &&
        !input.includes("\\")
      );
    }
    return /^[^\s/\\:]+$/.test(input) && input !== "." && input !== "..";
  });

export const sourceId = z
  .string()
  .max(128)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);

export const sourceInput = z.object({
  input: workInput,
  source: sourceId.optional(),
});
