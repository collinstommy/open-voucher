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
3. The entry point sets it. The Telegram webhook hardcodes `"telegram"`. App mutations (`submitUpload`) accept only `android | ios | web`, so a client cannot spoof the bot notification channel.
4. Thread `client` through async work (the OCR scheduler) so success, validation failure, and system error still know the origin.
5. `notifyUser` is the delivery gate: Telegram messages only when `client === "telegram"` and a chatId exists. App clients observe Convex queries for the same outcome.

Do not infer client from Google vs Telegram auth. Do not persist client on the user.

## Upload voucher

`internal.vouchers.uploadVoucher` takes `client` and passes it to `processVoucherImage` → `storeVoucherFromOcr`. Daily-limit, success, and failure all call `notifyUser(..., client)`. Android/web/iOS get no Telegram send; they call `submitUpload` and watch `getMyAvailableUploads` plus `getMyFailedUploads`.

Unsolicited messages (reminders, report-the-uploader) are a separate channel decision and are unchanged by this.
