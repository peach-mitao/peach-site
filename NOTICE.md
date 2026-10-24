# 许可与素材

本项目自有代码按 AGPL-3.0-only 发布，见 `LICENSE`。Sticker Forge 的 MIT 声明位于 `site/assets/vendor/sticker-forge/LICENSE`，Inter 的 SIL Open Font License 位于 `site/assets/fonts/LICENSE`，手写品牌声明位于 `site/assets/peach-hello-LICENSE.txt`。

支持页使用 Peach 应用的独立页面样式（AGPL-3.0-only），来源提交及摘要见 `support-ui-source.json`。其中 BoardUI 与 Tailwind CSS 按 MIT 许可使用，编译样式保留 Tailwind 的许可声明。支持页 Inter 5.3.0 的 SIL Open Font License 与来源说明位于 `site/assets/support-ui/inter/`。

Cloudflare Access 签名校验使用 [jose](https://github.com/panva/jose) 6.2.13，按 MIT 许可使用；许可证随 npm 包分发。分析补充页使用自有布局，Cloudflare 名称仅表示集成的平台。

分析后台使用 [Cloudflare Kumo](https://github.com/cloudflare/kumo) 2.15.0、React / React DOM 19.3.1 及 Phosphor React 2.1.10，均按 MIT 许可使用。构建入口将这四项的许可证写入 `/assets/vendor/behavior/`，与浏览器资源一同分发。Kumo standalone CSS 中含 Tailwind CSS 的 MIT 声明。

Apple 图标采用 [Simple Icons](https://github.com/simple-icons/simple-icons/blob/4d29a35c954699b389a834aacc97dd6e7e74143c/icons/apple.svg) 的 SVG 路径，固定于 `4d29a35c954699b389a834aacc97dd6e7e74143c`，按 [CC0 1.0](https://github.com/simple-icons/simple-icons/blob/4d29a35c954699b389a834aacc97dd6e7e74143c/LICENSE.md) 使用。商标权不随图标许可授予。

Docker 鲸鱼图标取自 [Docker 官方图标包](https://www.docker.com/company/newsroom/media-resources/)，仅表示部署兼容性；Docker 名称与图标的商标权归 Docker, Inc. 所有。

`media-01.js` 与 `media-01.css` 来自用户提供的播放器资源，其原始权利状态不由本项目许可证改变。

源码许可不授予厂商标志、人物照片、视频、产品截图或其中第三方内容的权利。展示素材不随 Git 仓库分发；`assets-manifest.json` 仅记录已部署资源的地址、长度与哈希。投诉入口为 `https://peach.video/copyright/`。
