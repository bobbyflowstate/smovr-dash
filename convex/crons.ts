import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.cron(
  "reminders",
  "* * * * *", // Every minute
  internal.reminders.checkAndSendReminders
);

export default crons;

