# Roadmap — AWS Marketing AI

This file is the project's persistent working memory. Claude updates it at the end of every session that produces meaningful work or decisions. Read it at the start of every session, after `CLAUDE.md`.

**Update rules**:
- Move items between sections (Backlog → In progress → Done) as state changes.
- When a decision is made, log it under "Decisions" with the date and the reasoning.
- When something changes the plan, edit the affected phase rather than appending notes that contradict it.
- Always use absolute dates (YYYY-MM-DD), not "yesterday" or "next week".

---

## Current status

**Phase**: 0 — Project bootstrap
**Last updated**: 2026-04-23
**Next action**: Initialize CDK app skeleton and stand up Phase 0 infrastructure (S3 bucket + KMS key).

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

### Phase 0 — Bootstrap (in progress)

- [x] Create `CLAUDE.md` and `roadmap.md`.
- [x] Resolve all project open questions (2026-04-23).
- [ ] Decide on AWS account structure (single account is fine for a personal project — confirm).
- [ ] Initialize CDK app skeleton (TypeScript) in `ap-southeast-1` with stacks: `capture`, `inference`, `messaging`, `api`.
- [ ] Set up local dev tooling (Node, AWS CLI v2, CDK, AWS profile for ap-southeast-1).
- [ ] Stand up S3 bucket (SSE-S3 encryption, 30-day lifecycle expiry). No KMS CMK — cost excluded.

### Phase 1 — End-to-end thin slice

Goal: one image uploaded via web → emotion detected → tailored email sent → result saved and retrievable via GET API.

- [ ] API Gateway + Lambda: generate presigned S3 PUT URL (accepts `email` + `contentType` in request body; returns `submissionId` + presigned URL).
- [ ] Web upload page: minimal HTML/JS form — email field, file picker, calls presigned URL endpoint, uploads directly to S3.
- [ ] S3 → Lambda (event trigger): calls Rekognition `DetectFaces`, extracts dominant emotion, writes result to DynamoDB (`capture` table, 30-day TTL).
- [ ] Emotion → template map (start with 5: `happy` → review request, `sad` → voucher, `surprised` → flash deal, `angry` → apology + discount, `neutral` → general offer). Templates stored as SES templates or inline in Lambda env.
- [ ] SES send Lambda: receives emotion + email, dispatches appropriate template, writes `emailSentAt` and `templateUsed` back to DynamoDB.
- [ ] GET `/results/{submissionId}` endpoint: returns stored emotion result + email status from DynamoDB.
- [ ] Smoke test: upload sample image → confirm DynamoDB record written and email dispatched within 5s.

### Phase 2 — Polish & robustness

- [ ] Error handling: dead-letter queues on async Lambdas; SES bounce/complaint handling.
- [ ] Input validation: file type and size limits on presigned URL Lambda.
- [ ] SES domain verification and sending identity setup (DKIM, SPF).
- [ ] Basic CloudWatch dashboard: Lambda errors, Rekognition latency, SES delivery rate.
- [ ] CDK pipeline (CodePipeline or GitHub Actions + OIDC — resolve CI/CD choice first).

### Phase 3 — Enhancements (optional / future)

- [ ] A/B test scaffolding — same emotion, two offer variants, measure open/click.
- [ ] Frequency cap — avoid emailing the same address more than once per N hours.
- [ ] Aggregate emotion analytics (counts by emotion over time, accessible via API or simple dashboard).
- [ ] Auth layer if the project ever becomes a demo shown to others.

---

## Decisions log

Record significant choices here with date and rationale. Future sessions will trust this log.

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

Nothing here yet — move items from Phase sections as they complete.
