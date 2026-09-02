// Pure link-code primitives: alphabet, constants, generation. No db access —
// the code lifecycle lives in src/lib/linkCodes.ts, and codes are generated in
// the calling action (crypto.getRandomValues is not available in the
// deterministic mutation runtime).

// 8 chars from 30 unambiguous symbols (no 0/1/I/L/O/U): ~2^39 space.
const CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTVWXYZ";

export const LINK_CODE_LENGTH = 8;
export const LINK_CODE_TTL_MS = 10 * 60 * 1000;
export const LINK_CODE_MAX_ATTEMPTS = 5;

/**
 * Generate a random link code. Uses crypto.getRandomValues, so it must be
 * called from an action (or test), never from inside a mutation.
 */
export function generateLinkCode(): string {
	const bytes = new Uint8Array(LINK_CODE_LENGTH);
	crypto.getRandomValues(bytes);
	let code = "";
	for (const byte of bytes) {
		code += CODE_ALPHABET[byte % CODE_ALPHABET.length];
	}
	return code;
}

/** Normalize user input: trim, uppercase, drop characters outside the alphabet. */
export function normalizeLinkCode(input: string): string {
	return input
		.trim()
		.toUpperCase()
		.replace(/[^2-9A-HJKMNP-TV-Z]/g, "");
}
