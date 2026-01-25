/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as admin from "../admin.js";
import type * as constants from "../constants.js";
import type * as crons from "../crons.js";
import type * as dashboard from "../dashboard.js";
import type * as healthCheck from "../healthCheck.js";
import type * as heartbeat from "../heartbeat.js";
import type * as http from "../http.js";
import type * as ocr_extract from "../ocr/extract.js";
import type * as ocr_process from "../ocr/process.js";
import type * as ocr_store from "../ocr/store.js";
import type * as reminders from "../reminders.js";
import type * as settings from "../settings.js";
import type * as telegram from "../telegram.js";
import type * as users from "../users.js";
import type * as vouchers from "../vouchers.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  admin: typeof admin;
  constants: typeof constants;
  crons: typeof crons;
  dashboard: typeof dashboard;
  healthCheck: typeof healthCheck;
  heartbeat: typeof heartbeat;
  http: typeof http;
  "ocr/extract": typeof ocr_extract;
  "ocr/process": typeof ocr_process;
  "ocr/store": typeof ocr_store;
  reminders: typeof reminders;
  settings: typeof settings;
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
