import { Menu, ActionIcon } from "@mantine/core";
import { Icon } from "./icons";
import { languageNames, locales } from "./i18n";
import { changeLanguage, useI18n } from "./i18n-context";

export function LanguagePicker() {
  const { t, locale } = useI18n();
  return (
    <Menu position="bottom-end">
      <Menu.Target>
        <ActionIcon
          size={36}
          variant="subtle"
          title={t("语言")}
          aria-label={t("语言")}
        >
          <Icon name="language" />
        </ActionIcon>
      </Menu.Target>
      <Menu.Dropdown>
        {locales.map((value) => (
          <Menu.Item
            key={value}
            lang={value}
            aria-current={value === locale ? "true" : undefined}
            onClick={() => changeLanguage(value)}
          >
            {languageNames[value]}
          </Menu.Item>
        ))}
      </Menu.Dropdown>
    </Menu>
  );
}
