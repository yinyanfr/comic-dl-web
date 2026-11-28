<p align="center">
  <img src="public/comic-icon.png" alt="comic-dl-web 图标" width="160" height="160" />
</p>

<h1 align="center">comic-dl-web</h1>

<p align="center">
  <strong>把漫画收藏交给 NAS，把浏览、追更与下载留在浏览器。</strong>
</p>

<p align="center">
  基于 <a href="https://github.com/yinyanfr/comic-dl">comic-dl</a> 的自托管 Web 界面<br />
  书架收藏 · 自动追更 · 多源浏览 · CBZ / ZIP 归档
</p>

<p align="center">
  <a href="https://github.com/yinyanfr/comic-dl-web/actions/workflows/ci.yml"><img src="https://github.com/yinyanfr/comic-dl-web/actions/workflows/ci.yml/badge.svg" alt="CI 状态" /></a>
  <a href="https://nodejs.org/"><img src="https://img.shields.io/badge/Node.js-24-5FA04E?logo=nodedotjs&logoColor=white" alt="Node.js 24" /></a>
  <a href="https://github.com/yinyanfr/comic-dl"><img src="https://img.shields.io/badge/comic--dl-4.0-0F766E" alt="基于 comic-dl 4.0" /></a>
  <img src="https://img.shields.io/badge/部署-自托管_NAS-5267A3" alt="自托管 NAS" />
  <img src="https://img.shields.io/badge/状态-开发中-D97706" alt="开发中" />
</p>

<p align="center">
  <a href="#本地开发">快速开始</a> ·
  <a href="#浏览与配置来源">支持来源</a> ·
  <a href="#书架与追更">书架与追更</a> ·
  <a href="PLAN.md">项目计划</a> ·
  <a href="todo.md">验收进度</a>
</p>

> [!TIP]
> **漫画留在 NAS，浏览器随时离开。**
>
> 服务直接在 NAS 上下载并归档到本地漫画共享目录，浏览器只负责提交和查看任务，不传输漫画文件；关闭页面不会中断后台下载。

> [!IMPORTANT]
> 请仅下载和保存你有权访问及备份的内容，并遵守来源站点的使用条款。应用没有内置登录，远程访问须置于已认证的反向代理后。

## 本地开发

使用 `.node-version` 指定的 Node.js 24：

```sh
npm ci
mkdir -p downloads
npm run dev
```

开发服务器默认在 `http://127.0.0.1:5173`，首页是书架。用 `COMIC_DL_WEB_FIXTURE=1 npm run dev` 显式启用离线测试源；在「手动下载」选择 `fixture`，输入 `demo`，即可查看章节并下载到 `./downloads`。测试源只接受 `demo`，不接受本机路径。

## 浏览与配置来源

安装依赖后，五个来源都可以从「浏览来源」打开。可在来源列表发起「聚合搜索」，结果按来源展示；未配置或不可用的来源单独标注。进入单个来源后可留空浏览或输入关键词搜索；排序、筛选和分页由来源提供。点击作品进入详情，查看章节、加入书架或提交下载。CopyManga 的题材、地区、状态和排序适用于浏览模式；关键词搜索使用站点的搜索顺序。

使用 `comic-dl@4.0.0`；内置 CopyManga、Zerobyw、Komga、Kavita 为 `0.3.0`，DM5 为 `0.2.0`。目录卡片和详情展示来源提供的封面、作者、简介与标签；缺失字段不影响使用。Komga/Kavita 鉴权封面通过同站 `/covers` 端点服务端读取，不把密钥或鉴权 URL 发给浏览器。该端点与页面、接口、SSE 一样须置于认证反向代理后。

如需在页面保存配置，用 `COMIC_DL_WEB_ENABLE_EXTENSION_MANAGEMENT=1 npm run dev` 启动，然后进入对应来源的「来源设置」。

| 来源                                                                                        | 配置方式                                                                                                                                                                                                                                 |
| ------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [CopyManga](https://github.com/yinyanfr/comic-dl-extensions/tree/main/extensions/copymanga) | 默认可匿名使用；可配置站点、API 地址和 API User-Agent。                                                                                                                                                                                  |
| [Zerobyw](https://github.com/yinyanfr/comic-dl-extensions/tree/main/extensions/zerobyw)     | 可匿名浏览和搜索。列章和下载需 Cookie：可直接粘贴，或通过「在新标签页登录 Zerobyw」登录后，从浏览器网络面板复制作品请求的 `Cookie` 头。用环境配置时设置 `COMIC_DL_ZEROBYW_COOKIE`，自定义站点还需设置 `COMIC_DL_ZEROBYW_COOKIE_ORIGIN`。 |
| [动漫屋 / 漫画人](https://github.com/yinyanfr/comic-dl-extensions/tree/main/extensions/dm5) | 可匿名浏览、搜索和下载公开章节；当前扩展没有可编辑字段。                                                                                                                                                                                 |
| [Komga](https://github.com/yinyanfr/comic-dl-extensions/tree/main/extensions/komga)         | 网页保存服务器地址后填写 API Key。也可用环境变量 `COMIC_DL_KOMGA_URL` 和 `COMIC_DL_KOMGA_API_KEY`；若网页地址与环境地址不同，用 `COMIC_DL_KOMGA_API_KEY_URL` 绑定完整服务器地址（含代理子路径）。                                        |
| [Kavita](https://github.com/yinyanfr/comic-dl-extensions/tree/main/extensions/kavita)       | 网页保存服务器地址后填写 Auth Key。也可用环境变量 `COMIC_DL_KAVITA_URL` 和 `COMIC_DL_KAVITA_API_KEY`；若网页地址与环境地址不同，用 `COMIC_DL_KAVITA_API_KEY_URL` 绑定完整服务器地址（含代理子路径）。                                    |

## 设置

「设置」可选择日间、夜间或跟随系统，外观偏好只保存在当前浏览器。启用网页管理后可保存全局检查间隔、默认下载来源、下载子目录和归档策略。全局间隔变化会重新安排使用全局默认的作品检查时间，作品级覆盖不受影响；已有基线保留。

输出根和选择的子目录须预先存在，子目录必须位于 `COMIC_DL_WEB_OUTPUT` 下，不能是符号链接。留空使用下载根目录。目录消失时不会重建所选目录，追更保留队列等待恢复。手动和追更共用同一策略；更改目录不会移动已有归档。监听地址、数据库、扩展目录和输出根目录仍由部署者配置。

默认每章一个 `{title}/{number}-{chapter}.cbz`，例如 `摇曳百合/1-第1话.cbz`。支持 CBZ/ZIP、序号补零和最多四层的命名模板，变量为 `{title}`、`{number}`、`{chapter}`、`{workId}`、`{chapterId}`，不要在模板内添加扩展名。核心清洗不安全名称并处理冲突。序号来自完整目录，不因选章改变；旧扩展无法提供直链上下文时，名称按章节 ID 回退。

改变模板、格式或上游排序不会自动改名；同一输出目录内已有的完整归档（包括 3.x 哈希 CBZ）仍按稳定身份识别并跳过。需要改名时，进入「设置 → 预览与迁移已有归档」，按单本或全书架生成预览，备份后确认应用。预览有效十分钟，设置变更或服务重启后需重做。迁移时阻止新手动任务并暂停追更；已有手动任务须先完成或取消，其他 CLI 或阅读器写入工具也须暂停。冲突项不会覆盖。旧 `.comic-dl-web-output` 文件不再使用，可由部署者自行清理。

## 手动下载

输入作品链接或短 ID，点击「查看章节」，再勾选章节或输入包含两端的序号范围，例如 `2-4`。也可以输入章节链接后直接提交。任务在服务端排队，关闭页面后仍会继续；可取消排队或运行中的任务。每章保存为独立的 CBZ 或 ZIP，重复下载时会跳过已经完整归档的章节。重启服务会清空手动任务列表和队列，已完成的归档会保留。

任何页面都可从右上角「下载」打开下载管理，合并显示手动与追更任务，按来源和作品分组。展示 `序号-章节名`、阶段、已下载页数、可用时的总页数，并支持取消和重试失败或取消的章节。一章失败不会掩盖其他结果，批次会标明失败。浏览器重连后重新读取快照；重启后追更队列恢复，实时页数从新尝试重新计算。

默认快照只包含活动追更任务及最近二十条结束记录；每个手动任务展示正在执行的章节、最多十条待下载章节和最近二十条结束章节，完整逐章结果仍可分页查看。隐藏的失败章节仍可随任务一起重试；尚未开始执行就取消的手动任务也可重新排队。

清除已结束记录不会删除归档或书架历史；追更记录仅在当前进程中隐藏，状态变化后会重新显示。手动任务重试在当前配置的核心实例中执行，只选择可重试章节，仍受目录版本校验保护，不长期持有旧托管扩展会话。

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

可以按 npm 包名及可选版本范围或标签（如 `^0.3.0`、`latest`）安装附加来源。推荐卡片可安装托管版本，覆盖随应用提供的同一来源；卸载后恢复内置版本。支持只检查单包或全部托管扩展更新；查询不会安装或切换版本。检查后显示当前版本、可用版本或逐包失败，确认后再应用单包或全部更新。应用时重新解析保存的版本范围，检查结果不是版本锁定。

清单通过核心只读 API 读取实际托管目录，显示版本、保存范围、来源 ID 和定义加载状态，能列出加载失败的包。“定义可加载”不代表账号或站点可用。固定版本不会自动升级，旧 `^0.2.0` 不包含 `0.3.0`；需要跨范围升级时，在按包名安装中明确填入新范围或 `latest` 并确认信任。操作期间显示加载反馈并禁用冲突操作。从 CLI 变更同一扩展目录后仍需重启 Web 服务。

网页设置和凭据默认保存到 `./data/sources.json`（可用 `COMIC_DL_WEB_SOURCE_STATE` 覆盖）。文件权限为 `0600`，凭据不回显；旧配置文件可继续读取，旧包名缓存不再作为清单依据。网页凭据仅供随应用提供的适配器使用，绑定至保存时的来源地址；托管版本按扩展文档配置部署环境凭据。清除网页凭据后恢复使用部署环境。来源的「恢复默认」只重置普通来源设置。

## 书架与追更

从作品详情加入书架，也可以在书架展开「通过链接添加作品」。点书架中的作品标题可手选章节，也可点「下载全部未下载章节」，由核心跳过完整的 CBZ。核心目前未提供查询每章本地归档状态的公开接口，因此跳过和下载结果在任务中展示。

书架显示作品封面，右上角可切换详细或紧凑模式，偏好保存在当前浏览器。紧凑模式仅展示封面、书名和状态/操作图标；点击管理图标打开完整策略与章节操作。封面按需加载，来源目录缺失封面时尝试通过公开作品详情 API 补齐；来源仍未提供封面时显示占位。

「检查更新」可手动检查任意作品，「检查全部作品」包含关闭自动检查的收藏。展开「检查与下载策略」独立配置自动检查、自动下载和作品检查间隔；间隔留空跟随全局。快捷开启/暂停自动追更会同时切换两个开关。

首次成功检查默认只建立基线，补旧章需显式点击「补下载历史」。关闭自动下载时，后续发现的新章会保留在「新发现与待处理章节」，重复检查不丢失，可逐章入队。手动检查也遵守自动下载设置；开启自动下载不追溯入队此前发现的章节。关闭任一开关不取消已有任务，取消需明确操作。失败或受限章节可重试；移除书架条目仍保留归档。

| 变量                          | 用途                                                               |
| ----------------------------- | ------------------------------------------------------------------ |
| `COMIC_DL_WEB_SHELF`          | SQLite 书架文件，默认 `./data/shelf.sqlite`；放在 NAS 本地持久存储 |
| `COMIC_DL_WEB_WATCH_INTERVAL` | 自动检查间隔（秒），默认 `3600`                                    |
| `COMIC_DL_WEB_OUTPUT_MARKER`  | 可选，漫画输出目录中的普通文件名，例如 `.nas-ready`                |

服务启动时自动开始追更，重启后继续处理持久化的下载队列。同一个书架只能有一个 watcher；如果界面报告锁被占用，停止另一个 watcher 后重启 Web 服务。

NAS 本地目录不需要配置输出标记。若选择写入外部挂载，可用 `COMIC_DL_WEB_OUTPUT_MARKER`：普通标记文件放在 `COMIC_DL_WEB_OUTPUT` 根目录，同时可选择其下既有子目录。手动下载和 watcher 都向核心传入根目录保护；标记或目标目录不可用时不提交归档，追更队列等待恢复。

## 从 3.x 升级

1. 停止 Web 服务和所有共享书架的 CLI watcher，备份 SQLite（停止后连同仍存在的 WAL/SHM 文件）、网页配置、托管扩展目录和归档。
2. 使用 Node.js 24，运行 `npm ci`、`npm run check`、`npm test` 和 `npm run build`。确认部署者配置的输出根已存在，再启动服务。
3. 首次打开书架由核心事务迁移至 schema v3。原 `following=1` 映射为自动检查/下载均开启，`0` 均关闭，基线和队列保留。升级后的数据库不能用旧核心打开；回退时恢复备份。
4. 默认归档从平铺哈希名改为可读路径；旧完整归档继续识别，不自动改名。托管旧扩展不会随内置依赖自动跨范围更新，请在市场检查并显式升级。

详见 [3.x → 4.x 迁移指南](https://yinyanfr.github.io/comic-dl/migration/v3-to-v4/)。测试中的 `comic-dl-v3` 仅用于以旧公开 API 生成迁移样本，不进入生产调用。

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
