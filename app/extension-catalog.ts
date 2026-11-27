const official = [
  {
    id: "copymanga",
    title: "CopyManga",
    description: "拷贝漫画。支持匿名浏览、搜索及下载。",
    category: "在线漫画",
  },
  {
    id: "zerobyw",
    title: "Zerobyw",
    description: "可公开搜索；列章和下载需要有效登录会话。",
    category: "在线漫画",
  },
  {
    id: "dm5",
    title: "动漫屋 / 漫画人",
    description: "支持浏览、搜索与下载。具体可用章节取决于站点。",
    category: "在线漫画",
  },
  {
    id: "komga",
    title: "Komga",
    description: "搜索和下载自托管 Komga 书库中的漫画。",
    category: "自托管书库",
  },
  {
    id: "kavita",
    title: "Kavita",
    description: "搜索和下载自托管 Kavita 书库中的漫画。",
    category: "自托管书库",
  },
];

export const extensionCatalog = official.map((extension) => ({
  ...extension,
  name: `@comic-dl/${extension.id}`,
  docs: `https://github.com/yinyanfr/comic-dl-extensions/tree/main/extensions/${extension.id}`,
}));
