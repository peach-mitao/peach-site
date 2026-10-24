import { bindings, defineConfig, triggers } from "cf/config";

export default defineConfig(({ mode }) => ({
	worker: {
		name: mode === "preview" ? "peach-site-docker-preview" : "peach-landing",
		workersDev: mode === "preview" ? true : undefined,
		entrypoint: "./worker/index.ts",
		compatibilityDate: "2026-09-20",
		compatibilityFlags: ["nodejs_compat"],
		observability: {
			enabled: true,
			headSamplingRate: 1,
			issues: {enabled: true},
		},
		assets: {
			notFoundHandling: "404-page",
			// 所有请求先按连接 IP 的地区判断服务范围，再读取静态资源或处理接口。
			runWorkerFirst: true,
		},
		env: {
			ASSETS: bindings.assets(),
			REGION_DATA: bindings.r2({name: "peach-region-data"}),
			SITE_EVENTS: bindings.analyticsEngineDataset({ name: "peach_site_events" }),
			EVENT_LIMIT: bindings.rateLimit({namespace:"10424",simple:{limit:120,period:60}}),
			BEHAVIOR: bindings.d1({id:"d81eb012-a8c9-4893-999c-33c31467ac75",name:"peach-behavior"}),
			BEHAVIOR_LAYOUTS: bindings.r2({name:"peach-behavior-layouts"}),
			BEHAVIOR_LIMIT: bindings.rateLimit({namespace:"10423",simple:{limit:60,period:60}}),
			ACCESS_TEAM: bindings.text("longmeidao"),
			CF_DASHBOARD_URL: bindings.text(process.env.PEACH_CF_DASHBOARD_URL || "https://dash.cloudflare.com/"),
			ACCESS_AUD: bindings.text("30d4a3629a0b136ff9392268614f3e0c41a37e241dadfea685e5f5a5b9f05f4a"),
			BEHAVIOR_PREVIEW: bindings.text(mode==="preview"?"1":"0"),
		},
		triggers: mode === "preview" ? [] : [triggers.scheduled({schedule:"17 3 * * *"}), triggers.scheduled({schedule:"30 6 * * *"})],
		domains: mode === "preview" ? [] : ["peach.video"],
	},
}));
