# Satisfaction Meter — Project Roadmap
**Last updated**: 2026-05-06 (smoke test run; backend code drift identified — capture stack redeploy required)  
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
- [ ] Integration test: end-to-end webcam → upload → Rekognition → email (verify against live API)

### 2D — CI/CD
- [x] GitHub Actions + OIDC pipeline (cdk synth → test → cdk deploy on push to main)
- [x] No stored AWS credentials in GitHub secrets — OIDC via GitHubActionsDeployRole

### 2E — Frontend Hosting (CloudFront)
- [x] Static export: `next.config.ts` with `output: "export"`, `trailingSlash: true`
- [x] CDK `WebStack`: private S3 bucket + CloudFront distribution with OAC + CloudFront Function for subdirectory index rewrite (lib/web-stack.ts)
- [x] GitHub Actions workflow `frontend-deploy.yml`: build → `aws s3 sync` → CloudFront invalidation
- [x] Path filters on `deploy.yml` so backend deploys ignore `frontend/**`
- [x] Extend GitHubActionsDeployRole with S3 write + cloudfront:CreateInvalidation
- [x] Smoke test: `/`, `/admin/`, `/admin/dashboard/` all return 200 on CloudFront URL
- [x] Add 3 DKIM CNAMEs at name.com for SES domain verification (`satisfactionmeter.live`)
- [x] Verify sender email `noreply@satisfactionmeter.live` in SES console (ap-southeast-1)
- [x] Request ACM cert in `us-east-1` for `satisfactionmeter.live` (DNS validated, cert issued)
- [x] Attach ACM cert to CloudFront distribution + configure apex domain alias (`satisfactionmeter.live`)
- [ ] Confirm SES production access approval from AWS (request submitted 2026-05-02; ~24-48h)
- [ ] Full end-to-end smoke test: webcam → upload → email flow on the CloudFront URL
- [ ] Tighten API Gateway + S3 image bucket CORS from `*` to the CloudFront origin (`satisfactionmeter.live`)

---

## 📊 Phase 3: Analytics Layer
Professor confirmed this is required. Simplified from original over-engineered design.

### 3A — Backend Analytics (DynamoDB-based, no Kinesis/Firehose)
- [x] Lambda: GET /analytics/emotions — aggregate emotion counts from DynamoDB scan (60s in-memory cache)
- [x] Lambda: GET /analytics/campaigns — delivery stats (totalSent, perTemplate, earliest/latestSentAt) from campaigns table
- [x] Lambda: GET /analytics/trends — emotion counts grouped by day (last 30 days)
- [x] DynamoDB campaigns table: dual-written by send-email Lambda — `{submissionId, email, emailSentAt, templateUsed, dominantEmotion}`. Routes are open during 3A; Lambda Authorizer wired up in 3B.

### 3B — Admin Portal (Frontend + Auth)
- [ ] API Gateway Lambda Authorizer — validates credentials from SSM Parameter Store (AWS-58)
- [ ] Admin login page (simple username/password, credentials in SSM) (AWS-64) — UI exists at `frontend/app/admin/page.tsx`, pending real Lambda Authorizer wiring
- [ ] Admin dashboard: emotion distribution chart (bar/pie) (AWS-65) — UI exists at `frontend/app/admin/dashboard/page.tsx` with mock data
- [ ] Admin dashboard: submission volume over time (line chart) (AWS-66)
- [ ] Admin dashboard: campaign performance table (sent count per template) (AWS-67)
- [ ] Admin dashboard: trend forecasting display (simple moving average, 7-day) (AWS-59)
- [ ] Protect all /analytics/* endpoints behind Lambda Authorizer — CDK route wiring + 401 verification (AWS-69)
- [ ] Wire admin dashboard frontend to real /analytics/* endpoints — replace `frontend/lib/mockAnalytics.ts` mock data with live fetch calls, pass Basic Auth header (AWS-70)

---

## 🔧 Phase 4: Polish & Observability
- [x] CloudWatch dashboard: Lambda errors, invocations, duration (P50/P99), DLQ depth, SES delivery metrics — ObservabilityStack
- [ ] CloudWatch Alarms → SNS alert to team Slack
- [ ] Optional: A/B test scaffolding (same emotion, two offer variants)
- [ ] Optional: Email frequency cap (deduplication — max 1 email per address per 24h)

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
| 2026-05-02 | ACM cert issued in `us-east-1` (not ap-southeast-1) | CloudFront requires certs in us-east-1 regardless of app region — single approved cross-region resource |
| 2026-05-02 | Custom apex domain `satisfactionmeter.live` configured on CloudFront | DKIM CNAMEs added at name.com; ACM cert attached to distribution; apex domain live |
| 2026-04-23 | SES only (no SMS/Pinpoint) | Cost and complexity not justified |
| 2026-04-23 | GitHub Actions + OIDC over CodePipeline | Team is GitHub-native; no stored AWS creds |
| 2026-04-23 | ap-southeast-1 region | Latency from PH; no data-residency constraints |
| 2026-05-02 | Frontend hosted on CloudFront + S3, not Vercel | Stays inside the single AWS account (no extra vendor accounts), keeps the project AWS-native per CLAUDE.md, and CloudFront's "always free" 1TB/month tier covers expected traffic. Static export is sufficient — no SSR/ISR needed. |
| 2026-05-06 | Backend CDK stack drifted from deployed state — submit button fix deferred to post-redeploy | All commits since Phase 2D were frontend-only, so deploy.yml never fired. Deployed capture stack requires x-api-key header and deprecated fileSize field; current repo code has neither. Redeploy required before end-to-end test can pass. |
