<p align="center">
  <img src="public/comic-icon.png" alt="comic-dl-web 图标" width="160" height="160" />
</p>

<h1 align="center">comic-dl-web</h1>

<p align="center">
  <strong>把漫画收藏交给 NAS，把浏览、追更与下载留在浏览器。</strong>
</p>

<p align="center">
  基于 <a href="https://github.com/yinyanfr/comic-dl">comic-dl</a> 的单用户自托管 Web UI<br />
  书架收藏 · 自动追更 · 五个内置来源 · CBZ / ZIP · 中英日界面 · 在线 PWA
</p>

<p align="center">
  <a href="https://github.com/yinyanfr/comic-dl-web/actions/workflows/ci.yml"><img src="https://github.com/yinyanfr/comic-dl-web/actions/workflows/ci.yml/badge.svg" alt="CI 状态" /></a>
  <a href="https://nodejs.org/"><img src="https://img.shields.io/badge/Node.js-24-5FA04E?logo=nodedotjs&logoColor=white" alt="Node.js 24" /></a>
  <a href="https://github.com/yinyanfr/comic-dl"><img src="https://img.shields.io/badge/comic--dl-4.1-0F766E" alt="基于 comic-dl 4.1" /></a>
  <img src="https://img.shields.io/badge/部署-自托管_NAS-5267A3" alt="自托管 NAS" />
  <img src="https://img.shields.io/badge/状态-开发中-D97706" alt="开发中" />
</p>

## 文档

| 语言    | 使用                                                          | 部署                                                                   |
| ------- | ------------------------------------------------------------- | ---------------------------------------------------------------------- |
| 中文    | [使用指南](https://yinyanfr.github.io/comic-dl/webui/usage/)  | [部署指南](https://yinyanfr.github.io/comic-dl/webui/deployment/)      |
| English | [Usage](https://yinyanfr.github.io/comic-dl/en/webui/usage/)  | [Deployment](https://yinyanfr.github.io/comic-dl/en/webui/deployment/) |
| 日本語  | [使い方](https://yinyanfr.github.io/comic-dl/ja/webui/usage/) | [デプロイ](https://yinyanfr.github.io/comic-dl/ja/webui/deployment/)   |

文档正文在本仓库维护，由主项目编入现有文档站。站点尚未同步时，请阅读 [本仓库使用指南](docs/webui/usage.md)与[部署指南](docs/webui/deployment.md)；三语文件及集成路径见 [文档交接](docs/README.md)。

## 功能与边界

- 浏览、聚合搜索和作品详情：CopyManga、Zerobyw、动漫屋／漫画人、Komga、Kavita。
- 跨来源书架、独立的自动检查／下载、补历史、取消与重试。
- 服务端后台任务与逐页进度，关闭浏览器后继续；漫画直接写到 NAS。
- 可信 npm 扩展的安装、只检查更新与确认应用，默认关闭管理。
- 可读归档、模板／补零／CBZ／ZIP，显式预览确认迁移旧归档。
- 可选管理员密码、中文／English／日本語、响应式视图和可安装的在线 PWA。

不是在线阅读器，不支持多用户或多实例调度。手动队列不跨重启恢复；追更队列持久化。PWA 无离线缓存。真实来源、NAS 和阅读器的待验收项见 [todo.md](todo.md)。

> [!IMPORTANT]
> 仅下载你有权访问和备份的内容。推荐本机、可信局域网或 VPN 使用，不建议直接暴露公网。管理员密码不能代替网络隔离与 HTTPS；安装扩展等同于授权服务器执行该包的代码。

## 快速试用：Docker Compose

需要 Docker Engine 和 Compose 插件。直接使用已发布的 `ghcr.io/yinyanfr/comic-dl-web:0.1.0`，无需克隆源码或本地构建。将仓库的 [`docker-compose.yml`](docker-compose.yml) 保存到专用部署目录；[部署指南](docs/webui/deployment.md#docker-compose-快速启动)也提供完整配置。

```sh
mkdir -p comic-dl-web
cd comic-dl-web
curl -fsSLO https://raw.githubusercontent.com/yinyanfr/comic-dl-web/main/docker-compose.yml
chmod 600 docker-compose.yml
```

直接编辑 `docker-compose.yml`：修改 `user` 中的 NAS 数字 UID/GID、`volumes` 中**已存在且可写**的数据／漫画目录，以及 `environment` 中的强随机管理员密码。无需 `.env`、命令行注入变量或 override 文件，再运行：

```sh
docker compose config --quiet
docker compose pull
docker compose up -d
```

默认只在宿主机 `http://127.0.0.1:3000` 监听。跨设备访问、HTTPS／SSE、来源凭据、备份和升级按[部署指南](docs/webui/deployment.md)配置。

镜像支持 `linux/amd64`／`linux/arm64`，Docker 自动选择对应架构。升级时直接修改 `image` 的固定版本标签或摘要，不使用浮动 `latest`。配置含密码，不要提交或分享。

## 本地开发

按 `.node-version` 使用 Node.js 24：

```sh
npm ci
mkdir -p downloads
npm run dev
```

默认打开 `http://127.0.0.1:5173`。用 `COMIC_DL_WEB_FIXTURE=1 npm run dev` 显式启用离线源，在手动下载中选择 `fixture`、输入 `demo`。测试源不用于生产。

```sh
npm run check
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

构建后 `npm start` 启动生产服务。Node.js 手动部署见[部署指南](docs/webui/deployment.md#不使用-docker)；容器验收与发布规则见[发布清单](docs/release-checklist.md)。可选挂载标记验收使用 `COMIC_DL_WEB_TEST_OUTPUT_MARKER=1 npm run test:e2e -- tests/e2e/shelf.spec.ts`。

## 项目状态

- [路线图](PLAN.md)
- [Changelog (English)](CHANGELOG.md)
- [真实环境待验收项](todo.md)
- [M4 发布与文档交接](docs/release-checklist.md)
