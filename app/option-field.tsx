import { NativeSelect, TextInput } from "@mantine/core";
import type { OptionDefinition, OptionValue } from "comic-dl/extension";

export function OptionField({
  name,
  definition,
  value,
  emptyLabel,
}: {
  name: string;
  definition: OptionDefinition;
  value?: OptionValue;
  emptyLabel: string;
}) {
  const props = {
    name: `option.${name}`,
    label: definition.label,
    description: definition.description,
    defaultValue: value === undefined ? "" : String(value),
  };
  if (definition.type === "select" || definition.type === "boolean") {
    const choices =
      definition.type === "select"
        ? definition.choices.map(({ id, label }) => ({ value: id, label }))
        : [
            { value: "true", label: "是" },
            { value: "false", label: "否" },
          ];
    return (
      <NativeSelect
        {...props}
        data={[{ value: "", label: emptyLabel }, ...choices]}
      />
    );
  }
  if (definition.type === "integer") {
    return (
      <TextInput
        {...props}
        type="number"
        step={1}
        min={definition.min}
        max={definition.max}
        placeholder={emptyLabel}
      />
    );
  }
  return (
    <TextInput
      {...props}
      type={definition.type}
      maxLength={4096}
      placeholder={emptyLabel}
    />
  );
}
