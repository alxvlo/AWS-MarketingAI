# Satisfaction Meter — Project Roadmap
**Last updated**: 2026-04-29  
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
- [ ] Restrict accepted file types to JPEG, PNG, WEBP only (validate in URL Generator Lambda)
- [ ] Add file size limit (max 5MB) in URL Generator Lambda
- [ ] Return clear 400 error to frontend for invalid file types
- [ ] Implement tie-breaking for equal emotion scores (priority order: HAPPY > SURPRISED > CALM > NEUTRAL > SAD > ANGRY > FEARFUL; first in list wins)
- [ ] Add dead-letter queues (DLQs) on async Lambdas (Rek Handler, SES Dispatcher)
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
- [ ] GitHub Actions + OIDC pipeline (cdk synth → test → cdk deploy on push to main)
- [ ] No stored AWS credentials in GitHub secrets

---

## 📊 Phase 3: Analytics Layer
Professor confirmed this is required. Simplified from original over-engineered design.

### 3A — Backend Analytics (DynamoDB-based, no Kinesis/Firehose)
- [ ] Lambda: GET /analytics/emotions — aggregate emotion counts from DynamoDB scan/query
- [ ] Lambda: GET /analytics/campaigns — delivery stats (sent, opened, clicked) from campaigns table
- [ ] Lambda: GET /analytics/trends — emotion counts grouped by day (last 30 days)
- [ ] DynamoDB campaigns table: track emailSentAt, templateUsed, submissionId per campaign record

### 3B — Admin Portal (Frontend + Auth)
- [ ] API Gateway Lambda Authorizer — validates credentials from SSM Parameter Store
- [ ] Admin login page (simple username/password, credentials in SSM)
- [ ] Admin dashboard: emotion distribution chart (bar/pie)
- [ ] Admin dashboard: submission volume over time (line chart)
- [ ] Admin dashboard: campaign performance table (sent count per template)
- [ ] Admin dashboard: trend forecasting display (simple moving average, 7-day)
- [ ] Protect all /analytics/* endpoints behind Lambda Authorizer

---

## 🔧 Phase 4: Polish & Observability
- [ ] CloudWatch dashboard: Lambda errors, Rekognition latency, SES delivery rate
- [ ] SES domain verification — DKIM + SPF setup
- [ ] CloudWatch Alarms → SNS alert to team Slack
- [ ] Optional: A/B test scaffolding (same emotion, two offer variants)
- [ ] Optional: Email frequency cap (deduplication — max 1 email per address per 24h)

---

## Key Decisions Log

| Date | Decision | Reason |
|------|----------|--------|
| 2026-04-29 | EventBridge over direct S3→Lambda notification | Avoids cross-stack CDK circular dependency |
| 2026-04-29 | Analytics via DynamoDB query, not Kinesis/Firehose/Athena | Simpler, free-tier, professor said OK |
| 2026-04-29 | Admin auth via Lambda Authorizer + SSM, not Cognito | One admin user; Cognito overkill for semester project |
| 2026-04-29 | Tie-breaking: priority order list | Avoids 50/50 ambiguity; deterministic; configurable |
| 2026-04-29 | Webcam: face-api.js client-side overlay, Rekognition cloud-side | Client-side for low-cost overlay; Rekognition for accuracy |
| 2026-04-23 | SES only (no SMS/Pinpoint) | Cost and complexity not justified |
| 2026-04-23 | GitHub Actions + OIDC over CodePipeline | Team is GitHub-native; no stored AWS creds |
| 2026-04-23 | ap-southeast-1 region | Latency from PH; no data-residency constraints |
