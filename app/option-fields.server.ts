import type { OptionDefinition, OptionValue } from "comic-dl/extension";
import { reusableWebUrl } from "./source-input.server";

export function readOptionFields(
  definitions: Readonly<Record<string, OptionDefinition>>,
  entries: Iterable<[string, FormDataEntryValue]>,
) {
  const values: Record<string, OptionValue> = Object.create(null);
  const seen = new Set<string>();
  for (const [name, raw] of entries) {
    if (!name.startsWith("option.")) continue;
    const key = name.slice("option.".length);
    if (
      !Object.hasOwn(definitions, key) ||
      seen.has(key) ||
      typeof raw !== "string" ||
      raw.length > 4096
    )
      throw new Error("Invalid option field");
    seen.add(key);
    if (raw === "") continue;
    const type = definitions[key].type;
    if (type === "integer") {
      if (!/^-?\d+$/.test(raw) || !Number.isSafeInteger(Number(raw)))
        throw new Error("Invalid integer");
      values[key] = Number(raw);
    } else if (type === "boolean") {
      if (raw !== "true" && raw !== "false") throw new Error("Invalid boolean");
      values[key] = raw === "true";
    } else {
      if (type === "url" && !reusableWebUrl(raw))
        throw new Error("Invalid reusable URL");
      values[key] = raw;
    }
  }
  return values;
}
