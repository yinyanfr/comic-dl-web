# comic-dl-web

- 这是 `comic-dl` 的独立自托管 Web UI。前端、HTTP 接口和后台任务放在本仓库，由单个常驻 Node.js 服务部署到 NAS 或服务器。产品范围和阶段验收见 [PLAN.md](PLAN.md)。
- 技术栈：Node.js 24、ESM、TypeScript 严格模式、React Router v7 Framework Mode（Vite + SSR）、React、Mantine + CSS Modules、Zod、SSE。用 Mantine 主题和 CSS 变量统一样式。不引入 Tailwind CSS 或 shadcn/ui。
- 路由用 loader/action、fetcher 和框架的重新验证机制；用 resource route 提供 SSE。将核心调用、SQLite、文件路径、扩展和凭据放在 `.server.ts` 或 `.server/` 中。loader 的返回值会发送给浏览器，只返回界面需要的字段。
- 通过 npm 依赖 `comic-dl`，当前以 `4.1.0` 的公开 API 为基线。不要导入 `dist/` 或源码内部路径，不启动 CLI、不解析终端输出。缺少公开能力时记录缺口，在核心仓库补齐后再升级依赖。源适配器负责站点识别、认证和解析；在线源由各自的 npm 扩展提供，无中心索引。
- 使用核心的作品与章节身份、选源顺序、目录排序与筛选、下载前校验、书架及追更规则。订阅与收藏分开；首次成功检查默认只建基线；移除书架条目保留已有 CBZ。书架和追更状态以核心 SQLite 为准，Web 层不直接读写其表。
- 后台任务由服务进程管理，不绑定浏览器连接或 HTTP 请求。每个书架只运行一个 watcher；切换扩展或生效设置时，先停止并等待旧 watcher，再启动新 watcher。托管扩展的操作必须在 `withManagedDownloader()` 回调结束前完成。
- 书架数据库、扩展目录、服务监听和漫画输出根目录由部署者管理。默认服务运行在 NAS 上，SQLite 放 NAS 本地持久存储，CBZ 直接写入 NAS 本地漫画共享目录。启用管理后可选择输出根下已存在的相对目录；HTTP 接口不接受任意本机路径。扩展凭据可由部署环境注入，或由管理员在网页保存并绑定到来源地址，不回显到页面、事件、日志或示例。安装扩展属于管理员操作，只安装受信任的 npm 包。
- 用 Vitest 做单元和服务集成测试，用 Playwright 做浏览器验收。显式注册 `fixtureExtension`，仅在测试或显式启用的开发环境中使用；测试使用固定的临时目录，不依赖真实站点或账号。按 `.node-version` 使用 Node.js 24，提交锁文件；工程初始化后用 `npm ci` 安装，运行 `npm run check`、`npm test` 和 `npm run build`，浏览器流程用 `npm run test:e2e` 验证。
- 新写或迁移框架和依赖代码时对照当前版本的官方文档和迁移指南；发现弃用警告时定位来源并迁移，避免通过日志过滤隐藏警告。
