# 复用与实现边界

依赖版本以 `package.json` 和 `package-lock.json` 为准；工具均为开发依赖。页面继续直接加载自有 JS 和既有第三方资源，许可范围见 [NOTICE](../NOTICE.md)。

| 能力 | 实现与许可 | 验证与边界 |
| --- | --- | --- |
| TS 类型检查 | TypeScript 7.0.2，Apache-2.0 | 严格检查本地预览、文字编辑和 Cloudflare 配置；Node 24.12 起直接运行可擦除类型，无需 `tsx` 运行器 |
| Cloudflare 配置与发布 | cf 1.0.0-beta.18，MIT OR Apache-2.0；Wrangler 4.151.2，MIT OR Apache-2.0 | 官方 `cf migrate` 转换；Build Output 对照名称、域名、404 行为与可观测性；固定 beta 版本，由 Dependabot 跟踪更新 |
| 本地预览与媒体范围 | Node HTTP、文件流与现有文字编辑模块 | 保留同源编辑和本地下载清单；验证 HEAD、Range、畸形路径、编辑冲突与输入错误；本地服务不进入部署目录 |
| 原位文字编辑 | Peach 主仓库 `frontend/src/copy-editor-core.js`，AGPL-3.0-only | 应用、官网和演示站使用相同核心；保存由各端适配。来源提交与 SHA-256 记录在 `copy-editor-source.json`，检查入口拒绝副本漂移 |
| 下载版本说明 | 现有 R2／GitHub 发行解析与 Shields Docker 版本 JSON 接口 | 安装包和镜像各取实际版本；保留版本格式校验，未取得时只显示平台。沿用静态官网，无新增运行时依赖 |
| 图片与浏览器验收 | 既有 Sharp 与 Playwright | 无损 WebP 编解码测试、合成 Release 响应、手机与桌面下载验证；固定版本见依赖清单 |
| 多语言页面 | 自有 `scripts/build_i18n.mjs` 与 `i18n/<语言>.json`，无新增依赖 | 静态双页面，标题、描述与 `hreflang` 可被搜索引擎读取；运行时换字做不到这一点，i18next 等框架又要求把中文源改写成键名，与原位编辑冲突。生成结果随源码提交，`npm run check` 拒绝缺译、多余译文与过期页面 |

未引入网站框架。生产页面由 Cloudflare 静态资源层提供，外语页由提交的生成文件直接发布，部署时不运行额外构建；本地预览只是编辑和测试入口。素材、真实账本与生产入口不由本次代码维护迁移。操作入口见[维护说明](MAINTAINING.md)。
