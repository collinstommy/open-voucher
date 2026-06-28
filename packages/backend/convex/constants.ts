// Coin rewards for uploading vouchers (by type)
export const UPLOAD_REWARDS: Record<string, number> = {
	"5": 15, // €5 voucher = 15 coins
	"10": 10, // €10 voucher = 10 coins
	"20": 5, // €20 voucher = 5 coins
};

// Coin costs for claiming vouchers (by type)
export const CLAIM_COSTS: Record<string, number> = {
	"5": 15, // €5 voucher = 15 coins
	"10": 10, // €10 voucher = 10 coins
	"20": 5, // €20 voucher = 5 coins
};

// Signup bonus
export const SIGNUP_BONUS = 10;

// Coin limits
export const MIN_COINS = 0;

// Valid voucher types
export const VOUCHER_TYPES = ["5", "10", "20"] as const;
export type VoucherType = (typeof VOUCHER_TYPES)[number];

// Telegram Bot API broadcast limits (https://core.telegram.org/bots/faq):
// - Bulk notifications: ~30 messages/second (HTTP 429 above this)
// - Single chat: 1 message/second
// - Groups: 20 messages/minute
// Reminders go to different private chats, so the ~30/s bulk limit applies.
// Paid broadcasts can raise this to 1000/s via @BotFather (not enabled).
//
// Staggering: batches of 25 at 50ms apart ≈ 20 msg/s, with a pause between
// batches so consecutive batches never overlap (well under the 30/s cap).
export const TELEGRAM_SEND_BATCH_SIZE = 25;
export const TELEGRAM_SEND_MESSAGE_INTERVAL_MS = 50;
export const TELEGRAM_SEND_BATCH_PAUSE_MS = 250;
