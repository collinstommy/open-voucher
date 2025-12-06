// Coin rewards for uploading vouchers (by type)
export const UPLOAD_REWARDS: Record<string, number> = {
  "5": 15,   // €5 voucher = 15 coins
  "10": 10,  // €10 voucher = 10 coins
  "20": 5,   // €20 voucher = 5 coins
};

// Coin costs for claiming vouchers (by type)
export const CLAIM_COSTS: Record<string, number> = {
  "5": 15,   // €5 voucher = 15 coins
  "10": 10,  // €10 voucher = 10 coins
  "20": 5,   // €20 voucher = 5 coins
};

// Signup bonus
export const SIGNUP_BONUS = 20;

// Coin limits
export const MAX_COINS = 100;
export const MIN_COINS = 0;

// Valid voucher types
export const VOUCHER_TYPES = ["5", "10", "20"] as const;
export type VoucherType = (typeof VOUCHER_TYPES)[number];
