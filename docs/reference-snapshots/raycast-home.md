# Raycast 首页样式取证

这是人工取证笔记，不是上游原文副本。取证日期为 2026-10-26，页面为 [Raycast 首页](https://www.raycast.com/)。

## 已取得的证据

用户提供的功能卡片截图与当前页面的 Linear 卡片对应。实际 DOM 的卡片为 `pFn2Lq_card`，计算尺寸约 360 × 536px，圆角 20px；背景为 138 度渐变，紫色从 `rgba(32,35,91,.7)` 过渡到 `rgba(7,9,33,.7)`，带内侧高光。功能图标、标题、右上角入口、说明和插图形成分层。

点击 Engineering 分类时，`_3Yq4tG_activeBackdrop` 的实际动画为 300ms、`ease`，以 `translate3d` 从一项移到另一项。

| 样式资源 | SHA-256 |
| --- | --- |
| [分类切换](https://www.raycast.com/_next/static/immutable/chunks/4193wtgrb190o.css) | `d1da0c359f53caf1d6595efbde971d5f191785e161e2e652eedb4e58e50d2336` |
| [功能卡片](https://www.raycast.com/_next/static/immutable/chunks/2655y81y70_90.css) | `b7fcce58e81d83d188e15f3fe61e74d6e8c607b2fe77d4a47b48b9becce8c14d` |

截图接口曾返回 `Page.captureScreenshot` 超时；当前样式、DOM、公开编译组件及动画读数均已取得。

## Peach 的实现边界

在 1025px 视口实测，卡片轨道使用原生横向滚动和 `scroll-snap-type: x mandatory`，卡片宽 360px、间距 56px；左右按钮约 58px，每次移动 416px。轨道保留相邻卡片露出，底部左侧为继续浏览入口，右侧为圆形前后按钮。

功能卡沿用 Peach 自有图标、预置资料和流程画面，使用横向轨道、分类切换、分色渐变、图标底板与右上角外链入口。创作者使用 RSS 橙色，其他功能采用对应的紫、绿和琥珀色。原站源码与本站适配边界如下。

## 源码移植

公开组件位于 [3fo2542liso-z.js](https://www.raycast.com/_next/static/immutable/chunks/3fo2542liso-z.js)，SHA-256 为 `f6f6ce2cca12a877a031149a1eb75e55c71333ff00c294e07fb692f25dca9ab5`，轮播模块 ID 为 `926753`。该组件按首张卡片宽度调用 `scrollTo`，由浏览器吸附到下一张；末端判断为 `scrollLeft + clientWidth >= scrollWidth - firstCard.clientWidth`。

`scripts/sync_raycast_features.ts` 校验上表两份 CSS 的完整摘要后，提取 `_3Yq4tG` 轨道与 `pFn2Lq` 卡片模块，原样生成 `site/assets/raycast-features.css`。DOM 沿用对应模块的容器、轨道、卡片头部、说明、分隔线与图片层级；原站卡片宽度为手机 300px、桌面 360px，断点 720px。没有以计算样式重写一套近似参数。

分类底板沿用组件的 `clientWidth + 24` 和 `offsetLeft`，CSS 过渡 300ms；卡片入场沿用 700ms 动画和 `100 + 80 × index` 毫秒延迟；分类退出沿用 300ms 的原站类。React 的状态与 TransitionGroup 通过本站既有静态页面适配，保留原位编辑节点，退出画面使用不可交互、隐藏于辅助技术的临时绘制副本。

Peach 的差异集中在 `peach-features.css`：连接实际读到的原站变量，替换品牌图像、功能图标、语义配色与预置界面；中文说明保留两行的最小高度。键盘与减少动态效果时关闭位移。原站商标、第三方服务脚本和推荐内容未进入本站。没有新增依赖。

导览采用 [1-qssuozz0_ir.js](https://www.raycast.com/_next/static/immutable/chunks/1-qssuozz0_ir.js) 中模块 `916355` 的横向 `scrollTo` 路径，该资源 SHA-256 为 `34887c3f280121484a57b221b15809ccaa5afa40ae675f51cfde8b78db35ec98`。目标位置由子项与轨道的矩形、当前 `scrollLeft` 算出，窗口变化时立即重新对齐。

轨道 CSS 来自 [0m6-h7j26kp-g.css](https://www.raycast.com/_next/static/immutable/chunks/0m6-h7j26kp-g.css)，SHA-256 为 `59b146eac5081b9c77f72a406ed9d6b256570e548dbd3ebc9787ab5d2aeffa08`。同步入口原样提取 `utU0aa_showcaseReel`、Dock 和 tooltip 模块。Peach 将五个演示改为六张完整应用截图，保留自身画框比例，在画框内为 Dock 单独留位，避免覆盖截图。首次主图直接显示，切换只等待目标图解码；横向滚动期间临时排列当前图和目标图，只在目标图对齐后恢复完整轨道，避免经过未加载画面、等待无关图片或因重排产生的滚动结束事件提前收尾。键盘或减少动态效果时立即对齐，不采用原站自动轮换。

原站 Dock 普通按钮为 54 × 54px，选中态使用 `scale(1.25) translateY(-5px)`、两侧各 6px 外边距、16px 圆角和径向高光。标题由模块 `916355` 的 Floating UI 配置定位在选中按钮上方 10px。Peach 沿用提取的选中样式，以既有 DOM 适配跟随位置；不再绘制横移底板，也不在悬停时改成其他按钮的标题。六个入口保留 54 × 54px 按钮和 24px 图标，窄屏在 Dock 内横向滚动，选中项进入可见范围；标题位于滚动裁剪区外。说明在画框下方居中，最大宽度 467px。

功能卡片的手机前后按钮保留在轨道下方，不使用置顶或吸顶定位；卡片仍采用紧凑画框，页面后续内容提供继续滚动的空间，按钮可滚出固定公告的覆盖区。

纠正记录：初版仅在两列网格上修改卡片样式；随后按测量值重建的横向布局仍存在自拟样式。用户指出后，改为提取原站完整 CSS 模块、移植公开组件的 DOM 和滚动逻辑，移除自拟的图片位移过渡。
