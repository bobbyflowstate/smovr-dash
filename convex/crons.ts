import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.cron(
  "reminders",
  "0 * * * *", // Every hour at minute 0
  internal.reminders.checkAndSendReminders
);

export default crons;

