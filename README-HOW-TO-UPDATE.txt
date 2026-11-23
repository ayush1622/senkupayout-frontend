SENKUPAYOUT — BOTH DEPOSIT PAGES FEE DISPLAY FIX

The supplied screenshot is from the logged-in Deposit dashboard (js/portal.js),
not only from the public guest checkout (js/public-pay.js). BOTH are fixed.

What changed:
- Payment methods show the effective account deposit fee returned by the backend
  (account override where >0, otherwise per-method backend fee).
- Quick amount buttons show only their nominal amount; unsupported options still
  say Unavailable. No 'Charge $9.99' and no fee text underneath.
- Live Summary shows actual payment amount, account fee + percentage, and estimated
  wallet credit AFTER the payment is verified.
- Provider-supported exact amounts are preserved! Google Pay's $10 quick choice
  still selects $9.99, and the summary/input show $9.99 before checkout.
- portal.html and pay.html include cache-busting script versions.

INSTALL — FRONTEND GITHUB REPOSITORY ONLY (ayush1622/senkupayout):
1. Download and extract the ZIP.
2. In the public GitHub frontend repo, replace these FOUR files in their existing paths:
     js/portal.js
     js/public-pay.js
     portal.html
     pay.html
3. Do NOT upload a new parent folder; do NOT replace js/config.js or the CNAME file.
4. Commit changes. Confirm GitHub Pages deploy succeeds.
5. Sign in, open Deposit page, and refresh Ctrl+Shift+R.
6. Open a public pay link incognito and check amount cards and fee summary there too.

No backend, Render, API keys, Telegram, or Neon changes are required.

This is an estimate based on feeBps currently returned by the backend, which is
also used in the backend deposit creation code. BytePayout's independent merchant
processing fees are not part of the account fee and are not provided per-method
by the existing backend API.
