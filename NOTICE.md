# 许可与素材

地区访问判断使用 [ipaddr.js](https://github.com/whitequark/ipaddr.js) 2.5.0（MIT）。`worker/region-data.ts` 是 [DB-IP Country Lite](https://db-ip.com/db/lite.php) 与 [IPLocate Country](https://github.com/iplocate/ip-address-databases) 的 `CN` 网段并集，派生数据按 [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) 分发；DB-IP 原始数据按 CC BY 4.0 分发。版本、来源地址及原始归档 SHA-256 保留在生成文件的 `sources` 中，页面保留两家数据提供者链接。此数据许可不改变项目自有代码许可。

云端国家库定时更新使用 [csv-parse](https://github.com/adaltas/node-csv) 7.0.3 与 [fflate](https://github.com/101arrowz/fflate) 0.8.3，均按 MIT 许可使用，许可随 npm 包分发。

本项目自有代码按 AGPL-3.0-only 发布，见 `LICENSE`。Sticker Forge 的 MIT 声明位于 `site/assets/vendor/sticker-forge/LICENSE`，Inter 的 SIL Open Font License 位于 `site/assets/fonts/LICENSE`，手写品牌声明位于 `site/assets/peach-hello-LICENSE.txt`。

支持页使用 Peach 应用的独立页面样式（AGPL-3.0-only），来源提交及摘要见 `support-ui-source.json`。其中 BoardUI 与 Tailwind CSS 按 MIT 许可使用，编译样式保留 Tailwind 的许可声明。支持页 Inter 5.3.0 的 SIL Open Font License 与来源说明位于 `site/assets/support-ui/inter/`。

Cloudflare Access 签名校验使用 [jose](https://github.com/panva/jose) 6.2.13，按 MIT 许可使用；许可证随 npm 包分发。分析补充页使用自有布局，Cloudflare 名称仅表示集成的平台。

分析后台使用 [Cloudflare Kumo](https://github.com/cloudflare/kumo) 2.15.0、React / React DOM 19.3.1 及 Phosphor React 2.1.10，均按 MIT 许可使用。构建入口将这四项的许可证写入 `/assets/vendor/behavior/`，与浏览器资源一同分发。Kumo standalone CSS 中含 Tailwind CSS 的 MIT 声明。

统计偏好页的开启礼炮使用 [canvas-confetti](https://github.com/catdad/canvas-confetti) 1.9.4，按 ISC 许可使用；构建入口将许可证写入 `/assets/vendor/behavior/canvas-confetti-LICENSE`。

Apple 图标采用 [Simple Icons](https://github.com/simple-icons/simple-icons/blob/4d29a35c954699b389a834aacc97dd6e7e74143c/icons/apple.svg) 的 SVG 路径，固定于 `4d29a35c954699b389a834aacc97dd6e7e74143c`，按 [CC0 1.0](https://github.com/simple-icons/simple-icons/blob/4d29a35c954699b389a834aacc97dd6e7e74143c/LICENSE.md) 使用。商标权不随图标许可授予。

Docker 鲸鱼图标取自 [Docker 官方图标包](https://www.docker.com/company/newsroom/media-resources/)，仅表示部署兼容性；Docker 名称与图标的商标权归 Docker, Inc. 所有。

`media-01.js` 与 `media-01.css` 来自用户提供的播放器资源，其原始权利状态不由本项目许可证改变。

官网与演示站采用 Blender 开放电影素材、Wikimedia Commons 电影图像与人物照片，逐文件来源、署名、许可与修改说明见[素材来源页面](https://peach.video/credits/)及[维护清单](docs/film-sources.json)。Blender 素材按各作品的 CC BY 2.5、3.0 或 4.0 许可使用；Commons 素材按各原始文件页记录的许可使用。主导览展示应用真实界面，功能示意、滚动条与贴纸中的图片按容器缩放或裁切。

源码许可不改变电影剧照、商标及其他第三方内容的权利。展示素材不随 Git 仓库分发；`assets-manifest.json` 锁定恢复地址、长度与哈希。投诉入口为[版权投诉](https://peach.video/copyright/)。
