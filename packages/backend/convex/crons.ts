import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.daily(
	"send upload reminders",
	{ hourUTC: 10, minuteUTC: 0 },
	internal.reminders.sendDailyUploadReminders,
);

crons.daily(
	"expire old vouchers",
	{ hourUTC: 1, minuteUTC: 1 },
	internal.vouchers.expireOldVouchers,
);

crons.daily(
	"cleanup admin sessions",
	{ hourUTC: 2, minuteUTC: 0 },
	internal.admin.cleanupExpiredSessions,
);

export default crons;
