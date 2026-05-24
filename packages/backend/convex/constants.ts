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

export const USER_SESSION_DURATION_MS = 365 * 24 * 60 * 60 * 1000; // 1 year

export const USER_SESSION_CLEANUP_BATCH_SIZE = 100;

export const MINI_APP_URL = "https://openvouchers.org/app";

export function miniAppPath(
	path = "",
	searchParams?: Record<string, string>,
): string {
	const baseUrl = process.env.MINI_APP_URL ?? MINI_APP_URL;
	const base = path
		? `${baseUrl}${path.startsWith("/") ? path : `/${path}`}`
		: baseUrl;
	const url = new URL(base);
	if (searchParams) {
		for (const [key, value] of Object.entries(searchParams)) {
			url.searchParams.set(key, value);
		}
	}
	return url.toString();
}
