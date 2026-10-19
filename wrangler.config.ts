import { defineWranglerConfig } from "wrangler/experimental-config";

export default defineWranglerConfig({
	assetsDirectory: "./site",
	dev: {ip: "127.0.0.1", port: 8794},
});
