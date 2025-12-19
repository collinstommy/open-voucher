import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Run at 10am UTC (approximately 10am Irish time in winter, 11am in summer)
// Sends daily reminders to users who uploaded vouchers yesterday
crons.daily(
  "send upload reminders",
  { hourUTC: 10, minuteUTC: 0 },
  internal.reminders.sendDailyUploadReminders
);

// Run at 1am UTC
// Marks vouchers as expired if their date has passed
crons.daily(
  "expire old vouchers",
  { hourUTC: 1, minuteUTC: 1 },
  internal.vouchers.expireOldVouchers
);

export default crons;
