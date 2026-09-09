# 0002: Request-scoped client vs account identity

- Status: accepted
- Date: 2026-09-08
- Decides: how a linked Telegram+Google account identifies which client initiated an action, and how upload feedback is delivered

## Context

An account can hold both a Telegram identity (`users.telegramChatId`) and a Google identity (`authIdentities`). `notifyUser` used to send a Bot API message whenever `telegramChatId` was set. That is wrong once the same person uploads from Android: they already see in-app status, and a Telegram DM is noise.

Auth method cannot identify the client. A linked account has both. The JWT subject is the user id, not the surface. Concurrent use (bot in one hand, Android in the other) means we must not store "current client" on the user.

## Decision

1. **Identity** (who) stays on the user: `telegramChatId` + `authIdentities`.
2. **Client** (where this request came from) is a request-scoped argument at the entry door only: `telegram | android | ios | web`.
3. The entry point sets it without putting it on OCR:
   - The Telegram webhook is the bot. `internal.vouchers.uploadVoucher` schedules `processTelegramVoucherImage`. Daily limit is returned to the webhook, which sends the Bot API message.
   - App clients send `X-OpenVoucher-Client` on auth HTTP (`/api/google-auth`, `/api/telegram-auth`, `/api/dev-auth`). Missing or unknown values are `400 invalid_client`. That header is minted onto the session JWT as a required `client` claim. `submitUpload` calls `requireAppClient(ctx.client)` and schedules `processVoucherImage` (no Telegram send).
4. `acceptUpload` inserts an `uploads` row (`processing`) and returns `uploadId`. OCR patches that row to `succeeded` or `failed`. Android `useQuery`s `getUpload({ uploadId })`.
5. `notifyUser` sends when called, if a chat id exists. It does not take `client`. `storeVoucherFromOcr` does not notify.

Do not infer client from Google vs Telegram auth. Do not persist client on the user or on `uploads`.

## Upload voucher

Shared domain: `acceptUpload` then `processVoucherImage` → `storeVoucherFromOcr`. Telegram-only wrapper `processTelegramVoucherImage` turns the result into a Bot API message. Daily limit never creates an upload row.

Unsolicited messages (reminders, report-the-uploader) are a separate channel decision and are unchanged by this.
