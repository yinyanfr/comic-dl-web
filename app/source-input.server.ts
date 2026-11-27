import { z } from "zod";

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

export const sourceInput = z.object({
  input: workInput,
  source: z
    .string()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
    .optional(),
});
