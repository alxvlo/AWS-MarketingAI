# Project State Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Audit and update `CLAUDE.md`, `docs/roadmap.md`, and the Jira board so every file reflects current project decisions — specifically the domain acquisition (`satisfactionmeter.live`), SES production-access pursuit, CloudFront deployment completion, ACM cert cross-region requirement, and the retirement of the Vercel plan.

**Architecture:** No infrastructure changes — this plan is documentation-only. Each task targets a specific file or external system, makes a targeted edit, and verifies the change is accurate before committing.

**Tech Stack:** Text editor, git CLI, AWS CLI (read-only checks), Jira web UI

---

## File Map

| File | Action | Reason |
|------|--------|--------|
| `CLAUDE.md` | Modify | Messaging bullet still says "sandbox mode, no domain" — outdated since `satisfactionmeter.live` was acquired |
| `CLAUDE.md` | Modify | No mention of the domain name or ACM us-east-1 cross-region requirement |
| `docs/roadmap.md` | Modify | Key Decisions row for SES sandbox is stale; add new rows for domain, ACM, production access |
| `docs/roadmap.md` | Modify | Phase 2E and pending domain/SES tasks need to be reflected |
| Jira | Update | Tickets referencing sandbox-only SES, and the CloudFront plan need status updates; new tickets for SES domain verification and ACM cert |

---

### Task 1: Audit current state of CLAUDE.md

**Files:**
- Read: `CLAUDE.md`

- [ ] **Step 1: Identify every stale or missing fact**

  Read `CLAUDE.md` top to bottom and mark each line that no longer matches reality. The known gaps (from conversation history) are:

  | Section | Stale text | What's true now |
  |---------|-----------|----------------|
  | Messaging bullet | `sandbox mode — no domain purchase, no production access request` | Domain `satisfactionmeter.live` acquired; production access request submitted/in-progress |
  | Messaging bullet | no mention of domain | Domain: `satisfactionmeter.live`, sender: `noreply@satisfactionmeter.live` |
  | IaC bullet | lists stacks: `capture`, `inference`, `messaging`, `api`, `analytics`, `web` | Already correct — `web` stack is there |
  | Region bullet | "No cross-region resources unless explicitly decided" | ACM cert in `us-east-1` is an approved cross-region exception for CloudFront |
  | No Cloudfront URL mentioned | — | CloudFront URL is `d1d3rdsk86mn4b.cloudfront.net` |

- [ ] **Step 2: Draft the exact replacement text for each stale line (do not edit yet)**

  Write out the new text in scratch notes so edits in Task 2 are clean and intentional.

---

### Task 2: Apply CLAUDE.md edits

**Files:**
- Modify: `CLAUDE.md` (Messaging bullet, Region bullet, optionally Frontend hosting bullet)

- [ ] **Step 1: Update the Messaging bullet**

  Replace:
  ```
  **Messaging**: **SES only** (transactional email), **sandbox mode** — no domain purchase, no production access request. Sending is limited to manually verified email addresses in the SES console.
  ```

  With:
  ```
  **Messaging**: **SES only** (transactional email). Domain `satisfactionmeter.live` acquired; sender address is `noreply@satisfactionmeter.live` (verified in SES). SES production access request submitted — pending AWS approval. Until approved, sending is limited to manually verified recipient addresses. Pinpoint, SNS, and SMS are out of scope. Emotion → template mapping: happy → review request, sad → voucher, neutral → general offer.
  ```

- [ ] **Step 2: Update the Region bullet to call out the ACM exception**

  Append to the Region bullet:
  ```
  Exception: ACM certificate for CloudFront must be in `us-east-1` (CloudFront requirement) — the cert ARN `arn:aws:acm:us-east-1:860550672813:certificate/<id>` is the single approved cross-region resource.
  ```

  *(Fill in the actual certificate ID once the cert is issued.)*

- [ ] **Step 3: Update the Frontend hosting bullet to include the live CloudFront URL**

  Append to the Frontend hosting bullet:
  ```
  Live CloudFront URL: `d1d3rdsk86mn4b.cloudfront.net`. Custom domain (`satisfactionmeter.live` or a subdomain) is a pending optional follow-up pending ACM cert issuance.
  ```

- [ ] **Step 4: Re-read the entire CLAUDE.md to confirm no other stale facts remain**

- [ ] **Step 5: Commit**

  ```bash
  git add CLAUDE.md
  git commit -m "docs: sync CLAUDE.md — domain acquisition, SES production access, ACM exception"
  ```

---

### Task 3: Audit current state of docs/roadmap.md

**Files:**
- Read: `docs/roadmap.md`

- [ ] **Step 1: Identify stale Key Decisions rows**

  The known stale row:

  | Date | Row | Problem |
  |------|-----|---------|
  | 2026-05-01 | "SES stays in sandbox mode — no domain" | Domain was acquired; decision reversed |

- [ ] **Step 2: Identify missing Key Decisions**

  These decisions happened but are not in the log:

  | Decision | Date | Reason |
  |----------|------|--------|
  | Domain `satisfactionmeter.live` acquired at name.com | 2026-05-02 | Enables SES production access and custom CloudFront domain |
  | SES production access request submitted | 2026-05-02 | Removes manually-verified-only constraint once approved |
  | ACM cert requested in us-east-1 (not ap-southeast-1) | 2026-05-02 | CloudFront mandates certs in us-east-1 regardless of app region |
  | DNS validation confirmed live for ACM cert | 2026-05-02 | nslookup confirmed `satisfactionmeter.live` resolves to `acm-validations.aws` |

- [ ] **Step 3: Identify missing Phase 2E tasks**

  Phase 2E currently shows as complete except for two items. Pending tasks not yet tracked:
  - Add DKIM CNAMEs at name.com for SES domain verification
  - Verify sender `noreply@satisfactionmeter.live` in SES console
  - Attach ACM cert to CloudFront distribution once cert is issued
  - Optional: configure custom domain alias on CloudFront (`satisfactionmeter.live` or subdomain)

---

### Task 4: Apply roadmap.md edits

**Files:**
- Modify: `docs/roadmap.md`

- [ ] **Step 1: Strike and replace the stale SES sandbox Key Decisions row**

  Replace:
  ```
  | 2026-05-01 | SES stays in sandbox mode (no production access) | Production access requires a verified domain; not purchasing a domain for a semester project. Sandbox is sufficient — all demo recipients will be manually verified in the SES console. |
  ```

  With:
  ```
  | 2026-05-01 | SES sandbox — prior decision | Was: no domain, sandbox only. **Superseded 2026-05-02** by domain acquisition. See rows below. |
  | 2026-05-02 | Domain `satisfactionmeter.live` acquired at name.com | Enables SES production access request and optional CloudFront custom domain |
  | 2026-05-02 | SES production access request submitted | Removes manually-verified-only limit once AWS approves (~24-48h). Sender: `noreply@satisfactionmeter.live` |
  | 2026-05-02 | ACM cert requested in `us-east-1` (not ap-southeast-1) | CloudFront requires certs in us-east-1 regardless of app region — single approved cross-region resource |
  | 2026-05-02 | DNS validation for ACM cert confirmed live | nslookup confirmed CNAME resolves to `acm-validations.aws`; cert should auto-issue shortly |
  ```

- [ ] **Step 2: Add pending domain/SES tasks to Phase 2E**

  Append to the Phase 2E checklist (after the existing items):
  ```markdown
  - [ ] Add 3 DKIM CNAMEs at name.com for SES domain verification (`satisfactionmeter.live`)
  - [ ] Verify sender email `noreply@satisfactionmeter.live` in SES console (ap-southeast-1)
  - [ ] Confirm SES production access approval from AWS (24-48h after request)
  - [ ] Attach ACM cert (us-east-1) to CloudFront distribution in WebStack CDK once cert is issued
  - [ ] (Optional) Configure custom domain alias on CloudFront — `satisfactionmeter.live` or subdomain
  ```

- [ ] **Step 3: Update the roadmap header "Last updated" date to 2026-05-02**

  Already correct based on current file — verify it matches.

- [ ] **Step 4: Commit**

  ```bash
  git add docs/roadmap.md
  git commit -m "docs: sync roadmap — reverse SES sandbox decision, add domain/ACM entries"
  ```

---

### Task 5: Verify no orphaned plan docs exist

**Files:**
- Check: `docs/vercel-deployment-plan.md` (should be gone — superseded by cloudfront plan)
- Check: `docs/cloudfront-deployment-plan.md` (should exist and be accurate)

- [ ] **Step 1: Confirm vercel-deployment-plan.md is deleted**

  Run:
  ```bash
  ls docs/
  ```

  Expected: `vercel-deployment-plan.md` does NOT appear. If it does exist, delete it:
  ```bash
  git rm docs/vercel-deployment-plan.md
  git commit -m "docs: remove stale vercel deployment plan"
  ```

- [ ] **Step 2: Scan cloudfront-deployment-plan.md for stale content**

  Read `docs/cloudfront-deployment-plan.md` and flag any tasks that are marked open but are actually complete (Task 2 — static export config — is already done per the previous session).

- [ ] **Step 3: Mark completed tasks in the CloudFront plan**

  Update `docs/cloudfront-deployment-plan.md` checkboxes to reflect:
  - Task 2 (static export config): done ✅
  - Task 2E checklist items that are done per `docs/roadmap.md`

- [ ] **Step 4: Commit if any changes were made**

  ```bash
  git add docs/cloudfront-deployment-plan.md
  git commit -m "docs: mark completed CloudFront plan tasks"
  ```

---

### Task 6: Update Jira board

This task is **manual** — Claude cannot log into Jira directly. These are the exact changes to make in the Jira UI.

**Files:**
- External: Jira project board (AWS-* tickets)

- [ ] **Step 1: Update SES sandbox ticket (AWS-48 — SES bounce/complaint handling)**

  - Add comment: "Prior scope was sandbox-only. Domain `satisfactionmeter.live` acquired 2026-05-02. Production access request submitted. Once approved, update this ticket to cover bounce/complaint webhooks for real recipients."
  - Change label or tag from "sandbox" to "production-pending" if your board has labels.

- [ ] **Step 2: Create new Jira ticket — SES domain verification**

  ```
  Title: AWS-NEW: Verify satisfactionmeter.live domain in SES + add DKIM CNAMEs
  Type: Task
  Priority: High
  Description:
    Add 3 DKIM CNAME records at name.com (generated by SES Easy DKIM for ap-southeast-1).
    Verify sender noreply@satisfactionmeter.live in SES console.
    Confirm domain status shows "Verified" in SES console.
  Acceptance criteria:
    - SES console shows satisfactionmeter.live as "Verified"
    - noreply@satisfactionmeter.live shows as "Verified"
    - Test email sends successfully from the address
  ```

- [ ] **Step 3: Create new Jira ticket — ACM cert + CloudFront custom domain**

  ```
  Title: AWS-NEW: Attach ACM cert to CloudFront and configure custom domain alias
  Type: Task
  Priority: Medium
  Description:
    Once ACM cert in us-east-1 is issued (DNS validation live), update WebStack CDK to:
    - Add the cert ARN to the CloudFront distribution
    - Add satisfactionmeter.live (or app.satisfactionmeter.live) as a CloudFront alias
    - Add CNAME at name.com pointing to d1d3rdsk86mn4b.cloudfront.net
    Run: cdk deploy WebStack --profile <profile>
    Smoke test: https://satisfactionmeter.live returns the Next.js app.
  Acceptance criteria:
    - HTTPS works on custom domain
    - Redirect http → https
    - No browser cert warnings
  ```

- [ ] **Step 4: Create new Jira ticket — SES production access tracking**

  ```
  Title: AWS-NEW: SES production access approval (track AWS response)
  Type: Task / Epic
  Priority: High
  Description:
    Request submitted ~2026-05-02. AWS typically responds within 24-48h.
    Once approved:
    - Update CLAUDE.md to remove "pending approval" caveat
    - Update roadmap.md Key Decisions to log approval date
    - Remove manual recipient pre-verification requirement from demo runbook
  Acceptance criteria:
    - AWS Support case closed with "approved"
    - SES account dashboard shows "Production access" (not sandbox)
    - Send test email to unverified address succeeds
  ```

- [ ] **Step 5: Update the CloudFront deployment ticket if one exists**

  Find any ticket tracking Phase 2E / CloudFront deployment. Add a comment:
  "Phase 2E core tasks complete. Remaining: custom domain attachment (pending ACM cert), DKIM verification, SES production approval."

---

### Task 7: Final cross-check

- [ ] **Step 1: Read CLAUDE.md and roadmap.md one more time**

  Confirm every known decision from the session history is captured:
  - [x] CloudFront hosting live at `d1d3rdsk86mn4b.cloudfront.net`
  - [x] Domain `satisfactionmeter.live` acquired
  - [x] SES production access requested
  - [x] ACM cert in us-east-1 (cross-region exception noted)
  - [x] DNS validation confirmed live
  - [x] Vercel plan retired
  - [x] `frontend/lib/api.ts` uses env vars (`NEXT_PUBLIC_*`)
  - [x] `.env.example` created and `.env.local` gitignored

- [ ] **Step 2: Confirm git status is clean**

  ```bash
  git status
  git log --oneline -5
  ```

  Expected: working tree clean, recent commits match the edits made in tasks 2, 4, 5.

---

## Open Questions

Answer these to enhance the plan before execution:

1. **SES production access:** Has the request already been submitted to AWS, or is it still pending submission? If submitted, what is the AWS Support case number?

2. **DKIM CNAMEs:** Have the 3 DKIM CNAME records been added at name.com yet? If not, do you need the exact Host/Answer values from SES, or do you already have them?

3. **ACM cert status:** Is the cert in `us-east-1` showing "Issued" yet in the AWS console, or still "Pending validation"? What is the final cert ARN (`arn:aws:acm:us-east-1:860550672813:certificate/<id>`)?

4. **Custom domain preference:** Do you want the site accessible at the apex domain `satisfactionmeter.live`, or a subdomain like `app.satisfactionmeter.live`? (Apex needs Route 53 or ALIAS support at name.com; subdomain is a simpler CNAME.)

5. **Jira board access:** Do you have a Jira project URL / board name I can reference in the plan? The current plan references tickets as `AWS-*` — is that the actual Jira project key?

6. **SES bounce handling (AWS-48):** Now that you have a real domain and are pursuing production access, do you want to add SES bounce/complaint webhooks (SNS → Lambda) to the roadmap as a real task, or keep it deprioritized?

7. **CloudFront CORS tightening:** The plan mentions optionally tightening API Gateway + S3 image bucket CORS from `*` to the CloudFront origin. Should this be added as a concrete roadmap task, or remain optional?

8. **Roadmap phase:** Should SES production access and the custom domain work be captured as Phase 2F (still in the "Core Improvements" phase), or promoted to a standalone Phase 2.5 / Phase 5?

## Answers
1. the request has been submitted and is currently pending approval.

2. the dkim cname has been added to name.com and the domain is now working as intended, including the custom domain. 

3. the acm certificate is now issued and working

4. i would like the site to be accessible at the apex domain satisfactionmeter.live

5. this is the jira board: https://alexvelo799.atlassian.net/jira/software/projects/AWS/boards/36?atlOrigin=eyJpIjoiOWRlMTlkOWUyNGJiNGFlOGFlZjg0YTVhYzQwYWFjMzgiLCJwIjoiaiJ9

6. i would like to add ses bounce/complaint webhooks to the roadmap as a real task.

7. i would like to add cloudfront cors tightening to the roadmap as a real task.

8. their already done, so still make them tickets but make them done