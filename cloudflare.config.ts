import { bindings, defineConfig } from "cf/config";

export default defineConfig(({ mode }) => ({
	worker: {
		name: mode === "preview" ? "peach-site-docker-preview" : "peach-landing",
		workersDev: mode === "preview",
		entrypoint: "./worker/index.ts",
		compatibilityDate: "2026-09-20",
		compatibilityFlags: ["nodejs_compat"],
		observability: {
			enabled: true,
			headSamplingRate: 1,
			issues: {enabled: true},
			logs: {enabled: true, invocationLogs: false, headSamplingRate: 1},
		},
		assets: {
			notFoundHandling: "404-page",
			// 地区规则由边缘执行，只有动态接口与专用页面进入 Worker。
			runWorkerFirst: ["/api/*", "/analytics*", "/privacy/analytics*", "/unavailable*", "/credits/ip-data"],
		},
		env: {
			ASSETS: bindings.assets(),
			SITE_EVENTS: bindings.analyticsEngineDataset({ name: "peach_site_events" }),
			EVENT_LIMIT: bindings.rateLimit({namespace:"10424",simple:{limit:120,period:60}}),
			BEHAVIOR: bindings.d1({id:"11f04f71-9abb-4073-8fec-116078742e97",name:"peach-behavior-metadata"}),
			BEHAVIOR_STREAM: bindings.pipeline({name:"80ff58a7cee6406591723c0fb136c3c6"}),
			BEHAVIOR_SQL_TOKEN: bindings.secret(),
			BEHAVIOR_SQL_ACCOUNT: bindings.text("0c8cf6b7df91a11710bc0b030666b4f0"),
			BEHAVIOR_SQL_BUCKET: bindings.text("peach-behavior-log"),
			BEHAVIOR_LAYOUTS: bindings.r2({name:"peach-behavior-layouts"}),
			BEHAVIOR_LIMIT: bindings.rateLimit({namespace:"10423",simple:{limit:60,period:60}}),
			ACCESS_TEAM: bindings.text("longmeidao"),
			CF_DASHBOARD_URL: bindings.text(process.env.PEACH_CF_DASHBOARD_URL || "https://dash.cloudflare.com/"),
			ACCESS_AUD: bindings.text("30d4a3629a0b136ff9392268614f3e0c41a37e241dadfea685e5f5a5b9f05f4a"),
			BEHAVIOR_PREVIEW: bindings.text(mode==="preview"?"1":"0"),
		},
		triggers: [],
		domains: mode === "preview" ? [] : ["peach.video"],
	},
}));
