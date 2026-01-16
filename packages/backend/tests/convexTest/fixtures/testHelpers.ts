/**
 * Test helpers and fixtures for convex-test
 */

import type { Id } from "../../../convex/_generated/dataModel";

// ============================================================================
// Mock Response Helpers
// ============================================================================

export interface MockGeminiParams {
	type: number;
	validFromDay?: number | null;
	validFromMonth?: number | null;
	expiryDate?: string | null;
	barcode?: string | null;
}

export function mockGeminiResponse(params: MockGeminiParams) {
	const { type, validFromDay = null, validFromMonth = null, expiryDate = null, barcode = null } = params;
	return {
		candidates: [
			{
				content: {
					parts: [
						{
							text: JSON.stringify({
								type,
								validFromDay,
								validFromMonth,
								expiryDate,
								barcode,
							}),
						},
					],
				},
			},
		],
	};
}

export function mockTelegramResponse() {
	return { ok: true, result: { message_id: 123 } };
}

// ============================================================================
// Telegram Message Creators
// ============================================================================

export interface CreateTelegramMessageParams {
	text: string;
	chatId?: string;
	username?: string;
}

export function createTelegramMessage(params: CreateTelegramMessageParams): any;
export function createTelegramMessage(text: string, chatId?: string, username?: string): any;
export function createTelegramMessage(
	textOrParams: string | CreateTelegramMessageParams,
	chatIdOrUndefined?: string,
	usernameOrUndefined?: string,
): any {
	let text: string;
	let chatId: string;
	let username: string;

	if (typeof textOrParams === "object") {
		text = textOrParams.text;
		chatId = textOrParams.chatId ?? "123456";
		username = textOrParams.username ?? "testuser";
	} else {
		text = textOrParams;
		chatId = chatIdOrUndefined ?? "123456";
		username = usernameOrUndefined ?? "testuser";
	}

	// Parse chatId as number if it's numeric, otherwise use it as-is
	const numericChatId = isNaN(Number(chatId)) ? chatId : Number(chatId);
	return {
		message_id: Math.floor(Math.random() * 100000),
		chat: { id: numericChatId },
		from: { id: numericChatId, username, first_name: "Test" },
		text,
		date: Math.floor(Date.now() / 1000),
	};
}

export interface CreateTelegramPhotoMessageParams {
	chatId?: string;
}

export function createTelegramPhotoMessage(params?: CreateTelegramPhotoMessageParams): any {
	const chatId = params?.chatId ?? "123456";
	const numericChatId = isNaN(Number(chatId)) ? chatId : Number(chatId);
	return {
		message_id: Math.floor(Math.random() * 100000),
		chat: { id: numericChatId },
		from: { id: numericChatId, username: "testuser", first_name: "Test" },
		photo: [
			{ file_id: "small_photo_id", width: 100, height: 100 },
			{ file_id: "large_photo_id", width: 800, height: 600 },
		],
		date: Math.floor(Date.now() / 1000),
	};
}

export interface CreateTelegramCallbackParams {
	data: string;
	chatId?: string;
}

export function createTelegramCallback(params: CreateTelegramCallbackParams): any;
export function createTelegramCallback(data: string, chatId?: string): any;
export function createTelegramCallback(
	dataOrParams: string | CreateTelegramCallbackParams,
	chatIdOrUndefined?: string,
): any {
	let data: string;
	let chatId: string;

	if (typeof dataOrParams === "object") {
		data = dataOrParams.data;
		chatId = dataOrParams.chatId ?? "123456";
	} else {
		data = dataOrParams;
		chatId = chatIdOrUndefined ?? "123456";
	}

	const numericChatId = isNaN(Number(chatId)) ? chatId : Number(chatId);
	return {
		id: "callback_id_" + Math.floor(Math.random() * 100000),
		data,
		message: {
			message_id: Math.floor(Math.random() * 100000),
			chat: { id: numericChatId },
		},
		from: { id: numericChatId, username: "testuser", first_name: "Test" },
	};
}

// ============================================================================
// Database Fixture Helpers
// ============================================================================

export interface CreateUserParams {
	telegramChatId: string | number;
	coins?: number;
	isBanned?: boolean;
	createdAt?: number;
	lastActiveAt?: number;
}

export async function createUser(
	t: any,
	params: CreateUserParams,
): Promise<Id<"users">> {
	const chatId = typeof params.telegramChatId === "string" ? params.telegramChatId : String(params.telegramChatId);
	return await t.run(async (ctx: any) => {
		return await ctx.db.insert("users", {
			telegramChatId: chatId,
			coins: params.coins ?? 0,
			isBanned: params.isBanned ?? false,
			createdAt: params.createdAt ?? Date.now(),
			lastActiveAt: params.lastActiveAt ?? Date.now(),
		});
	});
}

export interface CreateVoucherParams {
	type: string;
	uploaderId: Id<"users">;
	status?: "available" | "claimed" | "processing" | "expired";
	imageStorageId?: Id<"_storage">;
	expiryDate?: number;
	validFrom?: number;
	barcodeNumber?: string;
	claimedAt?: number;
	claimerId?: Id<"users">;
	createdAt?: number;
}

export async function createVoucher(
	t: any,
	params: CreateVoucherParams,
): Promise<Id<"vouchers">> {
	return await t.run(async (ctx: any) => {
		return await ctx.db.insert("vouchers", {
			type: params.type,
			status: params.status ?? "available",
			imageStorageId: params.imageStorageId ?? (await ctx.storage.store(new Blob(["test"]))),
			uploaderId: params.uploaderId,
			expiryDate: params.expiryDate ?? (Date.now() + 7 * 24 * 60 * 60 * 1000),
			validFrom: params.validFrom ?? (Date.now() - 24 * 60 * 60 * 1000),
			barcodeNumber: params.barcodeNumber,
			claimedAt: params.claimedAt,
			claimerId: params.claimerId,
			createdAt: params.createdAt ?? Date.now(),
		});
	});
}

// ============================================================================
// OCR Scenarios (for reference in tests)
// ============================================================================

export type OCRScenario =
	| "valid_10"
	| "valid_5"
	| "valid_20"
	| "expired"
	| "invalid_type"
	| "missing_valid_from"
	| "invalid_valid_from"
	| "missing_expiry"
	| "missing_barcode"
	| "too_late_today"
	| "gemini_api_error";
