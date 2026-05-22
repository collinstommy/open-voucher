import type { Deployment } from "@/components/EnvironmentDropdown";

export const CONVEX_URLS: Record<Deployment, string> = {
	dev: "https://fastidious-okapi-116.convex.cloud",
	prod: "https://whimsical-kudu-895.convex.cloud",
};

// Convex HTTP actions
export const CONVEX_SITE_URLS: Record<Deployment, string> = {
	dev: "https://fastidious-okapi-116.convex.site",
	prod: "https://whimsical-kudu-895.convex.site",
};
