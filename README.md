# comic-dl-web

[`comic-dl`](https://github.com/yinyanfr/comic-dl) 的自托管 Web 界面。功能范围与里程碑见 [PLAN.md](PLAN.md)。

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
| `COMIC_DL_WEB_EXTENSION_DIR`  | 可选，现有的 `comic-dl` 托管扩展目录                                |
| `COMIC_DL_WEB_DEFAULT_SOURCE` | 可选，未在页面选源时优先使用的来源 ID；没有默认源时由核心按链接匹配 |
| `COMIC_DL_WEB_OUTPUT`         | CBZ 输出目录，默认 `./downloads`                                    |

来源凭据按各扩展的文档由运行环境提供。

## 书架与追更

在「书架」输入作品链接或短 ID，或从首页的章节列表加入书架。收藏后可开启、暂停或恢复订阅。首次成功检查只记录当时已有的章节；后续检查发现的新章节由服务自动下载。可以手动检查单条或全部订阅，或对单条订阅点击「补下载历史」。下载失败或受限的章节会出现在「需处理章节」，修复原因后可重试。移除作品会清除其书架和订阅记录，已有 CBZ 会保留。

| 变量                          | 用途                                                              |
| ----------------------------- | ----------------------------------------------------------------- |
| `COMIC_DL_WEB_SHELF`          | SQLite 书架文件，默认 `./data/shelf.sqlite`；请放在本地持久存储上 |
| `COMIC_DL_WEB_WATCH_INTERVAL` | 自动检查间隔（秒），默认 `3600`                                   |
| `COMIC_DL_WEB_OUTPUT_MARKER`  | 可选，漫画输出目录中的普通文件名，例如 `.nas-ready`               |

服务启动时自动开始追更，重启后继续处理持久化的下载队列。同一个书架只能有一个 watcher；如果界面报告锁被占用，停止另一个 watcher 后重启 Web 服务。

将 CBZ 写到 NAS 时，只在实际挂载的共享中创建标记文件。标记消失时，追更仍会检查更新，待下载章节会等到挂载恢复后再重试（核心延后一分钟）。手动下载在提交时和开始执行前检查标记。`comic-dl@3.2.0` 的手动下载接口不支持在每次写入前再次检查标记。

## 检查与运行

```sh
npm run check                   # 格式、ESLint、TypeScript
npm test                        # Vitest
npm run build
npx playwright install chromium # 首次运行浏览器测试前执行
npm run test:e2e                # 启动生产构建并运行 Playwright
```

构建后运行 `npm start`，生产服务默认监听 `127.0.0.1:3000`，可用 `HOST` 和 `PORT` 覆盖。`npm run format` 可整理格式；本地安装依赖后，Husky 会在提交前通过 lint-staged 检查暂存文件。
