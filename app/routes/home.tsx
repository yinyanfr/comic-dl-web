import {
  Badge,
  Container,
  Group,
  Paper,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import { listSourceIds } from "../downloader.server";
import type { Route } from "./+types/home";
import styles from "./home.module.css";

export function meta() {
  return [{ title: "comic-dl-web" }];
}

export function loader() {
  return { sourceIds: listSourceIds() };
}

export default function Home({
  loaderData: { sourceIds },
}: Route.ComponentProps) {
  return (
    <Container component="main" size="sm" className={styles.main}>
      <Stack gap="xl">
        <header>
          <Title order={1}>comic-dl-web</Title>
          <Text c="dimmed" mt="xs">
            comic-dl 的自托管 Web 界面
          </Text>
        </header>
        <Paper
          component="section"
          aria-labelledby="sources-heading"
          withBorder
          p="lg"
          className={styles.sources}
        >
          <Title id="sources-heading" order={2} size="h4" mb="sm">
            已加载的漫画源
          </Title>
          {sourceIds.length > 0 ? (
            <Group gap="xs">
              {sourceIds.map((id) => (
                <Badge key={id} variant="light">
                  {id}
                </Badge>
              ))}
            </Group>
          ) : (
            <Text c="dimmed">尚未加载漫画源。</Text>
          )}
        </Paper>
      </Stack>
    </Container>
  );
}
