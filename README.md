# Satisfaction Meter
**Emotion-Driven Marketing via AWS**

A serverless web application that detects a customer's facial emotion from a photo and automatically dispatches a personalised marketing email matched to their mood — all in under 5 seconds, built entirely on AWS managed services.

---

## What It Does

1. A customer visits the web portal and uploads a photo (or uses their webcam)
2. Their image is sent to **Amazon Rekognition**, which detects the dominant facial emotion
3. Based on the emotion, a matching email template is selected and sent via **Amazon SES**
4. The result (emotion detected, email sent) is stored in **DynamoDB** and retrievable via a REST API

| Detected Emotion | Marketing Action |
|---|---|
| Happy | Request a product review |
| Sad | Send a voucher / discount |
| Surprised | Flash deal offer |
| Angry | Apology + discount |
| Neutral / Calm | General promotional offer |

---

## Architecture

```
[Browser / End User]
        │  (1) POST /upload — request presigned URL
        ▼
[API Gateway] ──► [Lambda: URL Generator] ──► returns presigned S3 PUT URL
        │
        │  (2) PUT image directly to S3 (browser → S3, no server proxy)
        ▼
[S3 Bucket]  ──► (ObjectCreated event)
        │
        │  (3) Event triggers Lambda
        ▼
[Lambda: Rekognition Handler] ──► [Amazon Rekognition DetectFaces]
        │                              returns emotion confidence scores
        │  (4) Store result
        ▼
[DynamoDB: submissions table]
        │
        │  (5) Select SES template based on dominant emotion
        ▼
[Lambda: SES Dispatcher] ──► [Amazon SES] ──► [Customer Inbox]
        │
        │  (6) Write emailSentAt + templateUsed back to DynamoDB
        ▼
[API Gateway: GET /results/{submissionId}] ◄── [Caller]
```

Images never pass through a Lambda proxy — they go directly from the browser to S3 via a presigned URL. This keeps Lambdas stateless and avoids API Gateway's 6 MB payload limit.

---

## AWS Services Used

| Layer | Service | Role |
|---|---|---|
| Upload | API Gateway + Lambda + S3 | Presigned URL generation, direct browser-to-S3 upload |
| Emotion Detection | Lambda + Amazon Rekognition | S3 event trigger → `DetectFaces` → dominant emotion |
| Messaging | Lambda + Amazon SES | Emotion-to-template mapping, transactional email dispatch |
| Persistence | Amazon DynamoDB | Submission records with 30-day TTL auto-expiry |
| Results API | API Gateway + Lambda | `GET /results/{submissionId}` endpoint |
| Infrastructure | AWS CDK (TypeScript) | Four stacks: `capture`, `inference`, `messaging`, `api` |
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
│   ├── inference-stack.ts        # Rekognition Lambda + DynamoDB
│   ├── messaging-stack.ts        # SES dispatch Lambda
│   └── api-stack.ts              # GET /results endpoint
├── lambdas/                  # Lambda handler source files
├── web/                      # Frontend HTML/JS (upload portal)
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

After deployment, the terminal prints the API endpoint URLs. These are also saved in `deploy-outputs.json` at the project root.

---

## Live Endpoints

| Purpose | URL |
|---|---|
| Get presigned upload URL | `https://bj0iusoe6a.execute-api.ap-southeast-1.amazonaws.com/prod/upload` |
| Get submission result | `https://axxsy44fvk.execute-api.ap-southeast-1.amazonaws.com/prod/results/{submissionId}` |

> These URLs are stable as long as the stacks are not destroyed and recreated. If they change after a redeploy, check `deploy-outputs.json` for the updated values.

---

## Testing the Full Pipeline

1. Open `web/index.html` in your browser
2. Enter `alexvelo199@gmail.com` as the recipient email — this is the SES-verified address used for testing
3. Upload a photo with a clearly visible face
4. Wait ~5 seconds — the page will display the detected emotion and email status
5. Check the `alexvelo199@gmail.com` inbox for the marketing email

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

- `roadmap.md` — what's built, what's in progress, what's next. Read this before starting any work.
- `CLAUDE.md` — architectural decisions and working conventions (used by the AI assistant).
- `deploy-outputs.json` — current deployed resource names and API URLs.
