import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
	server: {
		proxy: {
			// Live Convex CORS on fastidious-okapi-116 still omits
			// X-OpenVoucher-Client (android source already allows it). Same-origin
			// proxy so localhost testers can mint a web JWT without a backend deploy.
			"/convex-site": {
				target: "https://fastidious-okapi-116.convex.site",
				changeOrigin: true,
				rewrite: (path) => path.replace(/^\/convex-site/, ""),
			},
		},
	},
	plugins: [
		cloudflare({ viteEnvironment: { name: "ssr" } }),
		tsconfigPaths(),
		tailwindcss(),
		tanstackStart(),
		viteReact(),
	],
});
