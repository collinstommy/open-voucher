import { defineConfig } from "vitest/config";

export default defineConfig({
	resolve: {
		alias: {
			// Ensure proper resolution of convex modules
			"convex/_generated": "./convex/_generated",
		},
	},
	test: {
		environment: "edge-runtime",
		include: ["tests/convex-test/**/*.test.ts", "convex/**/*.test.ts"],
		testTimeout: 10000,
		// Ignore unhandled errors from scheduled functions running after tests
		dangerouslyIgnoreUnhandledErrors: true,
		server: {
			deps: {
				inline: ["convex-test"],
			},
		},
	},
});
