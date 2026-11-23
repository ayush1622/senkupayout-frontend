# SenkuPayout — Public Deposit Links (No-login checkout)

This update is based on the **SenkuPayout BytePayout + Telegram Agent Payouts** release. It keeps the existing login, wallet, transactions, roles, manual cashouts, Telegram alerts, and signed BytePayout webhook workflow.

## What was added

- Every **Agent** and **User** account can create its own public payment link on **Deposit → Your Public Deposit Link**.
- Visitors can use `https://senkupayout.site/pay.html?code=...` **without signing in**.
- Visitors select method and one of BytePayout's exact allowed USD amounts, generate their own provider checkout, open it, and view an **Awaiting Payment** status.
- Each deposit belongs to the account that generated the public link. The wallet only credits when BytePayout verification approves it.
- Public links can be paused and replaced by the account owner. Previously created deposits still process normally.
- Public requests are limited per IP and per link; the status page requires the original payer's separate private request identifier.

**This is not a publicly accessible BytePayout API key.** The merchant API key and webhook signing key remain on Render. Public links are intended to be shared with payers.

## Installation: backend first (private GitHub repository)

**Before changing production:** Back up your Neon database (for example, create a backup branch), and retain a copy of your last working repository. Do not run `prisma migrate reset` or drop tables.

1. Download `SenkuPayout_Public_Link_Backend_Update.zip` and extract it.
2. Go to your **private backend GitHub repository** and upload/replace the files while preserving their exact relative locations:

   ```
   backend/prisma/schema.prisma
   backend/src/server.js
   backend/src/services/transactions.js
   backend/src/services/public-link-utils.js  (NEW)
   backend/src/routes/public-pay.js          (NEW)
   backend/tests/public-links.test.js        (NEW)
   ```

3. Commit the changes to the branch Render deploys (`main` in your previous setup).
4. Open Render → `senkupayout-api` → Events/Logs. Let it deploy. If necessary, choose Manual Deploy → Deploy latest commit.
5. Your existing Start Command is `npm run start:render`. It runs `npx prisma db push` to add the `PublicDepositLink` table without a reset, then seeds the existing data. Confirm Render says **Live** and check `https://senkupayout-api.onrender.com/api/health`.
6. Verify that `FRONTEND_URL=https://senkupayout.site` and `ALLOWED_ORIGINS=https://senkupayout.site` are still correct. **Do not modify** database passwords, BytePayout credentials, Telegram secrets or `JWT_SECRET`.

## Installation: frontend second (public GitHub repository)

1. Download `SenkuPayout_Public_Link_Frontend_Update.zip` and extract it.
2. Go to your **public frontend GitHub Pages repository** `ayush1622/senkupayout` (or your actual Pages source repository).
3. Upload/replace these files at the repository root:

   ```
   pay.html                   (NEW)
   js/public-pay.js           (NEW)
   css/public-pay.css        (NEW)
   js/portal.js              (UPDATED)
   css/app.css               (UPDATED)
   ```

4. **Do not delete** `CNAME`, `js/config.js`, `index.html`, `login.html`, `portal.html`, or other existing files. Your `CNAME` must continue to point to `senkupayout.site`. Your current `js/config.js` should still point to `https://senkupayout-api.onrender.com`.
5. Commit to `main` and wait for GitHub → Settings → Pages to show deployment success.
6. Reload your site with Ctrl + Shift + R.

## How an Agent or User shares the link

1. Sign in to `https://senkupayout.site` as an Agent or User, using your existing credentials.
2. Open **Deposit** in the left menu.
3. Look for **Your Public Deposit Link** above the normal deposit form.
4. Click **Copy link**, then share it with a customer. **Open** lets you test the customer view without logging out.
5. Click **Pause link** to stop new checkouts on it, or **Replace link** to invalidate the old share link and generate a new one. Existing payment references still track and settle.

Employees do not have personal public links; an employee's normal deposits still credit their User owner. Admin accounts do not have public checkout links.

## What a public customer does

1. Opens the shared `pay.html?code=...` address. They do NOT log in or create an account.
2. Chooses a payment method: Chime, Venmo, PayPal, Cash App, Apple Pay or Google Pay (subject to admin-enabled payment methods).
3. Chooses an exact supported amount. The form displays a fee and the amount credited to the account owner.
4. Clicks **Generate payment link**, then **Open payment checkout** or copies the checkout link.
5. The page shows **Awaiting Payment** and checks the provider; after approval, it shows **Payment confirmed**.
6. The Agent/User sees the deposit in Transactions and its wallet is credited **only after authenticated BytePayout verification**.

Amounts of **$500 and $1,000 are not allowed** in the currently documented BytePayout methods. Chime, Venmo, and PayPal have whole-dollar amounts; Cash App/Apple Pay/Google Pay have values such as $9.99, $19.99, and $29.99.

## Testing without risking funds

- First create a public link as a fresh Agent/User and open it in an incognito browser that is **not logged in**.
- Check that the account display name, methods, amounts, and fee summary appear. Choose Chime/$10 and generate a checkout link. **Do not send funds yet**.
- Open your Agent/User Transactions; you should see a pending deposit belonging to the correct account.
- The customer status must remain Pending until payment approval is verified. A checkout link alone must not credit the wallet.
- Once you are ready and the merchant settlement rules are confirmed, run one controlled small live payment and verify the provider record, account balance, admin transaction, and webhook handling all agree.
- Test with two different accounts: each share link must credit **its own** account.
- Test Pause/Replace: old link must refuse new checkouts; already-created deposits must remain trackable.

## Troubleshooting

- **Public link panel missing:** Update `js/portal.js` in the FRONTEND repo and refresh; only Agent/User accounts have their own link.
- **404 payment page:** Confirm `pay.html` is at the GitHub Pages **repository root**, not under a nested `docs` folder; check the link wasn't paused/replaced.
- **404 API or unknown table:** Update the BACKEND repo and check Render logs for the Prisma db-push operation. Don't reset the database.
- **Production API URL not configured:** Keep the existing working `js/config.js` pointing to `https://senkupayout-api.onrender.com`.
- **CORS error:** `ALLOWED_ORIGINS` on Render must include `https://senkupayout.site` (and optionally your actual www origin if used). Redeploy after saving.
- **Unsupported amount:** Select one of the exact amounts shown. $500 and $1,000 are not supported.
- **Provider temporarily unavailable:** Reuse the same payment request instead of rapidly clicking repeatedly. The backend safeguards payment idempotency.
- **Payment status on another browser:** The status lookup uses a payer-specific key stored in the creating browser's session storage. The account owner still receives verified status updates in Transactions.
- **High public traffic:** Rate limiting in this version is in-memory per Render instance. For major traffic, use persistent limits and bot protection, review API limits and fraud controls with BytePayout, and add monitoring.

## API summary (for your own developer reference)

Authenticated account controls:

- `GET /api/public/links/me` — get/create account link (AGENT, USER)
- `POST /api/public/links/me/toggle` — `{ "enabled": false }` (AGENT, USER)
- `POST /api/public/links/me/rotate` — replace old link (AGENT, USER)

Unauthenticated customer flow:

- `GET /api/public/pay/:code` — public account display and supported methods
- `POST /api/public/pay/:code/deposits` — `{ "amount": 10, "method": "chime", "requestKey": "<uuid>" }`
- `POST /api/public/deposits/:reference/status` — `{ "access": "<same uuid>" }`

Payment ownership and fees are resolved on the backend; visitor-supplied owner IDs and fees are ignored/not accepted. Actual wallet credit still uses the pre-existing signed webhook / provider status verification mechanisms.

## Important financial note

The fee shown to the customer is the configured *account deposit fee* and is deducted from the recipient's credited wallet balance. Your actual BytePayout settlement fee may differ (e.g. a fixed per-deposit cost). Monitor merchant balance and reconcile provider fees, agent commissions, refunds, disputes, and payout costs before assuming a margin.

## Validation performed for this package

- Node JavaScript syntax checks on updated files.
- Eight offline tests, including public-token, allowed-amount, ownership, status-data minimization, HMAC signature, and BytePayout request-shape tests.
- **Not** tested with your live Neon data, production Render deployment, browser-to-Render CORS, or real BytePayout deposits. Do not assume production readiness until the controlled end-to-end test succeeds.
