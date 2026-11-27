# comic-dl-web

[`comic-dl`](https://github.com/yinyanfr/comic-dl) 的自托管 Web 界面。功能范围与里程碑见 [PLAN.md](PLAN.md)。

## 本地开发

使用 `.node-version` 指定的 Node.js 24：

```sh
npm ci
npm run dev
```

开发服务器默认在 `http://localhost:5173`。首页显示当前已加载的源；可用 `COMIC_DL_WEB_FIXTURE=1 npm run dev` 显式启用内置离线测试源。

## 检查与运行

```sh
npm run check                   # 格式、ESLint、TypeScript
npm test                        # Vitest
npm run build
npx playwright install chromium # 首次运行浏览器测试前执行
npm run test:e2e                # 启动生产构建并运行 Playwright
```

构建后运行 `npm start` 启动生产服务，默认端口为 `3000`。`npm run format` 可整理格式；本地安装依赖后，Husky 会在提交前通过 lint-staged 检查暂存文件。
