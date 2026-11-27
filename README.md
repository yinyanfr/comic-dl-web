# comic-dl-web

[`comic-dl`](https://github.com/yinyanfr/comic-dl) 的自托管 Web 界面。功能范围与里程碑见 [PLAN.md](PLAN.md)。

默认运行方式是服务直接运行在 NAS 上，由服务下载并把 CBZ 写入 NAS 自己的漫画共享目录。浏览器只负责提交和查看任务，不传输漫画文件。

## 本地开发

使用 `.node-version` 指定的 Node.js 24：

```sh
npm ci
npm run dev
```

开发服务器默认在 `http://localhost:5173`。用 `COMIC_DL_WEB_FIXTURE=1 npm run dev` 显式启用离线测试源；在首页选择 `fixture`，输入 `demo`，即可查看章节并下载到 `./downloads`。测试源只接受 `demo`，不接受本机路径。

## 手动下载

输入作品链接或短 ID，点击「查看章节」，再勾选章节或输入包含两端的序号范围，例如 `2-4`。也可以输入章节链接后直接提交。任务在服务端排队，关闭页面后仍会继续；可取消排队或运行中的任务。每章保存为一个 CBZ，重复下载时会跳过已经完整归档的章节。重启服务会清空手动任务列表和队列，已完成的 CBZ 会保留。

在线源由部署者配置。安装受信任的 npm 扩展后，用环境变量指定来源和输出路径：

| 变量                          | 用途                                                                |
| ----------------------------- | ------------------------------------------------------------------- |
| `COMIC_DL_WEB_EXTENSIONS`     | 已安装的 npm 扩展包名，多个用逗号分隔                               |
| `COMIC_DL_WEB_EXTENSION_DIR`  | `comic-dl` 托管扩展目录，默认 `./data/extensions`                   |
| `COMIC_DL_WEB_DEFAULT_SOURCE` | 可选，未在页面选源时优先使用的来源 ID；没有默认源时由核心按链接匹配 |
| `COMIC_DL_WEB_OUTPUT`         | NAS 上服务可写的本地漫画目录，默认 `./downloads`                    |

来源凭据按各扩展的文档由运行环境提供。

如果 NAS 的共享名称是符号链接，请将 `COMIC_DL_WEB_OUTPUT` 指向共享的实际目录；核心会拒绝沿符号链接写入 CBZ。

## 扩展市场与漫画目录

打开「扩展市场」查看 CopyManga、Zerobyw、动漫屋 / 漫画人、Komga 和 Kavita 的推荐包、文档及当前已加载来源。市场默认只读；部署者可设置 `COMIC_DL_WEB_ENABLE_EXTENSION_MANAGEMENT=1` 开启安装、更新、卸载和来源设置。扩展代码在服务进程中运行，只安装你信任的 npm 包。开启管理时，请仅在本机访问，或通过已认证的反向代理访问；若代理终止 TLS 或改变了主机名，设置 `COMIC_DL_WEB_ADMIN_ORIGIN` 为浏览器访问的准确 origin，例如 `https://comics.example.com`（无尾斜杠）。

可以安装推荐包，或输入 npm 包名及可选的简单版本范围或标签（如 `^0.2.0`、`latest`）。更新遵守安装时保存的范围。托管包清单来自上次管理操作；若使用既有 CLI 扩展目录，可按包名管理，页面的已加载来源列表会独立显示。从 CLI 变更同一扩展目录后，请重启 Web 服务以切换追更使用的扩展。

来源设置和上一次管理返回的托管包名默认保存到 `./data/sources.json`（可用 `COMIC_DL_WEB_SOURCE_STATE` 覆盖）。「恢复默认」会清除 Web 对该来源的设置，恢复部署环境和扩展默认值。登录凭据仍按各来源文档从部署环境提供。

在「漫画目录」选择来源，输入关键词搜索或留空浏览；排序和筛选由来源提供。可从结果加入书架，或打开已预填的手动下载表单。没有目录接口的来源可继续用作品链接或短 ID 下载。

## 书架与追更

在「书架」输入作品链接或短 ID，或从首页的章节列表加入书架。收藏后可开启、暂停或恢复订阅。首次成功检查只记录当时已有的章节；后续检查发现的新章节由服务自动下载。可以手动检查单条或全部订阅，或对单条订阅点击「补下载历史」。下载失败或受限的章节会出现在「需处理章节」，修复原因后可重试。移除作品会清除其书架和订阅记录，已有 CBZ 会保留。

| 变量                          | 用途                                                               |
| ----------------------------- | ------------------------------------------------------------------ |
| `COMIC_DL_WEB_SHELF`          | SQLite 书架文件，默认 `./data/shelf.sqlite`；放在 NAS 本地持久存储 |
| `COMIC_DL_WEB_WATCH_INTERVAL` | 自动检查间隔（秒），默认 `3600`                                    |
| `COMIC_DL_WEB_OUTPUT_MARKER`  | 可选，漫画输出目录中的普通文件名，例如 `.nas-ready`                |

服务启动时自动开始追更，重启后继续处理持久化的下载队列。同一个书架只能有一个 watcher；如果界面报告锁被占用，停止另一个 watcher 后重启 Web 服务。

NAS 本地目录不需要配置输出标记。若另外选择把输出写到外部挂载，可选用 `COMIC_DL_WEB_OUTPUT_MARKER`：标记缺失时暂缓追更下载，手动下载在提交和启动前检查标记。

## 检查与运行

```sh
npm run check                   # 格式、ESLint、TypeScript
npm test                        # Vitest
npm run build
npx playwright install chromium # 首次运行浏览器测试前执行
npm run test:e2e                # 启动生产构建并运行 Playwright
```

可选的外部挂载兼容测试用 `COMIC_DL_WEB_TEST_OUTPUT_MARKER=1 npm run test:e2e -- tests/e2e/shelf.spec.ts` 启用。

构建后运行 `npm start`，生产服务默认监听 `127.0.0.1:3000`，可用 `HOST` 和 `PORT` 覆盖。`npm run format` 可整理格式；本地安装依赖后，Husky 会在提交前通过 lint-staged 检查暂存文件。
