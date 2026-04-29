# Roadmap — AWS Marketing AI

This file is the project's persistent working memory. Claude updates it at the end of every session that produces meaningful work or decisions. Read it at the start of every session, after `CLAUDE.md`.

**Update rules**:
- Move items between sections (Backlog → In progress → Done) as state changes.
- When a decision is made, log it under "Decisions" with the date and the reasoning.
- When something changes the plan, edit the affected phase rather than appending notes that contradict it.
- Always use absolute dates (YYYY-MM-DD), not "yesterday" or "next week".

---

## Current status

**Phase**: 2 — Polish & robustness
**Last updated**: 2026-04-29
**Next action**: DLQ replay handling; SES bounce/complaint handling; GitHub Actions + OIDC CI/CD pipeline.

---

## Resolved decisions (former blockers)

All open questions from bootstrap are now resolved — see Decisions log for details.

- [x] Primary AWS region: `ap-southeast-1`
- [x] Consent flow: personal project; brief in-context notice suffices, no formal opt-in required
- [x] Retention: raw images and emotion records deleted after **30 days** (S3 lifecycle rule + DynamoDB TTL)
- [x] Messaging channel: **email only** via SES; no SMS
- [x] Identity model: **email address provided at upload time** — no login, no loyalty ID
- [x] Project scope clarified: **web-only** (no mobile app, no kiosk); product name is **Satisfaction Meter**
- [x] CI/CD choice: **GitHub Actions + OIDC** (team familiarity with GitHub; OIDC avoids storing AWS credentials as secrets; CodePipeline adds cost and complexity not justified at this scale)

---

## Phases

### Phase 2 — Polish & robustness (in progress)

- [ ] Error handling: dead-letter queues on async Lambdas; SES bounce/complaint handling.
- [ ] Input validation: file type and size limits on presigned URL Lambda.
- [ ] SES domain verification and sending identity setup (DKIM, SPF).
- [ ] Basic CloudWatch dashboard: Lambda errors, Rekognition latency, SES delivery rate.
- [ ] CDK pipeline: GitHub Actions + OIDC (IAM role assumed via federated identity; no AWS secrets in GitHub).

### Phase 3 — Enhancements (optional / future)

- [ ] A/B test scaffolding — same emotion, two offer variants, measure open/click.
- [ ] Frequency cap — avoid emailing the same address more than once per N hours.
- [ ] Aggregate emotion analytics (counts by emotion over time, accessible via API or simple dashboard).
- [ ] Auth layer if the project ever becomes a demo shown to others.

---

## Decisions log

Record significant choices here with date and rationale. Future sessions will trust this log.

- **2026-04-29** — Used EventBridge (not direct S3 → Lambda notification) for the upload trigger.
  Reason: a direct `s3.addEventNotification` from `InferenceStack` to a bucket owned by
  `CaptureStack` creates a cross-stack circular dependency in CDK (CaptureStack would
  reference the Lambda ARN, while InferenceStack already references the bucket). Enabling
  `eventBridgeEnabled` on the bucket and creating the rule in `InferenceStack` keeps the
  dependency one-directional.
- **2026-04-25** — **AWS account structure**: Single shared account confirmed. 6 team members, each gets an IAM user with `AdministratorAccess` (CDK requires IAM role creation rights; trusted team members on a semester project makes the broad policy pragmatic). No multi-tenant isolation or separate dev/prod accounts.
- **2026-04-23** — **Semester final project** (not a long-running product). 12-month free tier cliffs (Rekognition, API Gateway) are not a concern. 30-day image retention and other production-like patterns are intentional — they demonstrate sound architectural judgement for grading, not operational necessity. Free-tier AWS account confirmed; KMS CMKs and Secrets Manager excluded (unavoidable monthly cost regardless of usage). Multiple end-users and multiple developers supported via shared account + IAM users.
- **2026-04-23** — CI/CD: **GitHub Actions + OIDC** over CodePipeline. Reasoning: team is GitHub-native; OIDC eliminates the need to store AWS credentials as secrets (IAM role assumed via federated identity); CodePipeline adds per-pipeline cost and complexity that isn't justified at personal-project scale.
- **2026-04-23** — Stack baseline set in `CLAUDE.md`: AWS-native, serverless-first, CDK in TypeScript, Rekognition for emotion detection. Pinpoint was the original plan but **replaced by SES** (transactional email only) given personal-project scope — Pinpoint adds cost and complexity that isn't justified without campaign journeys or A/B at scale.
- **2026-04-23** — Primary region set to `ap-southeast-1` (Singapore). No data-residency constraints; chosen for latency from the user's location.
- **2026-04-23** — Messaging channel: **email only via SES**. SMS and Pinpoint journeys are out of scope at this stage.
- **2026-04-23** — Identity model: **email address supplied at upload time**. No auth, no loyalty ID. Anonymous session with email as the only identity anchor needed to route the outbound message.
- **2026-04-23** — Retention policy: raw S3 images and DynamoDB emotion records expire after **30 days**. Implemented via S3 lifecycle rule + DynamoDB TTL attribute. This may be revisited — user flagged uncertainty; 30 days is a safe default.
- **2026-04-23** — Scope narrowed: **web-only** upload (no mobile app, no kiosk). Product renamed **Satisfaction Meter**. Core flow: upload photo + email → Rekognition detects emotion → SES sends tailored template → result saved to DynamoDB → retrievable via GET API.

---

## Done

- **2026-04-29** — Phase 0 + Phase 1 complete. CDK skeleton (4 stacks: Capture, Inference, Messaging, Api) scaffolded, TypeScript clean, deployed to `ap-southeast-1`. S3 bucket (SSE-S3, 30-day lifecycle, EventBridge enabled, public access blocked), DynamoDB (TTL + streams), all 4 Lambdas, API Gateway endpoints verified. Web upload page (`web/index.html` + `web/app.js`) built with presigned URL flow + polling. Full pipeline smoke-tested: upload → Rekognition DetectFaces → DynamoDB write → DynamoDB stream → SES send → GET /results.
