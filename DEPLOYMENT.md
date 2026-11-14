# Deployment

## Current runtime

This application is a server-backed Cloudflare Worker, with an R2 binding named `BUCKET`. It is not a static GitHub Pages application. GitHub stores the source and runs build/tests; a hosting service is required to run the marketplace.

Build with Node 24:

```sh
npm ci
npm run build
npm test
```

The resulting entry point is `dist/server/index.js`. Browser assets are embedded in this Worker. Never deploy `scripts/dev.mjs`: it intentionally injects a test administrator identity for local development.

## Sites

The existing Site ID and storage binding are recorded in `.openai/hosting.json`. Publish with the Sites source synchronization and deployment workflow. Keep the initial Site private and initialize the owner account before changing its audience. GitHub CI does not automatically publish to Sites.

## Other hosting

Direct Cloudflare deployment requires an R2 bucket binding and a trusted authentication integration replacing the Sites identity headers. A publicly exposed Worker must not trust visitor-supplied `oai-authenticated-user-id` or `oai-authenticated-user-email` headers. Configure and validate identity and administrator provisioning before deploying outside Sites. Vercel, Netlify, and conventional Node servers require a storage/runtime adapter as well.

## Data and configuration

Source uploads exclude `.local-data`, `node_modules`, `.env*`, `outputs`, and generated `dist` files. No live customer/order data should be committed. Configure bank and PromptPay details through the administrator dashboard after deployment. Replace illustrative shops/products before accepting customer orders. See README.md for remaining operational limits.
