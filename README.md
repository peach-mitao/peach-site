# Peach 官网

[官网](https://peach.video/) · [在线演示](https://demo.peach.video/) · [Peach 应用](https://github.com/peach-mitao/peach)

产品介绍、六页导览、演示动效、下载入口与版权投诉页。页面正文在 `site/index.html`，静态站部署到 Cloudflare Workers Assets。

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
