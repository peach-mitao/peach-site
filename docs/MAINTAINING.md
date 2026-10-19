# 官网维护

页面正文位于 `site/index.html`，部署到 Cloudflare Workers Assets；视频通过 R2 的 `media.peach.video` 分发。中文排版约定见[官网中文排版](../TYPOGRAPHY.md)。脚本集中在 `scripts/`，本地预览与文字编辑使用 TypeScript，浏览器资源保留可直接加载的 JS。

## 环境与检查

使用 Node.js 24.12 或更新的受支持 LTS。以下命令均在本仓库根目录执行。

按锁文件安装依赖：

```powershell
npm ci
```

生成 Cloudflare 运行时类型，检查 TS 配置、预览服务与自有 JS 脚本：

```powershell
npm run check
```

验证预览服务、同源编辑、Range、下载识别和 Sharp 无损 WebP：

```powershell
npm test
```

安装浏览器测试所需的 Chromium：

```powershell
npx --no-install playwright install chromium
```

在临时回环端口自动验证手机和桌面的下载流程，无需启动预览：

```powershell
npm run test:browser
```

检查 cf 配置与构建，不上传资源：

```powershell
npm run check:deploy
```

CI 使用合成 Release 响应验证下载、平台选择与异常恢复，不访问真实 GitHub API，也不要求下载媒体。截图、播放器与素材完整性由下述发布验收覆盖。Node 直接运行可擦除类型的 TS，`tsc --noEmit` 独立检查类型；没有额外的 TS 运行器或需要提交的编译副本。

## 素材与预览

通过 `npm run assets:fetch` 按 `assets-manifest.json` 获取公开素材，逐个核对长度和 SHA-256。媒体、截图、原型、验收证据和缓存不进 Git。六页导览按视口选择 16:9 或 4:3 桌面截图；使用 `npm run capture:desktop` 更新截图和清单时，应先验收演示站，生成无损 WebP 并核对像素一致。

`npm run dev:edit` 启动 `http://127.0.0.1:8790/`，`?edit` 提供原位改字。回车或失焦写回 `site/index.html`，Esc 取消；保存接口只接受同源请求。`PEACH_PREVIEW_DOWNLOADS` 可指定本地 Mac 包清单，安装包留在原位置，预览仅开放已登记的包。

`npm run dev` 通过 cf 启动 `http://127.0.0.1:8794/`，用于验证实际静态资源与重定向，不提供保存接口。普通预览启动后可用 `npm run verify:downloads -- <预览地址>` 检查下载；其他入口为 `verify:typography`、`verify:mobile` 和 `verify`。浏览器验收脚本默认地址各不相同，运行时应明确传入地址；完整验收需要素材。

下载区按平台读取最新完整公开发行，包括预发布版本。Windows 安装包与免安装包、macOS 两种架构包须分别完整上传。Safari 的 Intel UA 不代表实际芯片，芯片不明时保留人工选择；下载逻辑的测试使用任意合成版本，不绑定当前发行号。

## 发布与 Cloudflare 配置

视频先发布到 R2，再用 `npm run deploy` 发布页面。媒体使用完整内容哈希对象名、`video/mp4` 与长期不可变缓存；同步清单、播放器地址与 `site/_redirects`，保留仍被页面引用的对象。`site/.assetsignore` 排除原型与历史素材，本地编辑服务位于发布目录之外。

发布后用 `npm run verify -- https://peach.video/ --http-only` 校验公网页面和文件哈希、首段／中段／尾段／后缀范围、无效范围和原地址跳转。省略 `--http-only` 增加桌面与手机的播放、拖动、预览、导览和投诉页检查。公网请求保持严格 TLS 校验。

本项目使用固定版本的 `cf` 与 [`cloudflare.config.ts`](https://developers.cloudflare.com/cf/projects/cloudflare-config/)，官网域名、Worker 名称和可观测性在此维护。`wrangler.config.ts` 仅维护打包器设置、素材目录和本地监听地址；Wrangler 是 cf 调用的打包依赖。`.cloudflare/` 保存生成类型和 Build Output，不进 Git。`npm run build` 执行 `cf build`，`npm run deploy` 执行 `cf deploy`。配置由官方 `cf migrate` 转换；这套配置仍为公开测试版，升级须核对构建和本地行为。

Dependabot 分别对普通小版本更新与安全更新分组，大版本单独审阅；`@types/node` 保持 Node 24 运行基线，只自动更新同一大版本。CI 在 Windows 和 Linux 运行安装、类型与语法检查、行为测试和 cf 构建，Linux 另跑 Chromium 下载流程测试。依赖版本只在 `package.json` 与锁文件维护，素材清单的内容哈希不随工具版本机械改变。素材许可见 [NOTICE](../NOTICE.md)。
