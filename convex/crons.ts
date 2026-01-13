import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.cron(
  "reminders",
  "* * * * *", // Every minute (reliability > cost; reduces missed windows)
  internal.reminders.checkAndSendReminders
);

export default crons;

