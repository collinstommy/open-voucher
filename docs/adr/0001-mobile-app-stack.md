# 0001: Mobile app stack

- Status: accepted
- Date: 2026-08-29
- Decides: the cross-platform stack for iOS and Android apps backed by the existing Convex backend

## Context

The voucher bot runs on a Telegram bot plus a React web app (TanStack Start on Cloudflare Workers) talking to a Convex 1.42 backend. The web app authenticates against a custom RS256 JWT provider (`packages/backend/convex/auth.config.ts`, issuer `openvouchers.org`). Users are keyed by `telegramChatId`.

We want native iOS and Android apps from one codebase with three requirements: image upload, push notifications on both platforms, and Google OAuth sign-in.

## Decision

Build the apps with Expo (React Native). Capacitor 8 around the existing web app is the runner-up if the spike fails. The PWA remains a free floor for Android and add-to-home-screen iOS use.

The evaluated alternatives lost on Convex compatibility, not on quality:

| Option | Convex fit | Verdict |
| --- | --- | --- |
| Expo + React Native (SDK 57) | Official client, same `convex/react`, typegen | Chosen |
| Capacitor 8 | Same web client as today | Runner-up, see risks below |
| PWA | Same web client | Floor, not a store app |
| Flutter 3.47 | Community client only (`convex_flutter`), no typegen | Rejected |
| Kotlin Multiplatform + Compose iOS | Community client only, Kotlin rewrite | Rejected |
| Tauri v2 mobile | Same web client, no first-party remote push | Rejected |
| .NET MAUI | HTTP only, wrong ecosystem | Rejected |

## Why

The app is mostly a Convex client, and React is the only stack Convex supports first-class on mobile. The same `convex/react` package with `useQuery` subscriptions over WebSocket works in the app, and the generated `api` types from `packages/backend` carry over directly. Every other option either drops realtime or depends on a single-maintainer community client.

Secondary reasons:

- Auth stays boring. Native Google sign-in yields an ID token; we verify it and mint the same RS256 JWT the web app already issues, or add a second custom JWT provider. No Convex Auth adoption needed (it is still beta).
- The web stack is React, so hooks patterns and non-DOM logic move across. Capacitor would reuse even more, but the app is server-rendered, so a client-only build path plus App Store review risk offset that.

## Notes for when work starts

- A paid Apple Developer account ($99/year) is required before iOS push works, even in testing.
- Push and native Google sign-in require EAS development builds. Expo Go cannot run them.
- One-time native config: SHA-1 fingerprints and an OAuth client for Google sign-in on Android, an APNs key for iOS, FCM v1 credentials.
- Sending pushes is a Convex action calling the Expo push API. `packages/backend/convex/crons.ts` and `reminders.ts` already exist to hang this on.
- Google users need rows in `users`, possibly linked to an existing Telegram identity. That backend work is the same for any stack.
- Unverified in research, needs a spike: uploading a file blob to `storage.generateUploadUrl()` from React Native (the documented flow POSTs raw bytes with a content type, not multipart), and fetching a local file URI as a blob.
- Versions at evaluation time: Expo SDK 57 (`expo` 57.0.18, `react-native` 0.86.3), Capacitor 8 (`@capacitor/core` 8.5.0), Flutter 3.47.

If Capacitor ever becomes the path, the known risks are App Store guideline 4.2 ("beyond a repackaged website") and WKWebView feel on iOS. Google Play enforces no equivalent.

## Sources

- Convex React Native: https://docs.convex.dev/client/react-native
- Convex custom JWT: https://docs.convex.dev/auth/advanced/custom-auth.md
- Expo Google authentication: https://docs.expo.dev/guides/google-authentication.md
- Expo push setup: https://docs.expo.dev/push-notifications/push-notifications-setup.md
- Expo monorepos: https://docs.expo.dev/guides/monorepos.md
- EAS Update: https://docs.expo.dev/eas-update/introduction.md
- Convex file upload: https://docs.convex.dev/file-storage/upload-files.md
- Capacitor push: https://capacitorjs.com/docs/apis/push-notifications
- Capawesome Firebase authentication: https://capawesome.io/plugins/firebase/authentication/
- Apple guideline 4.2: https://developer.apple.com/app-store/review/guidelines/#minimum-functionality
- `convex_flutter`: https://pub.dev/packages/convex_flutter
- Compose Multiplatform status: https://www.jetbrains.com/lp/compose-multiplatform/
