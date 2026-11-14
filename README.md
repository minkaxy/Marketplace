# BAAN Marketplace

Thai / English marketplace built with a dependency-light JavaScript interface and a Cloudflare Worker. Durable shop, member, product, campaign, and order records and media use the Sites R2 `BUCKET` binding. Cart, wishlist, and selected language stay on the device.

For SnapDeploy/container hosting, use the included Dockerfile or `npm start` on Node 24. See [DEPLOYMENT.md](DEPLOYMENT.md) for ports, health checks, S3/R2 credentials, and the required authentication integration. Without durable storage and authentication, the container serves a read-only catalog preview.

## Run locally

Node 24 or newer:

```sh
npm install
npm run build
npm test
npm run dev
```

Open http://localhost:4173. The development adapter supplies a local owner identity and stores data under the ignored `.local-data` directory. This adapter is never included in the hosted Worker.

On Windows PowerShell, use `npm.cmd` if execution policy blocks `npm.ps1`.

## First use

The published Site is private. Its first authenticated visitor becomes administrator through a conditional R2 owner record. Initialize it with the owner account before any sharing change. Platform-provided ChatGPT identity is used for members; there are no application passwords. Keep the Site private until an explicit launch and access review.

Open `/#/admin` to configure the name, logo, favicon, colors, bilingual hero copy, images, section visibility, price/discount sizes, platform categories, bank account, PromptPay recipient, default delivery fees, free delivery threshold, and campaign price. No bank details are prefilled. Checkout remains blocked until valid recipient settings are supplied. Existing orders retain a payment-settings snapshot.

Open `/#/seller` to manage products, both category systems, multiple uploaded image/video files, shop branding, cover, description, shipping, fulfillment, and sponsored placement requests. The administrator can manage the three sample shops; a member can create and manage their own shop. Sample products, ratings and images are illustrative and must be replaced with actual merchandise before launch. Remove a product using the seller dashboard; existing order snapshots remain intact.

## Payments and delivery

PromptPay QR uses the EMV payload with the exact order total, including each shop's shipping, and CRC16 checksum. The QR encoder is bundled locally from `qrcode-generator` under its MIT license. A QR is a payment instruction, not proof of payment. The administrator reviews uploaded slips manually, approves/rejects them, and the shop adds a carrier and tracking number. Delivery is manually updated; no carrier or bank API is connected. Test a real recipient and banking-app scan before accepting actual payments.

Homepage recommendations are shuffled across all shops. Sponsored shop cards are explicitly labelled. Campaign purchase requests capture the configured fee; payment is arranged and confirmed by the administrator before activation. There is no automated ad billing or expiry scheduler.

## Scope and operational limits

This is an initial working private implementation. It includes theme and content controls, rather than an unrestricted drag-and-drop page builder. Authentication depends on Sites. There are no refund, tax invoice, settlement, stock reservation/decrement, or automatic reconciliation integrations. Product availability is checked when placing an order but inventory is not reserved. R2 order updates are individual object writes, not cross-record transactions; high-volume production use requires transactional order storage and concurrency control. Before opening to customers, configure real seller ownership, banking, shipping and access policies, replace samples, and validate payment/fulfillment with the intended operators.

Server tests cover role separation, cross-origin writes, isolation between customers, authoritative pricing, per-shop delivery, invalid quantities, payment review permissions, and individual-shop shipment transitions. The build embeds all browser assets in `dist/server/index.js`; `.openai/hosting.json` defines the existing Site and R2 binding.

Product photos are remotely served Unsplash images; the UI fonts use Google Fonts. User uploads are stored in R2. Payment slips are accessible only to their uploader and the administrator.
