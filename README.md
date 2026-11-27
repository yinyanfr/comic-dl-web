# comic-dl-web

[`comic-dl`](https://github.com/yinyanfr/comic-dl) 的自托管 Web 界面。功能范围与里程碑见 [PLAN.md](PLAN.md)，依赖核心与扩展的后续能力见 [上游议题](todo.md)。

默认运行方式是服务直接运行在 NAS 上，由服务下载并把 CBZ 写入 NAS 自己的漫画共享目录。浏览器只负责提交和查看任务，不传输漫画文件。

## 本地开发

使用 `.node-version` 指定的 Node.js 24：

```sh
npm ci
npm run dev
```

开发服务器默认在 `http://127.0.0.1:5173`，首页是书架。用 `COMIC_DL_WEB_FIXTURE=1 npm run dev` 显式启用离线测试源；在「手动下载」选择 `fixture`，输入 `demo`，即可查看章节并下载到 `./downloads`。测试源只接受 `demo`，不接受本机路径。

## 浏览与配置来源

安装依赖后，五个来源都可以从「浏览来源」打开。可在来源列表发起「聚合搜索」，结果按来源展示；未配置或不可用的来源单独标注。进入单个来源后可留空浏览或输入关键词搜索；排序、筛选和分页由来源提供。点击作品进入详情，查看章节、加入书架或提交下载。CopyManga 的题材、地区、状态和排序适用于浏览模式；关键词搜索使用站点的搜索顺序。

目录卡片会显示扩展提供的公开封面，缺图或加载失败时使用占位。作品详情可展示扩展提供的封面、作者、简介和标签。随应用提供的五个来源版本目前未返回这些数据；接入进度见 [comic-dl#27](https://github.com/yinyanfr/comic-dl/issues/27)。

如需在页面保存配置，用 `COMIC_DL_WEB_ENABLE_EXTENSION_MANAGEMENT=1 npm run dev` 启动，然后进入对应来源的「来源设置」。

| 来源                                                                                        | 配置方式                                                                                                                                                                                                                                 |
| ------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [CopyManga](https://github.com/yinyanfr/comic-dl-extensions/tree/main/extensions/copymanga) | 默认可匿名使用；可配置站点、API 地址和 API User-Agent。                                                                                                                                                                                  |
| [Zerobyw](https://github.com/yinyanfr/comic-dl-extensions/tree/main/extensions/zerobyw)     | 可匿名浏览和搜索。列章和下载需 Cookie：可直接粘贴，或通过「在新标签页登录 Zerobyw」登录后，从浏览器网络面板复制作品请求的 `Cookie` 头。用环境配置时设置 `COMIC_DL_ZEROBYW_COOKIE`，自定义站点还需设置 `COMIC_DL_ZEROBYW_COOKIE_ORIGIN`。 |
| [动漫屋 / 漫画人](https://github.com/yinyanfr/comic-dl-extensions/tree/main/extensions/dm5) | 可匿名浏览、搜索和下载公开章节；当前扩展没有可编辑字段。                                                                                                                                                                                 |
| [Komga](https://github.com/yinyanfr/comic-dl-extensions/tree/main/extensions/komga)         | 网页保存服务器地址后填写 API Key。也可用环境变量 `COMIC_DL_KOMGA_URL` 和 `COMIC_DL_KOMGA_API_KEY`；若网页地址与环境地址不同，用 `COMIC_DL_KOMGA_API_KEY_URL` 绑定完整服务器地址（含代理子路径）。                                        |
| [Kavita](https://github.com/yinyanfr/comic-dl-extensions/tree/main/extensions/kavita)       | 网页保存服务器地址后填写 Auth Key。也可用环境变量 `COMIC_DL_KAVITA_URL` 和 `COMIC_DL_KAVITA_API_KEY`；若网页地址与环境地址不同，用 `COMIC_DL_KAVITA_API_KEY_URL` 绑定完整服务器地址（含代理子路径）。                                    |

## 设置

「设置」可选择日间、夜间或跟随系统，外观偏好只保存在当前浏览器。启用网页管理后可保存追更间隔、默认下载来源和下载子目录。已有追更作品会保留已排定的检查时间，下次成功的自动检查后使用新间隔；也可在书架手动检查，让追更服务提前检查。

子目录须已存在于 `COMIC_DL_WEB_OUTPUT` 下，留空使用下载根目录。追更服务在选择的子目录内维护一个 `.comic-dl-web-output` 标记文件，子目录消失时暂停写入，恢复后继续。手动和追更任务共用同一目录设置；更改目录不会移动已有 CBZ。监听地址、数据库、扩展目录和输出根目录由部署者配置。

## 手动下载

输入作品链接或短 ID，点击「查看章节」，再勾选章节或输入包含两端的序号范围，例如 `2-4`。也可以输入章节链接后直接提交。任务在服务端排队，关闭页面后仍会继续；可取消排队或运行中的任务。每章保存为一个 CBZ，重复下载时会跳过已经完整归档的章节。重启服务会清空手动任务列表和队列，已完成的 CBZ 会保留。

任何页面都可从右上角「下载」打开下载管理。作品任务按作品分组，显示 `序号-章节名`、已处理章数和逐章结果，也可清除已结束记录。单章直链目前仅显示核心返回的章节 ID；追更队列的状态仍在书架查看。可读归档路径、命名模板、ZIP 和逐页进度由[上游议题](todo.md)跟踪。

可用环境变量指定附加来源和输出路径：

| 变量                          | 用途                                                                |
| ----------------------------- | ------------------------------------------------------------------- |
| `COMIC_DL_WEB_EXTENSIONS`     | 已安装的 npm 扩展包名，多个用逗号分隔                               |
| `COMIC_DL_WEB_EXTENSION_DIR`  | `comic-dl` 托管扩展目录，默认 `./data/extensions`                   |
| `COMIC_DL_WEB_DEFAULT_SOURCE` | 可选，未在页面选源时优先使用的来源 ID；没有默认源时由核心按链接匹配 |
| `COMIC_DL_WEB_OUTPUT`         | NAS 上服务可写的本地漫画目录，默认 `./downloads`                    |

如果 NAS 的共享名称是符号链接，请将 `COMIC_DL_WEB_OUTPUT` 指向共享的实际目录；核心会拒绝沿符号链接写入 CBZ。

## 扩展市场

「扩展市场」列出随应用提供的五个来源、文档和当前已加载来源。市场默认只读；部署者可设置 `COMIC_DL_WEB_ENABLE_EXTENSION_MANAGEMENT=1` 开启安装、更新、卸载和来源设置。扩展代码在服务进程中运行，只安装你信任的 npm 包。

应用没有内置登录。远程使用时，请通过已认证的反向代理访问页面、接口和 SSE，并确保应用端口只对代理或本机开放。若代理终止 TLS 或改变了主机名，设置 `COMIC_DL_WEB_ADMIN_ORIGIN` 为浏览器访问的准确 origin，例如 `https://comics.example.com`（无尾斜杠）。该配置用于校验写请求来源。

可以按 npm 包名及可选版本范围或标签（如 `^0.2.0`、`latest`）安装附加来源。推荐卡片可安装托管版本，覆盖随应用提供的同一来源；卸载后恢复内置版本。市场顶部的「检查并更新全部托管扩展」会直接应用更新，托管扩展卡片可单独更新或卸载。更新遵守安装时保存的范围，操作期间会显示进度提示并禁用冲突操作。

托管包清单来自上次管理操作；若使用既有 CLI 扩展目录，可按包名管理，页面的已加载来源列表会独立显示。从 CLI 变更同一扩展目录后，请重启 Web 服务以切换追更使用的扩展。精确清单和只检查更新分别见 [comic-dl#31](https://github.com/yinyanfr/comic-dl/issues/31)、[comic-dl#32](https://github.com/yinyanfr/comic-dl/issues/32)。

网页设置、凭据和上一次管理返回的托管包名默认保存到 `./data/sources.json`（可用 `COMIC_DL_WEB_SOURCE_STATE` 覆盖）。文件权限为 `0600`，凭据不回显。网页凭据仅供随应用提供的适配器使用，绑定至保存时的来源地址；清除网页凭据后恢复使用部署环境。来源的「恢复默认」只重置普通来源设置。

## 书架与追更

从作品详情加入书架，也可以在书架展开「通过链接添加作品」。点书架中的作品标题可手选章节，也可点「下载全部未下载章节」，由核心跳过完整的 CBZ。核心目前未提供查询每章本地归档状态的公开接口，因此跳过和下载结果在任务中展示。

收藏后可开启或暂停自动追更。当前核心将自动检查与自动下载绑定；「检查更新」和「检查已开启追更的作品」仅检查已开启追更的条目。首次成功检查只记录当时已有的章节，后续发现的新章节会自动入队。要下载旧章节，可对已开启追更的作品点击「补下载历史」。下载失败或受限的章节会出现在「需处理章节」，修复原因后可重试。移除作品会清除其书架和追更记录，已有 CBZ 会保留。独立检查和下载策略见 [comic-dl#26](https://github.com/yinyanfr/comic-dl/issues/26)。

| 变量                          | 用途                                                               |
| ----------------------------- | ------------------------------------------------------------------ |
| `COMIC_DL_WEB_SHELF`          | SQLite 书架文件，默认 `./data/shelf.sqlite`；放在 NAS 本地持久存储 |
| `COMIC_DL_WEB_WATCH_INTERVAL` | 自动检查间隔（秒），默认 `3600`                                    |
| `COMIC_DL_WEB_OUTPUT_MARKER`  | 可选，漫画输出目录中的普通文件名，例如 `.nas-ready`                |

服务启动时自动开始追更，重启后继续处理持久化的下载队列。同一个书架只能有一个 watcher；如果界面报告锁被占用，停止另一个 watcher 后重启 Web 服务。

NAS 本地目录不需要配置输出标记。若另外选择把输出写到外部挂载，可选用 `COMIC_DL_WEB_OUTPUT_MARKER`：标记必须在 `COMIC_DL_WEB_OUTPUT` 根目录中，启用时下载子目录须留空。标记缺失时暂缓追更下载，手动下载在提交和启动前检查标记。

## 检查与运行

```sh
npm run check                   # 格式、ESLint、TypeScript
npm test                        # Vitest
npm run build
npx playwright install chromium # 首次运行浏览器测试前执行
npm run test:e2e                # 启动已构建的生产服务并运行 Playwright
```

可选的外部挂载兼容测试用 `COMIC_DL_WEB_TEST_OUTPUT_MARKER=1 npm run test:e2e -- tests/e2e/shelf.spec.ts` 启用。

构建后运行 `npm start`，生产服务默认监听 `127.0.0.1:3000`，可用 `HOST` 和 `PORT` 覆盖。`npm run format` 可整理格式；本地安装依赖后，Husky 会在提交前通过 lint-staged 检查暂存文件。
