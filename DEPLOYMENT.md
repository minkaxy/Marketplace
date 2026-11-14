# Deployment

## Current runtime

This application can run as a Cloudflare Worker or a Node 24 container. It is not a static GitHub Pages application. The Node adapter serves the same browser assets and API, supplies S3-compatible storage when configured, and does not inject the local development administrator.

## SnapDeploy

Use repository `minkaxy/Marketplace`, branch `main`, root directory `/`, and the checked-in `Dockerfile`. It builds with Node 24 and starts the HTTP server on `0.0.0.0` using `PORT` (default `3000`). Configure the container port as `3000` and health-check path as `/healthz` if the dashboard requests them. Let SnapDeploy use the Dockerfile command; for a generic Node build, use build command `npm ci && npm run build` and start command `npm start`.

`npm start` builds automatically if the output is missing. The Docker image already contains the built output, and starts directly with `node scripts/start.mjs`. Neither path uses `scripts/dev.mjs`.

After pulling the updated commit, redeploy. Expected log: `BAAN listening on 0.0.0.0:3000; health check: /healthz`. A 200 health response verifies the HTTP process, not the availability of customer account/payment integrations.

### Preview versus live transactions

With no storage/authentication settings, the container opens a **read-only preview** using the sample catalog. Login and order creation are not enabled. It does not store customer records on the container filesystem. SnapDeploy container files are ephemeral, so a successful startup alone is not enough to open the marketplace for real orders.

### Durable storage

Set these as runtime environment variables in SnapDeploy; do not commit credentials:

| Variable | Value |
| --- | --- |
| `S3_BUCKET` | Your existing private S3/R2 bucket name |
| `S3_ENDPOINT` | R2 or S3-compatible HTTPS endpoint; omit for AWS S3 |
| `S3_REGION` | `auto` for R2; actual region for AWS S3 |
| `S3_ACCESS_KEY_ID` | Bucket-scoped access key |
| `S3_SECRET_ACCESS_KEY` | Matching secret key |
| `S3_PREFIX` | Optional object prefix, default `baan/` |
| `PUBLIC_ORIGIN` | Public HTTPS origin of the deployed app |

AWS SDK standard credentials are also supported when the explicit S3 credentials are omitted. Storage requests require object read/write and list permissions. This does not automatically connect to the bucket owned by Sites.

### Authentication integration still required

SnapDeploy does not supply Sites' ChatGPT identity. Before enabling customers, integrate an authentication gateway that verifies user sessions, strips visitor-supplied identity headers, and supplies the verified user ID/email plus `x-baan-proxy-secret` on its server-to-server request. Set `AUTH_PROXY_SECRET` to the matching random secret of at least 32 characters, and `ADMIN_USER_ID` to the verified owner's ID. The adapter reserves that owner before serving authenticated traffic and ignores identity headers unless the gateway secret matches. Do not put this secret in browser JavaScript. The gateway must handle sign-in, sign-out, and callbacks; the legacy Sites sign-in paths show an explicit setup-required page on the Node runtime.

These variables are not a complete login provider. A gateway and member login UI are not provisioned by this startup fix. Without them, authenticated features remain unavailable. The existing Sites deployment keeps its platform authentication behavior.

References: [SnapDeploy deployment guide](https://snapdeploy.dev/docs/deployment), [ephemeral storage and file uploads](https://snapdeploy.dev/docs/faq).

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

Direct Cloudflare deployment requires an R2 bucket binding and a trusted authentication integration replacing the Sites identity headers. A publicly exposed Worker must not trust visitor-supplied `oai-authenticated-user-id` or `oai-authenticated-user-email` headers. Conventional Node hosts can use the checked-in Node adapter; serverless platforms require their own integration.

## Data and configuration

Source uploads exclude `.local-data`, `node_modules`, `.env*`, `outputs`, and generated `dist` files. No live customer/order data should be committed. Configure bank and PromptPay details through the administrator dashboard after deployment. Replace illustrative shops/products before accepting customer orders. See README.md for remaining operational limits.
