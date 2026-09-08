# 0002: Request-scoped client vs account identity

- Status: accepted
- Date: 2026-09-08
- Decides: how a linked Telegram+Google account identifies which client initiated an action, and how upload feedback is delivered

## Context

An account can hold both a Telegram identity (`users.telegramChatId`) and a Google identity (`authIdentities`). `notifyUser` used to send a Bot API message whenever `telegramChatId` was set. That is wrong once the same person uploads from Android: they already see in-app status, and a Telegram DM is noise.

Auth method cannot identify the client. A linked account has both. The JWT subject is the user id, not the surface. Concurrent use (bot in one hand, Android in the other) means we must not store "current client" on the user.

## Decision

1. **Identity** (who) stays on the user: `telegramChatId` + `authIdentities`.
2. **Client** (where this request came from) is a request-scoped argument: `telegram | android | ios | web`.
3. The entry point sets it without putting it on every mutation:
   - The Telegram webhook hardcodes `"telegram"`.
   - App clients send `X-OpenVoucher-Client` on auth HTTP (`/api/google-auth`, `/api/telegram-auth`, `/api/dev-auth`). Missing or unknown values are `400 invalid_client`. That header is minted onto the session JWT as a required `client` claim. `userMutation` reads `identity.client` onto `ctx`. Queries/mutations cannot see arbitrary HTTP headers (Convex does not plan to expose them).
4. Thread `client` through async work (the OCR scheduler) so success, validation failure, and system error still know the origin.
5. Telegram HTML is built only when `client === "telegram"`. `notifyUser` still refuses to send unless that client and a chatId exist. App clients observe Convex queries for the same outcome.

Do not infer client from Google vs Telegram auth. Do not persist client on the user.

## Upload voucher

`internal.vouchers.uploadVoucher` takes `client` and passes it to `processVoucherImage` → `storeVoucherFromOcr`. Daily-limit, success, and failure notify Telegram from those mutations when the client is telegram (scheduled send stays in the same transaction as the write). Android/web/iOS get no Telegram send; they call `submitUpload` (`ctx.client` from the JWT) and watch `getMyAvailableUploads` plus `getMyFailedUploads`.

Unsolicited messages (reminders, report-the-uploader) are a separate channel decision and are unchanged by this.
