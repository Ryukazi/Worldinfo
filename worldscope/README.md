# 🌍 WorldScope — Explore Every Country
Country explorer PWA by **Lord Denish** (GitHub: Ryukazi). Plain HTML/CSS/JS, no framework, no build dependencies.

## What it uses
- Country details: `https://api.siputzx.my.id/api/tools/countryInfo?name=<country>` (via `api/country.js` proxy on Vercel, direct fallback)
- Directory/flags/currency codes: REST Countries · Weather, time zones, capital lookup: Open-Meteo · Rates: Frankfurter
- Map: Leaflet + OpenStreetMap · Globe: Three.js

## Run locally (Termux)
```
pkg install nodejs git
cd ~/worldscope
npm run dev        # builds dist/ and serves it
```
(Locally the `/api/country` proxy isn't running, so the app calls the Country Info API directly.)

## GitHub (Termux)
```
cd ~/worldscope
git init -b main
git add -A
git commit -m "Build WorldScope country explorer"
git remote add origin https://github.com/Ryukazi/WorldScope.git
git push -u origin main
```
Create the empty repo `WorldScope` on github.com first. Authenticate with a personal access token or `gh auth login` (never a password).
If the repo already has history: `git status`, `git remote -v`, then `git pull --rebase origin main` before pushing.

## Vercel
1. Vercel → Add New → Project → import `Ryukazi/WorldScope`.
2. Framework preset: **Other**. Build command `npm run build`, output `dist` (already in `vercel.json`). No env vars needed.
3. Deploy, then check: homepage loads · `/api/country?name=Nepal` returns JSON · a country page shows weather · mobile layout.

## Android APK
See `android-wrapper/README.md`.

## Notes
- Routes use `#/` hash URLs so every page works on static hosting and inside the APK.
- Frankfurter does not support every currency (for example NPR). Unsupported ones are disabled and explained in the UI.
- Time zones come from Open-Meteo's IANA zone for the capital (or country center). Countries with several zones list their UTC offsets; each zone isn't separately explorable yet.
- Not yet verified in a real browser or against the live APIs — run through the checklist in the Vercel step before sharing.
