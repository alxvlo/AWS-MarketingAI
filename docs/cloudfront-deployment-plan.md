# CloudFront Deployment Plan — Satisfaction Meter Frontend

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers-ecc:subagent-driven-development (recommended) or superpowers-ecc:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deploy the Next.js frontend in `frontend/` to AWS using S3 + CloudFront (replacing the abandoned Vercel plan), keeping everything inside the single AWS account and on the free tier.

**Architecture:** Build the Next.js app as a fully static export (`output: "export"`) and serve `out/` from a private S3 bucket fronted by a CloudFront distribution with Origin Access Control (OAC). A new CDK stack (`WebStack`) provisions the bucket + distribution; a new GitHub Actions workflow (`frontend-deploy.yml`) builds the static bundle, syncs to S3, and invalidates CloudFront. Backend (API Gateway, Lambda, S3 image bucket, DynamoDB, SES) stays unchanged — frontend calls them via the same `NEXT_PUBLIC_*` env vars introduced in PR #2.

**Tech Stack:** AWS CDK (TypeScript), CloudFront + OAC, S3, GitHub Actions OIDC, Next.js 16 static export, React 19.

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `lib/web-stack.ts` | **create** | New CDK stack: private S3 bucket, CloudFront distribution, OAC, error responses |
| `bin/satisfaction-meter.ts` | **modify** | Instantiate `WebStack` |
| `frontend/next.config.ts` | **modify** | Add `output: "export"`, `trailingSlash: true`, `images.unoptimized: true` |
| `.github/workflows/frontend-deploy.yml` | **create** | Build static bundle, sync to S3, invalidate CloudFront |
| `.github/workflows/deploy.yml` | **modify** | Path-filter so backend deploys ignore `frontend/**` changes |
| `lib/iam-stack.ts` *(or wherever the OIDC role lives — see Task 5)* | **modify** | Grant the GH Actions role `s3:*` on web bucket + `cloudfront:CreateInvalidation` |
| `CLAUDE.md` | **modify** | Update frontend hosting section, add `web` stack to bounded-context list |
| `docs/roadmap.md` | **modify** | Add Phase 2E (frontend hosting) + Key Decisions Log entry |
| `docs/vercel-deployment-plan.md` | **delete** | Superseded by this plan |
| PR #2 (`vercel-deploy` branch) | **close & repurpose** | Rename branch to `cloudfront-deploy`, reword PR (the env-var work is still correct) |

---

## Task 1: Retire the Vercel artifacts and pivot the open branch

The existing PR #2 contains correct, useful work (env vars, `.env.example`, `.gitignore`). The framing is wrong, but the code lands cleanly under either platform. Pivot the branch rather than reverting.

**Files:**
- Delete: `docs/vercel-deployment-plan.md`
- Branch: rename `vercel-deploy` → `cloudfront-deploy` *(local + remote)*
- PR #2: close the existing PR, open a fresh one from `cloudfront-deploy` once Task 8 lands

- [x] **Step 1: Confirm PR #2 is unmerged**

```powershell
gh pr view 2 --json state,headRefName
```
Expected: `state = OPEN`, `headRefName = vercel-deploy`. If already merged, skip to Step 4 and just delete the doc on `main`.

- [x] **Step 2: Rename the local branch**

```powershell
git checkout vercel-deploy
git branch -m cloudfront-deploy
```

- [x] **Step 3: Update remote (delete old, push new)**

```powershell
git push origin --delete vercel-deploy
git push -u origin cloudfront-deploy
gh pr close 2 --comment "Pivoting to AWS CloudFront — superseded by upcoming PR from cloudfront-deploy."
```

- [x] **Step 4: Delete the obsolete plan doc**

```powershell
git rm docs/vercel-deployment-plan.md
git commit -m "chore: remove vercel deployment plan, superseded by cloudfront plan"
```

---

## Task 2: Make the Next.js app statically exportable

Next.js 16 produces a static site when every route is server-renderable as static. The current build output already shows all 4 routes as `○ (Static)`, so adding `output: "export"` should "just work."

**Files:**
- Modify: `frontend/next.config.ts`

- [x] **Step 1: Audit dynamic features that block static export**

Run these checks — any hit means we have to refactor before exporting:

```powershell
cd frontend
npx grep -rn "next/image" app components lib 2>$null
npx grep -rn "getServerSideProps\|getStaticPaths\|revalidate" app 2>$null
npx grep -rn "export const dynamic\|export const runtime" app 2>$null
```

Use the Grep tool instead of grep:
- Search for `next/image` imports under `frontend/app`, `frontend/components`, `frontend/lib`.
- Search for `route.ts` / `route.tsx` files under `frontend/app` (API routes are forbidden in static export).

Expected: zero hits, **or** `next/image` only with hardcoded local imports (works with `images.unoptimized: true`). If a `route.ts` file exists, this task balloons — flag it before continuing.

- [x] **Step 2: Update `next.config.ts`**

Replace the current contents with:

```ts
import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  // Emit a fully static site to frontend/out/ for S3 + CloudFront hosting.
  output: "export",

  // Force trailing slashes so URLs map cleanly to S3 keys (e.g. /admin/ → /admin/index.html).
  // Without this, /admin would 404 on S3 because the key is admin/index.html.
  trailingSlash: true,

  // next/image's default loader requires a Node runtime; static export needs the unoptimized loader.
  images: { unoptimized: true },

  turbopack: {
    // Repo root has its own package-lock.json (CDK). Pin the workspace root explicitly.
    root: path.resolve(__dirname),
  },
};

export default nextConfig;
```

- [x] **Step 3: Build and verify the export**

```powershell
cd frontend
Copy-Item .env.example .env.local -Force
npm run build
```

Expected: build succeeds and `frontend/out/` contains:
- `index.html`
- `admin/index.html`
- `admin/dashboard/index.html`
- `404.html`
- `_next/` directory with hashed JS/CSS
- `models/tiny_face_detector_model-*` (face-api.js assets)

Verify with:
```powershell
Get-ChildItem frontend/out -Recurse -Name | Select-Object -First 30
Test-Path frontend/out/models/tiny_face_detector_model-shard1
```
Both must be true.

- [x] **Step 4: Smoke test the static bundle locally**

```powershell
cd frontend/out
npx --yes serve -p 5173 .
```
Open `http://localhost:5173/` — webcam page must load, models must download from `/models/`. Then visit `http://localhost:5173/admin/` — admin login renders. Stop the server (`Ctrl+C`).

- [x] **Step 5: Add `frontend/out/` to `.gitignore`**

Edit `.gitignore`, in the "Next.js frontend build artifacts" block add:
```
frontend/out/
```
(Already mostly there — confirm before duplicating.)

- [x] **Step 6: Commit**

```powershell
git add frontend/next.config.ts .gitignore
git commit -m "feat(frontend): enable Next.js static export for S3+CloudFront hosting"
```

---

## Task 3: Create the `WebStack` CDK construct

A new stack provisions the S3 bucket + CloudFront distribution. Keep it independent of `CaptureStack` (different lifecycle: customer-image bucket has 30-day TTL, web bucket has none).

**Files:**
- Create: `lib/web-stack.ts`
- Modify: `bin/satisfaction-meter.ts`

- [x] **Step 1: Write `lib/web-stack.ts`**

```ts
import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as iam from 'aws-cdk-lib/aws-iam';

/**
 * Hosts the Next.js static export at frontend/out/.
 *
 * Layout:
 *   - Private S3 bucket (no public access)
 *   - CloudFront distribution with Origin Access Control (OAC) — modern replacement for OAI
 *   - SPA-style 403/404 → /404.html so deep links resolve to Next's static 404 page
 *
 * The bucket is intentionally NOT in CaptureStack: customer-image and static-asset
 * buckets have very different lifecycles (30-day TTL vs none) and IAM surfaces.
 */
export class WebStack extends cdk.Stack {
  public readonly siteBucket: s3.Bucket;
  public readonly distribution: cloudfront.Distribution;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    this.siteBucket = new s3.Bucket(this, 'SiteBucket', {
      bucketName: `satisfaction-meter-web-${this.account}-${this.region}`,
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      // Site assets are CI-rebuildable — destroy on stack delete is safe.
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      enforceSSL: true,
    });

    this.distribution = new cloudfront.Distribution(this, 'SiteDistribution', {
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(this.siteBucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        compress: true,
      },
      defaultRootObject: 'index.html',
      // Next.js static export emits a 404.html. Map S3's 403 (which it returns for
      // missing keys when listing is disabled) and any 404 to that page.
      errorResponses: [
        { httpStatus: 403, responseHttpStatus: 404, responsePagePath: '/404.html', ttl: cdk.Duration.minutes(5) },
        { httpStatus: 404, responseHttpStatus: 404, responsePagePath: '/404.html', ttl: cdk.Duration.minutes(5) },
      ],
      // PRICE_CLASS_200 includes Asia (PH) without paying for South America/Australia/NZ edges.
      priceClass: cloudfront.PriceClass.PRICE_CLASS_200,
      comment: 'Satisfaction Meter — Next.js static frontend',
    });

    new cdk.CfnOutput(this, 'SiteBucketName', { value: this.siteBucket.bucketName });
    new cdk.CfnOutput(this, 'DistributionId', { value: this.distribution.distributionId });
    new cdk.CfnOutput(this, 'DistributionDomain', { value: this.distribution.distributionDomainName });
  }
}
```

- [x] **Step 2: Wire into `bin/satisfaction-meter.ts`**

After the existing stack instantiations (around line 49), add:

```ts
import { WebStack } from '../lib/web-stack';

// ...existing stacks...

new WebStack(app, 'SatisfactionMeterWeb', { env });
```

The web stack has no dependencies on backend stacks (it's just a bucket + CDN), so no `addDependency` calls.

- [x] **Step 3: Synth and inspect**

```powershell
npx cdk synth SatisfactionMeterWeb > /dev/null
npx cdk diff SatisfactionMeterWeb
```

Expected: synth passes. Diff shows: 1 bucket, 1 OAC, 1 distribution, 1 bucket policy, ~3 outputs. **No public-access bucket policy.**

- [x] **Step 4: Deploy**

```powershell
npx cdk deploy SatisfactionMeterWeb --require-approval never
```

Capture the outputs — you'll need `SiteBucketName` and `DistributionId` for Task 4.

```powershell
aws cloudformation describe-stacks --stack-name SatisfactionMeterWeb --query "Stacks[0].Outputs" --output table
```

- [x] **Step 5: Smoke test the empty distribution**

```powershell
$domain = aws cloudformation describe-stacks --stack-name SatisfactionMeterWeb --query "Stacks[0].Outputs[?OutputKey=='DistributionDomain'].OutputValue" --output text
curl -I "https://$domain/"
```
Expected: 404 (bucket is empty — no `index.html` yet). That's fine; Task 4 fills it.

- [x] **Step 6: Commit**

```powershell
git add lib/web-stack.ts bin/satisfaction-meter.ts
git commit -m "feat(infra): add WebStack with private S3 bucket + CloudFront OAC"
```

---

## Task 4: Frontend deploy workflow

Build → sync → invalidate. Runs only when `frontend/**` changes so it doesn't fire on every backend tweak.

**Files:**
- Create: `.github/workflows/frontend-deploy.yml`
- Modify: `.github/workflows/deploy.yml` (path filter)

- [x] **Step 1: Add path filters to existing backend workflow**

Edit `.github/workflows/deploy.yml`. Replace the `on:` block (lines 3-5) with:

```yaml
on:
  push:
    branches: [main]
    paths-ignore:
      - 'frontend/**'
      - 'docs/**'
      - '*.md'
```

This stops backend redeploys when only frontend or docs change.

- [x] **Step 2: Create `.github/workflows/frontend-deploy.yml`**

```yaml
name: Frontend Deploy

on:
  push:
    branches: [main]
    paths:
      - 'frontend/**'
      - '.github/workflows/frontend-deploy.yml'
  workflow_dispatch:

permissions:
  id-token: write
  contents: read

jobs:
  deploy:
    name: Build & sync to S3 + CloudFront
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: frontend
    env:
      NEXT_PUBLIC_UPLOAD_API: ${{ vars.NEXT_PUBLIC_UPLOAD_API }}
      NEXT_PUBLIC_RESULTS_API: ${{ vars.NEXT_PUBLIC_RESULTS_API }}

    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
          cache-dependency-path: frontend/package-lock.json

      - name: Install dependencies
        run: npm ci

      - name: Build static export
        run: npm run build

      - name: Configure AWS credentials via OIDC
        uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: arn:aws:iam::860550672813:role/GitHubActionsDeployRole
          aws-region: ap-southeast-1
          audience: sts.amazonaws.com

      - name: Sync to S3
        run: |
          aws s3 sync ./out/ s3://${{ vars.WEB_BUCKET_NAME }}/ \
            --delete \
            --cache-control "public, max-age=31536000, immutable" \
            --exclude "*.html" --exclude "404.html"
          # HTML files: short cache so deploys are visible quickly
          aws s3 sync ./out/ s3://${{ vars.WEB_BUCKET_NAME }}/ \
            --cache-control "public, max-age=60, must-revalidate" \
            --exclude "*" --include "*.html"

      - name: Invalidate CloudFront
        run: |
          aws cloudfront create-invalidation \
            --distribution-id ${{ vars.CLOUDFRONT_DISTRIBUTION_ID }} \
            --paths "/*"
```

Note the **two-pass sync**: hashed `_next/*` assets get a 1-year immutable cache; HTML pages get a 60-second cache so the next deploy lands fast even if a user keeps a tab open.

- [x] **Step 3: Set the GitHub repo variables**

These are non-secret (the values appear in the deployed page source anyway), so use **repository variables**, not secrets.

Run from the repo root:

```powershell
gh variable set NEXT_PUBLIC_UPLOAD_API --body "https://bj0iusoe6a.execute-api.ap-southeast-1.amazonaws.com/prod/upload"
gh variable set NEXT_PUBLIC_RESULTS_API --body "https://axxsy44fvk.execute-api.ap-southeast-1.amazonaws.com/prod/results"
gh variable set WEB_BUCKET_NAME --body "<bucket name from Task 3 Step 4 outputs>"
gh variable set CLOUDFRONT_DISTRIBUTION_ID --body "<distribution ID from Task 3 Step 4 outputs>"
```

- [x] **Step 4: Commit (don't push yet — Task 5 must land first)**

```powershell
git add .github/workflows/frontend-deploy.yml .github/workflows/deploy.yml
git commit -m "ci: add frontend deploy workflow (S3 sync + CloudFront invalidation)"
```

---

## Task 5: Extend the GitHub Actions IAM role

The OIDC role `GitHubActionsDeployRole` currently grants CDK deploy permissions. It also needs S3 write on the new bucket and CloudFront invalidation on the new distribution.

**Files:**
- Modify: wherever the role policy lives. **Locate it first** — it may be in `lib/`, in a separate bootstrap stack, or hand-managed.

- [x] **Step 1: Locate the role definition**

Use Grep on the project:
- Pattern: `GitHubActionsDeployRole`
- Path: `lib/`

If found in CDK: extend the role's policy in code (preferred — declarative).
If managed manually (likely, since it predates this plan): document the IAM JSON to add and apply via console or `aws iam put-role-policy`.

- [x] **Step 2 (CDK path): extend role policy**

Add to the relevant stack:

```ts
role.addToPolicy(new iam.PolicyStatement({
  actions: ['s3:PutObject', 's3:DeleteObject', 's3:ListBucket', 's3:GetObject'],
  resources: [
    siteBucket.bucketArn,
    `${siteBucket.bucketArn}/*`,
  ],
}));

role.addToPolicy(new iam.PolicyStatement({
  actions: ['cloudfront:CreateInvalidation', 'cloudfront:GetInvalidation'],
  resources: [
    `arn:aws:cloudfront::${cdk.Stack.of(this).account}:distribution/${distribution.distributionId}`,
  ],
}));
```

- [x] **Step 2 (manual path): attach inline policy**

Save as `frontend-deploy-policy.json`:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "WebBucketWrite",
      "Effect": "Allow",
      "Action": ["s3:PutObject", "s3:DeleteObject", "s3:ListBucket", "s3:GetObject"],
      "Resource": [
        "arn:aws:s3:::satisfaction-meter-web-860550672813-ap-southeast-1",
        "arn:aws:s3:::satisfaction-meter-web-860550672813-ap-southeast-1/*"
      ]
    },
    {
      "Sid": "CloudFrontInvalidate",
      "Effect": "Allow",
      "Action": ["cloudfront:CreateInvalidation", "cloudfront:GetInvalidation"],
      "Resource": "arn:aws:cloudfront::860550672813:distribution/<DIST_ID>"
    }
  ]
}
```

Apply:
```powershell
aws iam put-role-policy `
  --role-name GitHubActionsDeployRole `
  --policy-name FrontendDeployPolicy `
  --policy-document file://frontend-deploy-policy.json
```

- [x] **Step 3: Verify the role has the new permissions**

```powershell
aws iam list-role-policies --role-name GitHubActionsDeployRole
aws iam get-role-policy --role-name GitHubActionsDeployRole --policy-name FrontendDeployPolicy
```

- [x] **Step 4: Commit (CDK path only)**

```powershell
git add lib/<file>.ts
git commit -m "feat(infra): grant GH Actions role S3+CloudFront access for frontend deploys"
```

---

## Task 6: Update `CLAUDE.md`

The frontend hosting paragraph and the bounded-context list need to reflect CloudFront, not Vercel.

**Files:**
- Modify: `CLAUDE.md`

- [x] **Step 1: Update the frontend section**

In the "Architectural stance" block, find the line starting with **"Image capture & upload:"** — leave it as-is.

Then **add a new bullet immediately after it**:

```markdown
- **Frontend hosting**: Next.js is built as a fully static export (`output: "export"` in `frontend/next.config.ts`). The `out/` bundle is uploaded to a private S3 bucket and served via a CloudFront distribution with Origin Access Control (OAC). No public bucket access. Provisioned by `WebStack` (`lib/web-stack.ts`). Deploys via the `frontend-deploy.yml` GitHub Actions workflow on push to `main` when `frontend/**` changes — backend stacks are unaffected.
```

- [x] **Step 2: Update the IaC bounded-context list**

Find the line starting with **"- **IaC**:"** and add `web` to the bounded-context list:

Before:
```
One stack per bounded context: `capture` (upload + S3), `inference` (Rekognition Lambda), `messaging` (SES send), `api` (GET results endpoint), `analytics` (analytics Lambdas + Lambda Authorizer + campaigns table). Frontend lives in `frontend/` (Next.js); admin portal at `frontend/app/admin/`.
```

After:
```
One stack per bounded context: `capture` (upload + S3), `inference` (Rekognition Lambda), `messaging` (SES send), `api` (GET results endpoint), `analytics` (analytics Lambdas + Lambda Authorizer + campaigns table), `web` (S3 + CloudFront for static frontend). Frontend lives in `frontend/` (Next.js); admin portal at `frontend/app/admin/`.
```

- [x] **Step 3: Update the CI/CD line**

Find the line starting with **"- **CI/CD**:"** and replace it with:

```markdown
- **CI/CD**: GitHub Actions + OIDC. Two workflows: `deploy.yml` (CDK on backend changes — `frontend/**` is path-ignored) and `frontend-deploy.yml` (build static export → `aws s3 sync` → CloudFront invalidation, on `frontend/**` changes). OIDC means no AWS credentials stored in GitHub secrets — GitHub assumes an IAM role via federated identity.
```

- [x] **Step 4: Commit**

```powershell
git add CLAUDE.md
git commit -m "docs: update CLAUDE.md for CloudFront frontend hosting"
```

---

## Task 7: Update `docs/roadmap.md`

Add a new sub-phase for frontend hosting, plus a Key Decisions Log entry.

**Files:**
- Modify: `docs/roadmap.md`

- [x] **Step 1: Update the "Last updated" line**

Change line 2 from:
```
**Last updated**: 2026-05-01 (Phase 3B tickets synced)
```
to:
```
**Last updated**: 2026-05-02 (Phase 2E added — CloudFront frontend hosting)
```

- [x] **Step 2: Add Phase 2E**

After the Phase 2D block (around line 58, after the "No stored AWS credentials..." line), insert:

```markdown

### 2E — Frontend Hosting (CloudFront)
- [ ] Static export: `next.config.ts` with `output: "export"`, `trailingSlash: true`
- [ ] CDK `WebStack`: private S3 bucket + CloudFront distribution with OAC (lib/web-stack.ts)
- [ ] GitHub Actions workflow `frontend-deploy.yml`: build → `aws s3 sync` → CloudFront invalidation
- [ ] Path filters on `deploy.yml` so backend deploys ignore `frontend/**`
- [ ] Extend GitHubActionsDeployRole with S3 write + cloudfront:CreateInvalidation
- [ ] Smoke test: webcam → upload → email flow on the CloudFront URL
- [ ] (Optional follow-up) Tighten API Gateway + S3 image bucket CORS to the CloudFront origin
```

- [x] **Step 3: Add Key Decisions Log entry**

At the end of the "Key Decisions Log" table, append:

```markdown
| 2026-05-02 | Frontend hosted on CloudFront + S3, not Vercel | Stays inside the single AWS account (no extra vendor accounts), keeps the project AWS-native per CLAUDE.md, and CloudFront's "always free" 1TB/month tier covers expected traffic. Static export is sufficient — no SSR/ISR needed. |
```

- [x] **Step 4: Commit**

```powershell
git add docs/roadmap.md
git commit -m "docs(roadmap): add Phase 2E — frontend hosting on CloudFront"
```

---

## Task 8: Deploy + smoke test

Putting it all together.

- [x] **Step 1: Push the branch and open the PR**

```powershell
git push origin cloudfront-deploy
gh pr create --title "feat: deploy frontend to AWS CloudFront (replaces Vercel plan)" `
  --body "Implements docs/cloudfront-deployment-plan.md. See plan for details."
```

- [x] **Step 2: Wait for CI to deploy the backend changes (WebStack)**

The PR's `deploy.yml` won't run on the PR branch (only on `main` push). Either:
- (a) Manually `npx cdk deploy SatisfactionMeterWeb` from your machine *before* merging, so the bucket+distribution exist when the frontend workflow first runs after merge — **already done in Task 3 Step 4**.
- (b) Merge the PR and accept that the first frontend deploy may race ahead of the WebStack creation.

Path (a) is safer; you should already be on it.

- [x] **Step 3: Merge to `main`**

```powershell
gh pr merge --squash --delete-branch
```

- [x] **Step 4: Watch the frontend workflow**

```powershell
gh run watch
```

Expected: build (~30s), sync (~10s), invalidation (~5s). Total under a minute.

- [x] **Step 5: Smoke test the live site**

```powershell
$domain = aws cloudformation describe-stacks --stack-name SatisfactionMeterWeb `
  --query "Stacks[0].Outputs[?OutputKey=='DistributionDomain'].OutputValue" --output text
Start-Process "https://$domain/"
```

Verify in the browser:
1. Home page loads, webcam preview initializes (face-api.js models load from `/models/`).
2. Auto-snap captures, you enter a verified SES email, submit.
3. DevTools → Network:
   - `POST /upload` → 200 with presigned URL
   - `PUT` to S3 → 200
   - `GET /results/{id}` → 200, `emailSentAt` populated
4. Email arrives within ~5 s.
5. `/admin/` renders the (still-mock) dashboard.
6. Refresh `/admin/dashboard/` directly — does NOT 404. (If it does, `trailingSlash: true` is missing.)

- [x] **Step 6: Update the Phase 2E checkboxes in `docs/roadmap.md`**

Tick off everything in 2E that's now done, push a follow-up commit straight to `main`.

```powershell
git add docs/roadmap.md
git commit -m "docs(roadmap): tick off Phase 2E completion"
git push
```

---

## Risks & gotchas

- **`output: "export"` is incompatible with App Router server features.** If anyone later adds a `route.ts` (API route), `dynamic = "force-dynamic"`, or `revalidate`, the build will fail. CI catches this — don't ignore the failure, refactor the offending route to a client component or move it to a Lambda behind API Gateway.
- **Trailing slash matters.** With `trailingSlash: true`, all internal links emit `/admin/` not `/admin`. Fine for a fresh build, but be aware if you add manual `<Link href="/admin">` later.
- **Cache poisoning on bad deploys.** The 1-year immutable cache on `_next/*` is safe because the filenames are content-hashed. Only HTML uses the 60s cache. If you ever serve a non-hashed asset under `_next/`, that'll burn you — invalidate explicitly.
- **CloudFront invalidations are free up to 1,000/month.** We invalidate `/*` once per deploy; nowhere near the limit.
- **OAC over OAI.** OAI is the legacy mechanism (still works, but uses a virtual user). OAC uses signed SigV4 requests — recommended by AWS for all new distributions. The CDK construct used here is the OAC one (`S3BucketOrigin.withOriginAccessControl`).
- **`autoDeleteObjects: true` on the site bucket** is a convenience for `cdk destroy` — it provisions a Lambda that purges objects on stack delete. Free tier covers it. Drop if you'd rather fail loudly.
- **Image bucket CORS still wildcards.** Backend CORS (`Cors.ALL_ORIGINS`) is unchanged; tightening to the CloudFront origin is captured as the optional step in Phase 2E. Don't block this plan on it.

---

## Done criteria

- [x] Static export builds clean (`frontend/out/` populated).
- [x] `WebStack` deployed; bucket + distribution visible in console.
- [x] `frontend-deploy.yml` green on its first run.
- [x] CloudFront URL serves the home page; webcam → upload → email round-trips.
- [x] `docs/vercel-deployment-plan.md` deleted.
- [x] `CLAUDE.md` and `docs/roadmap.md` reflect the new architecture.
- [x] PR #2 closed; new PR from `cloudfront-deploy` merged into `main`.
