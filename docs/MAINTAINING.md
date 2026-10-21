# 官网维护

页面正文位于 `site/index.html`，部署到 Cloudflare Workers Assets；视频通过 R2 的 `media.peach.video` 分发。中文排版约定见[官网中文排版](../TYPOGRAPHY.md)。脚本集中在 `scripts/`，本地预览与文字编辑使用 TypeScript，浏览器资源保留可直接加载的 JS。

工具选型与复用边界见[复用说明](REUSE.md)。

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

截图脚本以 UTC 日期命名，可用 `PEACH_CAPTURE_DATE` 指定八位日期；捕获和编码使用同一值。2026-10-20 的两套导览来自同步后的 Peach 0.46.1 演示界面，包含首页、艺人、艺人详情、播放、关注与统计；更新后同步替换首页引用，保留历史清单记录。

`npm run dev:edit` 启动 `http://127.0.0.1:8790/`，`?edit` 提供原位改字。回车或失焦写回 `site/index.html`，Esc 取消；保存接口只接受同源请求。`PEACH_PREVIEW_DOWNLOADS` 可指定本地 Mac 包清单，安装包留在原位置，预览仅开放已登记的包。

编辑模式中，平台选择、导览标签和展开控件照常操作，Alt+点击可编辑控件文字。脚本生成的下载文案由 `assets/copy.js` 按 `data-copy-key` 区分平台与状态，修改保存在首页的 `data-copy-overrides` 中，刷新、切换和异步重绘后继续生效。新增动态文案应使用 `renderCopy`；新增切换控件可标记 `data-copy-interact`。命令区支持 Shift+回车换行。`npm run test:browser` 同时验证下载与编辑流程，保存测试仅写临时站点。

段落、说明和标题中的连续行内文字共用编辑区域；标题与块级说明、链接和操作控件各自独立。保存保留未修改片段的行内样式，空的样式包装随文字删除。整段保存核对所有原始文字节点，再原子写入 HTML；节点数量变化会重排后续索引，连续编辑和刷新使用同一份源文件。

下载区的系统安全提示分别链接到 [Apple 打开 App 的说明](https://support.apple.com/zh-cn/102445) 和 [Microsoft 应用与浏览器控制说明](https://support.microsoft.com/zh-cn/windows/security/windows-security/app-browser-control-in-the-windows-security-app)。Mac 状态文字单独使用 `renderCopy`，官方说明链接位于该动态节点之外，状态重绘和编辑不替换链接。提示内容须与构建中的 Developer ID 签名、公证及 Windows 代码签名状态一致。

原位编辑核心唯一维护源为 Peach 应用仓库的 `frontend/src/copy-editor-core.js`。官网 `edit-client.js` 只适配 HTML 原文索引、导览属性与动态文案保存；核心通过本地 `/__edit-core.js` 在页面脚本前同步加载。`edit:sync` 从指定应用提交取得精确内容，`copy-editor-source.json` 记录提交及 SHA-256，`npm run check` 验证副本一致。不要单独修改 `copy-editor-core.js`。清空文案可以删除整行文字；删除默认导览说明时服务端同时重排后续索引。保存异常始终返回 JSON，未确认的响应由共享核心提示核对。

`npm run dev` 通过 cf 启动 `http://127.0.0.1:8794/`，用于验证实际静态资源与重定向，不提供保存接口。普通预览启动后可用 `npm run verify:downloads -- <预览地址>` 检查下载；其他入口为 `verify:typography`、`verify:mobile` 和 `verify`。浏览器验收脚本默认地址各不相同，运行时应明确传入地址；完整验收需要素材。

下载区按平台读取最新完整公开发行，包括预发布版本。Windows 安装包与免安装包、macOS 两种架构包须分别完整上传。Safari 的 Intel UA 不代表实际芯片，芯片不明时保留人工选择；下载逻辑的测试使用任意合成版本，不绑定当前发行号。

首页与页尾的下载说明统一使用「平台 · v版本号」。Windows、macOS 的版本来自完整公开发行包；Docker 版本由 Shields 的镜像版本 JSON 接口按语义版本查询，独立于安装包版本。只接受符合版本格式的值，版本未取得时只显示平台名。公开下载清单同时核对 R2 与 GitHub，同版本优先 R2。本地编辑预览通过同源代理读取公开 R2 清单。

Docker 与 Windows、macOS 共用平台选择入口；Linux 桌面默认显示 Docker，手机保持通用入口。Docker 面板链接到主仓库部署指南与 Docker Hub，说明 `linux/amd64`、数据卷与媒体挂载，不将 ARM NAS 标为已验收。通过 `?platform=docker#download` 可直接预览 Docker 面板。

## 发布与 Cloudflare 配置

视频先发布到 R2，再用 `npm run deploy` 发布页面。媒体使用完整内容哈希对象名、`video/mp4` 与长期不可变缓存；同步清单、播放器地址与 `site/_redirects`，保留仍被页面引用的对象。`site/.assetsignore` 排除原型与历史素材，本地编辑服务位于发布目录之外。

发布后用 `npm run verify -- https://peach.video/ --http-only` 校验公网页面和文件哈希、首段／中段／尾段／后缀范围、无效范围和原地址跳转。省略 `--http-only` 增加桌面与手机的播放、拖动、预览、导览和投诉页检查。公网请求保持严格 TLS 校验。

本项目使用固定版本的 `cf` 与 [`cloudflare.config.ts`](https://developers.cloudflare.com/cf/projects/cloudflare-config/)，官网域名、Worker 名称和可观测性在此维护。`wrangler.config.ts` 仅维护打包器设置、素材目录和本地监听地址；Wrangler 是 cf 调用的打包依赖。`.cloudflare/` 保存生成类型和 Build Output，不进 Git。`npm run build` 执行 `cf build`，`npm run deploy` 执行 `cf deploy`。配置由官方 `cf migrate` 转换；这套配置仍为公开测试版，升级须核对构建和本地行为。

Dependabot 分别对普通小版本更新与安全更新分组，大版本单独审阅；`@types/node` 保持 Node 24 运行基线，只自动更新同一大版本。CI 在 Windows 和 Linux 运行安装、类型与语法检查、行为测试和 cf 构建，Linux 另跑 Chromium 下载流程测试。依赖版本只在 `package.json` 与锁文件维护，素材清单的内容哈希不随工具版本机械改变。素材许可见 [NOTICE](../NOTICE.md)。
