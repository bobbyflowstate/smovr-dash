import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.cron(
  "reminders",
  "* * * * *", // Every minute (reliability > cost; reduces missed windows)
  internal.reminders.checkAndSendReminders
);

crons.cron(
  "alerts_monitor",
  "* * * * *", // Every minute (cheap rolling-window checks + fast detection)
  internal.alerts.monitorAndAlert
);

export default crons;

