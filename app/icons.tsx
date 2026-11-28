import type { SVGProps } from "react";

const paths = {
  shelf: "M4 4v16h16M8 4v12m5-12v12m4-11 3 10",
  search: "m16 16 5 5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0",
  extensions: "M4 4h6v6H4zm10 0h6v6h-6zM4 14h6v6H4zm13 0v6m-3-3h6",
  download: "M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5",
  settings: "M4 7h16M4 17h16M9 4v6m6 4v6",
  moon: "M20 14A8 8 0 0 1 10 4a8 8 0 1 0 10 10",
  sun: "M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1 1m12 12 1 1M5 19l1-1M18 6l1-1M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0",
  language:
    "M3 5h12M9 3v2m4 0c-1 6-4 9-9 11m1-8c1 3 4 6 8 8m1 5 4-11 4 11m-6-4h4",
  refresh: "M20 7v5h-5M4 17v-5h5M6 6a8 8 0 0 1 14 6M4 12a8 8 0 0 0 14 6",
  pause: "M8 4v16M16 4v16",
  play: "m7 4 14 8-14 8Z",
  history: "M3 4v6h6M3 10a9 9 0 1 1 1 8m8-12v6l4 2",
  grid: "M3 3h7v7H3zm11 0h7v7h-7zM3 14h7v7H3zm11 0h7v7h-7z",
  list: "M3 4h5v6H3zm9 1h9m-9 4h9M3 14h5v6H3zm9 1h9m-9 4h9",
  warning: "m12 3 10 18H2ZM12 9v5m0 3v1",
} as const;

export type IconName = keyof typeof paths;

export function Icon({
  name,
  ...props
}: SVGProps<SVGSVGElement> & { name: IconName }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <path d={paths[name]} />
    </svg>
  );
}
