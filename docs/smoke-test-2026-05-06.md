# Smoke Test — 2026-05-06

Run date: 2026-05-06  
Region: ap-southeast-1  
Tester: Claude Code automated verification (Tasks 3.1–3.10 of fix-local-dev-and-submit-button plan)

---

## Status Summary

| Service | Status | Notes |
|---|---|---|
| Upload API | ⚠️ | Lambda Active, but deployed code is STALE — see §Upload API |
| S3 + EventBridge | ✅ | Lifecycle 30d enabled; EventBridge enabled |
| Inference Lambda | ✅ | Active, last invoked 2026-05-02 |
| Rekognition | ✅ (inferred) | Inference Lambda ran successfully on 2026-05-02 |
| DynamoDB submissions | ✅ | Table exists; prior records present |
| DynamoDB campaigns | ✅ | Dual-write present; 9 totalSent recorded |
| SES | ⚠️ | `kit.red33@gmail.com` NOT verified — see §SES |
| Results API | ✅ | Endpoint present (not full-round-trip tested — blocked by upload) |
| Analytics endpoints | ✅ | All 3 routes return 200 + real data |
| CloudFront site | ✅ | /, /admin/, /admin/dashboard/ all HTTP 200 |
| DLQ depth | ⚠️ | `dev-user` lacks `sqs:GetQueueAttributes` — cannot read |

**Live end-to-end browser test (Task 3 Step 5): BLOCKED** — upload endpoint requires `x-api-key` header that the frontend does not send. See root cause below.

---

## §Upload API — Stale Deployed Code

**Lambda state:**
```
State=Active  LastUpdateStatus=Successful  Runtime=nodejs22.x
```

**Probe without API key (what the browser does):**
```
POST https://bj0iusoe6a.execute-api.ap-southeast-1.amazonaws.com/prod/upload
Body: {"email":"kit.red33@gmail.com","contentType":"image/jpeg"}
→ HTTP 403  {"message":"Forbidden"}
```

**Probe with API key `0RzO17UqNz5prbkanqbHW2tDhrDrLC8662iMnotX`:**
```
→ HTTP 422  {"message":"fileSize must be a positive number."}
```

**Root cause — code drift:** The deployed capture stack is running code from a commit *before* Phase 2D/2E. That older Lambda validates a `fileSize` request field and the API Gateway requires an `x-api-key` header. The current repo code (`lambdas/presigned-url/index.ts`) removed both — `fileSize` is now validated post-upload in the inference Lambda, and there is no API key on the route. However, the backend stack has **not been redeployed** since all commits in Phase 2D–2E only touched `frontend/**`, `docs/**`, or `*.md` files, which are path-ignored by `deploy.yml`.

**Effect:** Any submission from the live CloudFront site fails at the upload step with HTTP 403. The "Send for Analysis" button behaviour (Task 2 fix) is correct but the pipeline is still broken until the backend is redeployed.

**Fix:** Push any non-frontend, non-docs, non-`.md` change to main to trigger `deploy.yml`. A null comment change to any `.ts` file in `lib/` is sufficient. CDK will bring the deployed stack in sync with the repo, removing the API key requirement and deploying the updated Lambda code.

---

## §S3 — EventBridge + Lifecycle

```json
// get-bucket-notification-configuration
{"EventBridgeConfiguration": {}}   ✅ EventBridge enabled

// get-bucket-lifecycle-configuration
{
  "Rules": [{
    "Expiration": {"Days": 30},
    "ID": "expire-raw-images",
    "Status": "Enabled"
  }]
}   ✅
```

---

## §Inference Lambda

Last log stream: `2026/05/02` — invoked 4 days ago.  
Lambda `State=Active`, no signs of error.

DLQ depth: **could not check** — `dev-user` IAM does not have `sqs:GetQueueAttributes` on the inference or messaging DLQs. This is a least-privilege gap that should be noted but is low priority; CloudWatch metrics for DLQ depth remain available to the root account.

---

## §SES — Verified Identities

```json
// list-identities
{"Identities": ["satisfactionmeter.live", "alexvelo199@gmail.com"]}

// get-identity-verification-attributes
{
  "alexvelo199@gmail.com": {"VerificationStatus": "Success"},
  "satisfactionmeter.live": {"VerificationStatus": "Success"}
}
```

**Issue:** `kit.red33@gmail.com` (listed as the user's email in CLAUDE.md) is **not verified** in SES. In sandbox mode, SES rejects sends to unverified addresses. The verified addresses are `alexvelo199@gmail.com` and domain `satisfactionmeter.live`.

**Fix options:**
1. Verify `kit.red33@gmail.com` via the SES console (request verification email).
2. Use `alexvelo199@gmail.com` for testing submissions.

---

## §Analytics Endpoints

All three endpoints return HTTP 200 with real data:

```json
// GET /analytics/emotions
{"total": 22, "counts": {"angry": 12, "happy": 4, "calm": 4, "sad": 1, "confused": 1}}

// GET /analytics/campaigns
{
  "totalSent": 9,
  "perTemplate": {"angry": 2, "happy": 2, "calm": 2, "angry_v2": 1, "angry_v1": 1, "confused": 1},
  "earliestSentAt": "2026-05-01T18:10:04.537Z",
  "latestSentAt": "2026-05-04T06:44:29.538Z"
}

// GET /analytics/trends  (last 30 days, grouped by date)
[
  {"date": "2026-04-29", "counts": {"angry": 5, "calm": 2, "sad": 1, "happy": 2}},
  {"date": "2026-05-01", "counts": {"angry": 2, "calm": 1}},
  {"date": "2026-05-02", "counts": {"happy": 1, "calm": 1, "confused": 1}},
  {"date": "2026-05-04", "counts": {"angry": 5, "happy": 1}}
]
```

Analytics endpoints are open (no auth) as expected during Phase 3A. Lambda Authorizer wiring is Phase 3B.

---

## §CloudFront Frontend

```
/ → HTTP 200  ✅
/admin/ → HTTP 200  ✅
/admin/dashboard/ → HTTP 200  ✅
```

---

## Required Follow-Up Actions

1. **[BLOCKING] Trigger backend CDK redeploy** — push a trivial non-frontend commit to main so `deploy.yml` fires and brings the deployed capture stack (and all stacks) in sync with current repo code.
2. **[BLOCKING] Verify `kit.red33@gmail.com` in SES** — or confirm `alexvelo199@gmail.com` is the intended test recipient and update CLAUDE.md.
3. **[LOW] Grant `dev-user` `sqs:GetQueueAttributes`** — needed to check DLQ depth from CLI.
4. **[OPTIONAL] Post-redeploy: run full live submission** — go to CloudFront URL, submit a photo, confirm green "Analysis complete" panel and email delivered.
