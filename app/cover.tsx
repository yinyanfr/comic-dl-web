import { useI18n } from "./i18n-context";
import { Image } from "@mantine/core";
import styles from "./routes/home.module.css";

export function Cover({ src }: { src?: string }) {
  const { t } = useI18n();
  return (
    <div className={styles.cover} aria-hidden="true">
      <span>{t("暂无封面")}</span>
      {src && (
        <Image
          key={src}
          src={src}
          alt=""
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={({ currentTarget }) => {
            currentTarget.hidden = true;
          }}
        />
      )}
    </div>
  );
}
