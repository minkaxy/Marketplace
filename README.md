# BAAN Marketplace — self-hosted

A Thai / English marketplace for Windows, Linux and Raspberry Pi ARM64. Requires official Node.js 24 or newer with `node:sqlite`. No external database, storage account, ChatGPT account or authentication gateway is required.

**[คู่มือเริ่มต้นภาษาไทย](START-HERE.md)** · **[Deployment and operations](DEPLOYMENT.md)**

## Start

Windows: run `start-windows.cmd`. Linux / Raspberry Pi: run `sh start-linux.sh`. Open http://localhost:3000. Release bundles include the QR library and work without an npm install; Node itself is required.

For source development:

```sh
npm ci
npm run build
npm test
npm start
```

The first startup generates `data/setup-token.txt`. Use this code on the account screen to create the administrator. There are no default credentials, seed sellers, seed products, synthetic ratings, or automatic administrator sessions. Later members register using email and password. Passwords use salted scrypt; sessions use opaque, server-stored tokens in HttpOnly, SameSite cookies (Secure when PUBLIC_ORIGIN is HTTPS). Login attempts are rate limited and password changes invalidate old sessions.

## Included

- Platform and shop categories; bilingual product names/descriptions.
- Shop branding, product image/video uploads and galleries; configurable homepage, logo, favicon, prices and discount sizes.
- Cart and per-shop shipping, free-shipping thresholds, authoritative server pricing.
- PromptPay QR with exact amount including shipping; private slip uploads and manual administrator payment approval.
- Seller-specific orders, carrier/tracking entry, buyer delivery confirmation.
- Transactional stock reservation, idempotent checkout, cancellation and unpaid-order expiry with stock return.
- Sponsored placement requests with configurable fees and manual administrator activation.
- Persistent SQLite data, online backups, restore tool, password recovery CLI, Docker Compose and Linux systemd templates.

## Storage and operations

Everything is stored in `data/marketplace.sqlite`, including uploaded media (up to 25 MB per file). SQLite WAL and transactions protect order/stock changes. API mutations are serialized for correctness, so use one application process per data directory. This design suits a single-machine marketplace, not a horizontally scaled cluster. Put data on a reliable local disk/SSD, not a shared network filesystem. Monitor disk use, particularly for video uploads, and back up off-device.

```sh
npm run backup
# Stop the server before restoring:
npm run restore -- backups/your-backup.sqlite
```

Password recovery is an operator action: stop the server, then run `node scripts/reset-password.mjs member@example.com`. It creates a one-time recovery code, saved to a private file in the data directory. Give that code privately to the verified account owner, who uses the password recovery form. Do not send codes to unverified requesters. No email delivery service is configured; there are no automatic email-verification or forgotten-password emails.

## Before accepting money

Enter actual bank/PromptPay recipient details, shipping prices, shop contacts and merchandise through the dashboards. Verify the QR recipient and a complete payment/delivery flow with your own banking app. Payment approval and tracking remain manual: there is no bank reconciliation, carrier API, automated refund, tax invoice or seller payout service. Sponsored placements are manually billed and activated. No real transfer has been performed by automated tests.

The theme editor changes content, colors, images, visibility and typography; it is not a freeform drag-and-drop page builder. Google Fonts is optional network-loaded typography; uploaded product media is served locally. The bundled `public/qr.js` includes its MIT license header.

## Validation

Integration tests create isolated test accounts and products in a temporary SQLite database, exercise registration/login, permissions, tampered pricing, concurrent inventory, transaction rollback, checkout retries, private uploads, payment approval, shipping, cancellation, expiry, logout/password invalidation, backups and reopening persisted data. These fixtures are never inserted into the application database. CI runs on Windows, Linux x64 and Linux ARM64, plus a Docker startup check. Physical Raspberry Pi performance and actual payment confirmation require testing on the intended hardware/service.
