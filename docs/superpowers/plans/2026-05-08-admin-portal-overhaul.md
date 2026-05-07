# Admin Portal Overhaul — Login + Unified Home + Visual System

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert Satisfaction Meter from a customer-facing web app into a single admin-only portal — a login screen leads to one main grid-laid screen that combines the live emotion-detection demo with admin analytics — and overhaul the visual system into a restrained, editorial, information-dense aesthetic.

**Architecture:** Real Lambda Authorizer + SSM Parameter Store admin credentials behind a `/admin/login` endpoint. Frontend uses sessionStorage Basic-auth-style token to gate `/login` → `/home`. Single design system in `globals.css` with serif display + warm neutral palette + a single rust accent — applied uniformly to every card. `/home` is a 12-column grid composing existing webcam capture + new analytics cards (live `/analytics/*`) + new submissions audit card (live `/admin/submissions`). The dev-only Next.js DynamoDB scan route is replaced by a real Lambda + API Gateway endpoint behind the same authorizer.

**Tech Stack:** Next.js 16 static export · React 19 · Tailwind 4 · CDK TS · API Gateway REST + Lambda authorizer · DynamoDB · SSM Parameter Store · Recharts (already installed).

**Decisions locked (2026-05-08):**
- **Auth backend:** Real Lambda Authorizer + SSM (folds in Phase 3B AWS-58/64/69/70).
- **Recipient email:** Admin types per demo (keep email input on capture card).
- **Design:** Single recommended direction, no 3-way compare. Direction = "editorial information-architecture" (Pentagram-adjacent: serif display, warm neutrals, single rust accent, dense grid, no emoji/gradients/glassmorphism).
- **Session:** sessionStorage — clears on tab close.

**Working conventions:**
- Branch off `main`. Current branch `cleanup/elegant-repo-structure` has unrelated cleanup work — start fresh with `git checkout main && git pull && git checkout -b feat/admin-portal-overhaul`.
- Frequent commits at the granularity shown in each task. Conventional Commits (`feat:`, `fix:`, `chore:`, `docs:`).
- Backend Lambdas verified by post-deploy `curl` smoke tests (project convention — see `docs/reports/`). Frontend verified by `npm run build` + manual browser test + Playwright screenshots at design checkpoints.
- Update `docs/roadmap.md` at the **end of each Phase** (B, D, E, H, I) — strikethrough completed AWS tickets, mark Phase 3B done.

**Out of scope (call out, don't build):**
- Dark mode (light-mode v1 only).
- Password rotation UI / multiple admin users.
- Email frequency cap (already removed per roadmap 2026-05-07).
- Replacing existing Phase 3A analytics cache logic.
- New backend stacks beyond admin-auth + admin-submissions.

---

## File structure

### Backend (CDK)

```
bin/satisfaction-meter.ts              [MODIFY] instantiate AdminAuthStack; pass authorizer + login API to AnalyticsStack
lib/admin-auth-stack.ts                [NEW]    SSM params + login Lambda + authorizer Lambda + /admin/* REST API
lib/analytics-stack.ts                 [MODIFY] accept authorizer prop; attach to /analytics/* methods
lambdas/admin-login/index.ts           [NEW]    POST /admin/login → validates SSM creds → returns { token }
lambdas/admin-authorizer/index.ts      [NEW]    API Gateway TOKEN authorizer; validates Basic header against SSM
lambdas/admin-submissions/index.ts     [NEW]    GET /admin/submissions → DynamoDB scan → masked submissions + analytics
```

### Frontend

```
frontend/app/layout.tsx                       [MODIFY] swap Geist for Newsreader display + system body; keep Geist Mono
frontend/app/globals.css                      [REWRITE] design tokens (palette, type, spacing, primitives)
frontend/app/page.tsx                         [REWRITE] root redirect — token present → /home/, else → /login/
frontend/app/login/page.tsx                   [NEW]    centered login screen
frontend/app/home/page.tsx                    [NEW]    unified grid screen (emotion + analytics + audit)
frontend/app/admin/page.tsx                   [DELETE] (replaced by /home/)
frontend/app/api/admin/submissions/route.dev.ts [DELETE] (replaced by real Lambda)
frontend/components/auth/AuthGuard.tsx        [NEW]    client guard — redirects to /login/ if no token
frontend/components/auth/LoginForm.tsx        [NEW]    form, calls /admin/login
frontend/components/layout/AppHeader.tsx      [NEW]    brand bar with logout
frontend/components/home/KpiStrip.tsx         [NEW]    top KPI tiles
frontend/components/home/EmotionCapturePanel.tsx [NEW] webcam + email + result wrapped as a grid card
frontend/components/home/EmotionDistributionCard.tsx [NEW] bar chart from /analytics/emotions
frontend/components/home/TrendsCard.tsx       [NEW]    line chart from /analytics/trends
frontend/components/home/CampaignsCard.tsx    [NEW]    table from /analytics/campaigns
frontend/components/home/SubmissionsAuditCard.tsx [NEW] audit table from /admin/submissions
frontend/components/ui/Card.tsx               [NEW]    primitive — hairline border, eyebrow, body
frontend/components/ui/StatusBadge.tsx        [NEW]    extracted from old admin page; restyled
frontend/components/WebcamFeed.tsx            [MODIFY] minor restyle to match new design tokens
frontend/components/FaceOverlay.tsx           [keep]   no design coupling
frontend/lib/auth.ts                          [NEW]    sessionStorage token helpers + useAuth hook
frontend/lib/analytics.ts                     [NEW]    typed fetch wrappers for /analytics/*
frontend/lib/adminApi.ts                      [NEW]    typed fetch for /admin/login + /admin/submissions
frontend/lib/api.ts                           [keep]   submitPhoto path unchanged
frontend/lib/mockAnalytics.ts                 [DELETE]
frontend/.env.local.example                   [MODIFY] document NEXT_PUBLIC_ANALYTICS_API + NEXT_PUBLIC_ADMIN_API
```

### Design tokens (single source of truth, embedded in `globals.css`)

```
Palette (light mode):
  --bg-canvas:        #f6f5f1   (warm off-white page bg)
  --bg-surface:       #fbfaf6   (card surface)
  --bg-inset:         #efece4   (table headers, subdued zones)
  --ink-primary:      #1a1817   (near-black, warm)
  --ink-secondary:    #5d5854   (body)
  --ink-tertiary:     #8a847e   (captions, eyebrow labels)
  --rule:             #d8d2c5   (1px hairlines)
  --accent:           #b04a1f   (rust orange — SINGLE accent, used sparingly)
  --accent-soft:      #e9d4c4   (rust tint for backgrounds)
  --status-success:   #2f6b3d
  --status-warning:   #a06b1f
  --status-error:     #913321
  --status-info:      #2c5778

Emotion swatches (charts, badges):
  happy:     #c08a1d   surprised: #7a4f9b
  neutral:   #6e6a64   calm:      #3e7d75
  sad:       #3d5a78   angry:     #913321

Type:
  --font-display: "Newsreader", ui-serif, Georgia, serif      (h1, KPI numbers, headings)
  --font-body:    -apple-system, "Segoe UI", system-ui, sans  (NEVER Inter for display)
  --font-mono:    var(--font-geist-mono), ui-monospace        (timestamps, IDs, numbers in tables)

Spacing scale (px): 4 / 8 / 12 / 16 / 24 / 32 / 48 / 64 / 96
Border radius:      0 (sharp) / 2 (max)
Hairline border:    1px solid var(--rule)
Max content width:  1280px, side padding 48px desktop / 24px mobile
Grid:               12 cols, gap 24px
```

**No-AI-slop reject list (treat as hard rules during code review):**
- ❌ No emoji icons anywhere (unicode bullet `·` is fine)
- ❌ No purple/blue gradients, no `bg-gradient-to-*`
- ❌ No left-border-accent cards (signature 2020-2024 SaaS slop)
- ❌ No Inter / Roboto / Arial for display copy
- ❌ No glassmorphism (`backdrop-blur`, translucent cards)
- ❌ No colored drop shadows, no `shadow-2xl`
- ❌ No SVG-drawn faces or stock-photo "people"
- ✅ DO use: `text-wrap: pretty`, hairline rules, small-caps eyebrow labels with `letter-spacing: 0.12em`, serif display contrasted against system body

---

# Phase A — Design system foundation

> Builds the design tokens + primitives so every later card just composes them. Ends with a Playwright screenshot of `/login/` for sign-off before bulk work continues.

### Task A1: Create new branch + scratch design notes

**Files:**
- Modify: working tree (git)

- [ ] **Step 1: Create feature branch**

```bash
git checkout main
git pull --ff-only
git checkout -b feat/admin-portal-overhaul
```

- [ ] **Step 2: Verify working tree clean**

Run: `git status`
Expected: `nothing to commit, working tree clean` (other than untracked).

- [ ] **Step 3: Commit a placeholder marker so CI/dev tooling sees the branch**

(Skip if there's nothing to commit — proceed to A2.)

---

### Task A2: Install Newsreader display font via next/font

**Files:**
- Modify: `frontend/app/layout.tsx`

- [ ] **Step 1: Replace Geist sans import with Newsreader for display + keep Geist Mono**

Open `frontend/app/layout.tsx` and replace lines 1–13 with:

```tsx
import type { Metadata } from "next";
import { Newsreader, Geist_Mono } from "next/font/google";
import "./globals.css";

const newsreader = Newsreader({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  style: ["normal", "italic"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  display: "swap",
});
```

- [ ] **Step 2: Update className to expose the variables**

In the same file, change the `<html>` className from `${geistSans.variable} ${geistMono.variable} h-full antialiased` to `${newsreader.variable} ${geistMono.variable} h-full antialiased`. **Preserve the trailing `h-full antialiased`** — those classes are load-bearing for the layout.

- [ ] **Step 3: Build to verify next/font resolves the new face**

Run: `cd frontend && npm run build`
Expected: build succeeds; no font fetch error.

- [ ] **Step 4: Commit**

```bash
git add frontend/app/layout.tsx
git commit -m "feat(frontend): swap Geist sans for Newsreader display font"
```

---

### Task A3: Rewrite globals.css with the new design tokens

**Files:**
- Rewrite: `frontend/app/globals.css`

- [ ] **Step 1: Replace globals.css with the token system**

Overwrite the file with:

```css
@import "tailwindcss";

:root {
  --bg-canvas: #f6f5f1;
  --bg-surface: #fbfaf6;
  --bg-inset: #efece4;
  --ink-primary: #1a1817;
  --ink-secondary: #5d5854;
  --ink-tertiary: #8a847e;
  --rule: #d8d2c5;
  --accent: #b04a1f;
  --accent-soft: #e9d4c4;
  --status-success: #2f6b3d;
  --status-warning: #a06b1f;
  --status-error: #913321;
  --status-info: #2c5778;

  --emotion-happy: #c08a1d;
  --emotion-surprised: #7a4f9b;
  --emotion-neutral: #6e6a64;
  --emotion-calm: #3e7d75;
  --emotion-sad: #3d5a78;
  --emotion-angry: #913321;
}

@theme inline {
  --color-canvas: var(--bg-canvas);
  --color-surface: var(--bg-surface);
  --color-inset: var(--bg-inset);
  --color-ink: var(--ink-primary);
  --color-ink-secondary: var(--ink-secondary);
  --color-ink-tertiary: var(--ink-tertiary);
  --color-rule: var(--rule);
  --color-accent: var(--accent);
  --color-accent-soft: var(--accent-soft);
  --font-display: var(--font-display);
  --font-mono: var(--font-mono);
}

html, body {
  background: var(--bg-canvas);
  color: var(--ink-primary);
  font-family: -apple-system, "Segoe UI", system-ui, sans-serif;
  font-feature-settings: "ss01", "cv11";
  text-rendering: optimizeLegibility;
  -webkit-font-smoothing: antialiased;
}

p, h1, h2, h3 { text-wrap: pretty; }

.eyebrow {
  font-family: -apple-system, "Segoe UI", system-ui, sans-serif;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--ink-tertiary);
}

.display {
  font-family: var(--font-display);
  font-weight: 500;
  letter-spacing: -0.01em;
}

.numeric {
  font-family: var(--font-mono);
  font-variant-numeric: tabular-nums;
}
```

- [ ] **Step 2: Build to confirm Tailwind 4 picks up the @theme block**

Run: `cd frontend && npm run build`
Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
git add frontend/app/globals.css
git commit -m "feat(frontend): introduce editorial design tokens"
```

---

### Task A4: Build the Card primitive

**Files:**
- Create: `frontend/components/ui/Card.tsx`

- [ ] **Step 1: Create the Card primitive**

```tsx
import { ReactNode } from "react";

interface CardProps {
  eyebrow?: string;
  title?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}

export default function Card({ eyebrow, title, action, children, className = "" }: CardProps) {
  return (
    <section
      className={`bg-[var(--bg-surface)] border border-[var(--rule)] ${className}`}
      style={{ borderRadius: 2 }}
    >
      {(eyebrow || title || action) && (
        <header className="flex items-end justify-between gap-4 px-6 pt-5 pb-4 border-b border-[var(--rule)]">
          <div>
            {eyebrow && <p className="eyebrow mb-1.5">{eyebrow}</p>}
            {title && <h2 className="display text-[20px] leading-tight">{title}</h2>}
          </div>
          {action}
        </header>
      )}
      <div className="px-6 py-5">{children}</div>
    </section>
  );
}
```

- [ ] **Step 2: Build to confirm it compiles**

Run: `cd frontend && npm run build`
Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
git add frontend/components/ui/Card.tsx
git commit -m "feat(frontend): add Card primitive (hairline, eyebrow, title)"
```

---

### Task A5: Build the StatusBadge primitive (replacement for old inline version)

**Files:**
- Create: `frontend/components/ui/StatusBadge.tsx`

- [ ] **Step 1: Write StatusBadge with the new palette**

```tsx
const STATUS: Record<string, { label: string; fg: string; bg: string }> = {
  pending:          { label: "Pending",          fg: "var(--ink-secondary)", bg: "var(--bg-inset)" },
  emotion_detected: { label: "Emotion Detected", fg: "var(--status-info)",   bg: "rgba(44,87,120,0.1)" },
  email_sent:       { label: "Email Sent",       fg: "var(--status-success)", bg: "rgba(47,107,61,0.1)" },
  email_failed:     { label: "Email Failed",     fg: "var(--status-error)",   bg: "rgba(145,51,33,0.1)" },
  no_face_detected: { label: "No Face",          fg: "var(--status-warning)", bg: "rgba(160,107,31,0.1)" },
  invalid_file:     { label: "Invalid File",     fg: "var(--status-warning)", bg: "rgba(160,107,31,0.1)" },
};

export default function StatusBadge({ status }: { status: string }) {
  const s = STATUS[status] ?? { label: status, fg: "var(--ink-secondary)", bg: "var(--bg-inset)" };
  return (
    <span
      className="inline-block px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider"
      style={{ color: s.fg, backgroundColor: s.bg, borderRadius: 2 }}
    >
      {s.label}
    </span>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/components/ui/StatusBadge.tsx
git commit -m "feat(frontend): add StatusBadge primitive"
```

---

### Task A6: Design checkpoint — render a throwaway design preview page

> 🛑 **Checkpoint.** Before bulk-building cards, generate one preview to align with the user on aesthetic. Junior-Designer pass per huashu-design.

**Files:**
- Create: `frontend/app/_design-preview/page.tsx` (temporary, deleted in Task I3)

- [ ] **Step 1: Build a static page composing the primitives**

```tsx
import Card from "@/components/ui/Card";
import StatusBadge from "@/components/ui/StatusBadge";

export default function Preview() {
  return (
    <main className="min-h-screen bg-[var(--bg-canvas)] px-12 py-16">
      <div className="max-w-[1280px] mx-auto space-y-6">
        <header className="flex items-baseline justify-between border-b border-[var(--rule)] pb-6">
          <h1 className="display text-[40px] leading-none">Satisfaction Meter</h1>
          <p className="eyebrow">Design Preview · 2026-05-08</p>
        </header>

        <div className="grid grid-cols-12 gap-6">
          <div className="col-span-3">
            <Card eyebrow="Total submissions" title="1,284" />
          </div>
          <div className="col-span-3">
            <Card eyebrow="Emails sent" title="971" />
          </div>
          <div className="col-span-3">
            <Card eyebrow="Failed" title="14" />
          </div>
          <div className="col-span-3">
            <Card eyebrow="Top emotion" title="Happy" />
          </div>

          <div className="col-span-8">
            <Card eyebrow="Live capture" title="Emotion Detection">
              <p className="text-[var(--ink-secondary)]">Webcam panel mounts here.</p>
            </Card>
          </div>
          <div className="col-span-4 space-y-4">
            <Card eyebrow="Statuses">
              <div className="flex flex-wrap gap-2">
                {["pending","emotion_detected","email_sent","email_failed","no_face_detected"].map(s => (
                  <StatusBadge key={s} status={s} />
                ))}
              </div>
            </Card>
          </div>
        </div>
      </div>
    </main>
  );
}
```

- [ ] **Step 2: Run dev and visually confirm**

Run: `cd frontend && npm run dev`
Open: `http://localhost:3000/_design-preview/`

Expected: warm off-white canvas, hairline-bordered cards, serif display numbers, small-caps eyebrows, no purple, no rounded shadows, single rust accent unused on this page (will appear on buttons later).

- [ ] **Step 3: Take a Playwright screenshot for the user sign-off**

Run from repo root:

```bash
npx -y playwright@latest screenshot --viewport-size=1440,900 http://localhost:3000/_design-preview/ docs/reports/design-preview-2026-05-08.png
```

Expected: PNG written.

- [ ] **Step 4: 🛑 Stop and show the screenshot to the user**

Pause. Wait for the user to confirm "go" or request adjustments to the tokens before proceeding to Phase B. Adjustments at this point are 5-min token tweaks; the same change after Phase H is a multi-hour reskin.

- [ ] **Step 5: Commit (preview page kept temporarily; deletion is Task I3)**

```bash
git add frontend/app/_design-preview docs/reports/design-preview-2026-05-08.png
git commit -m "chore(frontend): design preview snapshot for review"
```

---

# Phase B — Backend admin auth (Lambda Authorizer + SSM)

> Real auth path. Folds in roadmap items AWS-58 + AWS-64.

### Task B1: Create the admin-login Lambda

**Files:**
- Create: `lambdas/admin-login/index.ts`
- Create: `lambdas/admin-login/package.json` (only if your repo uses per-Lambda package boundaries — check sibling folders first; if they're shared via root package.json, skip).

- [ ] **Step 1: Sibling check**

Run: `ls lambdas/analytics-emotions/`
If you see only `index.ts`, this repo uses the root `package.json` for Lambda deps. Skip the per-Lambda `package.json`.

- [ ] **Step 2: Write the login Lambda**

```ts
import { APIGatewayProxyHandler } from "aws-lambda";
import { SSMClient, GetParameterCommand } from "@aws-sdk/client-ssm";

const ssm = new SSMClient({});
const USERNAME_PARAM = process.env.ADMIN_USERNAME_PARAM!;
const PASSWORD_PARAM = process.env.ADMIN_PASSWORD_PARAM!;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type,Authorization",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
};

export const handler: APIGatewayProxyHandler = async (event) => {
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: cors, body: "" };

  let username = "", password = "";
  try {
    const body = JSON.parse(event.body ?? "{}");
    username = String(body.username ?? "");
    password = String(body.password ?? "");
  } catch {
    return { statusCode: 400, headers: cors, body: JSON.stringify({ error: "Invalid JSON" }) };
  }

  if (!username || !password) {
    return { statusCode: 400, headers: cors, body: JSON.stringify({ error: "Missing credentials" }) };
  }

  const [u, p] = await Promise.all([
    ssm.send(new GetParameterCommand({ Name: USERNAME_PARAM })),
    ssm.send(new GetParameterCommand({ Name: PASSWORD_PARAM, WithDecryption: true })),
  ]);

  if (username !== u.Parameter?.Value || password !== p.Parameter?.Value) {
    return { statusCode: 401, headers: cors, body: JSON.stringify({ error: "Invalid credentials" }) };
  }

  const token = Buffer.from(`${username}:${password}`).toString("base64");
  return { statusCode: 200, headers: cors, body: JSON.stringify({ token }) };
};
```

- [ ] **Step 3: Commit**

```bash
git add lambdas/admin-login/
git commit -m "feat(admin): add login Lambda validating SSM credentials"
```

---

### Task B2: Create the admin-authorizer Lambda

**Files:**
- Create: `lambdas/admin-authorizer/index.ts`

- [ ] **Step 1: Write the authorizer**

```ts
import { APIGatewayTokenAuthorizerHandler, APIGatewayAuthorizerResult } from "aws-lambda";
import { SSMClient, GetParameterCommand } from "@aws-sdk/client-ssm";

const ssm = new SSMClient({});
const USERNAME_PARAM = process.env.ADMIN_USERNAME_PARAM!;
const PASSWORD_PARAM = process.env.ADMIN_PASSWORD_PARAM!;

// 60-second module-scope cache — same pattern as analytics-emotions.
let cache: { username: string; password: string; expiresAt: number } | null = null;

async function getCreds() {
  if (cache && cache.expiresAt > Date.now()) return cache;
  const [u, p] = await Promise.all([
    ssm.send(new GetParameterCommand({ Name: USERNAME_PARAM })),
    ssm.send(new GetParameterCommand({ Name: PASSWORD_PARAM, WithDecryption: true })),
  ]);
  cache = {
    username: u.Parameter?.Value ?? "",
    password: p.Parameter?.Value ?? "",
    expiresAt: Date.now() + 60_000,
  };
  return cache;
}

function policy(effect: "Allow" | "Deny", resource: string, principal = "admin"): APIGatewayAuthorizerResult {
  return {
    principalId: principal,
    policyDocument: {
      Version: "2012-10-17",
      Statement: [{ Action: "execute-api:Invoke", Effect: effect, Resource: resource }],
    },
  };
}

export const handler: APIGatewayTokenAuthorizerHandler = async (event) => {
  const token = event.authorizationToken ?? "";
  const match = token.match(/^Basic\s+(.+)$/i);
  if (!match) return policy("Deny", event.methodArn);

  const decoded = Buffer.from(match[1], "base64").toString("utf-8");
  const idx = decoded.indexOf(":");
  if (idx < 0) return policy("Deny", event.methodArn);
  const u = decoded.slice(0, idx);
  const p = decoded.slice(idx + 1);

  const creds = await getCreds();
  if (u !== creds.username || p !== creds.password) return policy("Deny", event.methodArn);
  return policy("Allow", event.methodArn);
};
```

- [ ] **Step 2: Commit**

```bash
git add lambdas/admin-authorizer/
git commit -m "feat(admin): add API Gateway token authorizer with SSM cache"
```

---

### Task B3: Create the admin-submissions Lambda (production replacement for the dev Next.js route)

**Files:**
- Create: `lambdas/admin-submissions/index.ts`

- [ ] **Step 1: Port the logic from `frontend/app/api/admin/submissions/route.dev.ts`**

```ts
import { APIGatewayProxyHandler } from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, ScanCommand } from "@aws-sdk/lib-dynamodb";

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const TABLE = process.env.SUBMISSIONS_TABLE_NAME!;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type,Authorization",
  "Access-Control-Allow-Methods": "GET,OPTIONS",
};

const maskEmail = (e: string) => e.replace(/(.{2}).+(@.+)/, "$1***$2");

export const handler: APIGatewayProxyHandler = async () => {
  const result = await ddb.send(new ScanCommand({ TableName: TABLE }));
  const items = (result.Items ?? [])
    .map(i => ({
      submissionId:    i.submissionId,
      email:           maskEmail(i.email ?? ""),
      timestamp:       i.timestamp ?? "",
      status:          i.status ?? "",
      dominantEmotion: i.dominantEmotion,
      emotionScores:   i.emotionScores,
      emailSentAt:     i.emailSentAt,
      templateUsed:    i.templateUsed,
    }))
    .sort((a, b) => String(b.timestamp).localeCompare(String(a.timestamp)));

  const byEmotion: Record<string, number> = {};
  let emailSentCount = 0, emailFailedCount = 0;
  for (const it of items) {
    if (it.dominantEmotion) byEmotion[it.dominantEmotion] = (byEmotion[it.dominantEmotion] ?? 0) + 1;
    if (it.status === "email_sent")   emailSentCount++;
    if (it.status === "email_failed") emailFailedCount++;
  }

  return {
    statusCode: 200,
    headers: { ...cors, "Content-Type": "application/json" },
    body: JSON.stringify({
      submissions: items,
      analytics: { total: items.length, byEmotion, emailSentCount, emailFailedCount },
    }),
  };
};
```

- [ ] **Step 2: Commit**

```bash
git add lambdas/admin-submissions/
git commit -m "feat(admin): add submissions list Lambda (production path)"
```

---

### Task B4: Create the AdminAuthStack CDK construct

**Files:**
- Create: `lib/admin-auth-stack.ts`

- [ ] **Step 1: Scaffold the stack**

```ts
import * as cdk from "aws-cdk-lib";
import * as ssm from "aws-cdk-lib/aws-ssm";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as apigateway from "aws-cdk-lib/aws-apigateway";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import { Construct } from "constructs";
import * as path from "path";

interface AdminAuthStackProps extends cdk.StackProps {
  submissionsTable: dynamodb.Table;
}

export class AdminAuthStack extends cdk.Stack {
  public readonly authorizer: apigateway.RequestAuthorizer | apigateway.TokenAuthorizer;
  public readonly api: apigateway.RestApi;

  constructor(scope: Construct, id: string, props: AdminAuthStackProps) {
    super(scope, id, props);

    const usernameParam = "/satisfaction-meter/admin/username";
    const passwordParam = "/satisfaction-meter/admin/password";

    // SSM params are created MANUALLY via CLI (see roadmap addendum) — not here, so the
    // stack doesn't see plaintext credentials. We only grant read access.

    const env = {
      ADMIN_USERNAME_PARAM: usernameParam,
      ADMIN_PASSWORD_PARAM: passwordParam,
    };

    const grantSsm = (fn: lambda.IFunction) => {
      ssm.StringParameter.fromStringParameterName(this, `Username${fn.node.id}`, usernameParam).grantRead(fn);
      ssm.StringParameter.fromSecureStringParameterAttributes(this, `Password${fn.node.id}`, {
        parameterName: passwordParam,
      }).grantRead(fn);
    };

    const loginFn = new NodejsFunction(this, "AdminLoginFunction", {
      runtime: lambda.Runtime.NODEJS_22_X,
      entry: path.join(__dirname, "../lambdas/admin-login/index.ts"),
      handler: "handler",
      timeout: cdk.Duration.seconds(5),
      environment: env,
    });
    grantSsm(loginFn);

    const authorizerFn = new NodejsFunction(this, "AdminAuthorizerFunction", {
      runtime: lambda.Runtime.NODEJS_22_X,
      entry: path.join(__dirname, "../lambdas/admin-authorizer/index.ts"),
      handler: "handler",
      timeout: cdk.Duration.seconds(5),
      environment: env,
    });
    grantSsm(authorizerFn);

    const submissionsFn = new NodejsFunction(this, "AdminSubmissionsFunction", {
      runtime: lambda.Runtime.NODEJS_22_X,
      entry: path.join(__dirname, "../lambdas/admin-submissions/index.ts"),
      handler: "handler",
      timeout: cdk.Duration.seconds(10),
      environment: { SUBMISSIONS_TABLE_NAME: props.submissionsTable.tableName },
    });
    props.submissionsTable.grantReadData(submissionsFn);

    this.api = new apigateway.RestApi(this, "AdminApi", {
      restApiName: "satisfaction-meter-admin",
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: ["GET", "POST", "OPTIONS"],
        allowHeaders: ["Content-Type", "Authorization"],
      },
    });

    this.authorizer = new apigateway.TokenAuthorizer(this, "AdminTokenAuthorizer", {
      handler: authorizerFn,
      identitySource: "method.request.header.Authorization",
      resultsCacheTtl: cdk.Duration.minutes(5),
    });

    const admin = this.api.root.addResource("admin");
    admin.addResource("login").addMethod("POST", new apigateway.LambdaIntegration(loginFn)); // unauth
    admin.addResource("submissions").addMethod("GET", new apigateway.LambdaIntegration(submissionsFn), {
      authorizer: this.authorizer,
    });

    new cdk.CfnOutput(this, "AdminApiUrl", { value: this.api.url, description: "Base URL for /admin/*" });
    new cdk.CfnOutput(this, "AdminLoginUrl", { value: `${this.api.url}admin/login` });
  }
}
```

- [ ] **Step 2: Build to confirm typing**

Run: `npm run build`
Expected: TS compiles.

- [ ] **Step 3: Commit**

```bash
git add lib/admin-auth-stack.ts
git commit -m "feat(cdk): add AdminAuthStack with login + token authorizer"
```

---

### Task B5: Wire AdminAuthStack into the CDK app entry

**Files:**
- Modify: `bin/satisfaction-meter.ts`

- [ ] **Step 1: Import and instantiate after CaptureStack**

Add after the `captureStack` declaration:

```ts
import { AdminAuthStack } from "../lib/admin-auth-stack";
// ... after captureStack:
const adminAuthStack = new AdminAuthStack(app, "SatisfactionMeterAdminAuth", {
  env,
  submissionsTable: captureStack.submissionsTable,
});
adminAuthStack.addDependency(captureStack);
```

- [ ] **Step 2: Build**

Run: `npm run build && npx cdk synth SatisfactionMeterAdminAuth`
Expected: synth produces a CFN template; no errors.

- [ ] **Step 3: Commit**

```bash
git add bin/satisfaction-meter.ts
git commit -m "feat(cdk): instantiate AdminAuthStack in app entry"
```

---

### Task B6: Create SSM parameters out-of-band

**Files:**
- (no code changes — operational step)

- [ ] **Step 1: Pick credentials**

Use a memorable but non-trivial password. Suggestion: `username=admin`, `password=` 16-char random — generate via `openssl rand -base64 16` or pick yourself.

- [ ] **Step 2: Create SSM parameters via AWS CLI**

```bash
aws ssm put-parameter --region ap-southeast-1 \
  --name /satisfaction-meter/admin/username --type String --value "admin"

aws ssm put-parameter --region ap-southeast-1 \
  --name /satisfaction-meter/admin/password --type SecureString --value "<paste-password-here>"
```

Expected: each returns `{ "Version": 1, ... }`.

- [ ] **Step 3: Record the credentials in a private note**

Save the password in your password manager. Do NOT commit it. Do NOT paste into CLAUDE.md or roadmap.

---

### Task B7: Deploy the admin auth stack

**Files:**
- (deploy)

- [ ] **Step 1: Deploy**

Run: `npx cdk deploy SatisfactionMeterAdminAuth`
Expected: stack creates; outputs `AdminApiUrl` and `AdminLoginUrl` printed to stdout. Capture both.

- [ ] **Step 2: Smoke-test login (success)**

```bash
ADMIN_API="<paste AdminApiUrl from output, ending with trailing slash>"
curl -sS -X POST "${ADMIN_API}admin/login" \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"<password>"}'
```

Expected: HTTP 200 with `{"token":"YWRtaW46..."}`.

- [ ] **Step 3: Smoke-test login (failure)**

```bash
curl -sS -X POST "${ADMIN_API}admin/login" \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"wrong"}'
```

Expected: HTTP 401 `{"error":"Invalid credentials"}`.

- [ ] **Step 4: Smoke-test authorizer denies missing header**

```bash
curl -i "${ADMIN_API}admin/submissions"
```

Expected: HTTP 401 (no Authorization header).

- [ ] **Step 5: Smoke-test authorizer allows valid token**

```bash
TOKEN="<paste token from Step 2>"
curl -sS "${ADMIN_API}admin/submissions" -H "Authorization: Basic ${TOKEN}" | head -c 400
```

Expected: HTTP 200, JSON `{"submissions":[...],"analytics":{...}}`.

- [ ] **Step 6: Record the deployed URLs**

Add a note in `docs/reports/admin-auth-deploy-2026-05-08.md` with the AdminApiUrl, the test commands, and the date.

```bash
git add docs/reports/admin-auth-deploy-2026-05-08.md
git commit -m "docs(reports): admin auth stack deploy + smoke test 2026-05-08"
```

---

# Phase C — Wire authorizer onto /analytics/*

> Closes AWS-69.

### Task C1: Make AnalyticsStack accept an authorizer prop

**Files:**
- Modify: `lib/analytics-stack.ts`

- [ ] **Step 1: Extend the props**

Change the `AnalyticsStackProps` interface to accept `authorizer: apigateway.IAuthorizer` (and import `IAuthorizer` from `aws-cdk-lib/aws-apigateway`).

- [ ] **Step 2: Apply the authorizer to each /analytics/* method**

Replace the 3 `addMethod` calls so each one passes `{ authorizer: props.authorizer, authorizationType: apigateway.AuthorizationType.CUSTOM }`.

- [ ] **Step 3: Build**

Run: `npm run build && npx cdk synth SatisfactionMeterAnalytics`
Expected: synth includes `AuthorizationType: CUSTOM` on each method.

- [ ] **Step 4: Commit**

```bash
git add lib/analytics-stack.ts
git commit -m "feat(cdk): protect /analytics/* with admin authorizer"
```

---

### Task C2: Pass authorizer into AnalyticsStack from the app entry

**Files:**
- Modify: `bin/satisfaction-meter.ts`

- [ ] **Step 1: Pass `authorizer: adminAuthStack.authorizer` into the AnalyticsStack constructor; add `analyticsStack.addDependency(adminAuthStack);`**

- [ ] **Step 2: Build + synth**

Run: `npm run build && npx cdk synth`
Expected: all stacks synth.

- [ ] **Step 3: Deploy**

Run: `npx cdk deploy SatisfactionMeterAnalytics`
Expected: in-place update succeeds.

- [ ] **Step 4: Smoke-test analytics now requires auth**

```bash
ANALYTICS_API="<existing AnalyticsApiUrl>"
curl -i "${ANALYTICS_API}/emotions"                                          # expect 401
curl -i "${ANALYTICS_API}/emotions" -H "Authorization: Basic ${TOKEN}" | head -c 200  # expect 200 JSON
```

- [ ] **Step 5: Commit**

```bash
git add bin/satisfaction-meter.ts
git commit -m "feat(cdk): wire admin authorizer into analytics stack"
```

---

# Phase D — Frontend auth plumbing

### Task D1: Add `lib/auth.ts` with sessionStorage helpers + `useAuth` hook

**Files:**
- Create: `frontend/lib/auth.ts`

- [ ] **Step 1: Write the module**

```ts
"use client";

import { useEffect, useState } from "react";

const KEY = "sm_admin_token";

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return sessionStorage.getItem(KEY);
}

export function setToken(token: string) {
  sessionStorage.setItem(KEY, token);
  window.dispatchEvent(new Event("sm-auth-change"));
}

export function clearToken() {
  sessionStorage.removeItem(KEY);
  window.dispatchEvent(new Event("sm-auth-change"));
}

export function useAuth() {
  const [token, setT] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setT(getToken());
    setHydrated(true);
    const onChange = () => setT(getToken());
    window.addEventListener("sm-auth-change", onChange);
    window.addEventListener("storage", onChange);
    return () => {
      window.removeEventListener("sm-auth-change", onChange);
      window.removeEventListener("storage", onChange);
    };
  }, []);

  return { token, isAuthed: hydrated && !!token, hydrated };
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/lib/auth.ts
git commit -m "feat(frontend): sessionStorage auth helpers + useAuth hook"
```

---

### Task D2: Add `lib/adminApi.ts` and `lib/analytics.ts`

**Files:**
- Create: `frontend/lib/adminApi.ts`
- Create: `frontend/lib/analytics.ts`

- [ ] **Step 1: Write `adminApi.ts`**

```ts
import { getToken } from "./auth";

// CfnOutput from API Gateway includes a trailing slash; the .env.local.example
// shows it without. Strip defensively so neither form double-slashes paths.
const ADMIN_API = (process.env.NEXT_PUBLIC_ADMIN_API ?? "").replace(/\/$/, "");

export async function login(username: string, password: string): Promise<string> {
  const res = await fetch(`${ADMIN_API}/admin/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Login failed (${res.status})`);
  }
  return (await res.json()).token as string;
}

export interface SubmissionRow {
  submissionId: string;
  email: string;
  timestamp: string;
  status: string;
  dominantEmotion?: string;
  emotionScores?: Record<string, number>;
  emailSentAt?: string;
  templateUsed?: string;
}

export interface SubmissionsResponse {
  submissions: SubmissionRow[];
  analytics: {
    total: number;
    byEmotion: Record<string, number>;
    emailSentCount: number;
    emailFailedCount: number;
  };
}

export async function fetchSubmissions(): Promise<SubmissionsResponse> {
  const token = getToken();
  if (!token) throw new Error("Not authenticated");
  const res = await fetch(`${ADMIN_API}/admin/submissions`, {
    headers: { Authorization: `Basic ${token}` },
  });
  if (res.status === 401) throw new Error("Session expired");
  if (!res.ok) throw new Error(`Failed (${res.status})`);
  return res.json();
}
```

- [ ] **Step 2: Write `analytics.ts`**

```ts
import { getToken } from "./auth";

const ANALYTICS_API = (process.env.NEXT_PUBLIC_ANALYTICS_API ?? "").replace(/\/$/, "");

function authedGet<T>(path: string): Promise<T> {
  const token = getToken();
  if (!token) throw new Error("Not authenticated");
  return fetch(`${ANALYTICS_API}${path}`, {
    headers: { Authorization: `Basic ${token}` },
  }).then(async r => {
    if (r.status === 401) throw new Error("Session expired");
    if (!r.ok) throw new Error(`Failed (${r.status})`);
    return r.json() as Promise<T>;
  });
}

export interface EmotionsResponse {
  byEmotion: Record<string, number>;
  total: number;
}
export interface CampaignsResponse {
  totalSent: number;
  perTemplate: Record<string, number>;
  earliestSentAt?: string;
  latestSentAt?: string;
}
export interface TrendsResponse {
  days: Array<{ date: string; counts: Record<string, number> }>;
}

export const fetchEmotions  = () => authedGet<EmotionsResponse>("/emotions");
export const fetchCampaigns = () => authedGet<CampaignsResponse>("/campaigns");
export const fetchTrends    = () => authedGet<TrendsResponse>("/trends");
```

> **Note for the engineer:** the actual response shapes for `/emotions /campaigns /trends` come from `lambdas/analytics-emotions`, `analytics-campaigns`, `analytics-trends`. Open each one and confirm the field names match the interfaces above **before** wiring the cards in Phase H. Adjust the interfaces (and the cards) if the real shapes differ. In each Phase H card, use defensive access (`data?.byEmotion ?? {}`, `data?.days ?? []`) so a partial response doesn't crash render.

- [ ] **Step 3: Commit**

```bash
git add frontend/lib/adminApi.ts frontend/lib/analytics.ts
git commit -m "feat(frontend): typed clients for /admin/* and /analytics/*"
```

---

### Task D3: Add `.env.local.example` entries

**Files:**
- Modify: `frontend/.env.local.example` (create if it does not exist)

- [ ] **Step 1: Document the new env vars**

```
# Backend API URLs (CloudFront frontend talks to these)
# IMPORTANT: do NOT include a trailing slash. The clients strip one defensively
# but consistent values keep curl smoke-test commands and CfnOutput pasting clean.
NEXT_PUBLIC_UPLOAD_API=https://<id>.execute-api.ap-southeast-1.amazonaws.com/prod/upload
NEXT_PUBLIC_RESULTS_API=https://<id>.execute-api.ap-southeast-1.amazonaws.com/prod/results
NEXT_PUBLIC_ANALYTICS_API=https://<id>.execute-api.ap-southeast-1.amazonaws.com/prod/analytics
NEXT_PUBLIC_ADMIN_API=https://<id>.execute-api.ap-southeast-1.amazonaws.com/prod
```

- [ ] **Step 2: Set the values for local dev in `.env.local`** (NOT committed)

Paste real URLs from CDK outputs.

- [ ] **Step 3: Commit example file**

```bash
git add frontend/.env.local.example
git commit -m "docs(frontend): document analytics + admin API env vars"
```

---

### Task D4: Build the LoginForm component

**Files:**
- Create: `frontend/components/auth/LoginForm.tsx`

- [ ] **Step 1: Write the form**

```tsx
"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { login } from "@/lib/adminApi";
import { setToken } from "@/lib/auth";

export default function LoginForm() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr(null);
    try {
      const token = await login(username, password);
      setToken(token);
      router.push("/home/");
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <div>
        <label htmlFor="u" className="eyebrow block mb-1.5">Username</label>
        <input id="u" autoComplete="username" required value={username} onChange={e => setUsername(e.target.value)}
          className="w-full bg-[var(--bg-canvas)] border border-[var(--rule)] px-3.5 py-2.5 text-[15px] focus:outline-none focus:border-[var(--accent)] transition-colors"
          style={{ borderRadius: 2 }} />
      </div>
      <div>
        <label htmlFor="p" className="eyebrow block mb-1.5">Password</label>
        <input id="p" type="password" autoComplete="current-password" required value={password} onChange={e => setPassword(e.target.value)}
          className="w-full bg-[var(--bg-canvas)] border border-[var(--rule)] px-3.5 py-2.5 text-[15px] focus:outline-none focus:border-[var(--accent)] transition-colors"
          style={{ borderRadius: 2 }} />
      </div>
      {err && <p className="text-[13px]" style={{ color: "var(--status-error)" }}>{err}</p>}
      <button type="submit" disabled={busy}
        className="w-full bg-[var(--ink-primary)] text-[var(--bg-canvas)] py-3 text-[14px] font-semibold tracking-wide uppercase hover:bg-[var(--accent)] disabled:opacity-50 transition-colors"
        style={{ borderRadius: 2, letterSpacing: "0.08em" }}>
        {busy ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/components/auth/LoginForm.tsx
git commit -m "feat(frontend): admin login form"
```

---

### Task D5: Build the AuthGuard

**Files:**
- Create: `frontend/components/auth/AuthGuard.tsx`

- [ ] **Step 1: Write the guard**

```tsx
"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const { isAuthed, hydrated } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (hydrated && !isAuthed) router.replace("/login/");
  }, [hydrated, isAuthed, router]);

  if (!hydrated) return null;          // first paint, sessionStorage not read yet
  if (!isAuthed) return null;          // redirecting
  return <>{children}</>;
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/components/auth/AuthGuard.tsx
git commit -m "feat(frontend): client-side AuthGuard wrapper"
```

---

# Phase E — Routing: /login, /home, root redirect

### Task E1: Build `/login/` page

**Files:**
- Create: `frontend/app/login/page.tsx`

- [ ] **Step 1: Write a centered login screen**

```tsx
import LoginForm from "@/components/auth/LoginForm";

export default function LoginPage() {
  return (
    <main className="min-h-screen bg-[var(--bg-canvas)] flex items-center justify-center px-6">
      <div className="w-full max-w-[440px]">
        <header className="mb-8 text-center">
          <p className="eyebrow mb-2">Satisfaction Meter</p>
          <h1 className="display text-[36px] leading-tight">Admin Sign-in</h1>
          <p className="mt-3 text-[14px] text-[var(--ink-tertiary)]">
            Authorized personnel only.
          </p>
        </header>
        <div className="bg-[var(--bg-surface)] border border-[var(--rule)] p-8" style={{ borderRadius: 2 }}>
          <LoginForm />
        </div>
        <p className="mt-6 text-center text-[12px] text-[var(--ink-tertiary)]">
          Photos processed for emotion detection are deleted within 30 days.
        </p>
      </div>
    </main>
  );
}
```

- [ ] **Step 2: Build to confirm**

Run: `cd frontend && npm run build`
Expected: build succeeds; `/login/` is exported.

- [ ] **Step 3: Commit**

```bash
git add frontend/app/login/page.tsx
git commit -m "feat(frontend): add /login page"
```

---

### Task E2: Replace root `/` with a redirect

**Files:**
- Rewrite: `frontend/app/page.tsx`

- [ ] **Step 1: Overwrite with a redirect-on-mount client component**

```tsx
"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";

export default function Root() {
  const router = useRouter();
  const { isAuthed, hydrated } = useAuth();

  useEffect(() => {
    if (!hydrated) return;
    router.replace(isAuthed ? "/home/" : "/login/");
  }, [hydrated, isAuthed, router]);

  return (
    <main className="min-h-screen bg-[var(--bg-canvas)] flex items-center justify-center">
      <p className="eyebrow">Loading…</p>
    </main>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/app/page.tsx
git commit -m "feat(frontend): root redirects based on auth state"
```

---

### Task E3: Delete the old `/admin/` page and dev-only API route

**Files:**
- Delete: `frontend/app/admin/page.tsx`
- Delete: `frontend/app/api/admin/submissions/route.dev.ts`

- [ ] **Step 1: Remove the files**

```bash
rm frontend/app/admin/page.tsx
rm frontend/app/api/admin/submissions/route.dev.ts
rmdir frontend/app/admin frontend/app/api/admin/submissions frontend/app/api/admin frontend/app/api 2>/dev/null
```

- [ ] **Step 2: Verify no lingering imports**

Run: Grep for `mockAnalytics|app/admin/|/api/admin/` across `frontend/`.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "chore(frontend): drop old /admin page and dev-only DDB route"
```

---

# Phase F — /home shell (header, layout, guard)

### Task F1: Build AppHeader

**Files:**
- Create: `frontend/components/layout/AppHeader.tsx`

- [ ] **Step 1: Write the header**

```tsx
"use client";
import { useRouter } from "next/navigation";
import { clearToken } from "@/lib/auth";

export default function AppHeader() {
  const router = useRouter();
  function logout() {
    clearToken();
    router.replace("/login/");
  }
  return (
    <header className="border-b border-[var(--rule)] bg-[var(--bg-surface)]">
      <div className="max-w-[1280px] mx-auto px-12 py-4 flex items-baseline justify-between">
        <div className="flex items-baseline gap-4">
          <h1 className="display text-[22px] leading-none">Satisfaction Meter</h1>
          <span className="eyebrow">Admin Console</span>
        </div>
        <button onClick={logout}
          className="text-[12px] uppercase tracking-wider font-semibold text-[var(--ink-secondary)] hover:text-[var(--accent)] transition-colors"
          style={{ letterSpacing: "0.12em" }}>
          Sign out
        </button>
      </div>
    </header>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/components/layout/AppHeader.tsx
git commit -m "feat(frontend): app header with sign-out"
```

---

### Task F2: Build the `/home/` page shell

**Files:**
- Create: `frontend/app/home/page.tsx`

- [ ] **Step 1: Write the layout shell with placeholder slots**

```tsx
"use client";
import AuthGuard from "@/components/auth/AuthGuard";
import AppHeader from "@/components/layout/AppHeader";
import Card from "@/components/ui/Card";

export default function Home() {
  return (
    <AuthGuard>
      <div className="min-h-screen bg-[var(--bg-canvas)]">
        <AppHeader />
        <main className="max-w-[1280px] mx-auto px-12 py-10 space-y-6">
          {/* KPI strip */}
          <div id="kpi-slot" className="grid grid-cols-12 gap-6" />

          {/* Primary grid */}
          <div className="grid grid-cols-12 gap-6">
            <div className="col-span-7"><div id="capture-slot"><Card eyebrow="Live capture" title="Loading…"><div /></Card></div></div>
            <div className="col-span-5 space-y-6">
              <div id="emotions-slot"><Card eyebrow="Emotion mix" title="Loading…"><div /></Card></div>
              <div id="campaigns-slot"><Card eyebrow="Campaigns" title="Loading…"><div /></Card></div>
            </div>

            <div className="col-span-12"><div id="trends-slot"><Card eyebrow="30-day trend" title="Loading…"><div /></Card></div></div>
            <div className="col-span-12"><div id="audit-slot"><Card eyebrow="Audit trail" title="Loading…"><div /></Card></div></div>
          </div>
        </main>
      </div>
    </AuthGuard>
  );
}
```

> Slots are placeholders — replaced in subsequent tasks. Building it skeleton-first lets us verify the grid math before stuffing real content in.

- [ ] **Step 2: Build, run dev, log in, verify the shell**

Run: `cd frontend && npm run dev`
Manually log in at `/login/` (use the SSM-stored creds).
Confirm `/home/` renders 4 placeholder cards in a 12-col grid, header is sticky-ish, sign-out works.

- [ ] **Step 3: Commit**

```bash
git add frontend/app/home/page.tsx
git commit -m "feat(frontend): /home grid shell behind AuthGuard"
```

---

# Phase G — Live capture card (move emotion detection in)

### Task G1: Wrap WebcamFeed + email input as a single card

**Files:**
- Create: `frontend/components/home/EmotionCapturePanel.tsx`
- Modify: `frontend/components/WebcamFeed.tsx` (minor restyle only — borders, fonts; logic unchanged)

- [ ] **Step 1: Write EmotionCapturePanel**

```tsx
"use client";
import { useState } from "react";
import Card from "@/components/ui/Card";
import WebcamFeed from "@/components/WebcamFeed";

export default function EmotionCapturePanel() {
  const [email, setEmail] = useState("");
  return (
    <Card eyebrow="Live capture" title="Emotion Detection">
      <div className="space-y-5">
        <div>
          <label htmlFor="email" className="eyebrow block mb-1.5">
            Recipient email <span style={{ color: "var(--accent)" }}>*</span>
          </label>
          <input id="email" type="email" required autoComplete="email" placeholder="recipient@example.com"
            value={email} onChange={e => setEmail(e.target.value)}
            className="w-full bg-[var(--bg-canvas)] border border-[var(--rule)] px-3.5 py-2.5 text-[15px] focus:outline-none focus:border-[var(--accent)] transition-colors"
            style={{ borderRadius: 2 }} />
          <p className="mt-1.5 text-[12px] text-[var(--ink-tertiary)]">
            Until SES production access lands, use a verified address (alexvelo199@gmail.com).
          </p>
        </div>
        <WebcamFeed email={email} />
      </div>
    </Card>
  );
}
```

- [ ] **Step 2: Restyle WebcamFeed buttons + status copy to match new tokens**

Open `frontend/components/WebcamFeed.tsx` and replace existing button class strings to match new aesthetic. Specifically:

- Replace `rounded-lg bg-slate-800 ... hover:bg-slate-700` with sharp-cornered rust hover variants. Use this className helper at top of file:
  ```ts
  const PRIMARY_BTN = "bg-[var(--ink-primary)] text-[var(--bg-canvas)] py-2.5 text-[13px] font-semibold uppercase tracking-wider hover:bg-[var(--accent)] disabled:opacity-50 transition-colors";
  const SECONDARY_BTN = "border border-[var(--rule)] text-[var(--ink-secondary)] py-2.5 text-[13px] font-semibold uppercase tracking-wider hover:bg-[var(--bg-inset)] disabled:opacity-50 transition-colors";
  ```
  with `style={{ borderRadius: 2, letterSpacing: "0.08em" }}` on each `<button>`.
- Replace inline `bg-green-50 / bg-amber-50 / bg-red-50 / bg-slate-50` panels in `ResultPanel` with the same off-white surface + colored eyebrow text + status-tinted left rule (1px). Avoid full bg fills.
- Replace mode tabs `bg-slate-50` underline-style: hairline strip with current tab on rust accent underline 2px.
- Logic, hooks, refs, snap behavior, drag-drop — **leave untouched**. Only class strings + small wrapper divs.

- [ ] **Step 3: Mount the panel in /home**

Edit `frontend/app/home/page.tsx` and replace the `capture-slot` placeholder div with `<EmotionCapturePanel />`. Drop the `id="capture-slot"` div.

- [ ] **Step 4: Build + browser-verify**

Run: `cd frontend && npm run build && npm run dev`
Open `/home/`, confirm webcam mounts inside the card, snap+upload still works against the deployed backend.

- [ ] **Step 5: Commit**

```bash
git add frontend/components/home/EmotionCapturePanel.tsx frontend/components/WebcamFeed.tsx frontend/app/home/page.tsx
git commit -m "feat(frontend): EmotionCapturePanel mounts WebcamFeed in /home"
```

---

# Phase H — Analytics + audit cards (live data)

### Task H1: Build the KPI strip

**Files:**
- Create: `frontend/components/home/KpiStrip.tsx`

- [ ] **Step 1: Write the strip — sources count from `/admin/submissions` analytics**

```tsx
"use client";
import { useEffect, useState } from "react";
import { fetchSubmissions, SubmissionsResponse } from "@/lib/adminApi";

function Tile({ eyebrow, value, accent = false }: { eyebrow: string; value: string | number; accent?: boolean }) {
  return (
    <div className="bg-[var(--bg-surface)] border border-[var(--rule)] px-5 py-4" style={{ borderRadius: 2 }}>
      <p className="eyebrow mb-1.5">{eyebrow}</p>
      <p className="display numeric text-[34px] leading-none" style={{ color: accent ? "var(--accent)" : "var(--ink-primary)" }}>
        {value}
      </p>
    </div>
  );
}

export default function KpiStrip() {
  const [data, setData] = useState<SubmissionsResponse | null>(null);
  const [err, setErr]   = useState<string | null>(null);

  useEffect(() => {
    fetchSubmissions().then(setData).catch(e => setErr((e as Error).message));
  }, []);

  if (err) return <div className="col-span-12 text-[13px]" style={{ color: "var(--status-error)" }}>{err}</div>;
  if (!data) return <div className="col-span-12 eyebrow">Loading metrics…</div>;

  const top = Object.entries(data.analytics.byEmotion).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "—";
  return (
    <>
      <div className="col-span-3"><Tile eyebrow="Total submissions" value={data.analytics.total} /></div>
      <div className="col-span-3"><Tile eyebrow="Emails sent"       value={data.analytics.emailSentCount} /></div>
      <div className="col-span-3"><Tile eyebrow="Email failures"    value={data.analytics.emailFailedCount} /></div>
      <div className="col-span-3"><Tile eyebrow="Top emotion"       value={top} accent /></div>
    </>
  );
}
```

- [ ] **Step 2: Mount the strip — replace `<div id="kpi-slot" .../>` in `/home/page.tsx` with `<div className="grid grid-cols-12 gap-6"><KpiStrip /></div>`**

- [ ] **Step 3: Browser-verify**

Confirm 4 tiles render with live numbers from the deployed admin API.

- [ ] **Step 4: Commit**

```bash
git add frontend/components/home/KpiStrip.tsx frontend/app/home/page.tsx
git commit -m "feat(frontend): KPI strip on /home"
```

---

### Task H2: Build EmotionDistributionCard

**Files:**
- Create: `frontend/components/home/EmotionDistributionCard.tsx`

- [ ] **Step 1: Confirm /analytics/emotions response shape**

Open `lambdas/analytics-emotions/index.ts` and read the response object. Adjust the imported `EmotionsResponse` interface in `frontend/lib/analytics.ts` if the field names differ from what the plan assumed.

- [ ] **Step 2: Write the card with a horizontal bar list (no Recharts needed for simple distribution — keeps bundle smaller, but recharts is fine if you prefer)**

```tsx
"use client";
import { useEffect, useState } from "react";
import Card from "@/components/ui/Card";
import { fetchEmotions, EmotionsResponse } from "@/lib/analytics";

const SWATCH: Record<string, string> = {
  happy:     "var(--emotion-happy)",
  surprised: "var(--emotion-surprised)",
  neutral:   "var(--emotion-neutral)",
  calm:      "var(--emotion-calm)",
  sad:       "var(--emotion-sad)",
  angry:     "var(--emotion-angry)",
};

export default function EmotionDistributionCard() {
  const [data, setData] = useState<EmotionsResponse | null>(null);
  const [err, setErr]   = useState<string | null>(null);

  useEffect(() => {
    fetchEmotions().then(setData).catch(e => setErr((e as Error).message));
  }, []);

  return (
    <Card eyebrow="Emotion mix" title="Distribution">
      {err && <p className="text-[13px]" style={{ color: "var(--status-error)" }}>{err}</p>}
      {!err && !data && <p className="eyebrow">Loading…</p>}
      {data && (
        <ul className="space-y-3">
          {Object.entries(data.byEmotion)
            .sort((a, b) => b[1] - a[1])
            .map(([emotion, n]) => {
              const pct = data.total > 0 ? (n / data.total) * 100 : 0;
              return (
                <li key={emotion}>
                  <div className="flex items-baseline justify-between mb-1">
                    <span className="text-[13px] capitalize">{emotion}</span>
                    <span className="numeric text-[12px] text-[var(--ink-tertiary)]">{n} · {pct.toFixed(0)}%</span>
                  </div>
                  <div className="h-1.5 bg-[var(--bg-inset)]">
                    <div className="h-full" style={{ width: `${pct}%`, backgroundColor: SWATCH[emotion.toLowerCase()] ?? "var(--ink-secondary)" }} />
                  </div>
                </li>
              );
            })}
        </ul>
      )}
    </Card>
  );
}
```

- [ ] **Step 3: Mount in /home**

Replace `id="emotions-slot"` div content with `<EmotionDistributionCard />`.

- [ ] **Step 4: Commit**

```bash
git add frontend/components/home/EmotionDistributionCard.tsx frontend/app/home/page.tsx
git commit -m "feat(frontend): emotion distribution card on /home"
```

---

### Task H3: Build CampaignsCard

**Files:**
- Create: `frontend/components/home/CampaignsCard.tsx`

- [ ] **Step 1: Confirm /analytics/campaigns shape (same drill — read `lambdas/analytics-campaigns/index.ts`).**

- [ ] **Step 2: Write the card as a compact ranked table**

```tsx
"use client";
import { useEffect, useState } from "react";
import Card from "@/components/ui/Card";
import { fetchCampaigns, CampaignsResponse } from "@/lib/analytics";

export default function CampaignsCard() {
  const [data, setData] = useState<CampaignsResponse | null>(null);
  const [err, setErr]   = useState<string | null>(null);

  useEffect(() => {
    fetchCampaigns().then(setData).catch(e => setErr((e as Error).message));
  }, []);

  return (
    <Card eyebrow="Campaigns" title="Sent by template">
      {err && <p className="text-[13px]" style={{ color: "var(--status-error)" }}>{err}</p>}
      {!err && !data && <p className="eyebrow">Loading…</p>}
      {data && (
        <table className="w-full text-[13px]">
          <tbody>
            {Object.entries(data.perTemplate).sort((a, b) => b[1] - a[1]).map(([t, n]) => (
              <tr key={t} className="border-b border-[var(--rule)] last:border-0">
                <td className="py-2 capitalize">{t}</td>
                <td className="py-2 text-right numeric">{n}</td>
              </tr>
            ))}
            <tr>
              <td className="pt-3 eyebrow">Total</td>
              <td className="pt-3 text-right numeric font-semibold">{data.totalSent}</td>
            </tr>
          </tbody>
        </table>
      )}
    </Card>
  );
}
```

- [ ] **Step 3: Mount + commit**

Replace `id="campaigns-slot"` div with `<CampaignsCard />`.

```bash
git add frontend/components/home/CampaignsCard.tsx frontend/app/home/page.tsx
git commit -m "feat(frontend): campaigns card on /home"
```

---

### Task H4: Build TrendsCard (Recharts line chart)

**Files:**
- Create: `frontend/components/home/TrendsCard.tsx`

- [ ] **Step 1: Confirm /analytics/trends shape (read `lambdas/analytics-trends/index.ts`).**

- [ ] **Step 2: Write the card using Recharts**

```tsx
"use client";
import { useEffect, useState } from "react";
import Card from "@/components/ui/Card";
import { fetchTrends, TrendsResponse } from "@/lib/analytics";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from "recharts";

const COLOR: Record<string, string> = {
  happy: "#c08a1d", surprised: "#7a4f9b", neutral: "#6e6a64",
  calm: "#3e7d75", sad: "#3d5a78", angry: "#913321",
};

export default function TrendsCard() {
  const [data, setData] = useState<TrendsResponse | null>(null);
  const [err, setErr]   = useState<string | null>(null);

  useEffect(() => {
    fetchTrends().then(setData).catch(e => setErr((e as Error).message));
  }, []);

  if (err) return <Card eyebrow="30-day trend" title="Trend"><p className="text-[13px]" style={{ color: "var(--status-error)" }}>{err}</p></Card>;
  if (!data) return <Card eyebrow="30-day trend" title="Loading…"><div /></Card>;

  // Flatten { date, counts: { happy: n, ... } } → [{ date, happy, ... }]
  const flat = data.days.map(d => ({ date: d.date, ...d.counts }));
  const emotions = Object.keys(COLOR);

  return (
    <Card eyebrow="30-day trend" title="Submissions over time">
      <div style={{ width: "100%", height: 280 }}>
        <ResponsiveContainer>
          <LineChart data={flat} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
            <CartesianGrid stroke="var(--rule)" strokeDasharray="2 4" vertical={false} />
            <XAxis dataKey="date" stroke="var(--ink-tertiary)" fontSize={11} tickLine={false} axisLine={{ stroke: "var(--rule)" }} />
            <YAxis stroke="var(--ink-tertiary)" fontSize={11} tickLine={false} axisLine={{ stroke: "var(--rule)" }} />
            <Tooltip contentStyle={{ background: "var(--bg-surface)", border: "1px solid var(--rule)", borderRadius: 2, fontSize: 12 }} />
            <Legend wrapperStyle={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--ink-tertiary)" }} />
            {emotions.map(em => (
              <Line key={em} type="monotone" dataKey={em} stroke={COLOR[em]} strokeWidth={1.5} dot={false} />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}
```

- [ ] **Step 3: Mount + commit**

Replace `id="trends-slot"` div with `<TrendsCard />`.

```bash
git add frontend/components/home/TrendsCard.tsx frontend/app/home/page.tsx
git commit -m "feat(frontend): trends card on /home (recharts line chart)"
```

---

### Task H5: Build SubmissionsAuditCard (port of old admin table)

**Files:**
- Create: `frontend/components/home/SubmissionsAuditCard.tsx`

- [ ] **Step 1: Write the card composing the new StatusBadge + restyled table**

```tsx
"use client";
import { useCallback, useEffect, useState } from "react";
import Card from "@/components/ui/Card";
import StatusBadge from "@/components/ui/StatusBadge";
import { fetchSubmissions, SubmissionsResponse } from "@/lib/adminApi";

function fmtTime(iso: string) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  } catch { return iso; }
}

export default function SubmissionsAuditCard() {
  const [data, setData] = useState<SubmissionsResponse | null>(null);
  const [err, setErr]   = useState<string | null>(null);

  const load = useCallback(() => {
    setErr(null);
    fetchSubmissions().then(setData).catch(e => setErr((e as Error).message));
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <Card
      eyebrow="Audit trail"
      title="Submissions"
      action={
        <button onClick={load}
          className="text-[12px] uppercase tracking-wider font-semibold text-[var(--ink-secondary)] hover:text-[var(--accent)]"
          style={{ letterSpacing: "0.12em" }}>
          Refresh
        </button>
      }>
      {err && <p className="text-[13px]" style={{ color: "var(--status-error)" }}>{err}</p>}
      {!err && !data && <p className="eyebrow">Loading…</p>}
      {data && (
        data.submissions.length === 0 ? (
          <p className="text-[var(--ink-tertiary)] text-[14px]">No submissions yet.</p>
        ) : (
          <div className="overflow-x-auto -mx-6">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="bg-[var(--bg-inset)]">
                  {["Submission","Time","Email","Status","Emotion","Template","Sent At"].map(h => (
                    <th key={h} className="text-left px-4 py-2 eyebrow font-semibold">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.submissions.map(s => (
                  <tr key={s.submissionId} className="border-b border-[var(--rule)] last:border-0">
                    <td className="px-4 py-2 numeric text-[var(--ink-secondary)]">{s.submissionId.slice(0, 8)}…</td>
                    <td className="px-4 py-2 numeric whitespace-nowrap">{fmtTime(s.timestamp)}</td>
                    <td className="px-4 py-2 text-[var(--ink-secondary)]">{s.email}</td>
                    <td className="px-4 py-2"><StatusBadge status={s.status} /></td>
                    <td className="px-4 py-2 capitalize">{s.dominantEmotion ?? "—"}</td>
                    <td className="px-4 py-2 text-[var(--ink-secondary)]">{s.templateUsed ?? "—"}</td>
                    <td className="px-4 py-2 numeric whitespace-nowrap text-[var(--ink-secondary)]">{s.emailSentAt ? fmtTime(s.emailSentAt) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}
    </Card>
  );
}
```

- [ ] **Step 2: Mount + commit**

Replace `id="audit-slot"` div with `<SubmissionsAuditCard />`.

```bash
git add frontend/components/home/SubmissionsAuditCard.tsx frontend/app/home/page.tsx
git commit -m "feat(frontend): audit trail card on /home"
```

---

# Phase I — Cleanup, deploy, smoke test

### Task I1: Remove `mockAnalytics.ts`

**Files:**
- Delete: `frontend/lib/mockAnalytics.ts`

- [ ] **Step 1: Verify no remaining imports**

Grep for `mockAnalytics` across the repo. Expect 0 hits.

- [ ] **Step 2: Delete + commit**

```bash
rm frontend/lib/mockAnalytics.ts
git add -A
git commit -m "chore(frontend): drop mockAnalytics (replaced by live /analytics)"
```

---

### Task I2: Lint + typecheck the whole frontend

**Files:**
- (no changes if clean)

- [ ] **Step 1: Lint**

Run: `cd frontend && npm run lint`
Expected: zero errors. Fix any unused imports or `any` types introduced by the plan.

- [ ] **Step 2: Production build**

Run: `cd frontend && npm run build`
Expected: build succeeds; static export emits `out/` with `/login/index.html`, `/home/index.html`, `/index.html`. Confirm there is **no** `/admin/index.html` (deleted) and **no** `out/api/` directory.

- [ ] **Step 3: Commit any lint fixes**

```bash
git add -A
git commit -m "chore(frontend): lint + typecheck cleanup"
```

---

### Task I3: Remove design-preview page

**Files:**
- Delete: `frontend/app/_design-preview/`

- [ ] **Step 1: Remove**

```bash
rm -r frontend/app/_design-preview
```

- [ ] **Step 2: Commit**

```bash
git add -A
git commit -m "chore(frontend): drop temporary design preview page"
```

---

### Task I4: Update `docs/roadmap.md`

**Files:**
- Modify: `docs/roadmap.md`

- [ ] **Step 1: Mark AWS-58, AWS-64, AWS-65, AWS-66, AWS-67, AWS-69, AWS-70 complete in Phase 3B**

Walk through each `- [ ]` line under "3B — Admin Portal (Frontend + Auth)" and replace with `- [x]` where this plan completed it. Specifically:
- AWS-58 (Lambda Authorizer + SSM) — ✅ Phase B
- AWS-64 (Login UI) — ✅ Phase E
- AWS-65 (emotion distribution chart) — ✅ Phase H
- AWS-66 (submission volume over time) — ✅ Phase H (TrendsCard)
- AWS-67 (campaign performance table) — ✅ Phase H
- AWS-69 (protect /analytics/* behind authorizer) — ✅ Phase C
- AWS-70 (wire dashboard to real /analytics) — ✅ Phase H
- AWS-59 (trend forecasting / 7-day MA) — **NOT done** by this plan; leave as `- [ ]`

Also strike through the stale `frontend/app/admin/dashboard/` reference in CLAUDE.md (that path never existed) and update it to `frontend/app/home/`.

- [ ] **Step 2: Add a "Date / Decision" row**

```markdown
| 2026-05-08 | Frontend reorganized to admin-only: /login → /home (unified emotion + admin grid) | User pivot — no public end-user; admin runs demo and views analytics from one screen |
| 2026-05-08 | Editorial design system (serif display + warm neutrals + single rust accent) | huashu-design single-direction overhaul — replaces the slate/indigo Tailwind defaults |
```

- [ ] **Step 3: Update "Last updated" header**

Change to `**Last updated**: 2026-05-08 (admin portal overhaul: login + unified /home + new visual system)`.

- [ ] **Step 4: Commit**

```bash
git add docs/roadmap.md
git commit -m "docs(roadmap): mark Phase 3B AWS-58/64/65/66/67/69/70 complete; record overhaul"
```

---

### Task I5: Deploy frontend to CloudFront

**Files:**
- (deploy)

- [ ] **Step 1: Push the branch + open a PR**

```bash
git push -u origin feat/admin-portal-overhaul
gh pr create --title "feat: admin portal overhaul (login + /home grid + visual system)" --body "..."
```

- [ ] **Step 2: Merge to main once CI is green**

This triggers `frontend-deploy.yml` → `aws s3 sync` → CloudFront invalidation. Watch the workflow run.

- [ ] **Step 3: Smoke-test production**

Visit `https://satisfactionmeter.live/`:
- Expect immediate redirect to `/login/`.
- Sign in with the SSM-stored creds.
- Land on `/home/`. Confirm KPI strip, capture card, distribution, campaigns, trends, audit all render with live data.
- Run an end-to-end emotion submission with `alexvelo199@gmail.com` and confirm the audit table updates after a refresh.
- Sign out, confirm redirect to `/login/`, confirm direct visit to `/home/` redirects to `/login/`.

- [ ] **Step 4: Capture a production screenshot for the report**

```bash
npx -y playwright@latest screenshot --viewport-size=1440,1200 https://satisfactionmeter.live/login/ docs/reports/prod-login-2026-05-08.png
```

(Manual session-based screenshot of `/home/` is fine — Playwright can't trivially log in.)

- [ ] **Step 5: Final commit on the PR if any tweaks**

```bash
git push
```

---

## Out-of-scope follow-ups (file as roadmap items, don't do here)

- Tighten admin authorizer cache TTL or rotate creds.
- Add password reset / multi-admin support (Cognito if it grows).
- Replace `/admin/submissions` Scan with paginated Query (cost when table grows).
- 7-day moving-average forecast line on TrendsCard (AWS-59).
- Tighten API Gateway + S3 image bucket CORS from `*` → CloudFront origin (already on roadmap, separate PR).
- Update CLAUDE.md to point at `/home` (currently mentions `/admin/dashboard` which never existed).

---

## Pre-existing repo notes the engineer must know

- We're on Windows + PowerShell. `&&` chains work in pwsh 7+. Use forward slashes in code/paths; `git` handles them.
- The repo uses **CDK CLI** via `npx cdk` (not `cdk-cli` global). Ensure AWS profile is set: `$env:AWS_PROFILE = "personal"` (or whatever the user's profile is) before deploys.
- `frontend/next.config.ts` switches between dev (`pageExtensions: ["ts","tsx","dev.ts","dev.tsx"]`) and prod (just `ts/tsx`). Deletion of `route.dev.ts` doesn't affect prod build but cleans the dev path.
- `face-api.js` weights live in `frontend/public/models/`. `WebcamFeed.tsx` lazily loads them — keep that path intact when restyling.
- **Verified SES recipient** as of 2026-05-06: `alexvelo199@gmail.com`. Until production access is approved, use that for end-to-end demos.
