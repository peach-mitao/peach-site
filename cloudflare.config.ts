import { bindings, defineConfig } from "cf/config";

export default defineConfig(({ mode }) => ({
	worker: {
		name: mode === "preview" ? "peach-site-docker-preview" : "peach-landing",
		workersDev: mode === "preview" ? true : undefined,
		entrypoint: "./worker/index.ts",
		compatibilityDate: "2026-09-20",
		observability: {
			enabled: true,
			headSamplingRate: 1,
		},
		assets: {
			notFoundHandling: "404-page",
			// 只有埋点进入 Worker；页面、资源与未匹配的路径仍由静态资源直接返回，不计 Worker 调用。
			runWorkerFirst: ["/api/event"],
		},
		env: {
			ASSETS: bindings.assets(),
			SITE_EVENTS: bindings.analyticsEngineDataset({ name: "peach_site_events" }),
		},
		domains: mode === "preview" ? [] : ["peach.video"],
	},
}));
