# 官网维护

页面正文位于 `site/index.html`，部署到 Cloudflare Workers Assets；视频通过 R2 的 `media.peach.video` 分发。中文排版约定见[官网中文排版](../TYPOGRAPHY.md)。站点维护的 JavaScript 源码统一使用 TypeScript：浏览器交互在 `browser/`，维护入口在 `scripts/`，回归在 `tests/`，动态接口在 `worker/`。首页交互与启动脚本也由 TS 编译。

工具选型与复用边界见[复用说明](REUSE.md)。

## 独立支持页

所有请求先由 Worker 使用 Cloudflare 的 `request.cf.country` 与边缘设置的 `CF-Connecting-IP` 判断服务地区。Cloudflare 为 `CN`，或 DB-IP Country Lite、IPLocate Country 任一库命中大陆网段时，跳转到 `/unavailable`，提示页返回 403 并复用 404 样式。`HK`、`MO`、`TW` 不按国家码拦截；库间冲突时仍按任一来源命中即拦截，允许增加误封以减少漏放。两份库只提取 `CN`，IPv4、IPv6 及 IPv4 映射 IPv6 都在 Worker 内离线查询，不把访问者 IP 发给外部查询服务，也不使用语言、时区、`X-Forwarded-For` 或客户端地区声明。

跳转和提示页均为 `private, no-store`，只有提示页所需的样式、字体和标识直接放行。`runWorkerFirst: true` 保证每次服务器请求先判断地区，再读取静态缓存，因此资源请求均产生 Worker 调用。已在浏览器中显示或保存且没有发起请求的内容无法远程撤回。

官网的 Cloudflare Cron 在每天 06:30 UTC（Asia/Taipei 14:30）检查官方数据，保留原有统计清理定时器。DB-IP 使用当月版本，IPLocate 先查询官方最新提交，再按固定提交下载。归档按流解压与解析，不将整个 CSV 保存在内存中；每个来源缓存版本、SHA-256 与 CN 网段。两库成功且 IPv4／IPv6 完整、规模合理时，才原子替换 R2 `peach-region-data` 中的 `regions/cn/current.json`。大陆网段相同则不替换生效表，来源缓存可更新。失败保留当前表并记录定时器错误；定时日志包含版本、哈希和计数，不包含访问者 IP。

两站通过 `REGION_DATA` 绑定共读 R2 生效表，每个 Worker 实例最多约五分钟重新读取一次，并合并并发读取；读取失败时继续用上一份有效表，冷启动兜底使用 `worker/region-data.ts` 的内置快照。定时更新不需要本机、Codex、GitHub Actions 或重新部署网站。R2 请求和存储按现有账户计量；数据版本、哈希与网段摘要可在 R2 对象及 Worker 定时日志中查看。

内置快照记录官方归档版本、下载地址、SHA-256 与来源计数。手工更新内置快照时使用 Python 标准库脚本 `scripts/build_region_data.py`，传入 `--dbip`、`--dbip-month`、`--iplocate` 和 `--iplocate-revision`。预览、网站构建与云端定时器不需要 Python。修改地区判断后验证命中、未命中、冲突、地址族、更新失败保留及热更新缓存。

404 位于 `site/404.html`，版权投诉中文源位于 `site/copyright/index.html`，英文页由 `npm run i18n` 生成。版权页按保存偏好或浏览器语言跳转到静态版本；404 由 `browser/assets/page-support.ts` 显示单一语言，显式 `lang` 参数优先。

维护应用样式时，将应用检出目录作为参数运行 `scripts/sync_support_ui.ts`，再构建浏览器资源、查看桌面和手机预览。来源提交、资源摘要与许可随样式一起保存；实测尺寸见[支持页样式来源](reference-snapshots/peach-support-pages.md)。版权表单只在浏览器整理邮件，不自动发送或存储投诉。

本地官网预览支持 404 与版权页的 `?edit`。中文正文保存到对应源文件，英文版权页应通过中文源和翻译表生成，避免生成结果被覆盖。独立 404 的英文显示由 TypeScript 维护。

统计偏好页位于 `worker/ui/privacy.html`，由 Worker 提供且禁止缓存，复用支持页样式。`behavior-privacy.ts` 按显式语言、已选偏好及浏览器语言显示单一版本，保留共享 Cookie 的开关行为；页脚链接携带当前语言。页脚布局依据[布局观察](reference-snapshots/lumno-footer.md)分开品牌联系、辅助信息与语言选择。

版本清单是可变资源，下载控制器使用 `cache: no-store` 读取。进入页面或从往返缓存恢复时重新获取；页面重新可见、下载入口悬停或聚焦时按一分钟间隔重新核对，并合并进行中的请求。同版本的 R2 入口可替换 GitHub 回退；安装包仍使用版本路径和长期缓存。Cloudflare 的版本清单规则必须尊重源站短缓存，避免区域 Browser Cache TTL 抬高可变清单的有效期。安装包的不可变缓存与该规则分别维护。

## 环境与检查

使用 Node.js 24.12 或更新的受支持 LTS。以下命令均在本仓库根目录执行。

按锁文件安装依赖：

```powershell
npm ci
```

生成浏览器脚本与 Cloudflare 运行时类型，严格检查源码、预览服务和构建产物：

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

在临时回环端口自动验证手机和桌面的下载、埋点、编辑与中英文界面，无需启动预览：

```powershell
npm run test:browser
```

对已有预览使用 `npm run verify:interface -- <地址>`，核对语言菜单、问答开合、离屏动效卡的暂停与窗口缩放，以及减少动态效果。`verify:typography` 与 `verify:mobile` 使用合成发行清单，分别验证可下载状态和未取得安装包时的跳转，不依赖公网版本或发布时间。

检查 cf 配置与构建，不上传资源：

```powershell
npm run check:deploy
```

CI 使用合成 Release 响应验证下载、平台选择与异常恢复，不访问真实 GitHub API，也不要求下载媒体。截图、播放器与素材完整性由下述发布验收覆盖。Node 直接运行可擦除类型的 TS；`tsconfig.json` 与 `tsconfig.browser.json` 分别严格检查 Node／Worker 和浏览器代码。检查入口拒绝在维护源码目录新增 `.js` 或 `.mjs`。

`npm run browser:build` 通过 esbuild 将 `browser/assets/`、`browser/copyright/` 和编辑适配器编译到对应的浏览器 JS 路径。构建、预览、检查、测试与 npm 部署入口自动准备这些文件；直接调用 cf 前须先生成浏览器产物。编译副本不进 Git。第三方库与按来源锁定的共享编辑核心保持 JS 产物，不在本站维护副本实现。

## 素材与预览

通过 `npm run assets:fetch` 按 `assets-manifest.json` 获取公开素材，逐个核对长度和 SHA-256。媒体、截图、原型、验收证据和缓存不进 Git。六页导览按视口选择 16:9 或 4:3 桌面截图；使用 `npm run capture:desktop` 更新截图和清单时，应先验收演示站，生成无损 WebP 并核对像素一致。

每张 4K 截图另有无损的缩小版：16:9 桌面图 1280、1920、2560 宽，4:3 手机图 1440、1920 宽，文件名在日期后加宽度。首页用 `srcset` 与 `sizes` 让浏览器按显示宽度和设备像素比挑选，4K 原图保留为最高一档。截图最宽显示 1134 CSS 像素，手机约 340；改版面宽度时同步调整 `sizes`。手机最小一档约为常见手机设备像素的 1.4 倍，给双指放大留了余量，放大到更大倍数时比 4K 原图模糊。已发布截图的字节不随编码器版本改变，像素变化时使用新日期文件名。新增的候选图部署前在线上不存在，`assets:fetch` 对这些条目会失败，需要设置 `PEACH_CAPTURE_DATE` 后运行 `node scripts/optimize_compact_desktop.ts`，从 PNG 原图在本地生成。

`site/_headers` 为页面引用的截图与 README 公开截图提供一年不可变缓存，字体缓存七天，头像、厂牌、小图、海报、Logo 与第三方脚本缓存一天。截图规则使用清单中的精确路径，不为不存在的截图缓存 404；捕获用的其他 PNG 原图保留默认校验。页面和自有 JS／CSS 使用静态资源层的 ETag 与逐次校验，确保页面与逻辑同步更新；埋点响应仍为 `no-store`。同一响应只匹配一条自定义缓存规则，避免多个 `max-age` 被拼接。

更新截图清单或页面引用后运行 `npm run cache:sync`，按素材清单与中英文页面生成缓存规则；`npm run check` 拒绝过期规则。规则不得超过 Cloudflare 的 100 条上限。

截图文件名包含日期，公开后不能用相同 URL 发布不同像素。捕获与编码入口复用 `scripts/immutable_image.ts`：相同像素保留原字节，不同像素拒绝覆盖，须使用新的 `PEACH_CAPTURE_DATE`。更换字体或其他带缓存的同名素材时，也应使用新文件名或在引用中加入新内容版本。旧素材保留，以便仍持有旧页面的客户端正常加载。

使用 `cf dev` 后运行 `npm run verify:cache -- <地址>`，核对实际缓存头、ETag 条件请求的 304、页面与自有脚本的校验策略，以及 `_headers` 不公开。编辑预览服务器不应用 Cloudflare 的 `_headers`，不能代替这项验收。发布后对公开地址运行同一入口。

页面里的小尺寸 Logo 用 `assets/peach-logo-192.webp`；`peach-logo.png` 保留 1024 原图，供 `apple-touch-icon` 与外部链接使用。

截图脚本以 UTC 日期命名，可用 `PEACH_CAPTURE_DATE` 指定八位日期；捕获和编码使用同一值。首页使用 2026-10-18 的两套导览，包含首页、艺人、艺人详情、播放、关注与统计；清单另保留 2026-10-20 的 Peach 0.46.1 演示界面截图，作为可选素材，不代表页面当前引用。更新时同步替换首页引用、生成响应式候选并运行 `cache:sync`，保留历史清单记录。

`npm run dev:edit` 启动 `http://127.0.0.1:8790/`，`?edit` 提供原位改字。回车或失焦写回 `site/index.html`，Esc 取消；保存接口只接受同源请求。`PEACH_PREVIEW_DOWNLOADS` 可指定本地 Mac 包清单，安装包留在原位置，预览仅开放已登记的包。

编辑模式中，平台选择、导览标签和展开控件照常操作，Alt+点击可编辑控件文字。脚本生成的下载文案由 `assets/copy.js` 按 `data-copy-key` 区分平台与状态，修改保存在首页的 `data-copy-overrides` 中，刷新、切换和异步重绘后继续生效。新增动态文案应使用 `renderCopy`；新增切换控件可标记 `data-copy-interact`。命令区支持 Shift+回车换行。`npm run test:browser` 同时验证下载与编辑流程，保存测试仅写临时站点。

段落、说明和标题中的连续行内文字共用编辑区域；标题与块级说明、链接和操作控件各自独立。保存保留未修改片段的行内样式，空的样式包装随文字删除。整段保存核对所有原始文字节点，再原子写入 HTML；节点数量变化会重排后续索引，连续编辑和刷新使用同一份源文件。

Windows 的系统安全提示链接到 [Microsoft 应用与浏览器控制说明](https://support.microsoft.com/zh-cn/windows/security/windows-security/app-browser-control-in-the-windows-security-app)。Mac 包未经公证时，较新的 macOS 会提示「已损坏，无法打开」，「隐私与安全性」里也不出现「仍要打开」；点击 Mac 安装包时弹出 `[data-mac-help-dialog]` 打开步骤，下载照常开始，面板里的「查看打开步骤」可再次打开。步骤中的命令为 `sudo /usr/bin/xattr -rd com.apple.quarantine "/Applications/Peach.app"`，写全路径以避开 Python 包安装的同名 `xattr`。Mac 状态文字单独使用 `renderCopy`，按钮位于该动态节点之外，状态重绘和编辑不替换按钮。提示内容须与构建中的 Developer ID 签名、公证及 Windows 代码签名状态一致；完成公证后移除弹窗与命令。

原位编辑核心唯一维护源为 Peach 应用仓库的 `frontend/src/copy-editor-core.js`。官网 `edit-client.js` 只适配 HTML 原文索引、导览属性与动态文案保存；核心通过本地 `/__edit-core.js` 在页面脚本前同步加载。`edit:sync` 从指定应用提交取得精确内容，`copy-editor-source.json` 记录提交及 SHA-256，`npm run check` 验证副本一致。不要单独修改 `copy-editor-core.js`。清空文案可以删除整行文字；删除默认导览说明时服务端同时重排后续索引。保存异常始终返回 JSON，未确认的响应由共享核心提示核对。

编辑工具条提供「撤销」「重做」，按已保存操作逐步回退；未在输入框中编辑时可用 Ctrl／⌘+Z 撤销、Ctrl／⌘+Shift+Z 或 Ctrl+Y 重做。输入框内保留浏览器原生撤销，Esc 取消尚未保存的输入。每次保存记录完整中文源及版本摘要，支持找回整段删除、行内样式、导览和动态文案；撤销后新保存清空重做分支。最近 50 次保存留在本机 `evidence/edit-history.json`，刷新或重启预览仍可使用，不进 Git 或发布目录。恢复操作重新加载编辑页并保留问答展开位置；原文已被其他操作修改时拒绝覆盖，刷新后以当前文件为起点。

「查看打开步骤」与弹窗「知道了」使用 `data-copy-interact`，普通点击照常打开或关闭，Alt+点击可改按钮文字。弹窗打开时，工具条进入同一原生弹窗层，弹窗里的文字可编辑、保存和撤销。

资料条三行（厂商、事务所、女优）以「同一项滚出左边之前不会从右边再出现」为准：每行单份长度不短于 1920 视口宽度，条目不必更多。三行约 24px/s 同速滚动；增删条目后用浏览器量单份长度，按长度除以速度重算 `.marks-row` 的动画时长。事务所标志取自主仓库 `resources/marks/studios/` 的 `*.logo.png`，来源记录在该目录的 `manifest.json`。女优头像取宣传照顶部、与图同宽的正方形，缩成 96×96 的 WebP，只用人脸完整、无文字压脸、不露点的图。新素材同时写入 `assets-manifest.json`。

`data-copy-draft` 标记本轮待用户确认的改字位置，编辑预览中显示为粉色。每轮改字先清除上一轮的全部标记，只标这一轮改过或新增的元素；外语页生成时去掉该标记。

常见问题区 `#faq` 沿用主仓库 README 的常见问题，另含界面语言与 Mac「已损坏」两条；应用支持的语言变化时同步「支持哪些语言」。展开与收起用 Web Animations 过渡高度，减少动态效果时直接切换；README 的问答变动时同步这里与 `i18n/en.json`，英文措辞对齐 `README.en.md`。Mac 这一条不重复终端命令，按钮打开同一个 `[data-mac-help-dialog]`，命令只在弹窗里维护一处。

首屏下载按钮按访客平台改字，版本号来自发行清单。`<head>` 的内联脚本先给页面加 `dl-label-pending` 与 `dl-meta-pending`，`downloads.js` 首次渲染后显示按钮文字，当前平台取得版本或发行清单查完后显示版本行；最多等 3 秒。按钮的最小宽度容得下各平台最长的文字，换字时位置不变。

## 多语言

`site/index.html` 与 `site/copyright/index.html` 是唯一手编的中文源。英文页 `site/en/` 由 `npm run i18n` 生成并随源码提交，译文在 `i18n/en.json`：

| 字段 | 内容 |
| --- | --- |
| `text` | 文字节点与 `alt`、`title`、`aria-label`、`placeholder`、`content`、`data-label`、`data-say`、`data-title`、`data-done` 的整段原文到译文 |
| `attributes` | 按属性名精确替换的值，如 `lang`、`hreflang` 与站内链接 |
| `runtime` | 脚本中 `t('原文')` 的译文，生成时注入为 `window.PEACH_I18N` |

`translate="no"` 的子树保留原文；首页的演示界面与应用一致，保持中文。中文改字后 `npm run check` 会列出缺少或不再使用的译文，以及需要重新生成的页面。补齐 `i18n/en.json` 后运行 `npm run i18n`。英文页不提供 `?edit` 原位编辑，改译文直接改 JSON。脚本新增文案时用 `t()` 包住原文：模块从 `/assets/i18n.js` 导入，经典脚本使用同名的单行查表函数。顶栏地球仪菜单与页尾链接切换语言，菜单标 `translate="no"`，各语言名称保持原文；两种语言互相声明 `hreflang`。译文以不超框为准，按钮可只留图标加名称，例如 Mac 面板写「Apple silicon」；改完运行 `npm run test:browser` 与浏览器截图核对 320、390、768、1280 宽度。

`assets/locale.js` 在页面头部运行：首页 `/` 优先使用本机手选的 `peach.site.locale`（`zh` 或 `en`），否则按 `navigator.languages` 的偏好顺序匹配中英文，未匹配时使用英文。英文通过 `location.replace` 前往 `/en/`，保留查询参数和锚点；显式英文页、版权页、爬虫与 `?edit` 不自动跳转。`?lang=zh` 或 `?lang=en` 可显式选择；手动切换会保存偏好，本地存储受限时在链接中保留显式参数，避免中文入口反跳。服务器仍提供静态页面，不为语言识别增加 Worker 调用；禁用 JavaScript 时根路径显示中文。

自动跳转前仅把来源域名临时写到会话存储 `peach.site.entry-referrer`，下一页读取后删除，十秒过期；不传递来源完整网址。埋点只记录最终页面，使用原来源域名及原推广参数。语言偏好是功能设置，不是访客标识；除该一次性来源交接，访问统计不使用浏览器存储。`npm run verify:locale -- <地址>` 验证识别、记忆、存储受限、无 JS、参数保留与单次访问，已纳入 `test:browser`。

`npm run dev` 通过 cf 启动 `http://127.0.0.1:8794/`，用于验证实际静态资源与重定向，不提供保存接口。普通预览启动后可用 `npm run verify:downloads -- <预览地址>` 检查下载；其他入口为 `verify:typography`、`verify:mobile` 和 `verify`。浏览器验收脚本默认地址各不相同，运行时应明确传入地址；完整验收需要素材。

下载区按平台读取最新完整公开发行，包括预发布版本。Windows 安装包与免安装包、macOS 两种架构包须分别完整上传。Safari 的 Intel UA 不代表实际芯片，芯片不明时保留人工选择；下载逻辑的测试使用任意合成版本，不绑定当前发行号。

首页与页尾的下载说明统一使用「平台 · v版本号」。Windows、macOS 的版本来自完整公开发行包；Docker 版本由 Shields 的镜像版本 JSON 接口按语义版本查询，独立于安装包版本。只接受符合版本格式的值，版本未取得时只显示平台名。公开下载清单同时核对 R2 与 GitHub，同版本优先 R2。本地编辑预览通过同源代理读取公开 R2 清单。

Docker 与 Windows、macOS 共用平台选择入口；Linux 桌面默认显示 Docker，手机保持通用入口。Docker 面板链接到主仓库部署指南与 Docker Hub，说明 `linux/amd64`、数据卷与媒体挂载，不将 ARM NAS 标为已验收。通过 `?platform=docker#download` 可直接预览 Docker 面板。

## 发布与 Cloudflare 配置

视频先发布到 R2，再用 `npm run deploy` 发布页面。媒体使用完整内容哈希对象名、`video/mp4` 与长期不可变缓存；同步清单、播放器地址与 `site/_redirects`，保留仍被页面引用的对象。`site/.assetsignore` 排除原型与历史素材，本地编辑服务位于发布目录之外。

Workers 静态资源请求免费且不限量；R2 不收公网出口流量费，存储与对象操作按服务额度计费。CDN 命中不代表客户端免于再次请求：浏览器或图片代理是否复用响应，还取决于对外的 `Cache-Control`。分析访客时使用官网页面访问或埋点；图片代理、视频 Range、发行包下载、演示站 API 与健康检查分别统计，不能用整个域名区域的 HTTP 请求数代表访客数。R2 自定义域名仍属于所在区域，迁移资源后需要按主机或路径筛选统计。

发布后用 `npm run verify -- https://peach.video/ --http-only` 校验公网页面和文件哈希、首段／中段／尾段／后缀范围、无效范围和原地址跳转。省略 `--http-only` 增加桌面与手机的播放、拖动、预览、导览和投诉页检查。公网请求保持严格 TLS 校验。

本项目使用固定版本的 `cf` 与 [`cloudflare.config.ts`](https://developers.cloudflare.com/cf/projects/cloudflare-config/)，官网域名、Worker 名称和可观测性在此维护。`wrangler.config.ts` 仅维护打包器设置、素材目录和本地监听地址；Wrangler 是 cf 调用的打包依赖。`.cloudflare/` 保存生成类型和 Build Output，不进 Git。`npm run build` 执行 `cf build`，`npm run deploy` 执行 `cf deploy`。配置由官方 `cf migrate` 转换；这套配置仍为公开测试版，升级须核对构建和本地行为。

站点有一个 Worker（`worker/index.ts`），`assets.runWorkerFirst` 只把 `/api/event` 交给它；页面、资源与未匹配路径都由静态资源层返回，不计 Worker 调用。未匹配路径返回 `site/404.html`，缺少这一页时资源层没有可返回的 404 页，扫描与探测请求会全部落到 Worker。Workers 免费档每天 10 万次调用按账号计，与演示站共用；超出后只有埋点收到 429，页面不受影响。

Dependabot 分别对普通小版本更新与安全更新分组，大版本单独审阅；`@types/node` 保持 Node 24 运行基线，只自动更新同一大版本。CI 在 Windows 和 Linux 运行安装、类型与语法检查、行为测试和 cf 构建，Linux 另跑 Chromium 下载流程测试。依赖版本只在 `package.json` 与锁文件维护，素材清单的内容哈希不随工具版本机械改变。素材许可见 [NOTICE](../NOTICE.md)。

## 加载与渲染性能

动效卡的画框用 `aspect-ratio` 保留尺寸，内部使用浏览器原生 `content-visibility: auto` 跳过离屏布局。`ResizeObserver` 的 `contentRect` 提供缩放宽度，避免初始化时交错读取布局与写入样式；播放脚本和光标在卡片首次进入视口时创建，离屏或页面隐藏时暂停。减少动态效果时保留静态画面。浏览器不支持内容可见性优化时仍正常布局。

首屏贴纸只在宽屏且使用精确指针时加载 Sticker Forge，并且要求硬件加速的 WebGL：浏览器因性能问题拒绝创建上下文，或渲染器是 SwiftShader、llvmpipe 等软件实现时，保留静态贴纸图，不生成纹理。软件渲染下九张贴纸的距离场计算与重绘会占用主线程数秒，滚动掉到 30 帧左右。翘角提示在首屏滚出视口或页面隐藏时暂停。

用 Playwright 测性能时，默认的无头 Chromium 使用 SwiftShader 软件渲染，WebGL 与合成的开销被严重放大。测 WebGL、滚动帧率和动画要加 `--use-angle=d3d11 --enable-gpu --ignore-gpu-blocklist`（Windows）并用 `WEBGL_debug_renderer_info` 确认渲染器；手机档用 4 倍 CPU 降速与慢速 4G 模拟，重点看 LCP 与图片字节。

## 访问统计

Cloudflare 在页面里自动注入 Web Analytics 脚本，提供页面访问、国家、路径、来源、设备、浏览器族与系统族，没有语言、版本号和自定义事件。`site/assets/analytics.js` 只补这几项：打开页面和几个关键操作各发一条埋点到 `/api/event`，Worker 归一后写入 Analytics Engine 数据集 `peach_site_events`。数据集在第一次写入时自动创建，按 [Cloudflare 保留期](https://developers.cloudflare.com/analytics/analytics-engine/limits/)存储三个月。

| 列 | 来源 | 用途 |
| --- | --- | --- |
| `event` | 页面 | `pageview`、`lang_switch`、`download`、`platform`、`mac_help`、`faq`；同时作为唯一的采样键 |
| `page_lang`、`path` | 页面 | 实际看的语言版本与页面，只接受已知取值 |
| `pref_lang`、`pref_langs` | `Accept-Language` | 浏览器的首选语言（含地区）与按偏好排序的前三种主语言，用来判断值得投入哪种语言；与页面上的语言切换分开统计 |
| `country` | Cloudflare 按 IP 判断 | 与语言做交叉，区分「人在哪」与「读什么」 |
| `browser`、`browser_version` | UA | 浏览器族与主版本，App 内置浏览器（X、微信、QQ）单独归类 |
| `os`、`os_version`、`arch` | UA 与 Chromium 客户端提示 | 系统与版本、CPU 架构。主流浏览器把 Windows 冻结为 10.0、macOS 冻结为 10.15.7，UA 只能写成 `10+`、`10.15+`；客户端提示给出的 Windows 11、macOS 真实主版本与芯片架构优先 |
| `device` | UA | 手机、平板与桌面 |
| `referrer`、`utm_source` | 页面 | 来源只记域名，站内跳转记为 `(internal)` |
| `detail` | 页面 | 事件补充：切换到的语言、下载的包、选择的平台、展开的问答序号 |

统计匿名：不用 Cookie，不发访客标识，不存 IP 与 UA 原文，任意输入都经白名单或格式校验后才写入。浏览器存储只涉及上文说明的功能语言偏好和一次性来源交接，不作为识别或关联访客的依据。爬虫、脚本与无头浏览器照常收到 204，但不记录，所以浏览器验收不会写入统计。新增维度只能追加到 `worker/events.ts` 的 `BLOBS` 末尾，查询脚本按同一顺序取列。

下载事件记录点击，不能作为成功下载、安装或应用使用量；Web Analytics 与自有统计分别描述，不将自有统计的字段限制泛化为 CDN 日志策略。

`npm run verify:analytics -- <地址>` 在页面上逐个触发埋点并核对 204；`npm run test:browser` 已包含这一步。本地 `cf dev` 的 Analytics Engine 绑定不落盘，只能验证路由与返回码，写入与查询要在线上核对。

查询使用 SQL API，需要账号 ID 与带 Account Analytics Read 权限的 API 令牌，计数一律用 `SUM(_sample_interval)` 还原采样：

```powershell
$env:CLOUDFLARE_ACCOUNT_ID = '<账号 ID>'
$env:CLOUDFLARE_API_TOKEN = '<只读令牌>'
npm run analytics -- --days 30 --report languages --report switches
```

报表有 `languages`、`readable`、`countries`、`switches`、`downloads`、`systems`、`sources`、`actions`，省略 `--report` 输出全部。Web Analytics 的原有数据也可以用 `cf sql query` 查询数据集 `events.rumPageloadEvents`；HTML 请求的完整 UA 在 `events.httpRequests`。
