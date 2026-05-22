import {
	validate,
	parse,
	isSignatureInvalidError,
	isSignatureMissingError,
	isExpiredError,
	isAuthDateInvalidError,
} from "@telegram-apps/init-data-node/web";

interface TelegramUser {
	id: number;
	first_name?: string;
	last_name?: string;
	username?: string;
	language_code?: string;
	is_premium?: boolean;
}

interface VerifyResult {
	success: true;
	user: TelegramUser;
}

interface VerifyError {
	success: false;
	error: string;
	status: number;
}

export async function verifyTelegramInitData(
	initData: string,
	botToken: string,
): Promise<VerifyResult | VerifyError> {
	try {
		await validate(initData, botToken, {
			expiresIn: 3600,
		});

		// Parse the validated init data to extract the user
		const parsed = parse(initData);
		const user = parsed.user;

		if (!user) {
			return { success: false, error: "Missing user in initData", status: 400 };
		}

		return {
			success: true,
			user: {
				id: user.id,
				first_name: user.first_name,
				last_name: user.last_name,
				username: user.username,
				language_code: user.language_code,
				is_premium: user.is_premium,
			},
		};
	} catch (err) {
		if (isSignatureInvalidError(err)) {
			return { success: false, error: "Invalid initData hash", status: 403 };
		}
		if (isSignatureMissingError(err)) {
			return { success: false, error: "Missing initData hash", status: 400 };
		}
		if (isExpiredError(err) || isAuthDateInvalidError(err)) {
			return { success: false, error: "initData expired", status: 400 };
		}
		const message = err instanceof Error ? err.message : "Validation failed";
		return { success: false, error: message, status: 400 };
	}
}
