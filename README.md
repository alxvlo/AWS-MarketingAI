# Satisfaction Meter
**Emotion-Driven Marketing via AWS**

A serverless web application that detects a customer's facial emotion from a photo and automatically dispatches a personalised marketing email matched to their mood — all in under 5 seconds, built entirely on AWS managed services.

---

## What It Does

1. A customer visits the web portal — a live webcam feed starts with a face-detection overlay (green outline when a face is detected, red when not). After 1.5 seconds of stable face detection the snapshot is auto-captured. Manual file upload is also available as a fallback.
2. The snapshot is uploaded directly to **S3** via a presigned URL; this triggers **Amazon Rekognition**, which detects the dominant facial emotion
3. Based on the emotion, a matching email template is selected and sent via **Amazon SES**
4. The result (emotion detected, email sent) is stored in **DynamoDB** and retrievable via a REST API

| Priority | Detected Emotion | Marketing Action |
|---|---|---|
| 1 | Happy | Request a product review |
| 2 | Surprised | Flash deal offer |
| 3 | Calm | General wellness / relaxation offer |
| 4 | Neutral | General promotional offer |
| 5 | Sad | Send a voucher / discount |
| 6 | Angry | Apology + discount |
| 7 | Fearful | Reassurance offer |

> When two emotions tie on confidence, the priority order above wins (HAPPY > SURPRISED > CALM > NEUTRAL > SAD > ANGRY > FEARFUL).

---

## Architecture

```
[Browser Webcam]
        │  (0) face-api.js client-side overlay — auto-snap on 1.5s stable face
        │      (or: manual file upload as fallback)
        ▼
[Browser / End User]
        │  (1) POST /upload — request presigned URL
        ▼
[API Gateway] ──► [Lambda: URL Generator] ──► returns presigned S3 PUT URL
        │
        │  (2) PUT image directly to S3 (browser → S3, no server proxy)
        ▼
[S3 Bucket]  ──► (ObjectCreated event via EventBridge)
        │
        │  (3) Event triggers Lambda
        ▼
[Lambda: Rekognition Handler] ──► [Amazon Rekognition DetectFaces]
        │   │                          returns emotion confidence scores
        │   └──► [SQS DLQ]  (failed events captured here)
        │  (4) Store result
        ▼
[DynamoDB: submissions table]
        │
        │  (5) Select SES template based on dominant emotion (tie-break by priority order)
        ▼
[Lambda: SES Dispatcher] ──► [Amazon SES] ──► [Customer Inbox]
        │   │
        │   └──► [SQS DLQ]  (failed sends captured here)
        │  (6) Write emailSentAt + templateUsed back to DynamoDB
        ▼
[API Gateway: GET /results/{submissionId}] ◄── [Caller]

─── Analytics / Admin path (Phase 3 — planned) ───────────────────────────────
[Admin Browser]
        │  POST /admin/login → Lambda Authorizer validates against SSM credential
        ▼
[API Gateway: GET /analytics/*] ──► [Lambda Authorizer] ──► [Lambda: Analytics Handlers]
        │                                                           │
        │                                                           ▼
        │                                              [DynamoDB scan/query]
        ▼
[Admin Dashboard] — emotion distribution · volume over time · campaign performance · 7-day trend
```

Images never pass through a Lambda proxy — they go directly from the browser to S3 via a presigned URL. This keeps Lambdas stateless and avoids API Gateway's 6 MB payload limit.

---

## AWS Services Used

| Layer | Service | Role |
|---|---|---|
| Webcam Capture | Browser MediaDevices API + face-api.js (client-side) | Live face-detection overlay; auto-snap on stable face; manual upload fallback |
| Upload | API Gateway + Lambda + S3 | Presigned URL generation, direct browser-to-S3 upload |
| Emotion Detection | Lambda + Amazon Rekognition | S3 event trigger → `DetectFaces` → dominant emotion |
| Messaging | Lambda + Amazon SES | Emotion-to-template mapping, transactional email dispatch |
| Persistence | Amazon DynamoDB | Submission records (submissions table) + campaign tracking (campaigns table) |
| Results API | API Gateway + Lambda | `GET /results/{submissionId}` endpoint |
| Analytics | API Gateway + Lambda + DynamoDB | `GET /analytics/emotions`, `/analytics/campaigns`, `/analytics/trends` (Phase 3 — planned) |
| Admin Auth | API Gateway Lambda Authorizer + SSM Parameter Store | Single admin credential; protects `/analytics/*` endpoints (Phase 3 — planned) |
| Reliability | SQS DLQs + SES bounce/complaint handling | Captures failed Rekognition and SES events; protects sender reputation |
| Infrastructure | AWS CDK (TypeScript) | Five stacks: `capture`, `inference`, `messaging`, `api`, `analytics` |
| Identity | AWS IAM | Least-privilege role per Lambda |
| Config | SSM Parameter Store | Runtime credentials and config (free alternative to Secrets Manager) |
| CI/CD | GitHub Actions + OIDC | Push to `main` → synth → test → deploy; no stored AWS credentials |
| Observability | Amazon CloudWatch | Lambda errors, Rekognition latency, SES delivery metrics |

**Region**: `ap-southeast-1` (Singapore)  
**Target cost**: $0 — all services operate within AWS free tier limits

---

## Project Structure

```
AWS-MarketingAI/
├── bin/                      # CDK app entry point
├── lib/                      # CDK stack definitions
│   ├── capture-stack.ts          # S3 bucket + presigned URL Lambda
│   ├── inference-stack.ts        # Rekognition Lambda + DynamoDB + DLQ
│   ├── messaging-stack.ts        # SES dispatch Lambda + DLQ
│   ├── api-stack.ts              # GET /results endpoint
│   └── analytics-stack.ts        # Analytics Lambdas + Lambda Authorizer + campaigns table (Phase 3)
├── lambdas/                  # Lambda handler source files
├── frontend/                 # Frontend: Next.js 16 + React 19 + Tailwind 4
│   ├── app/
│   │   ├── page.tsx              # Customer webcam capture page
│   │   ├── admin/page.tsx        # Admin login page
│   │   └── admin/dashboard/      # Admin analytics dashboard (Phase 3B)
│   ├── components/
│   │   ├── WebcamFeed.tsx        # Webcam + file-upload component
│   │   └── FaceOverlay.tsx       # face-api.js detection overlay
│   ├── lib/
│   │   ├── api.ts                # Upload API + presigned URL + polling
│   │   └── mockAnalytics.ts      # Mock analytics data (pending AWS-70)
│   └── public/models/            # face-api.js model weights
├── docs/                     # Project docs (roadmap, setup, presentation, architecture PDF)
├── scripts/                  # Helper scripts (e.g. push-tickets.sh)
└── CLAUDE.md                 # AI assistant context
```

---

## Setup Guide

Follow these steps to set up the project on your local machine and deploy to AWS.

### 1. Prerequisites

Install the following before anything else.

#### Node.js (v22 LTS)

**Windows** — Download and run the installer from https://nodejs.org (choose the LTS version).

**Linux Mint**
```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs
```

Verify: `node -v` and `npm -v`

---

#### AWS CLI v2

**Windows** — Download and run the MSI installer from https://aws.amazon.com/cli/

**Linux Mint**
```bash
curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
unzip awscliv2.zip
sudo ./aws/install
```

Verify: `aws --version`

---

#### AWS CDK CLI

```bash
npm install -g aws-cdk
```

Verify: `cdk --version`

---

#### Git

**Windows** — Download from https://git-scm.com/download/win  
**Linux Mint** — `sudo apt-get install -y git`

---

### 2. Configure AWS Credentials

The team uses **one shared IAM user**. You should have already received the credentials from Alex — an **Access Key ID** and a **Secret Access Key**.

Run the following and paste the values when prompted:

```bash
aws configure
```

```
AWS Access Key ID:     <SHARED_ACCESS_KEY_ID>
AWS Secret Access Key: <SHARED_SECRET_ACCESS_KEY>
Default region name:   ap-southeast-1
Default output format: json
```

Verify it works:
```bash
aws sts get-caller-identity
```
You should see the account ID and IAM user ARN. If you get an error, double-check your credentials.

---

### 3. Clone the Repository

You must be added as a GitHub collaborator first — ask Alex if you haven't been added.

```bash
git clone https://github.com/alxvlo/AWS-MarketingAI.git
cd AWS-MarketingAI
```

---

### 4. Install Dependencies

```bash
npm install
```

---

### 4b. Install Frontend Dependencies

```bash
cd frontend && npm install && cd ..
```

Or from the root:
```bash
npm run install:all
```

---

### 5. Build the TypeScript

```bash
npm run build
```

This compiles the CDK app and Lambda handlers. Resolve any TypeScript errors before deploying.

---

### 6. CDK Bootstrap (first time only, per machine)

If this is your first time deploying from your machine, bootstrap the CDK toolkit in the account:

```bash
cdk bootstrap aws://860550672813/ap-southeast-1
```

This is a one-time setup per machine. If it's already been done, you'll see a message saying the bootstrap stack is up to date — that's fine, continue.

---

### 7. Deploy

Deploy all stacks:
```bash
cdk deploy --all
```

To deploy a single stack:
```bash
cdk deploy SatisfactionMeterCapture
```

After deployment, the terminal prints the API endpoint URLs. These are also saved in `cdk.out/deploy-outputs.json`.

---

## Live Endpoints

| Purpose | URL |
|---|---|
| Get presigned upload URL | `https://bj0iusoe6a.execute-api.ap-southeast-1.amazonaws.com/prod/upload` |
| Get submission result | `https://axxsy44fvk.execute-api.ap-southeast-1.amazonaws.com/prod/results/{submissionId}` |
| Analytics endpoints (Phase 3 — not yet deployed) | `/analytics/emotions`, `/analytics/campaigns`, `/analytics/trends` — admin-auth protected |

> These URLs are stable as long as the stacks are not destroyed and recreated. If they change after a redeploy, check `cdk.out/deploy-outputs.json` for the updated values.

---

## Testing the Full Pipeline

1. Start the development server from the project root:
   ```bash
   npm run dev
   ```
2. Open `http://localhost:3000` in your browser
3. Enter `alexvelo199@gmail.com` as the recipient email — this is the SES-verified address used for testing
4. Allow camera access when prompted. Wait for the green face outline to appear in the webcam view — the snapshot is auto-captured after 1.5s of stable detection. Alternatively, click **Upload a Photo** to use a local image.
5. Click **Send for Analysis** — wait ~5 seconds for the page to display the detected emotion and email status
6. Check the `alexvelo199@gmail.com` inbox for the marketing email
7. For admin analytics, navigate to `http://localhost:3000/admin`

> **Important:** SES is in sandbox mode. Only the verified address above can receive test emails. Using any other address will silently fail — no error will appear but no email will be delivered.

---

## Common Issues

**`cdk: command not found`**  
Run `npm install -g aws-cdk` again, or prefix commands with `npx`: `npx cdk deploy --all`

**`ExpiredTokenException` or `InvalidClientTokenId`**  
Your credentials are wrong or expired. Re-run `aws configure` with the correct values from Alex.

**`Unable to resolve AWS account to use`**  
`aws configure` hasn't been run yet, or credentials are misconfigured. Run `aws sts get-caller-identity` to diagnose.

**`Is this AWS account bootstrapped?` error on deploy**  
Run the bootstrap command from Step 6 above.

**`npm install` fails with node-gyp errors**  
Install build tools:  
- Windows (run terminal as Administrator): `npm install --global windows-build-tools`  
- Linux Mint: `sudo apt-get install -y build-essential`

---

## Key References

- `docs/roadmap.md` — what's built, what's in progress, what's next. Read this before starting any work.
- `docs/SETUP.md` — full setup walkthrough.
- `CLAUDE.md` — architectural decisions and working conventions (used by the AI assistant).
- `frontend/` — Next.js frontend (customer portal + admin dashboard). Run `npm run dev` from root to start.
- `cdk.out/deploy-outputs.json` — current deployed resource names and API URLs.
