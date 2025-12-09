/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as constants from "../constants.js";
import type * as healthCheck from "../healthCheck.js";
import type * as http from "../http.js";
import type * as ocr from "../ocr.js";
import type * as telegram from "../telegram.js";
import type * as users from "../users.js";
import type * as vouchers from "../vouchers.js";

import type {
	ApiFromModules,
	FilterApi,
	FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
	constants: typeof constants;
	healthCheck: typeof healthCheck;
	http: typeof http;
	ocr: typeof ocr;
	telegram: typeof telegram;
	users: typeof users;
	vouchers: typeof vouchers;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
	typeof fullApi,
	FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
	typeof fullApi,
	FunctionReference<any, "internal">
>;

export declare const components: {};
