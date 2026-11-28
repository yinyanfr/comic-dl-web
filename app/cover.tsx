import { Image } from "@mantine/core";
import styles from "./routes/home.module.css";

export function Cover({ src }: { src?: string }) {
  return (
    <div className={styles.cover} aria-hidden="true">
      <span>暂无封面</span>
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
