import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.cron(
  "reminders",
  "*/15 * * * *", // Every 15 minutes (reduced frequency to save costs)
  internal.reminders.checkAndSendReminders
);

export default crons;

