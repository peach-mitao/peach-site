import { defineConfig } from "cf/config";

export default defineConfig(({ mode }) => ({
	worker: {
		name: mode === "preview" ? "peach-site-docker-preview" : "peach-landing",
		workersDev: mode === "preview" ? true : undefined,
		compatibilityDate: "2026-09-20",
		observability: {
			enabled: true,
			headSamplingRate: 1,
		},
		assets: {
			notFoundHandling: "404-page",
		},
		domains: mode === "preview" ? [] : ["peach.video"],
	},
}));
