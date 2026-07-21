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
import type * as admin_auth from "../admin/auth.js";
import type * as adminAnalytics from "../adminAnalytics.js";
import type * as adminDashboard from "../adminDashboard.js";
import type * as adminEvals from "../adminEvals.js";
import type * as adminFeedback from "../adminFeedback.js";
import type * as adminGuards from "../adminGuards.js";
import type * as adminSession from "../adminSession.js";
import type * as adminUsers from "../adminUsers.js";
import type * as adminVouchers from "../adminVouchers.js";
import type * as analytics from "../analytics.js";
import type * as auth from "../auth.js";
import type * as crons from "../crons.js";
import type * as errors from "../errors.js";
import type * as http from "../http.js";
import type * as messages from "../messages.js";
import type * as ocr from "../ocr.js";
import type * as reminders from "../reminders.js";
import type * as settings from "../settings.js";
import type * as telegram from "../telegram.js";
import type * as telegram_classifyUnknown from "../telegram/classifyUnknown.js";
import type * as users from "../users.js";
import type * as vouchers from "../vouchers.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  admin: typeof admin;
  "admin/auth": typeof admin_auth;
  adminAnalytics: typeof adminAnalytics;
  adminDashboard: typeof adminDashboard;
  adminEvals: typeof adminEvals;
  adminFeedback: typeof adminFeedback;
  adminGuards: typeof adminGuards;
  adminSession: typeof adminSession;
  adminUsers: typeof adminUsers;
  adminVouchers: typeof adminVouchers;
  analytics: typeof analytics;
  auth: typeof auth;
  crons: typeof crons;
  errors: typeof errors;
  http: typeof http;
  messages: typeof messages;
  ocr: typeof ocr;
  reminders: typeof reminders;
  settings: typeof settings;
  telegram: typeof telegram;
  "telegram/classifyUnknown": typeof telegram_classifyUnknown;
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
