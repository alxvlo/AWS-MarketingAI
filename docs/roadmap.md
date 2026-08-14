# Satisfaction Meter — Project Roadmap
**Last updated**: 2026-08-15 (login removed; dashboard and APIs made public)
**Region**: ap-southeast-1 (Singapore) · Serverless · CDK TypeScript

---

## ✅ DONE — Phase 0: Bootstrap
All foundational AWS infrastructure confirmed working.
- AWS account structure confirmed, 1 shared IAM user created for all team members
- CDK app skeleton (TypeScript) initialized
- Local dev tooling set up
- S3 bucket (SSE-S3, 30-day lifecycle, EventBridge enabled, public access blocked)
- Presigned URL Lambda + API Gateway endpoint
- Web upload page (HTML/JS) with presigned URL flow + polling

## ✅ DONE — Phase 1: End-to-End Thin Slice
Full pipeline smoke-tested and verified.
- Build presigned URL Lambda + API Gateway endpoint
- Build web upload page (HTML/JS)
- Build inference Lambda (S3 trigger → Rekognition → DynamoDB)
- Define emotion-to-SES template map (5 emotions)
- Build SES send Lambda
- Build GET /results/{submissionId} API endpoint
- End-to-end smoke test: upload → Rekognition → DynamoDB → SES → GET /results ✅

---

## 🔥 Phase 2: Bug Fixes & Core Improvements (CURRENT)
Addressing consultation feedback + known bugs from testing.

### 2A — Image Pipeline Fix (BLOCKER)
- [x] **Backend capture stack redeployed** — removed stale API key requirement from API Gateway; upload endpoint now returns HTTP 200 + presigned URL without x-api-key header (2026-05-06). See `docs/smoke-test-2026-05-06.md`.
- [x] **Frontend api.ts aligned** — removed dead x-api-key header; fileSize already correctly passed from image.size (2026-05-06).
- [ ] Validate image actually lands in S3 and triggers EventBridge/Lambda (pending live test)
- [ ] Add CloudWatch logging to Rek Handler Lambda to confirm S3 key received
- [ ] Fix CORS headers on presigned URL response if PUT to S3 is failing

### 2B — Input Validation & Robustness
- [x] Restrict accepted file types to JPEG, PNG, WEBP only (validated post-upload in inference Lambda via HeadObject)
- [x] Add file size limit (max 5MB) — enforced post-upload in inference Lambda; invalid files deleted from S3
- [x] Return clear 400 error to frontend for invalid file types (presigned URL Lambda validates contentType field)
- [ ] Implement tie-breaking for equal emotion scores (priority order: HAPPY > SURPRISED > CALM > NEUTRAL > SAD > ANGRY > FEARFUL; first in list wins)
- [x] Add dead-letter queues (DLQs) on async Lambdas (Rek Handler, SES Dispatcher)
- [ ] SES bounce/complaint handling — SNS topic for bounces/complaints → Lambda to log and suppress offending addresses (required now that production access is in progress)

### 2C — Webcam Capture (Customer Portal UX)
- [x] Add webcam feed to customer portal (`frontend/app/page.tsx`)
- [x] Integrate face-api.js for client-side face detection overlay (`frontend/components/FaceOverlay.tsx`)
- [x] Green outline when face detected in frame, red when not
- [x] Auto-snap photo when face is centered and stable for 1.5s
- [x] Replace webcam view with snapshot preview after auto-snap
- [x] Wire "Send for Analysis" button to presigned URL upload flow via `frontend/lib/api.ts`
- [x] Support fallback: manual file upload still available
- [x] Integration test: end-to-end webcam → upload → Rekognition → email (verify against live API) — verified via synthetic CLI test 2026-05-06, submissionId e5848940

### 2D — CI/CD
- [x] GitHub Actions + OIDC pipeline (cdk synth → test → cdk deploy on push to main)
- [x] No stored AWS credentials in GitHub secrets — OIDC via GitHubActionsDeployRole

### 2E — Frontend Hosting (Vercel)
- [x] Static export: `next.config.ts` with `output: "export"`, `trailingSlash: true`
- [x] Vercel project config: repo-level `vercel.json` points Vercel at `frontend/`, uses Next.js, `npm ci`, and `npm run build`
- [x] Frontend runtime pinned to Node 22 via `frontend/package.json`
- [x] Removed legacy GitHub Actions workflow `frontend-deploy.yml` for S3 sync and CloudFront invalidation
- [x] Removed CDK `WebStack` from the active CDK app; frontend hosting is no longer provisioned by AWS CDK
- [x] Path filters on `deploy.yml` so backend deploys ignore `frontend/**`
- [x] S3 upload bucket CORS allows custom domain, `www`, Vercel preview domains, and localhost
- [x] Create isolated Vercel project `satisfaction-meter`, configure Production `NEXT_PUBLIC_*` variables, and deploy the static export (2026-08-15)
- [x] Smoke test: `/` and `/home/` render the public dashboard with the SES notice; `/login/` returns 404 at `https://satisfaction-meter.vercel.app` (2026-08-15)
- [x] Add 3 DKIM CNAMEs at name.com for SES domain verification (`satisfactionmeter.live`)
- [x] Verify sender email `noreply@satisfactionmeter.live` in SES console (ap-southeast-1)
- [ ] Point `satisfactionmeter.live` and `www.satisfactionmeter.live` DNS at Vercel after production deploy is verified; preserve SES DNS records
- [ ] Confirm SES production access approval from AWS (request submitted 2026-05-02; ~24-48h)
- [ ] Full end-to-end smoke test: webcam → upload → email flow on the Vercel URL; use alexvelo199@gmail.com for browser test
- [ ] Destroy orphaned `SatisfactionMeterWeb` CloudFormation stack after DNS cutover is complete

---

## 📊 Phase 3: Analytics Layer
Professor confirmed this is required. Simplified from original over-engineered design.

### 3A — Backend Analytics (DynamoDB-based, no Kinesis/Firehose)
- [x] Lambda: GET /analytics/emotions — aggregate emotion counts from DynamoDB scan (60s in-memory cache)
- [x] Lambda: GET /analytics/campaigns — delivery stats (totalSent, perTemplate, earliest/latestSentAt) from campaigns table
- [x] Lambda: GET /analytics/trends — emotion counts grouped by day (last 30 days)
- [x] DynamoDB campaigns table: dual-written by send-email Lambda — `{submissionId, email, emailSentAt, templateUsed, dominantEmotion}`. Routes are open during 3A; Lambda Authorizer wired up in 3B.

### 3B — Public Dashboard (Frontend + Analytics) ✅ DONE
- [x] Remove the login page, browser session token, login/authorizer Lambdas, and SSM credential dependency (2026-08-15)
- [x] Expose dashboard submissions and analytics endpoints without API Gateway authorizers (2026-08-15)
- [x] Add a visible SES sandbox notice stating that email delivery only works for `alexvelo199@gmail.com` until AWS grants production access (2026-08-15)
- [x] Admin dashboard: emotion distribution chart — horizontal bar list from live `/analytics/emotions` (AWS-65)
- [x] Admin dashboard: submission volume over time — Recharts line chart from live `/analytics/trends` (AWS-66)
- [x] Admin dashboard: campaign performance table — ranked table from live `/analytics/campaigns` (AWS-67)
- [ ] Admin dashboard: trend forecasting display (simple moving average, 7-day) (AWS-59) — NOT in scope for this overhaul
- [x] Wire dashboard frontend to real `/analytics/*` endpoints — public live fetch calls; `mockAnalytics.ts` deleted (AWS-70)

---

## 🔧 Phase 4: Polish & Observability
- [x] CloudWatch dashboard: Lambda errors, invocations, duration (P50/P99), DLQ depth, SES delivery metrics — ObservabilityStack
- [ ] CloudWatch Alarms → SNS alert to team Slack
- [ ] Optional: A/B test scaffolding (same emotion, two offer variants)
- ~~Optional: Email frequency cap (deduplication — max 1 email per address per 24h)~~ — implemented in `56c9897`, **removed 2026-05-07** in `c75b974` because it actively blocked the demo workflow under SES sandbox + single verified recipient. The cap was the trigger for a silent polling-hang bug; same change set also fixed the underlying class of bugs by writing honest terminal statuses for `no_face_detected` / `invalid_file` paths.

---

## Key Decisions Log

| Date | Decision | Reason |
|------|----------|--------|
| 2026-04-29 | EventBridge over direct S3→Lambda notification | Avoids cross-stack CDK circular dependency |
| 2026-04-29 | Analytics via DynamoDB query, not Kinesis/Firehose/Athena | Simpler, free-tier, professor said OK |
| 2026-05-01 | Separate `campaigns` table, not reuse `submissions` | Submissions has 30-day TTL — analytics must outlive that. Campaigns gets no TTL so historical send volume survives. Dual-write happens in send-email Lambda. |
| 2026-05-01 | /analytics/emotions uses 60s module-scope cache | Avoids full table scan on every request from admin dashboard polling; 60s freshness is acceptable for a dashboard. |
| 2026-04-29 | Admin auth via Lambda Authorizer + SSM, not Cognito | One admin user; Cognito overkill for semester project |
| 2026-04-29 | Tie-breaking: priority order list | Avoids 50/50 ambiguity; deterministic; configurable |
| 2026-04-29 | Webcam: face-api.js client-side overlay, Rekognition cloud-side | Client-side for low-cost overlay; Rekognition for accuracy |
| 2026-05-01 | SES sandbox — prior decision | Was: no domain, sandbox only. **Superseded 2026-05-02** by domain acquisition. See rows below. |
| 2026-05-02 | Domain `satisfactionmeter.live` acquired at name.com | Enables SES production access request and custom CloudFront apex domain |
| 2026-05-02 | SES production access request submitted | Removes manually-verified-only limit once AWS approves (~24-48h). Sender: `noreply@satisfactionmeter.live` |
| 2026-05-02 | ACM cert issued in `us-east-1` (not ap-southeast-1) | Historical CloudFront setup; superseded by Vercel frontend hosting on 2026-08-10 |
| 2026-05-02 | Custom apex domain `satisfactionmeter.live` configured on CloudFront | Historical CloudFront setup; DNS should move to Vercel after production deploy verification |
| 2026-04-23 | SES only (no SMS/Pinpoint) | Cost and complexity not justified |
| 2026-04-23 | GitHub Actions + OIDC over CodePipeline | Team is GitHub-native; no stored AWS creds |
| 2026-04-23 | ap-southeast-1 region | Latency from PH; no data-residency constraints |
| 2026-05-02 | Frontend hosted on CloudFront + S3, not Vercel | Superseded 2026-08-10 by user request to host the website on Vercel. |
| 2026-05-06 | Backend CDK stack drifted from deployed state — submit button fix deferred to post-redeploy | All commits since Phase 2D were frontend-only, so deploy.yml never fired. Deployed capture stack requires x-api-key header and deprecated fileSize field; current repo code has neither. Redeploy required before end-to-end test can pass. |
| 2026-05-07 | Removed 24h email frequency cap (`EmailFrequencyCapTable` + Lambda check + IAM grant + env wiring) | OPTIONAL Phase 4 polish but actively blocked demo workflow: only 1 verified SES recipient (`alexvelo199@gmail.com`) and SES production access still pending after 5 days. Same change set fixed a class of frontend polling-hang bugs by writing honest terminal statuses for `no_face_detected` / `invalid_file` paths and exiting `pollResult` on any terminal status. Verified end-to-end live: 3+ back-to-back submissions all reached `email_sent`. See commits `c75b974`, `a9d0823`, `ca03439`. |
| 2026-05-07 | `next.config.ts` `output: 'export'` is now conditional on `!isDev` | Static export config blocked the `force-dynamic` admin API route in `next dev` even after the route was renamed to `route.dev.ts`. Production build/deploy unaffected — only local dev mode now runs full Next.js so the dev-only admin audit page can serve. |
| 2026-05-08 | Frontend reorganized to admin-only: `/login/` → `/home/` (unified emotion + admin grid) | User pivot — no public end-user; admin runs demo and views analytics from one screen |
| 2026-05-08 | Editorial design system (Newsreader serif + warm neutrals + single rust accent) | huashu-design single-direction overhaul — replaces the slate/indigo Tailwind defaults |
| 2026-05-08 | CloudFront Function extended to 301-redirect bare page routes to trailing-slash canonical | S3 REST API (OAC) has no directory-index concept; bare `/login` returned 403→404. Fixed in `lib/web-stack.ts` and deployed to `SatisfactionMeterWeb` stack. |
| 2026-08-10 | Frontend hosting moved to Vercel; AWS remains backend-only | User requested Vercel website hosting. `vercel.json` records `frontend/` as project root; `frontend-deploy.yml` and `WebStack` were removed from source. AWS API Gateway, S3 uploads, Rekognition, DynamoDB, SES, admin auth, analytics, and observability stay in CDK. |
| 2026-08-15 | Removed login and made the dashboard APIs public | User requested public access. Frontend auth gates and Basic Auth headers were removed; API Gateway authorizers and login Lambdas were removed. The deployed `SatisfactionMeterAdminAuth` stack ID remains temporarily to preserve the existing submissions API URL. |
| 2026-08-15 | Deployed to a new isolated Vercel project | Created `ahi-capstone/satisfaction-meter` without modifying the existing `ahi-capstone` project. Because the frontend uses Next.js static export, the Vercel project uses the Other preset with `npm run build` and `out` as its output directory. Production URL: `https://satisfaction-meter.vercel.app`. |
