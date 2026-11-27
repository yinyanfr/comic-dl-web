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

## 检查与运行

```sh
npm run check                   # 格式、ESLint、TypeScript
npm test                        # Vitest
npm run build
npx playwright install chromium # 首次运行浏览器测试前执行
npm run test:e2e                # 启动生产构建并运行 Playwright
```

构建后运行 `HOST=127.0.0.1 npm start` 在本机的 `3000` 端口启动生产服务。`npm run format` 可整理格式；本地安装依赖后，Husky 会在提交前通过 lint-staged 检查暂存文件。
