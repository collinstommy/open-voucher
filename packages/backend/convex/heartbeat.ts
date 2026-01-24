import { v } from "convex/values";
import dayjs from "dayjs";
import type { Id } from "./_generated/dataModel";
import { internalQuery, query } from "./_generated/server";

type HeartbeatStatus = "healthy" | "warning" | "critical";

interface HeartbeatResult {
	status: HeartbeatStatus;
	timestamp: number;
	checks: {
		ocr: {
			status: HeartbeatStatus;
			message: string;
			extractedAmount?: number;
			extractedExpiryDate?: string;
			extractedBarcode?: string;
		};
		telegram: {
			status: HeartbeatStatus;
			message: string;
			tokenConfigured: boolean;
		};
		vouchers: {
			status: HeartbeatStatus;
			message: string;
			totalAvailable: number;
			byType: Record<string, number>;
		};
	};
}

export const heartbeat = internalQuery({
	args: {},
	handler: async (ctx): Promise<HeartbeatResult> => {
		const now = Date.now();
		const checks: HeartbeatResult["checks"] = {
			ocr: {
				status: "healthy",
				message: "OCR check not run",
				extractedAmount: undefined,
				extractedExpiryDate: undefined,
				extractedBarcode: undefined,
			},
			telegram: {
				status: "healthy",
				message: "Telegram check not run",
				tokenConfigured: false,
			},
			vouchers: {
				status: "healthy",
				message: "Voucher check not run",
				totalAvailable: 0,
				byType: { "5": 0, "10": 0, "20": 0 },
			},
		};

		let overallStatus: HeartbeatStatus = "healthy";

		// Check 1: OCR configuration (just check if sample image is set)
		try {
			const sampleImageSetting = await ctx.db
				.query("settings")
				.withIndex("by_key", (q) => q.eq("key", "sample-voucher-image"))
				.first();

			if (!sampleImageSetting?.value) {
				checks.ocr = {
					status: "critical",
					message: "Sample voucher image not configured",
				};
				overallStatus = "critical";
			} else {
				const imageUrl = await ctx.storage.getUrl(
					sampleImageSetting.value as Id<"_storage">,
				);

				if (!imageUrl) {
					checks.ocr = {
						status: "critical",
						message: "Could not get URL for sample image",
					};
					overallStatus = "critical";
				} else {
					checks.ocr = {
						status: "healthy",
						message: "Sample voucher image is configured",
						extractedAmount: 0,
						extractedExpiryDate: undefined,
						extractedBarcode: undefined,
					};
				}
			}
		} catch (error) {
			checks.ocr = {
				status: "critical",
				message: `OCR check failed: ${error instanceof Error ? error.message : "Unknown error"}`,
			};
			overallStatus = "critical";
		}

		// Check 2: Telegram token
		try {
			const telegramToken = process.env.TELEGRAM_BOT_TOKEN;

			if (!telegramToken) {
				checks.telegram = {
					status: "critical",
					message: "Telegram bot token not configured",
					tokenConfigured: false,
				};
				overallStatus = "critical";
			} else {
				// Verify token by making a test API call
				const testResponse = await fetch(
					`https://api.telegram.org/bot${telegramToken}/getMe`,
				);

				if (!testResponse.ok) {
					checks.telegram = {
						status: "critical",
						message: `Telegram API returned error: ${testResponse.statusText}`,
						tokenConfigured: true,
					};
					overallStatus = "critical";
				} else {
					const botInfo = (await testResponse.json()) as {
						ok: boolean;
						result?: { username?: string };
						description?: string;
					};
					if (botInfo.ok && botInfo.result?.username) {
						checks.telegram = {
							status: "healthy",
							message: `Telegram bot "${botInfo.result.username}" is configured and responding`,
							tokenConfigured: true,
						};
					} else {
						checks.telegram = {
							status: "critical",
							message: `Telegram API error: ${botInfo.description ?? "Unknown error"}`,
							tokenConfigured: true,
						};
						overallStatus = "critical";
					}
				}
			}
		} catch (error) {
			checks.telegram = {
				status: "critical",
				message: `Telegram check failed: ${error instanceof Error ? error.message : "Unknown error"}`,
				tokenConfigured: !!process.env.TELEGRAM_BOT_TOKEN,
			};
			overallStatus = "critical";
		}

		// Check 3: Available vouchers
		try {
			const availableVouchers = await ctx.db
				.query("vouchers")
				.withIndex("by_status_type", (q) => q.eq("status", "available"))
				.collect();

			const counts: Record<string, number> = { "5": 0, "10": 0, "20": 0 };
			for (const v of availableVouchers) {
				counts[v.type] = (counts[v.type] || 0) + 1;
			}

			const totalAvailable = availableVouchers.length;

			if (totalAvailable < 20) {
				checks.vouchers = {
					status: "critical",
					message: `Only ${totalAvailable} vouchers available (minimum 20 required)`,
					totalAvailable,
					byType: counts,
				};
				overallStatus = "critical";
			} else if (totalAvailable < 50) {
				checks.vouchers = {
					status: "warning",
					message: `${totalAvailable} vouchers available (low but acceptable)`,
					totalAvailable,
					byType: counts,
				};
				if (overallStatus === "healthy") {
					overallStatus = "warning";
				}
			} else {
				checks.vouchers = {
					status: "healthy",
					message: `${totalAvailable} vouchers available (healthy stock)`,
					totalAvailable,
					byType: counts,
				};
			}
		} catch (error) {
			checks.vouchers = {
				status: "critical",
				message: `Voucher check failed: ${error instanceof Error ? error.message : "Unknown error"}`,
				totalAvailable: 0,
				byType: { "5": 0, "10": 0, "20": 0 },
			};
			overallStatus = "critical";
		}

		return {
			status: overallStatus,
			timestamp: now,
			checks,
		};
	},
});

export const getHeartbeat = query({
	args: {},
	handler: async (ctx) => {
		const now = Date.now();
		const checks: HeartbeatResult["checks"] = {
			ocr: {
				status: "healthy",
				message: "OCR check not run",
				extractedAmount: undefined,
				extractedExpiryDate: undefined,
				extractedBarcode: undefined,
			},
			telegram: {
				status: "healthy",
				message: "Telegram check not run",
				tokenConfigured: false,
			},
			vouchers: {
				status: "healthy",
				message: "Voucher check not run",
				totalAvailable: 0,
				byType: { "5": 0, "10": 0, "20": 0 },
			},
		};

		let overallStatus: HeartbeatStatus = "healthy";

		// Check 1: OCR configuration (just check if sample image is set)
		try {
			const sampleImageSetting = await ctx.db
				.query("settings")
				.withIndex("by_key", (q) => q.eq("key", "sample-voucher-image"))
				.first();

			if (!sampleImageSetting?.value) {
				checks.ocr = {
					status: "critical",
					message: "Sample voucher image not configured",
				};
				overallStatus = "critical";
			} else {
				const imageUrl = await ctx.storage.getUrl(
					sampleImageSetting.value as Id<"_storage">,
				);

				if (!imageUrl) {
					checks.ocr = {
						status: "critical",
						message: "Could not get URL for sample image",
					};
					overallStatus = "critical";
				} else {
					checks.ocr = {
						status: "healthy",
						message: "Sample voucher image is configured",
						extractedAmount: 0,
						extractedExpiryDate: undefined,
						extractedBarcode: undefined,
					};
				}
			}
		} catch (error) {
			checks.ocr = {
				status: "critical",
				message: `OCR check failed: ${error instanceof Error ? error.message : "Unknown error"}`,
			};
			overallStatus = "critical";
		}

		// Check 2: Telegram token
		try {
			const telegramToken = process.env.TELEGRAM_BOT_TOKEN;

			if (!telegramToken) {
				checks.telegram = {
					status: "critical",
					message: "Telegram bot token not configured",
					tokenConfigured: false,
				};
				overallStatus = "critical";
			} else {
				// Verify token by making a test API call
				const testResponse = await fetch(
					`https://api.telegram.org/bot${telegramToken}/getMe`,
				);

				if (!testResponse.ok) {
					checks.telegram = {
						status: "critical",
						message: `Telegram API returned error: ${testResponse.statusText}`,
						tokenConfigured: true,
					};
					overallStatus = "critical";
				} else {
					const botInfo = (await testResponse.json()) as {
						ok: boolean;
						result?: { username?: string };
						description?: string;
					};
					if (botInfo.ok && botInfo.result?.username) {
						checks.telegram = {
							status: "healthy",
							message: `Telegram bot "${botInfo.result.username}" is configured and responding`,
							tokenConfigured: true,
						};
					} else {
						checks.telegram = {
							status: "critical",
							message: `Telegram API error: ${botInfo.description ?? "Unknown error"}`,
							tokenConfigured: true,
						};
						overallStatus = "critical";
					}
				}
			}
		} catch (error) {
			checks.telegram = {
				status: "critical",
				message: `Telegram check failed: ${error instanceof Error ? error.message : "Unknown error"}`,
				tokenConfigured: !!process.env.TELEGRAM_BOT_TOKEN,
			};
			overallStatus = "critical";
		}

		// Check 3: Available vouchers
		try {
			const availableVouchers = await ctx.db
				.query("vouchers")
				.withIndex("by_status_type", (q) => q.eq("status", "available"))
				.collect();

			const counts: Record<string, number> = { "5": 0, "10": 0, "20": 0 };
			for (const v of availableVouchers) {
				counts[v.type] = (counts[v.type] || 0) + 1;
			}

			const totalAvailable = availableVouchers.length;

			if (totalAvailable < 20) {
				checks.vouchers = {
					status: "critical",
					message: `Only ${totalAvailable} vouchers available (minimum 20 required)`,
					totalAvailable,
					byType: counts,
				};
				overallStatus = "critical";
			} else if (totalAvailable < 50) {
				checks.vouchers = {
					status: "warning",
					message: `${totalAvailable} vouchers available (low but acceptable)`,
					totalAvailable,
					byType: counts,
				};
				if (overallStatus === "healthy") {
					overallStatus = "warning";
				}
			} else {
				checks.vouchers = {
					status: "healthy",
					message: `${totalAvailable} vouchers available (healthy stock)`,
					totalAvailable,
					byType: counts,
				};
			}
		} catch (error) {
			checks.vouchers = {
				status: "critical",
				message: `Voucher check failed: ${error instanceof Error ? error.message : "Unknown error"}`,
				totalAvailable: 0,
				byType: { "5": 0, "10": 0, "20": 0 },
			};
			overallStatus = "critical";
		}

		return {
			status: overallStatus,
			timestamp: now,
			checks: {
				ocr: checks.ocr,
				telegram: checks.telegram,
				vouchers: {
					status: checks.vouchers.status,
					message: checks.vouchers.message,
					totalAvailable: checks.vouchers.totalAvailable,
					byType: checks.vouchers.byType,
				},
			},
		};
	},
});
