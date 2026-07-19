import { readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

/**
 * Module loader for convex-test compatible with Bun.
 * Scans the convex directory and returns a record matching Vite's import.meta.glob output.
 */
function scanConvexModules(dir: string, root: string): Record<string, () => Promise<unknown>> {
	const modules: Record<string, () => Promise<unknown>> = {};

	for (const entry of readdirSync(dir)) {
		const fullPath = join(dir, entry);
		const stat = statSync(fullPath);

		if (stat.isDirectory()) {
			Object.assign(modules, scanConvexModules(fullPath, root));
			continue;
		}

		if (!/\.(ts|js|tsx|jsx)$/.test(entry)) {
			continue;
		}

		const relativePath = relative(root, fullPath);
		modules[relativePath] = () => import(fullPath);
	}

	return modules;
}

export const modules = scanConvexModules(
	new URL("../convex", import.meta.url).pathname,
	new URL("..", import.meta.url).pathname,
);
