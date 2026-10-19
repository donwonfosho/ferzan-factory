# Rebuild notes

Snapshot of ferzan-factory.com before a redesign. Names only. No secret values, no keys, no tokens.

Checkpoint: git tag `pre-rebuild-v2` is the live code (same commit as `main` when this backup was made). Branch `backup/pre-rebuild-v2` is that code plus this file. `main` was not changed.

## Privy

Allowed origins (from the Privy app's public config). Both required hosts are present:

- https://ferzan-factory.com
- https://www.ferzan-factory.com
- https://ferzan-factory.grok.me
- https://www.ferzan-factory.grok.me

Login methods turned on in the Privy app: email, Google, X (Twitter), Telegram, wallet, Solana wallet. External wallets can be used to sign up. SMS, guest, Discord, GitHub, TikTok, LINE, Twitch, LinkedIn, Apple, Spotify, Instagram, Farcaster, passkey, and custom JWT are off.

The site also chooses methods in the browser (`PrivyProvider`):

- On `ferzan-factory.com`: email, Google, X, Telegram, wallet.
- On every other host, including `ferzan-factory.grok.me`: email, Google, X, wallet. Telegram is not offered there.

Embedded wallets: the site asks Privy to create an Ethereum wallet and a Solana wallet on login when the user has none. App id is `VITE_PRIVY_APP_ID` (not written here).

## Environment variable names

The site reads these names. Values are not listed.

- `BETTER_AUTH_SECRET`
- `BETTER_AUTH_URL`
- `DATABASE_URL`
- `FEEDBACK_ADMIN_SECRET`
- `FERZAN_INGEST_SECRET`
- `GROK_AUTH_CLIENT_ID`
- `GROK_AUTH_CLIENT_SECRET`
- `GROK_AUTH_ISSUER`
- `GROK_CONNECTOR_ACCESS_TOKEN`
- `GROK_CONNECTORS_URL`
- `GROK_GATE_ORIGIN`
- `GROK_PROJECT_ID`
- `MOONPAY_PUBLISHABLE_KEY`
- `MOONPAY_SECRET_KEY`
- `NODE_ENV`
- `TRONGRID_API_KEY`
- `VITE_AUTH_ENABLED`
- `VITE_PLAUSIBLE_DOMAIN`
- `VITE_PRIVY_APP_ID`
- `VITE_PUBLIC_HOSTNAME`
- `VITE_SENTRY_DSN`
- `VITE_STUN_URLS`

## Routes

Every page below also has the shell: `getSiteStatus` (Launch API status), `searchCoins` (Launch API search), `sendReport` (feedback), Plausible `track` when `VITE_PLAUSIBLE_DOMAIN` is set, Sentry when `VITE_SENTRY_DSN` is set, Coinbase spot via `useNativeUsd`, and Privy.

| Path | Page data |
|---|---|
| `/` | Floor: `listBoard`, `quoteBoard`, `listPrints`, `listTelegram`, `getPulse`, `listLiveStreams`, `setCoinStream`, `quickBuy` |
| `/about` | Static |
| `/bots` | `getLaunchFees`, `getPerks`, `getPulse`, `listTelegram` (via floor-style live bits) |
| `/bridge` | `getBridgeQuote`, `getTronSun`, `siteBalance`, `solBalance` |
| `/changelog` | Static |
| `/compare` | Static |
| `/compete` | `getCompete` |
| `/creator` | `listLaunched`, `readClaimable`, `listLiveStreams`, `setCoinStream`, `listSocials`, `mySocials`, `putSocial`, `dropSocial`, `getHolders` |
| `/creator/$wallet` | `getCreator`, `loadProfile`, `listFollows`, `putFollow`, `dropFollow` |
| `/docs` | `sendReport` |
| `/ferzan` | `getPulse`, `listTelegram`, `listLiveStreams`, `setCoinStream`, `quickBuy` |
| `/funds` | `moonpayUrl`, `listTelegram`, `solBalance` |
| `/how-to-buy` | Static |
| `/launch` | `getChainModes`, `startBotLaunch`, `finishBotLaunch`, `getLaunchFees`, `getPerks`, `getReceipt`, `getPortfolio`, `getSolFees`, `buildSolFeeClaim` |
| `/leaderboard` | `listTelegramLeaders` |
| `/login` | Account: `listBoard`, `listLaunched`, `loadProfile`, `saveProfile`, `loadAccountProfile`, `saveAccountProfile`, `getPortfolio`, `getPnlAll`, `getPerks`, `getSolFees`, `buildSolFeeClaim`, `listWatch`, `putWatch`, `dropWatch`, `pushWatches`, `listTelegram`, `listLiveStreams`, `setCoinStream`, `deskCall`, `deskCashout`, `deskTopupSol`, `deskTopupBlockhash`, `readBalance`, `readTokenBalances`, `readClaimable`, `sendCurve`, `getTonBalance`, `getTronBalance`, `solBalance`, `moonpayUrl`, `quickBuy` |
| `/press` | Static |
| `/privacy` | Static |
| `/promoted` | `listBoosts`, `previewBoost`, `setBoostPayer`, `submitBoost` |
| `/pulse` | `listPulseCoins`, `listPromoted`, `listTelegram`, `listLiveStreams`, `setCoinStream`, `listWatch`, `putWatch`, `dropWatch`, `pushWatches`, `listFollows`, `putFollow`, `dropFollow`, `quickBuy` |
| `/status` | `getSiteStatus` |
| `/terminal` | `listTelegram`, `deskLinked`, `deskCall`, `deskCashout`, `deskSafety`, `deskTopupSol`, `deskTopupBlockhash`, `readBalance`, `solBalance` |
| `/terms` | Static (`acceptTerms` is local) |
| `/transparency` | `getTransparency` |
| `/verify` | Static (on-page contract addresses, no fetch) |
| `/c/$chain/$address` | Trade: `getCoin`, `coinTitle`, `readCurve`, `readCurveWall`, `readPool`, `readHeld`, `readClaimable`, `sendCurve`, `readSolanaCurve`, `readSolanaHeld`, `buySolanaCurve`, `sellSolanaCurve`, `listFills`, `listHolders`, `listCoinTrades`, `listPosts`, `addPost`, `recordTrade`, `listLaunched`, `listSocials`, `mySocials`, `putSocial`, `dropSocial`, `moonpayUrl`, `listTelegram`, `readTokenBalances`, `solBalance`, `sendReport` |
| `/coin/$chain/$curve` | Coin: `getBotCurve`, `quoteBotCurve`, `getCurveV2`, `quoteCurveV2`, `txCurveV2`, `getSolCoin`, `buildSolSwap`, `getTronCurve`, `quoteTronCurve`, `buildTronTrade`, `getTonCurve`, `quoteTonCurve`, `buildTonTrade`, `getCoinRisk`, `getHolders`, `getPnl`, `getCreatorScore`, `getPerks`, `getPortfolio`, `getSolFees`, `buildSolFeeClaim`, `listComments`, `addComment`, `reportComment`, `listLiveStreams`, `setCoinStream`, `listWatch`, `putWatch`, `dropWatch`, `pushWatches`, `listSocials`, `mySocials`, `putSocial`, `dropSocial`, `deskSafety`, `getBridgeQuote`, `getTronSun`, `creditCall`, `listTelegram`, `readTokenBalances`, `getReceipt`, `sendReport` |
| `/embed/$chain/$id` | `readEmbedCard` |
| `/p/$address` | `loadProfile`, `listLaunched`, `getPnlAll` |
| `/t/$id` | Same trade desk as `/c/$chain/$address` (`TokenView`) |
| `/token/$chain/$address` | `getPlainCoin`, `getCreatorScore`, `getPerks`, `getPortfolio`, `getSolFees`, `buildSolFeeClaim`, `listComments`, `addComment`, `reportComment`, `listWatch`, `putWatch`, `dropWatch`, `pushWatches`, `listTelegram`, `readTokenBalances`, `sendReport` |
| `/$` | Not found. Search uses `searchCoins` |

`/auth/popup` is not an app route file. The platform auth plugin serves it.

### HTTP API routes

| Path | What it calls |
|---|---|
| `GET /healthz` | None. Returns ok. Does not use the database. |
| `GET /api/v1/coins` | `coinsBody` → Launch API. Rate limit via `guardRelayBudget`. |
| `GET /api/v1/coin/$chain/$id` | `coinBody` → Launch API. |
| `GET /api/v1/coin/$chain/$id/trades` | `tradesBody` → Launch API. |
| `POST /api/launches` | `ingestLaunch`. Caller must send header `x-ferzan-ingest` checked against `FERZAN_INGEST_SECRET`. |
| `GET /api/relay-status` | `visitorTag`. Same ingest header. Returns header presence only, not visitor addresses. |
| `POST /api/csp-report` | Forwards a CSP warning to Sentry when `VITE_SENTRY_DSN` is set. |

## Upstream APIs those hooks use

- Launch API: `https://launch.ferzaneco.com/api` (curves, quotes, launches, pulse, portfolio, search, status, streams, socials, compete, perks, fees, public coin reads).
- Privy: `https://auth.privy.io`.
- Trade desk: host read in `trade-desk.server.ts` (desk link, cashout, safety, top-up).
- Bridge quotes: `https://api.relay.link` and `https://dln.debridge.finance`.
- MoonPay buy and sell links. Signed URLs need `MOONPAY_SECRET_KEY`. Publishable name is `MOONPAY_PUBLISHABLE_KEY`.
- Prices: `https://api.coinbase.com`.
- Tron: `https://api.trongrid.io` (optional `TRONGRID_API_KEY`).
- Chain reads: Ethereum, BNB, Base, Robinhood, and Arc public RPCs; Solana via `https://solana-rpc.publicnode.com`.
- TON relay: Launch API path `/ton/relay`.
- Postgres via `DATABASE_URL` for the board, profiles, comments, follows, watchlist, boosts, and feedback.
- Better Auth (`/api/auth/*`) when `VITE_AUTH_ENABLED` is not `false`. Uses `BETTER_AUTH_URL`, `BETTER_AUTH_SECRET`, `GROK_AUTH_ISSUER`, `GROK_AUTH_CLIENT_ID`, `GROK_AUTH_CLIENT_SECRET`.
- Grok gate and connectors: `GROK_PROJECT_ID`, `GROK_GATE_ORIGIN`, `GROK_CONNECTORS_URL`, `GROK_CONNECTOR_ACCESS_TOKEN`.
