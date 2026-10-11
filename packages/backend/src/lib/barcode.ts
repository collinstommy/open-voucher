export function stripBarcodeSpaces(barcode: string): string {
	return barcode.replace(/\s/g, "");
}

// Spacings saved before uploads stored digits only. These are the only
// groupings present on existing vouchers.
function storedSpacedForms(digits: string): string[] {
	if (/^\d{13}$/.test(digits)) {
		return [
			`${digits.slice(0, 7)} ${digits.slice(7, 11)} ${digits.slice(11)}`,
			`${digits.slice(0, 1)} ${digits.slice(1, 7)} ${digits.slice(7, 12)} ${digits.slice(12)}`,
			`${digits.slice(0, 1)} ${digits.slice(1, 7)} ${digits.slice(7)}`,
		];
	}
	if (/^\d{12}$/.test(digits)) {
		return [`${digits.slice(0, 6)} ${digits.slice(6)}`];
	}
	return [];
}

export function barcodeLookupKeys(barcode: string): string[] {
	const digits = stripBarcodeSpaces(barcode);
	if (!digits) return [];
	return [...new Set([digits, ...storedSpacedForms(digits)])];
}

export async function firstMatchingBarcode<T>(
	barcode: string,
	find: (key: string) => Promise<T | null>,
): Promise<T | null> {
	for (const key of barcodeLookupKeys(barcode)) {
		const match = await find(key);
		if (match) return match;
	}
	return null;
}
