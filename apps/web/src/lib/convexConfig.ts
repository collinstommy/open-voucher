import type { Deployment } from "@/components/EnvironmentDropdown";

const cloudConvexUrls: Record<Deployment, string> = {
	dev: "https://fastidious-okapi-116.convex.cloud",
	prod: "https://whimsical-kudu-895.convex.cloud",
};

const cloudSiteUrls: Record<Deployment, string> = {
	dev: "https://fastidious-okapi-116.convex.site",
	prod: "https://whimsical-kudu-895.convex.site",
};

const envConvexUrl = import.meta.env.VITE_CONVEX_URL as string | undefined;
const envSiteUrl = import.meta.env.VITE_CONVEX_SITE_URL as string | undefined;

export const CONVEX_URLS: Record<Deployment, string> = {
	dev: envConvexUrl || cloudConvexUrls.dev,
	prod: cloudConvexUrls.prod,
};

export const CONVEX_SITE_URLS: Record<Deployment, string> = {
	dev: envSiteUrl || cloudSiteUrls.dev,
	prod: cloudSiteUrls.prod,
};
