# 文档交接

本目录是主项目文档站的正文来源，不包含独立站点或构建工具。

| 本仓库文件               | 主项目目标文件（相对于 `docs/src/content/docs/`） | 站点地址                         |
| ------------------------ | ------------------------------------------------- | -------------------------------- |
| `webui/usage.md`         | `webui/usage.md`                                  | `/comic-dl/webui/usage/`         |
| `webui/deployment.md`    | `webui/deployment.md`                             | `/comic-dl/webui/deployment/`    |
| `en/webui/usage.md`      | `en/webui/usage.md`                               | `/comic-dl/en/webui/usage/`      |
| `en/webui/deployment.md` | `en/webui/deployment.md`                          | `/comic-dl/en/webui/deployment/` |
| `ja/webui/usage.md`      | `ja/webui/usage.md`                               | `/comic-dl/ja/webui/usage/`      |
| `ja/webui/deployment.md` | `ja/webui/deployment.md`                          | `/comic-dl/ja/webui/deployment/` |

使用普通 Markdown 和 `title` / `description` frontmatter。两篇文档间使用相对链接，部署文件使用 Web 仓库链接，不引用本地文件系统或本仓库专用站点组件。

由主项目会话复制正文、保留已有导航并验证三语构建和链接；本仓库不直接修改主项目。站点更新前，以本目录正文为准，不把空页面视为已集成。

修改功能或部署约定时同步维护三语对应章节。镜像发布前参照 [发布与验收清单](release-checklist.md)，不要把计划支持的平台或未完成的 NAS 实测标为通过。
