import { v } from "convex/values";
import dayjs from "dayjs";

type VoucherOcrFailureReason =
	| "EXPIRED"
	| "COULD_NOT_READ_AMOUNT"
	| "COULD_NOT_READ_BARCODE"
	| "COULD_NOT_READ_EXPIRY_DATE"
	| "COULD_NOT_READ_VALID_FROM"
	| "INVALID_TYPE"
	| "DUPLICATE_BARCODE"
	| "UNKNOWN_ERROR";

export class VoucherValidationError extends Error {
	constructor(
		public reason: VoucherOcrFailureReason,
		message?: string,
		public expiryDate?: number,
	) {
		super(message || reason);
		this.name = "VoucherValidationError";
	}
}

export interface VoucherData {
	type: "5" | "10" | "20";
	expiryDate: number;
	validFrom: number;
	barcodeNumber: string;
}

export function validateVoucherData(
	extracted: any,
	existingVoucher: any | null,
): VoucherData {
	// Validate type
	let voucherType: "5" | "10" | "20";
	if (extracted.type === "10" || extracted.type === 10) {
		voucherType = "10";
	} else if (extracted.type === "20" || extracted.type === 20) {
		voucherType = "20";
	} else if (extracted.type === "5" || extracted.type === 5) {
		voucherType = "5";
	} else {
		throw new VoucherValidationError(
			"INVALID_TYPE",
			"Invalid voucher type detected",
		);
	}

	// Parse validFrom date
	let validFrom: number;
	if (extracted.validFrom) {
		const dayjsValidFrom = dayjs(extracted.validFrom);
		if (
			dayjsValidFrom.isValid() &&
			dayjsValidFrom.valueOf() > Date.now() - 365 * 24 * 60 * 60 * 1000
		) {
			validFrom = dayjsValidFrom.startOf("day").valueOf();
		} else {
			throw new VoucherValidationError(
				"COULD_NOT_READ_VALID_FROM",
				"Invalid validFrom date",
			);
		}
	} else {
		throw new VoucherValidationError(
			"COULD_NOT_READ_VALID_FROM",
			"Could not determine valid from date",
		);
	}

	// Parse expiry date
	let expiryDate: number;
	if (extracted.expiryDate) {
		const dayjsDate = dayjs(extracted.expiryDate);
		const now = dayjs();
		if (
			dayjsDate.isValid() &&
			dayjsDate.valueOf() > Date.now() - 365 * 24 * 60 * 60 * 1000
		) {
			expiryDate = dayjsDate.endOf("day").valueOf();

			if (dayjsDate.isBefore(now, "day")) {
				throw new VoucherValidationError(
					"EXPIRED",
					"Voucher has already expired",
					expiryDate,
				);
			}

			if (dayjsDate.isSame(now, "day") && now.hour() >= 21) {
				throw new VoucherValidationError(
					"EXPIRED",
					"Voucher expires today and it's too late to use (after 9 PM)",
					expiryDate,
				);
			}
		} else {
			throw new VoucherValidationError(
				"EXPIRED",
				"Invalid or past expiry date",
			);
		}
	} else {
		throw new VoucherValidationError(
			"COULD_NOT_READ_EXPIRY_DATE",
			"Could not determine expiry date",
		);
	}

	const barcodeNumber = extracted.barcode;
	if (!barcodeNumber) {
		throw new VoucherValidationError(
			"COULD_NOT_READ_BARCODE",
			"Could not read barcode from voucher",
		);
	}

	if (existingVoucher) {
		throw new VoucherValidationError(
			"DUPLICATE_BARCODE",
			"This voucher has already been uploaded",
		);
	}

	return { type: voucherType, expiryDate, validFrom, barcodeNumber };
}

export function getErrorMessageForReason(
	reason: VoucherOcrFailureReason,
): string {
	const messages: Record<VoucherOcrFailureReason, string> = {
		EXPIRED: "This voucher has expired.",
		COULD_NOT_READ_AMOUNT:
			"We couldn't determine the voucher amount. Please make sure it's clear in the photo.",
		COULD_NOT_READ_BARCODE:
			"We couldn't read the barcode. Please ensure it's fully visible and clear.",
		COULD_NOT_READ_EXPIRY_DATE:
			"We couldn't determine the expiry date. Please make sure it's clear in the photo.",
		COULD_NOT_READ_VALID_FROM:
			"We couldn't determine the valid from date. Please make sure the validity dates are clear in the photo.",
		INVALID_TYPE:
			"This voucher does not appear to be a valid €5, €10, or €20 Dunnes voucher. We only accept these specific general spend vouchers.",
		DUPLICATE_BARCODE:
			"This voucher has already been uploaded by someone. Each voucher can only be uploaded once.",
		UNKNOWN_ERROR:
			"We encountered an unknown error while processing your voucher. Please try again or contact support.",
	};
	return messages[reason];
}
