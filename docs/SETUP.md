# Satisfaction Meter — Team Setup Guide

This guide gets you from zero to a working local dev environment and a successful `cdk deploy`.  
**Region**: `ap-southeast-1` (Singapore) — all AWS resources live here.

---

## Prerequisites

Install the following tools before anything else.

### 1. Node.js (v22 LTS recommended)

**Windows**  
Download and run the installer from https://nodejs.org (choose the LTS version).  
Verify: open a new terminal and run:
```
node -v
npm -v
```

**Linux Mint**
```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs
```

---

### 2. AWS CLI v2

**Windows**  
Download and run the MSI installer from https://aws.amazon.com/cli/  
Verify: `aws --version`

**Linux Mint**
```bash
curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
unzip awscliv2.zip
sudo ./aws/install
```
Verify: `aws --version`

---

### 3. AWS CDK CLI

Install globally after Node.js is set up:
```bash
npm install -g aws-cdk
```
Verify: `cdk --version`

---

### 4. Git

**Windows**: Download from https://git-scm.com/download/win  
**Linux Mint**: `sudo apt-get install -y git`

---

## AWS Credentials Setup

The team shares **one IAM user** for this project. You should have already received the credentials from Alex — an **Access Key ID** and a **Secret Access Key**.

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

Verify the credentials work:
```bash
aws sts get-caller-identity
```
You should see the account ID and IAM user ARN — no errors.

---

## Clone the Repository

You must be added as a collaborator on GitHub before cloning (ask Alex if you haven't been added yet).

```bash
git clone https://github.com/alxvlo/AWS-MarketingAI.git
cd AWS-MarketingAI
```

---

## Install Dependencies

```bash
npm install
```

This installs both the CDK library and all AWS SDK packages used by the Lambdas.

---

## Build the TypeScript

```bash
npm run build
```

This compiles the CDK app and Lambda handlers. Fix any TypeScript errors before deploying.

---

## CDK Bootstrap (first time only)

If this is your **first time deploying** from your machine, you need to bootstrap the CDK toolkit in the account:

```bash
cdk bootstrap aws://860550672813/ap-southeast-1
```

This is a one-time setup per machine. If it's already been run before by someone else you'll see a message saying the bootstrap stack is up to date — that's fine.

---

## Deploy

```bash
cdk deploy --all
```

This deploys all stacks (`SatisfactionMeterCapture`, `SatisfactionMeterInference`, `SatisfactionMeterMessaging`, `SatisfactionMeterApi`).

To deploy a single stack:
```bash
cdk deploy SatisfactionMeterCapture
```

After deployment, the terminal will print the API endpoint URLs. These are also saved in `cdk.out/deploy-outputs.json`.

---

## Testing the App

### Deployed API Endpoints (current)

| Purpose | URL |
|---|---|
| Get presigned upload URL | `https://bj0iusoe6a.execute-api.ap-southeast-1.amazonaws.com/prod/upload` |
| Get submission result | `https://axxsy44fvk.execute-api.ap-southeast-1.amazonaws.com/prod/results/{submissionId}` |

> These URLs are stable as long as nobody destroys and recreates the stacks. If you redeploy and they change, check `cdk.out/deploy-outputs.json` for the new values.

### End-to-End Test

1. Open `web/index.html` in your browser (or serve it locally).
2. Enter `alexvelo199@gmail.com` as the recipient email — this is the verified SES address used for testing.
3. Upload a photo with a visible face.
4. Wait ~5 seconds. You should see the detected emotion and a confirmation that the email was sent.
5. Check `alexvelo199@gmail.com` inbox for the marketing email.

> SES is in sandbox mode. Only verified email addresses can receive emails. Do not use a different address for testing — it will silently fail.

---

## Common Issues

**`cdk: command not found`**  
Run `npm install -g aws-cdk` again, or prefix with `npx`: `npx cdk deploy --all`

**`ExpiredTokenException` or `InvalidClientTokenId`**  
Your credentials are wrong or expired. Re-run `aws configure` with the correct values.

**`Unable to resolve AWS account`**  
Make sure `aws configure` has been run and `aws sts get-caller-identity` returns a valid response.

**`Is this AWS account bootstrapped?` error on deploy**  
Run the bootstrap command from the [CDK Bootstrap](#cdk-bootstrap-first-time-only) section above.

**`npm install` fails with node-gyp errors**  
Install build tools:  
- Windows: `npm install --global windows-build-tools` (run as Administrator)  
- Linux: `sudo apt-get install -y build-essential`

---

## Project Structure (quick reference)

```
AWS-MarketingAI/
├── bin/                  # CDK app entry point
├── lib/                  # CDK stack definitions
│   ├── capture-stack.ts      # S3 bucket + presigned URL Lambda
│   ├── inference-stack.ts    # Rekognition Lambda
│   ├── messaging-stack.ts    # SES dispatch Lambda
│   └── api-stack.ts          # GET /results endpoint
├── lambdas/              # Lambda handler source files
├── web/                  # Frontend HTML/JS
├── docs/                 # roadmap.md, SETUP.md, presentation, architecture PDF
├── scripts/              # Helper scripts (e.g. push-tickets.sh)
└── CLAUDE.md             # AI assistant context (read by Claude)
```

Read `docs/roadmap.md` to see what's been built, what's in progress, and what's next.
