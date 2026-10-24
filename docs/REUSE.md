# 复用与实现边界

文案工具条唯一实现在 `browser/assets/edit-toolbar.ts`，按钮使用 `browser/vendor/boardui/` 的固定来源组件，浮动栏几何复用应用 SelectionDock。`browser/edit-client.ts` 只适配官网源码保存与撤销。构建生成 `site/assets/edit-toolbar.js`，演示站通过其 `edit:ui:sync` 入口同步同一产物并校验来源摘要。样式隔离在 Shadow DOM 内；说明收在支持悬停、焦点和点击的帮助提示中。改动工具条时分别预览官网和演示站，不以交互核心相同推断工具条一致。

外语生成页的原位编辑由 `scripts/edit-locale.ts` 适配，复用 `edit-server.ts` 的纯 HTML 编辑变换、`build_i18n.ts` 的译文位置绑定及生成器、`edit-history.ts` 的版本校验与撤销记录。英文修改写回翻译源，保存后生成页面；中文维护源保持独立。动态控件通过翻译表中的 `overrides` 读取稳定文案键。英文首页的目录别名和文件别名使用同一维护源。

依赖版本以 `package.json` 和 `package-lock.json` 为准。构建工具属于开发依赖，`jose` 用于 Worker 签名校验，Kumo、React 与 Phosphor 用于分析后台控件。页面加载由 TS 编译的 JS 和既有第三方资源，许可范围见 [NOTICE](../NOTICE.md)。

| 能力 | 实现与许可 | 验证与边界 |
| --- | --- | --- |
| IP 服务地区 | Cloudflare 原生地区、ipaddr.js 2.5.0（MIT）、DB-IP Country Lite（CC BY 4.0）与 IPLocate Country（CC BY-SA 4.0） | 任一来源命中大陆即拦截。官网 Cron 每日更新共用 R2，两站五分钟刷新并保留有效表及内置兜底。云端 CSV 流解析复用 csv-parse 7.0.3（MIT），ZIP 流解压复用 fflate 0.8.3（MIT），GZIP、摘要与定时触发复用平台 API；手工快照生成复用 Python 标准库。来源版本、哈希与署名保留，不外发访问者 IP。未选需要账号凭据的 GeoLite／IPinfo；没有零误判保证 |
| TS 类型检查与浏览器编译 | TypeScript 7.0.2，Apache-2.0；esbuild 0.28.2，MIT | 严格检查浏览器、维护脚本、回归、预览与 Worker；Node 24.12 起直接运行可擦除类型。esbuild 生成浏览器 JS，复用 cf 已使用的构建工具，不增加运行时加载器 |
| Cloudflare 配置与发布 | cf 1.0.0-beta.18，MIT OR Apache-2.0；Wrangler 4.151.2，MIT OR Apache-2.0 | 官方 `cf migrate` 转换；Build Output 对照名称、域名、404 行为与可观测性；固定 beta 版本，由 Dependabot 跟踪更新 |
| 本地预览与媒体范围 | Node HTTP、文件流与现有文字编辑模块 | 保留同源编辑和本地下载清单；验证 HEAD、Range、畸形路径、编辑冲突与输入错误；本地服务不进入部署目录 |
| 原位文字编辑 | Peach 主仓库 `frontend/src/copy-editor-core.js`，AGPL-3.0-only | 应用、官网和演示站使用相同核心；保存由各端适配。来源提交与 SHA-256 记录在 `copy-editor-source.json`，检查入口拒绝副本漂移 |
| 官网保存撤销 | 既有官网保存适配、Node fs 原子替换、SHA-256 与本机 JSON 日志，无新增依赖 | 工具条属于各端适配，未修改共享核心。浏览器原生撤销只管理未保存输入，通用编辑器历史库不能恢复源码标签、动态覆盖与节点索引；本地保存接口按源文版本记录完整快照，以可恢复事务持久化，拒绝过期撤销与跨站写入 |
| 下载版本说明 | 现有 R2／GitHub 发行解析与 Shields Docker 版本 JSON 接口 | 安装包和镜像各取实际版本；可变清单使用原生 Fetch 的 `no-store`，页面恢复及过期交互重新核对，合并进行中的请求。同版本优先 R2；真实浏览器 HTTP 缓存回归覆盖旧清单、来源回退与恢复。沿用静态官网，无新增运行时依赖 |
| 图片与浏览器验收 | 既有 Sharp 与 Playwright | 无损 WebP 编解码测试、合成 Release 响应、手机与桌面下载验证；固定版本见依赖清单 |
| 离屏动效卡 | 浏览器原生 `content-visibility`、ResizeObserver 与现有 IntersectionObserver，无新增依赖 | 固定比例画框保留占位，缩放读取观察结果，首次可见才创建播放脚本；验证滚动、窗口缩放、暂停与减少动态效果。不支持内容可见性的浏览器正常布局。属性行为见 [MDN](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/content-visibility) |
| 首屏手写标题 | 原有 SVG／CSS 笔画、IntersectionObserver 与页面可见性事件，无新增依赖 | 手写与静态光束使用绘制隔离和合成提示；笔画沿用 SVG 的路径、延迟、时长与缓动，完成后移除动画。离屏、后台及往返缓存期间暂停，减少动态效果时显示完整标题；没有逐帧脚本或几何读取 |
| 静态资源缓存 | Cloudflare Workers Assets 原生 `_headers`、ETag 与既有 Sharp，无新增依赖 | 日期截图一年不可变，捕获与编码入口按解码像素拒绝覆盖冲突；可更新页面和自有脚本保持校验。真实响应验收覆盖缓存头与 304，不使用 Worker 包装静态资源 |
| 访问统计 | Cloudflare Web Analytics（平台自动注入）与 Workers Analytics Engine，无新增依赖 | Web Analytics 已有国家、路径、来源、设备、浏览器族与系统族，缺语言、版本号与自定义事件；只补这几项，由 `worker/` 的单一埋点入口写入。D1 要自建聚合，KV 免费档每天只能写 1,000 次，Observability 日志免费档只留 3 天，都不适合看趋势 |
| 点击与动线 | 两站共用 TS 协议与浏览器观察器，D1、私有 R2、Cloudflare Access；`jose` 6.2.13，MIT | D1 保存可排序的匿名会话事件，R2 保存维护者构建截图，Access JWT 校验签发者、应用 AUD 与有效期。复用现有 Worker、Sharp、Playwright 和原位编辑器；不用 Analytics Engine 的抽样事件重建精确动线。来源与维护见[访问分析](ANALYTICS.md) |
| 分析面板外观 | Cloudflare Kumo 2.15.0、React / React DOM 19.3.1、Phosphor React 2.1.10，均为 MIT | 下拉与按钮复用官方组件及独立 CSS，使用小型 React 控件适配原生表单；公开官网不加载这些后台依赖。布局与尺寸见[面板样式记录](reference-snapshots/cloudflare-dashboard.md)，未复制 Cloudflare 标志或控制台脚本 |
| 多语言页面 | 自有 `scripts/build_i18n.ts` 与 `i18n/<语言>.json`，无新增依赖 | 静态双页面，标题、描述与 `hreflang` 可被搜索引擎读取；运行时换字做不到这一点，i18next 等框架又要求把中文源改写成键名，与原位编辑冲突。生成结果随源码提交，`npm run check` 拒绝缺译、多余译文与过期页面 |
| 独立支持页 | Peach 应用的 `web/dist/peach-pages.css`、Inter 5.3.0 与品牌标志；既有 Sharp、esbuild | 404、版权页与统计偏好复用应用的页面卡片、字体和控件 token，不加载应用数据。`support-ui-source.json` 记录来源提交及资源摘要；演示站从官网同步 404 与语言解析器。版权页使用静态中英文版本，404 与统计偏好根据语言偏好只显示一种语言 |
| 语言识别与选择 | 浏览器原生 [navigator.languages](https://developer.mozilla.org/en-US/docs/Web/API/Navigator/languages)、localStorage 与现有静态中英文页，无新增依赖 | 首页按偏好匹配，手选优先；禁止存储时使用显式参数。既有页面生成器保留静态 SEO；两个语言不引入额外检测库，不让首页进入 Worker。一次性会话来源交接不包含完整网址或访客标识 |

公开产品页面由 Worker 执行地区判断后读取 Cloudflare 静态资源，不加载分析后台的 React / Kumo 控件。Worker 同时处理事件、受保护的分析页与统计偏好。外语页由提交的生成文件发布，浏览器脚本在部署前编译。本地预览用于编辑和测试；素材、真实账本与生产入口由各自维护入口管理。操作入口见[维护说明](MAINTAINING.md)。
