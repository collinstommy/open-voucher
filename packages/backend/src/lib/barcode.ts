export function stripBarcodeSpaces(barcode: string): string {
	return barcode.replace(/\s/g, "");
}
