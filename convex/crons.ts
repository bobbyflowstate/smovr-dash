import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.cron(
  "reminders",
  "* * * * *", // Every minute (reliability > cost; reduces missed windows)
  internal.reminders.checkAndSendReminders
);

crons.cron(
  "birthday-reminders",
  "0 14 * * *", // Daily at 14:00 UTC (~9 AM ET / 7 AM PT)
  internal.proReminders.checkAndSendBirthdayReminders
);

crons.cron(
  "return-date-reminders",
  "0 15 * * *", // Daily at 15:00 UTC (~10 AM ET / 8 AM PT)
  internal.proReminders.checkAndSendReturnDateReminders
);

crons.cron(
  "referral-follow-ups",
  "*/5 * * * *", // Every 5 minutes for timely delayed follow-ups
  internal.proReminders.checkAndSendReferralFollowUps
);

export default crons;

