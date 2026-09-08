import dayjs from "dayjs";

export type UploadFailureReason =
	| "EXPIRED"
	| "TOO_LATE_TODAY"
	| "COULD_NOT_READ_AMOUNT"
	| "COULD_NOT_READ_BARCODE"
	| "COULD_NOT_READ_EXPIRY_DATE"
	| "INVALID_TYPE"
	| "DUPLICATE_BARCODE"
	| "SYSTEM_ERROR"
	| "UNKNOWN_ERROR";

function formatExpiry(expiryDate?: number | string): string {
	if (expiryDate === undefined) return "unknown";
	const parsed =
		typeof expiryDate === "number" ? dayjs(expiryDate) : dayjs(expiryDate);
	return parsed.isValid() ? parsed.format("DD-MM-YYYY") : "unknown";
}

export function uploadFailureBody(
	reason: string,
	expiryDate?: number | string,
): string {
	switch (reason) {
		case "COULD_NOT_READ_AMOUNT":
			return "We couldn't determine the voucher amount (e.g., €5, €10, €20). Please make sure the value is clear in the photo.";
		case "COULD_NOT_READ_EXPIRY_DATE":
			return "We couldn't determine the expiry date. Please make sure it's clear in the photo.";
		case "COULD_NOT_READ_BARCODE":
			return "We couldn't read the barcode. Please ensure it's fully visible and clear.";
		case "EXPIRED":
			return `This voucher expired on ${formatExpiry(expiryDate)}.`;
		case "TOO_LATE_TODAY": {
			const day = expiryDate === undefined ? "today" : formatExpiry(expiryDate);
			return `This voucher expires ${day}, but it's after 9 PM. Vouchers expiring today can only be uploaded before 9 PM.`;
		}
		case "INVALID_TYPE":
			return "This voucher does not appear to be a valid €5, €10, or €20 Dunnes voucher. We only accept these specific general spend vouchers.";
		case "DUPLICATE_BARCODE":
			return "This voucher has already been uploaded by someone. Each voucher can only be uploaded once.";
		default:
			return "We encountered an error while processing your voucher. Please try again.";
	}
}
