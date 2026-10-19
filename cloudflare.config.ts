import { defineConfig } from "cf/config";

export default defineConfig({
	worker: {
		name: "peach-landing",
		compatibilityDate: "2026-09-20",
		observability: {
			enabled: true,
			headSamplingRate: 1,
		},
		assets: {
			notFoundHandling: "404-page",
		},
		domains: [
			"peach.video",
		],
	},
});
