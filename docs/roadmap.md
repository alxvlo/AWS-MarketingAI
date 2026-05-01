# Satisfaction Meter — Project Roadmap
**Last updated**: 2026-05-01 (Phase 3B tickets synced)  
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
- [ ] Debug presigned URL flow — confirm browser makes 2 requests (POST /upload → PUT to S3)
- [ ] Validate image actually lands in S3 and triggers EventBridge/Lambda
- [ ] Add CloudWatch logging to Rek Handler Lambda to confirm S3 key received
- [ ] Fix CORS headers on presigned URL response if PUT to S3 is failing

### 2B — Input Validation & Robustness
- [x] Restrict accepted file types to JPEG, PNG, WEBP only (validated post-upload in inference Lambda via HeadObject)
- [x] Add file size limit (max 5MB) — enforced post-upload in inference Lambda; invalid files deleted from S3
- [x] Return clear 400 error to frontend for invalid file types (presigned URL Lambda validates contentType field)
- [ ] Implement tie-breaking for equal emotion scores (priority order: HAPPY > SURPRISED > CALM > NEUTRAL > SAD > ANGRY > FEARFUL; first in list wins)
- [x] Add dead-letter queues (DLQs) on async Lambdas (Rek Handler, SES Dispatcher)
- [ ] SES bounce/complaint handling

### 2C — Webcam Capture (Customer Portal UX)
- [ ] Add webcam feed to customer portal using browser MediaDevices API
- [ ] Integrate face-api.js for client-side face detection overlay
- [ ] Green outline when face detected in frame, red when not
- [ ] Auto-snap photo when face is centered and stable for 1.5s
- [ ] Replace webcam view with snapshot preview after auto-snap
- [ ] Add "Send" button to trigger presigned URL upload flow from snapshot
- [ ] Support fallback: manual file upload still available

### 2D — CI/CD
- [x] GitHub Actions + OIDC pipeline (cdk synth → test → cdk deploy on push to main)
- [x] No stored AWS credentials in GitHub secrets — OIDC via GitHubActionsDeployRole

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
- [ ] Admin login page (simple username/password, credentials in SSM) (AWS-64)
- [ ] Admin dashboard: emotion distribution chart (bar/pie) (AWS-65)
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
| 2026-05-01 | SES stays in sandbox mode (no production access) | Production access requires a verified domain; not purchasing a domain for a semester project. Sandbox is sufficient — all demo recipients will be manually verified in the SES console. |
| 2026-04-23 | SES only (no SMS/Pinpoint) | Cost and complexity not justified |
| 2026-04-23 | GitHub Actions + OIDC over CodePipeline | Team is GitHub-native; no stored AWS creds |
| 2026-04-23 | ap-southeast-1 region | Latency from PH; no data-residency constraints |
