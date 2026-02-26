/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as appointments from "../appointments.js";
import type * as audit_logs from "../audit_logs.js";
import type * as auth from "../auth.js";
import type * as crons from "../crons.js";
import type * as env from "../env.js";
import type * as http from "../http.js";
import type * as lib_auth from "../lib/auth.js";
import type * as lib_logger from "../lib/logger.js";
import type * as messageTemplates from "../messageTemplates.js";
import type * as messages from "../messages.js";
import type * as migrations from "../migrations.js";
import type * as patients from "../patients.js";
import type * as reminder_logic from "../reminder_logic.js";
import type * as reminder_policies from "../reminder_policies.js";
import type * as reminders from "../reminders.js";
import type * as smsConfig from "../smsConfig.js";
import type * as sms_factory from "../sms_factory.js";
import type * as sms_provider from "../sms_provider.js";
import type * as teams from "../teams.js";
import type * as users from "../users.js";
import type * as webhook_utils from "../webhook_utils.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

/**
 * A utility for referencing Convex functions in your app's API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
declare const fullApi: ApiFromModules<{
  appointments: typeof appointments;
  audit_logs: typeof audit_logs;
  auth: typeof auth;
  crons: typeof crons;
  env: typeof env;
  http: typeof http;
  "lib/auth": typeof lib_auth;
  "lib/logger": typeof lib_logger;
  messageTemplates: typeof messageTemplates;
  messages: typeof messages;
  migrations: typeof migrations;
  patients: typeof patients;
  reminder_logic: typeof reminder_logic;
  reminder_policies: typeof reminder_policies;
  reminders: typeof reminders;
  smsConfig: typeof smsConfig;
  sms_factory: typeof sms_factory;
  sms_provider: typeof sms_provider;
  teams: typeof teams;
  users: typeof users;
  webhook_utils: typeof webhook_utils;
}>;
declare const fullApiWithMounts: typeof fullApi;

export declare const api: FilterApi<
  typeof fullApiWithMounts,
  FunctionReference<any, "public">
>;
export declare const internal: FilterApi<
  typeof fullApiWithMounts,
  FunctionReference<any, "internal">
>;

export declare const components: {
  migrations: {
    lib: {
      cancel: FunctionReference<
        "mutation",
        "internal",
        { name: string },
        {
          batchSize?: number;
          cursor?: string | null;
          error?: string;
          isDone: boolean;
          latestEnd?: number;
          latestStart: number;
          name: string;
          next?: Array<string>;
          processed: number;
          state: "inProgress" | "success" | "failed" | "canceled" | "unknown";
        }
      >;
      cancelAll: FunctionReference<
        "mutation",
        "internal",
        { sinceTs?: number },
        Array<{
          batchSize?: number;
          cursor?: string | null;
          error?: string;
          isDone: boolean;
          latestEnd?: number;
          latestStart: number;
          name: string;
          next?: Array<string>;
          processed: number;
          state: "inProgress" | "success" | "failed" | "canceled" | "unknown";
        }>
      >;
      clearAll: FunctionReference<
        "mutation",
        "internal",
        { before?: number },
        null
      >;
      getStatus: FunctionReference<
        "query",
        "internal",
        { limit?: number; names?: Array<string> },
        Array<{
          batchSize?: number;
          cursor?: string | null;
          error?: string;
          isDone: boolean;
          latestEnd?: number;
          latestStart: number;
          name: string;
          next?: Array<string>;
          processed: number;
          state: "inProgress" | "success" | "failed" | "canceled" | "unknown";
        }>
      >;
      migrate: FunctionReference<
        "mutation",
        "internal",
        {
          batchSize?: number;
          cursor?: string | null;
          dryRun: boolean;
          fnHandle: string;
          name: string;
          next?: Array<{ fnHandle: string; name: string }>;
        },
        {
          batchSize?: number;
          cursor?: string | null;
          error?: string;
          isDone: boolean;
          latestEnd?: number;
          latestStart: number;
          name: string;
          next?: Array<string>;
          processed: number;
          state: "inProgress" | "success" | "failed" | "canceled" | "unknown";
        }
      >;
    };
  };
};
