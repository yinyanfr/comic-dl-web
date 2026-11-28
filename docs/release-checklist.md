# M4 发布与验收清单

## 发布约定

- 镜像：`ghcr.io/yinyanfr/comic-dl-web`，`linux/amd64` 和 `linux/arm64`。
- 使用 `package.json` / 锁文件中的 Web 版本，不把核心版本当作 Web 版本。
- 推送到 `main` 且 `package.json` 有变更时，比较推送前后的版本；只有版本变化才发布。PR、手动推送标签和版本未变的提交不发布。
- 版本须为不含 build metadata 的 SemVer，与锁文件的两个版本字段一致；英文 `CHANGELOG.md` 须有唯一的 `## <version> — YYYY-MM-DD`、摘要及非空三级章节。准备工作在任何镜像发布前完成。
- 先运行完整 CI 和两个原生架构的容器验收，再构建推送 `ghcr.io/yinyanfr/comic-dl-web:<version>`；不发布浮动 `latest`。
- 镜像成功后创建指向本次推送 SHA 的 `v<version>` 标签及 GitHub Release；预发布版本标记为 prerelease，不设为 Latest。已有同名标签若指向其他提交则拒绝发布。
- Release 使用完整英文 Changelog 正文，追加实际镜像标签、多架构摘要、拉取命令及工作流链接；生成 provenance / SBOM，摘要也写入工作流 Summary。
- 发布工作流排队执行，不取消等待中的版本发布。失败后可在 Actions 重跑原推送工作流；重跑可能重建镜像，同提交已有 Release 的说明会同步新摘要。已发布版本不要复用到其他提交。
- 首次推送后在 GitHub Packages 检查包与仓库关联及可见性；需要匿名拉取时将包设为公开，并从未登录环境验证。
- 首版 `0.1.0` 已发布。用户部署直接使用 `ghcr.io/yinyanfr/comic-dl-web:0.1.0` 和包含环境变量的 `docker-compose.yml`，无需本地构建或 `.env`／override 文件；发布不等同于真实 NAS 验收。

## 维护者发布步骤

1. 完成下面的真实环境验收或明确记录限制，更新英文 Changelog 的日期、功能、兼容性和未验证项。
2. 同一提交中更新 `package.json` 与 `package-lock.json` 的版本，在本地运行检查、单测和构建；不要手工创建发布标签。
3. 将版本提交推送或合并到 `main`。检测以整个 push 的 `before` 与当前提交比较，多提交推送只发布最终版本。
4. 确认 Publish comic-dl-web 的版本检测、完整 CI、镜像发布和 GitHub Release 均成功。
5. 检查 GHCR 可见性、双架构 manifest 和匿名固定标签／摘要拉取，核对 Release 的实际摘要。失败时重跑原工作流，不提交相同版本的“补发”提交。

## 自动化验收

以下条目只有对应运行实际成功后才能标记完成。

- [x] `npm ci`、`npm run check`、`npm test`、`npm run build`。
- [x] `npm run test:e2e`；本次显式启用可选标记测试，23 项全部通过，CI 也启用该场景。
- [x] Compose 配置校验及 Dockerfile 构建。
- [ ] amd64 原生容器测试通过。
- [x] arm64 原生容器测试通过。
- [x] 默认非 root、自定义数字 UID/GID、只读根、无需开发依赖。
- [x] 生产配置下认证与 PWA 清单可用，健康检查不需要密码。
- [x] 显式测试源下，关闭浏览器后 watcher 生成归档。
- [x] SIGTERM 正常退出；重建容器保留书架、设置、扩展目录与已有归档，不重复写入。
- [ ] GHCR 多架构清单存在，两种架构均可按固定标签／摘要拉取。

本机容器验收：

```sh
docker build -t comic-dl-web:test .
npx playwright install chromium
CONTAINER_IMAGE=comic-dl-web:test npm run test:container
```

测试使用本次运行生成的临时目录、固定 fixture、离线 npm 仓库和独立容器名，不访问真实站点或 NAS。测试源只在显式 `NODE_ENV=test` 时挂入，生产镜像不包含测试数据。生产配置的容器通过本地 npm 仓库验证安装、重建后加载、只检查更新、确认应用和卸载；仓库仅在验收期间监听临时端口，供容器通过宿主机网关访问。

验收需要 Docker daemon、宿主机 Node.js 24、Chromium 和 OpenSSL。代理测试使用 `nginx:1.30.8-alpine`（可通过 `PROXY_IMAGE` 替换），为每次运行生成短期自签名证书，仅测试浏览器忽略该证书错误，部署仍须可信证书。第一次运行需要拉取基础／代理镜像和 npm 依赖；“离线”指业务使用本地 fixture 与 npm 仓库，不访问真实漫画站点。

### 本机记录（2026-11-28）

- macOS arm64、Docker Desktop；宿主机 Node.js 24.14.1，运行镜像 Node.js 24.22.3。
- 31 项单测通过，包含健康检查、三语变量清单、本地文档链接、版本变化／锁文件／标签冲突和 Changelog 说明提取检查；检查与生产构建通过。
- arm64 原生：构建成功，4 项容器验收通过。
- `0.1.0` 版本准备后另行构建 `comic-dl-web:release-check-0.1.0`，arm64 原生的 4 项容器验收再次全部通过。
- amd64 模拟：通过 `docker build --platform linux/amd64` 构建，4 项容器验收通过；**不等同于 amd64 原生 CI 验收**。
- Compose 文件实际启动通过，验证空密码和缺失宿主机目录被拒绝，缺失目录不会被自动创建。
- 两种应用镜像均验证实际 Nginx TLS 转发、Secure Cookie、登录、写操作、拒绝错误 Origin 和 SSE 两次连接。此结果不替代真实 NAS／远程代理／移动设备验收。
- GitHub Actions 工作流其余配置与 ShellCheck 通过 actionlint；本机 actionlint 尚不识别 `concurrency.queue: max`，仅排除此项并按 GitHub 官方文档核验，与主项目保持一致。远端 CI、GHCR 发布与匿名拉取尚未运行。

## 文档交接

- [ ] 六篇 Markdown 正文已由主项目集成。
- [ ] 主项目三语文档站构建与导航、语言切换、相对链接通过。
- [ ] `/comic-dl/webui/usage/` 与 `/comic-dl/webui/deployment/` 不再为空。
- [ ] README 的文档入口与最终镜像版本示例核对。

## 真实环境（不能由模拟测试代替）

- [ ] NAS 型号／系统、CPU、文件系统、Docker／Compose 版本已记录。
- [ ] 实际 UID/GID 和 ACL 可写，SQLite 位于 NAS 本地持久存储。
- [ ] 容器重建保留配置、书架、托管扩展；追更在无浏览器连接时继续。
- [ ] 输出挂载中断、标记消失与恢复不误建目录、不错误提交。
- [ ] HTTPS Origin、登录、封面、写请求与 SSE 断线恢复。
- [ ] 至少一个桌面浏览器及一个移动端的实际 PWA 安装／启动／重新登录。
- [ ] 外部阅读器实际打开 CBZ／ZIP 并核对页序。
- [ ] 在备份副本上演练升级、停止后备份与恢复、旧归档迁移、同名冲突。
- [ ] 真实 Zerobyw 凭据、CopyManga／DM5 下载、Komga／Kavita 实例的验收结果或明确限制。

## 发布说明模板

```markdown
## 版本与镜像

- Web 版本：
- 镜像标签与摘要：
- 平台：
- 核心与内置扩展版本：

## 部署／升级

- 使用与部署文档：
- 数据目录与权限变化：
- 备份与回退要求：

## 已验证

- 自动化运行链接：
- 实际 NAS／代理／阅读器／PWA 环境与结果：

## 已知限制与未验证项

- …
```
