# Moneboard

An **unofficial, read-only earnings dashboard** for [Monetag](https://www.monetag.com/) publishers. Built with AI.

Moneboard lets you keep an eye on your Monetag publisher statistics on the go. Your API key is only ever used to **read your own stats** — nothing is sent anywhere except to Monetag's public API.

> ⚠️ **Unofficial.** Moneboard is not affiliated with, endorsed by, or sponsored by Monetag. It simply talks to Monetag's public API with your own API key.

## Features

- **Home** — current balance with odometer animation, the **Hold / Approved** split (Monetag holds the last 4 days of earnings), lifetime earnings & withdrawals, plus a Today vs. Yesterday typographic hero.
- **Graph** — a trend chart that **defaults to the last 30 days**, with a Telegram-style scroller below showing the **entire cached history**: **drag to scroll** through it, **pinch to zoom**, or pull the scroller's edges to squeeze the visible range.
- **Daily** — full daily breakdown table of your cached stats, paginated **14 rows per page** (no date filters — everything is shown).
- **Home-screen widget** — a transparent Android widget showing **Today**, **Yesterday** and the **Total Balance** with a refresh button; it stays current in the background and refreshes from the last data the app fetched.
- **Settings** — paste your Monetag API key (stored on-device, not bundled), configure withdrawals, and switch light/dark theme.
- **Onboarding** — on first open the app asks for your Monetag API key and total withdrawals before showing the dashboard. No bundled API key.
- **Swipe to navigate** — swipe left/right to move between Home → Daily → Graph → Settings.
- **Pull to refresh** — the dashboard refreshes on any data page and shows a "refreshing" chip.
- **Minimal black & white UI** — no accent colors, no shadows, no gradients.
- **Offline cache** — every fetched day is stored in a local day-index per API key, so charts and tables read entirely from cache (never the API). Pull-to-refresh only re-fetches the last few days and backfills any gaps; Settings has a **Load all data** button to cache the whole history.

## Supported target

Moneboard ships as a **native Android app** (APK):

| Target | Stack |
|---|---|
| **Android (APK)** | Capacitor shell around a Vite + React 19 + Tailwind CSS v4 bundle; API calls go directly to `https://api.monetag.com/v5` with your key |

Look on the **GitHub Releases** page for the latest Android APK to sideload (Moneboard is not on the Play Store).

## Google Play Protect scan prompt

When you sideload any APK, Android's **Play Protect** asks once per install to scan the file — this is a Google/device-level prompt, not something Moneboard shows, and the app cannot disable it from inside. Because every release is a fresh build, you'll see the prompt again on each update.

Moneboard already does everything within its control to keep that scan green:

- It is signed with a **dedicated release keystore** (never debug-signed), which avoids the "debug app" warning.
- All traffic is HTTPS-only (`api.monetag.com`), cleartext is disabled (`allowMixedContent: false`).
- The APK requests only the `INTERNET` permission.

To make Play Protect stop asking on your device:

1. Open the **Play Store** app → tap your profile picture → **Play Protect** → tap the **settings gear**.
2. Turn off **Scan apps with Play Protect**.
3. (Optional) Also turn off **Improve harmful app detection** if you want the on-device scanner to stop running.

Note this disables Google's scanning of *all* sideloaded apps on the device, so only do it if you trust what you install.

## Why is this a read-only app?

The Monetag API key only grants access to the publisher's own statistics endpoints — it cannot spend, withdraw, or alter anything. Moneboard deliberately exposes no write actions. If you're concerned about your API key, generate a fresh one in the Monetag dashboard and paste it in Settings; it never leaves your device except to authenticate the read-only API calls.

## Development

```bash
npm install        # install dependencies
npm run lint       # TypeScript typecheck (run after changes)
npm run build:android   # build web assets into dist/www (Capacitor bundle)
npm run android:apk     # build a local release APK
```

## How it's built

This project was **built with AI** (LLM-assisted development) to get a minimal, mobile-first Android earnings dashboard shipped quickly.

See `AGENTS.md` for repository conventions and the versioning/release workflow.