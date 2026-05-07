# Plan — Fix Silent Suppression Hang Bug

**Date:** 2026-05-07
**Status:** PROPOSED — awaiting approval before any code change
**Scope:** Backend (2 Lambdas + 1 CDK stack — drops `EmailFrequencyCapTable`) + frontend (2 files + Next.js build config)
**Estimated effort:** ~90 min from approval to verified live fix
**Authors:** Drafted with Claude Code; reviewed by Keith
**Revision history:**
- v1 (initial): Patched freq-cap path to surface suppression in UI; kept the cap intact
- v2 (current): Removes the freq cap entirely after user confirmed: only 1 verified SES recipient, no production access, demo needs many successful sends per session

---

## TL;DR

The browser appears stuck in an infinite polling loop after photo upload. It's not actually infinite — it's a bounded 20-attempt poll whose exit condition (`emailSentAt`) is **never** satisfied, because the SendEmail Lambda's frequency-cap path silently `continue`s without writing anything back to DynamoDB. The same hang pattern exists in two other Lambda code paths (no_face_detected, invalid_file), making this a *class of bugs*, not a single instance.

This plan:
1. **Removes the 24h email frequency cap entirely** (and the `EmailFrequencyCapTable` it depends on) — needed because we have only 1 verified SES recipient (`alexvelo199@gmail.com`), no SES production access yet, and a demo workflow that requires many successful sends to that one address per session.
2. **Closes the silent-hang class of bugs** by making every Lambda skip path write a terminal-state breadcrumb the frontend can detect.
3. **Unblocks the broken `frontend-deploy.yml`** so the frontend changes can actually reach `satisfactionmeter.live`.

---

## 1. Problem statement

### 1.1 Symptom (what the user sees)

After photo upload completes (`PUT` to S3 succeeds, HTTP 200), the UI stays on **"Sending… / Waiting for emotion detection and email dispatch…"** indefinitely. DevTools Network tab shows ~20 sequential `GET /results/{submissionId}` calls, all returning HTTP 200 with `~0.7 kB` payloads, spaced roughly 1.5s apart. After ~30s+ the polling throws `"Timed out waiting for emotion detection and email send."` and the UI shows a generic error.

The user describes this as "infinite loop or recursion." It is technically a bounded loop, but the *exit condition is unsatisfiable* given the backend state.

### 1.2 Evidence (verified live, 2026-05-07)

DynamoDB submission record `0e446723-05da-40e4-b442-661544802ff7` (one of the user's test submissions):

```json
{
  "submissionId": "0e446723-05da-40e4-b442-661544802ff7",
  "email": "alexvelo199@gmail.com",
  "dominantEmotion": "calm",
  "emotionScores": { "calm": 98.6, "angry": 0.53, ... },
  "status": "emotion_detected",
  "timestamp": "2026-05-07T02:45:30.580Z"
  // NOTE: emailSentAt is missing
  // NOTE: templateUsed is missing
}
```

EmailFrequencyCapTable entry for `alexvelo199@gmail.com`:

```json
{
  "email": "alexvelo199@gmail.com",
  "sentAt": "2026-05-06T14:06:10.084Z",
  "ttl":   1778162770   // → 2026-05-07T14:06:10Z (still active for ~11h)
}
```

CloudWatch SendEmail Lambda logs show:
```
2026-05-07T02:02:57Z  event=email_suppressed_freq_cap  submissionId=943132f0...  emailMasked=al***@gmail.com
2026-05-07T02:45:39Z  event=email_suppressed_freq_cap  submissionId=0e446723...  emailMasked=al***@gmail.com
```

### 1.3 Root cause (single sentence)

The SendEmail Lambda's frequency-cap check at [`lambdas/send-email/index.ts:108-117`](../lambdas/send-email/index.ts#L108-L117) `continue`s without writing any terminal-state back to the submission record, and the frontend's polling helper at [`frontend/lib/api.ts:87-101`](../frontend/lib/api.ts#L87-L101) only exits on `data.emailSentAt`, so the browser polls until 20-attempt timeout.

### 1.4 The freq-cap was the trigger; the silent-hang is a class of bugs

| Trigger | Backend writes | Frontend behavior | After this plan |
|---|---|---|---|
| ✅ Happy path (email sent) | `status='email_sent'` + `emailSentAt` | Returns to UI ✅ | Unchanged |
| ⚠️ Freq cap hit (today's report) | nothing | Hangs until 20-attempt timeout | **Trigger removed** — cap deleted entirely (see Stage 1B) |
| ⚠️ Rekognition: no face | `dominantEmotion='no_face_detected'`, but `status='emotion_detected'` (misleading) | Hangs until timeout | Inference writes correct `status='no_face_detected'`; frontend exits polling and shows amber message |
| ⚠️ File invalid (wrong type / >5MB) | `dominantEmotion='invalid_file'`, but `status='emotion_detected'` (misleading) | Hangs until timeout | Inference writes correct `status='invalid_file'`; frontend exits polling and shows red message |
| ⚠️ SES failure | Step A writes `emailSentAt`; catch sets `status='email_failed'` | Surfaces (kind of) | Polling exits cleanly on `status='email_failed'`; UX shows red error message |

**Key insight:** removing the freq cap eliminates today's specific trigger, but the *silent-hang class* would still exist for the no_face / invalid_file paths. So this plan does both: removes the cap AND closes the rest of the hang class.

---

## 2. Files involved (the cast)

| Layer | File | Role in the bug |
|---|---|---|
| Frontend | [`frontend/components/WebcamFeed.tsx`](../frontend/components/WebcamFeed.tsx) | Snaps photo, calls `submitPhoto` |
| Frontend | [`frontend/lib/api.ts`](../frontend/lib/api.ts) | Contains the polling loop with the unsatisfiable exit condition |
| Frontend | [`frontend/app/admin/page.tsx`](../frontend/app/admin/page.tsx) | Admin audit table — needs to know about new statuses |
| Frontend config | [`frontend/next.config.ts`](../frontend/next.config.ts) | Currently breaks the production build (P0-1 blocker) |
| Frontend dev-only | [`frontend/app/api/admin/submissions/route.ts`](../frontend/app/api/admin/submissions/route.ts) | The `force-dynamic` route incompatible with `output: 'export'` |
| Backend | [`lambdas/inference/index.ts`](../lambdas/inference/index.ts) | Writes misleading `status='emotion_detected'` even for no-face / invalid-file |
| Backend | [`lambdas/send-email/index.ts`](../lambdas/send-email/index.ts) | The silent freq-cap `continue` — entire freq-cap block being removed |
| Backend infra | [`lib/messaging-stack.ts`](../lib/messaging-stack.ts) | Owns the `EmailFrequencyCapTable` being removed and the env var wiring |
| AWS state | DynamoDB `EmailFrequencyCapTable` row for `alexvelo199@gmail.com` | The currently-blocking entry (will be irrelevant after Stage 1B redeploys without the table) |

---

## 3. Stages

### Stage 0 — Optional immediate unblock (no code, 1 CLI call)

**Goal:** Allow live testing right now without waiting for the cap-removal deploy in Stage 1B.

**When to use:** Only if you want to verify the *current* (pre-fix) deployed pipeline before pushing the cap removal. After Stage 1B deploys, the table will be destroyed entirely and this stage becomes irrelevant.

**Action:**
```bash
aws dynamodb delete-item \
  --table-name SatisfactionMeterMessaging-EmailFrequencyCapTableCD467663-FA1M3VUCO6UT \
  --key '{"email":{"S":"alexvelo199@gmail.com"}}'
```

**Why this is safe — but DON'T delete the table itself directly:**
- Deleting the row removes one stale entry; the table and Lambda still work normally.
- Deleting the *table* via CLI (instead of via Stage 1B's CDK redeploy) would cause `SendEmail.GetCommand` to throw `ResourceNotFoundException` on every invocation until the Lambda code is also updated. That's a broken state in production.
- The right way to *remove the cap entirely* is the coordinated CDK change in Stage 1B: code + infra updated together, atomically.

**Effect:** Next submission with `alexvelo199@gmail.com` goes through SES normally. After Stage 1B ships, the table is destroyed and no entries can ever block again.

**Reversibility:** None needed — the row would be re-written automatically the next time an email actually sends to this address. (Moot after Stage 1B.)

---

### Stage 1 — Backend Lambda fixes (2 files)

**Goal:** Every Lambda code path that exits without sending an email must leave a terminal-state breadcrumb in the submission record.

#### 1A. [`lambdas/inference/index.ts`](../lambdas/inference/index.ts) — write honest status names

**Problem:** When Rekognition detects no face, the Lambda writes `dominantEmotion='no_face_detected'` AND `status='emotion_detected'` — the status field is a lie. Same for `invalid_file`. The admin UI's `STATUS_BADGE` already declares these statuses ([admin/page.tsx:30-37](../frontend/app/admin/page.tsx#L30-L37)) but no code ever writes them.

**Change to `writeResult` helper (around line 83):**
```ts
async function writeResult(
  submissionId: string,
  dominantEmotion: string,
  emotionScores: Record<string, number>,
  status: string = 'emotion_detected',     // ← new param, defaults to current behavior
) {
  await ddb.send(new UpdateCommand({
    TableName: TABLE_NAME,
    Key: { submissionId },
    UpdateExpression: 'SET dominantEmotion = :e, emotionScores = :s, #st = :status',
    ExpressionAttributeNames: { '#st': 'status' },
    ExpressionAttributeValues: {
      ':e': dominantEmotion,
      ':s': emotionScores,
      ':status': status,                    // ← uses caller-supplied status
    },
  }));
}
```

**Update the two callers:**
- Line 48 (invalid file): `await writeResult(submissionId, 'invalid_file', {}, 'invalid_file');`
- Line 61 (no face detected): `await writeResult(submissionId, 'no_face_detected', {}, 'no_face_detected');`
- Line 76 (happy path): unchanged — still uses default `'emotion_detected'`

**Why:** The DB row now reflects reality. Frontend can branch on `status`. Admin badges will finally light up correctly.

#### 1B. Remove the email frequency cap entirely (Lambda + CDK + table)

**Why this approach over a "make it suppress gracefully" approach:**
- Only 1 verified SES recipient (`alexvelo199@gmail.com`) — SES production access still pending after 5 days
- Demo workflow needs many successful sends to that one address per session
- Roadmap line 102 explicitly marks the freq cap as **OPTIONAL** (Phase 4 polish)
- Keeping the cap and only making suppression "visible" still leaves you with 1 successful demo send per day — not viable

**Files affected:**
- [`lambdas/send-email/index.ts`](../lambdas/send-email/index.ts) — strip cap-check block + cap-write block + constants + env var read
- [`lib/messaging-stack.ts`](../lib/messaging-stack.ts) — remove `EmailFrequencyCapTable` resource + its grants + its env var wiring

**Change 1 — `lambdas/send-email/index.ts`:**

Remove the freq-cap constants (around lines 13-16):
```ts
// DELETE these two lines:
const FREQ_CAP_TABLE_NAME = process.env.FREQ_CAP_TABLE_NAME!;
const FREQ_CAP_SECONDS = 24 * 60 * 60;
```

Remove the imports that become unused:
```ts
// Before:
import { DynamoDBDocumentClient, UpdateCommand, PutCommand, GetCommand } from '@aws-sdk/lib-dynamodb';

// After (drop GetCommand if no longer used elsewhere — verify):
import { DynamoDBDocumentClient, UpdateCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
```

Remove the entire freq-cap check block (lines 108-117):
```ts
// DELETE this entire block:
const capCheck = await ddb.send(new GetCommand({
  TableName: FREQ_CAP_TABLE_NAME,
  Key: { email },
}));
if (capCheck.Item) {
  log('INFO', 'send-email', 'email_suppressed_freq_cap', submissionId, {
    emailMasked: email.replace(/(.{2}).+(@.+)/, '$1***$2'),
  });
  continue;
}
```

Remove the freq-cap PUT in Step C (lines 178-185):
```ts
// In the Promise.all([...]) of Step C, DELETE this PutCommand:
ddb.send(new PutCommand({
  TableName: FREQ_CAP_TABLE_NAME,
  Item: {
    email,
    sentAt,
    ttl: Math.floor(Date.now() / 1000) + FREQ_CAP_SECONDS,
  },
})),
```

The remaining `Promise.all` after removal will have 2 commands (submissions update + campaigns put) instead of 3.

**Change 2 — `lib/messaging-stack.ts`:**

Remove the freq-cap table creation (lines 33-38):
```ts
// DELETE this entire block:
const freqCapTable = new dynamodb.Table(this, 'EmailFrequencyCapTable', {
  partitionKey: { name: 'email', type: dynamodb.AttributeType.STRING },
  billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
  timeToLiveAttribute: 'ttl',
  removalPolicy: cdk.RemovalPolicy.DESTROY,
});
```

Remove the env var wiring in the Lambda definition (line 52):
```ts
// In `environment: { ... }`, DELETE this line:
FREQ_CAP_TABLE_NAME: freqCapTable.tableName,
```

Remove the IAM grant (line 58):
```ts
// DELETE this line:
freqCapTable.grantReadWriteData(sendEmailFn);
```

**Deploy ordering (CloudFormation handles this atomically):**
1. CDK synth produces the new template (Lambda code updated, table removed from template)
2. CloudFormation updates the Lambda function first (new code that doesn't reference the table)
3. CloudFormation then destroys the now-orphaned `EmailFrequencyCapTable`
4. No window where Lambda code references a non-existent table

**Data loss:** The `EmailFrequencyCapTable` data is just dedup state — no historical or audit value. Safe to discard. (`removalPolicy: DESTROY` is already set on the table, so CDK won't refuse.)

#### Net diff for Stage 1
~50 lines deleted across 2 files (mostly net negative — removing code is the cleanest fix). One new optional 4th arg to `writeResult` in inference Lambda. No new IAM, no new resources. One DynamoDB table is destroyed.

---

### Stage 2 — Unblock the broken `frontend-deploy.yml` (P0-1)

**Goal:** Make sure the Stage 3 frontend changes can actually reach `satisfactionmeter.live`.

**Background:** Since 2026-05-06 13:31Z, every push to `frontend/**` has failed CI with:
```
Error: export const dynamic = "force-dynamic" on page "/api/admin/submissions"
       cannot be used with "output: export"
Failed to collect page data for /api/admin/submissions
Process completed with exit code 1
```
Cause: [`frontend/next.config.ts`](../frontend/next.config.ts) has `output: 'export'` (static site), but [`frontend/app/api/admin/submissions/route.ts`](../frontend/app/api/admin/submissions/route.ts) declares `export const dynamic = 'force-dynamic'` (server-side route). Next.js refuses to build.

**Per the 2026-05-07 admin-direction decision:** the admin route is dev-only. Production build should not include it.

#### Recommended approach: `pageExtensions` + file rename

**1. Rename:**
```
frontend/app/api/admin/submissions/route.ts
                       ↓
frontend/app/api/admin/submissions/route.dev.ts
```

**2. Update [`frontend/next.config.ts`](../frontend/next.config.ts):**
```ts
import type { NextConfig } from 'next';
import path from 'path';

const isDev = process.env.NODE_ENV === 'development';

const nextConfig: NextConfig = {
  output: 'export',
  trailingSlash: true,
  images: { unoptimized: true },
  // Production build: only `.ts/.tsx` count as routes — `.dev.ts` files are ignored.
  // Dev mode (`next dev`): include `.dev.ts/.dev.tsx` so the admin API route works.
  pageExtensions: isDev
    ? ['ts', 'tsx', 'dev.ts', 'dev.tsx']
    : ['ts', 'tsx'],
  turbopack: { root: path.resolve(__dirname) },
};

export default nextConfig;
```

**Why this works:** Next.js's `pageExtensions` config controls which file extensions are scanned as routes. Restricting production to `.ts/.tsx` makes the `route.dev.ts` invisible to the build. `next dev` automatically sets `NODE_ENV='development'`, so the dev route is picked up locally.

**Verify locally before pushing:**
```bash
cd frontend
npm run build      # must succeed (will fail right now)
npm run dev        # admin should still work at http://localhost:3000/admin/
```

---

### Stage 3 — Frontend polling + UX (3 files)

**Goal:** Browser exits polling on ANY terminal status; UI shows the right message per status.

#### 3A. [`frontend/lib/api.ts`](../frontend/lib/api.ts) — terminal-status-aware polling

**Add at top of file:**
```ts
const TERMINAL_STATUSES = new Set([
  'email_sent',          // happy path
  'email_failed',        // SES error path (Step A claim already set emailSentAt; status set in catch)
  'no_face_detected',    // Rekognition didn't find a face (Stage 1A writes this)
  'invalid_file',        // post-upload file rejection (Stage 1A writes this)
]);
```

**Note:** `email_suppressed` is NOT in this list because the freq cap is being removed in Stage 1B. If we ever re-add a cap (e.g. once SES production access lands), add `email_suppressed` here at the same time.

**Update `SubmissionResult` type to include `status`:**
```ts
export interface SubmissionResult {
  submissionId: string;
  email: string;
  status: string;                    // ← add this
  dominantEmotion: string;
  emotionScores: Record<string, number>;
  emailSentAt: string;
  templateUsed: string;
  timestamp: string;
}
```

**Replace the polling exit condition:**
```ts
export async function pollResult(
  submissionId: string,
  attempts = 20,
  intervalMs = 1500
): Promise<SubmissionResult> {
  for (let i = 0; i < attempts; i++) {
    const res = await fetch(`${RESULTS_API}/${submissionId}`);
    if (res.ok) {
      const data = (await res.json()) as SubmissionResult;
      // Exit on emailSentAt (legacy success signal) OR any terminal status.
      if (data.emailSentAt || TERMINAL_STATUSES.has(data.status)) {
        return data;
      }
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error('Analysis took longer than expected. Please try again.');
}
```

#### 3B. [`frontend/components/WebcamFeed.tsx`](../frontend/components/WebcamFeed.tsx) — status-aware result panel

The current "Analysis complete" panel appears in two places (camera mode lines 395-402, upload mode lines 489-496) and assumes `email_sent`. Extract a single `ResultPanel` component that switches on status:

```tsx
function ResultPanel({ result }: { result: SubmissionResult }) {
  switch (result.status) {
    case 'email_sent':
      return (
        <div className="mt-3 rounded-lg border border-green-200 bg-green-50 p-4 text-sm">
          <p className="font-semibold text-green-700 mb-1">✓ Analysis complete</p>
          <p className="text-slate-700">Emotion detected: <span className="font-medium capitalize">{result.dominantEmotion}</span></p>
          <p className="text-slate-700">Email sent: <span className="font-medium">{new Date(result.emailSentAt).toLocaleTimeString()}</span></p>
        </div>
      );

    case 'no_face_detected':
      return (
        <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm">
          <p className="font-semibold text-amber-700 mb-1">No face detected</p>
          <p className="text-slate-700">We couldn't find a face in your photo. Try retaking with better lighting.</p>
        </div>
      );

    case 'invalid_file':
      return (
        <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-4 text-sm">
          <p className="font-semibold text-red-700 mb-1">Invalid file</p>
          <p className="text-slate-700">The uploaded file wasn't a valid JPEG/PNG/WebP under 5 MB.</p>
        </div>
      );

    case 'email_failed':
      return (
        <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-4 text-sm">
          <p className="font-semibold text-red-700 mb-1">Email could not be sent</p>
          <p className="text-slate-700">Emotion was detected (<span className="capitalize">{result.dominantEmotion}</span>) but the email failed to send.</p>
        </div>
      );

    default:
      return null;
  }
}
```

Replace both inline panels with `<ResultPanel result={result} />`.

#### 3C. [`frontend/app/admin/page.tsx`](../frontend/app/admin/page.tsx) — admin badge map

The current `STATUS_BADGE` ([lines 30-37](../frontend/app/admin/page.tsx#L30-L37)) already declares badges for `pending`, `emotion_detected`, `email_sent`, `email_failed`, `no_face_detected`, `invalid_file` — which exactly matches the set of statuses the backend will write after Stage 1A. **No changes needed here.**

(If we ever re-add a cap, add `email_suppressed` to this map at the same time as adding it to the Lambda + frontend constants.)

---

### Stage 4 — Deploy and verify

| # | Step | Owner | How |
|---|---|---|---|
| 1 | Push backend changes (Stage 1) | git | `deploy.yml` deploys `Inference` + `Messaging` stacks; ~3 min |
| 2 | Confirm Lambdas updated | aws | `aws lambda get-function ... --query Configuration.LastModified` |
| 3 | Confirm freq-cap table is gone | aws | `aws dynamodb describe-table --table-name SatisfactionMeterMessaging-EmailFrequencyCapTableCD467663-FA1M3VUCO6UT` should return `ResourceNotFoundException` |
| 4 | Test multiple back-to-back submissions | browser/curl | Submit 2-3 photos with `alexvelo199@gmail.com` → all three should reach `status='email_sent'` and deliver real emails |
| 5 | Test no-face path (cover the camera) | browser | Submit photo with no face → UI shows amber "No face detected" panel within ~5s, no hang |
| 6 | Verify locally that frontend builds | dev | `cd frontend && npm run build` (must succeed; this is the Stage 2 unblock) |
| 7 | Push frontend changes (Stages 2 + 3) | git | `frontend-deploy.yml` should now succeed (it's been failing since 2026-05-06) |
| 8 | Hard-refresh `satisfactionmeter.live` | browser | Cmd/Ctrl+Shift+R to bypass cache |
| 9 | Final end-to-end test on live site | browser | Take photo → confirm UI shows correct panel for current state |
| 10 | Update [`docs/roadmap.md`](roadmap.md) | docs | Tick off the bug as fixed; document freq-cap removal; note the cap was OPTIONAL Phase 4 polish |

---

## 4. Risks and mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Status string typo in Lambda doesn't match frontend constant | Med | Hang returns silently | Define the names as exported consts in one shared place if possible; otherwise grep test |
| Inference Lambda change breaks the happy path | Low | All emotion detection broken | Default arg `status='emotion_detected'` keeps happy path identical; CDK synth + smoke test post-deploy |
| `pageExtensions` change still doesn't fix the build | Low | Frontend stays stuck on old version | `npm run build` locally before pushing; if it fails, fall back to relocating the api/ folder |
| Polling exits "too early" on email_failed | Low | User sees error UI when SES might recover | UX message is explicit about retrying |
| New status string written, but a stuck submission from before the fix is still hung | Med | User confused | Note in deploy plan: existing stuck records won't auto-resolve; new submissions will |
| Forgot to remove `GetCommand` import after stripping freq-cap block | Low | TS lint warning, no runtime impact | `npm run build` (strict mode) catches unused imports |
| CDK fails to destroy `EmailFrequencyCapTable` (e.g. CloudFormation stuck) | Low | Orphan table costs $0 (PAY_PER_REQUEST, no use) but pollutes account | Manually delete via console or CLI after stack stabilizes |
| User sends a real customer email twice in a row post-fix | Low (post-semester concern) | Customer gets 2 marketing emails | Out of scope — re-introduce cap if/when SES production access lands |

---

## 5. Out of scope (intentional)

These are real issues from the 2026-05-07 audit but **not** part of this fix:

- **Tightening CORS** from `*` to the CloudFront origin (P2-1)
- **Authenticating** `/analytics/*` endpoints (P2-2)
- **SES bounce/complaint** SNS webhook (P2-3)
- **Adding tests** to the project (P2-4)
- **Removing dead code** (`frontend/lib/mockAnalytics.ts`, `recharts` dep) — P3-2/P3-3
- **Updating CLAUDE.md / roadmap.md** to reflect the dev-only admin direction

These will be addressed separately.

---

## 6. Decisions — status

- [x] **Demo strategy resolved (2026-05-07):** Remove the freq cap entirely (Stage 1B). User has only 1 verified SES recipient + no production access; cap was OPTIONAL Phase 4 polish per roadmap.
- [ ] Approve the full plan (Stages 0–4) vs narrow scope
- [ ] Use Stage 0 immediate row-delete now, OR wait for Stage 1B redeploy
- [ ] Approve `route.dev.ts` + `pageExtensions` approach for Stage 2
- [ ] Confirm: Claude can run `cdk deploy` post-Stage-1, or user runs it manually
- [ ] Verify additional SES recipients (e.g. `kit.red33@gmail.com`) for richer demo — optional, not part of this plan

---

## 7. Verification checklist (post-deploy)

**Backend:**
- [ ] `cdk deploy` succeeds with no diffs after a second run
- [ ] `aws lambda get-function ... --query Configuration.LastModified` shows a newer timestamp than 2026-05-06T13:34Z for SendEmail and Inference
- [ ] `aws dynamodb describe-table --table-name SatisfactionMeterMessaging-EmailFrequencyCapTableCD467663-FA1M3VUCO6UT` returns `ResourceNotFoundException` (table actually destroyed)
- [ ] Submit 3 photos in a row with `alexvelo199@gmail.com` → all three reach `status='email_sent'` within ~10s; all three actual emails arrive in the inbox
- [ ] Submit a photo with the camera covered → DynamoDB row gets `status='no_face_detected'`; UI exits polling and shows amber message within ~5s

**Frontend:**
- [ ] `npm run build` succeeds locally (Stage 2 unblock)
- [ ] `npm run dev` still serves the admin page at `/admin/` and the API route at `/api/admin/submissions`
- [ ] `frontend-deploy.yml` workflow passes (it's been failing since 2026-05-06 13:31Z)
- [ ] `satisfactionmeter.live` reflects new code (Network tab shows fresh JS bundle hash)
- [ ] Live browser test: each of `email_sent`, `no_face_detected`, `invalid_file` shows the correct ResultPanel
- [ ] Polling loop stops at the first terminal status, never reaches the 20-attempt timeout under normal conditions

---

## 8. Rollback plan

| If this fails | Action |
|---|---|
| Backend deploy breaks emails entirely | `git revert <commit>` + push → CDK redeploys previous Lambda code AND re-creates the `EmailFrequencyCapTable` (~3-5 min) |
| Frontend deploy breaks the live site | `git revert <commit>` + push → `frontend-deploy.yml` reverts S3 + invalidates CloudFront |
| Polling exits incorrectly on email_failed (false negative) | Hot-fix: remove `email_failed` from `TERMINAL_STATUSES` until UX is improved |
| Want the freq cap back later (e.g. SES production access lands) | `git revert` the Stage 1B commits, re-deploy. Table comes back fresh (no historical cap data is preserved — all addresses get a clean slate) |
| Stage 0 was used and we want the row back (pre-deploy edge case) | Re-trigger by sending a real email to that address (or `aws dynamodb put-item` manually). Moot once Stage 1B ships. |
