# Peach 官网

[官网](https://peach.video/) · [在线演示](https://demo.peach.video/) · [Peach 应用](https://github.com/peach-mitao/peach)

产品介绍、六页导览、演示动效、下载入口与版权投诉页。页面正文在 `site/index.html`，静态站部署到 Cloudflare Workers Assets。

中文标题的字距、标点与响应式断行见 [官网中文排版](TYPOGRAPHY.md)。

下载是导航、首屏和收尾区的主动作，首屏的在线演示与介绍视频并排显示。手机导览聚焦截图内容。页脚使用深色底面，链接保留足够的点击高度。

Windows 下载区区分 EXE 安装包与 ZIP 免安装压缩包：`-setup.exe` 用于安装，ZIP 解压后运行目录中的 `Peach.exe`。两种文件均从应用的 GitHub Releases 获取。

介绍视频由 `worker.mjs` 使用 Cloudflare Cache API 提供字节范围响应，支持进度拖动与悬停缩略图。缓存键包含媒体清单的内容哈希；视频文件与 `assets-manifest.json` 必须一致。其余页面走静态资源层。Cloudflare 原生范围行为见 [Cache API](https://developers.cloudflare.com/workers/runtime-apis/cache/#match)。实现无新增依赖。

介绍视频为 74.5 秒、14 个章节，分镜与文案跟随本页分区。独立视频工程导出 4K 母版与 1080p 官网文件（H.264 2.6 Mbps、AAC 128k，低于静态资源单文件 25 MiB 上限）；MP4 使用 faststart 与 2 秒关键帧间隔。章节、封面和媒体清单与同一版影片匹配。

## 本地预览

使用 Node.js 24 LTS 或更新的 LTS，在仓库目录安装依赖：

```powershell
npm ci
```

按清单下载已部署的公开素材并逐文件校验哈希：

```powershell
npm run assets:fetch
```

启动只监听回环地址的预览：

```powershell
npm run dev
```

普通页面为 `http://127.0.0.1:8790/`，原位改字为 `http://127.0.0.1:8790/?edit`。回车或点别处保存到 `site/index.html`，Esc 取消。保存接口只接受同一预览来源；改字服务位于发布目录之外。

验证视频 Worker 时运行 `npm run dev:worker`，入口为 `http://127.0.0.1:8794/`；该入口不提供改字模式。运行 `node check_publish.mjs http://127.0.0.1:8794/` 核对媒体范围、进度点击、拖动、缩略图与桌面／手机页面。

## 验证与发布

检查脚本语法：

```powershell
npm run check
```

预览运行时验证桌面、手机、六张 3840×2160 导览、三行资料、播放器与投诉页：

```powershell
npm run verify
```

使用已登录的 Cloudflare 账号发布到 `peach.video`：

```powershell
npm run deploy
```

发布后严格校验公网文件；`--http-only` 不启动浏览器：

```powershell
node check_publish.mjs https://peach.video/ --http-only
```

`site/.assetsignore` 排除原型、旧版页面、手写预览与未引用的历史截图。公网不提供本地保存接口。导览按需加载，资料区为厂商、事务所、女优各一行；贴纸每次打开显示「拖我试试」，本次拖动后收起并保留位置。

## 项目边界

`peach-site` 管理官网代码。应用在 `peach-mitao/peach`，演示站在 `peach-mitao/peach-demo`。媒体、截图、原型、本地验收证据与缓存不进入 Git，展示素材由独立清单管理。许可范围见 [NOTICE](NOTICE.md)。
