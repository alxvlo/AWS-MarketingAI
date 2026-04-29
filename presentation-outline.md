# Presentation Outline — AWS Services: Satisfaction Meter
**Audience**: Professors / Graders
**Tone**: Design-decision-forward; emphasise architectural reasoning and trade-offs

---

## Slide 1 — Title

**Satisfaction Meter**
*Emotion-Driven Marketing via AWS*

- Course / semester context
- Team members (6 developers, one shared AWS account)
- One-line pitch: *A user uploads a photo → we detect their mood → we send a personalised marketing email.*

---

## Slide 2 — Problem Statement & Scope

- Traditional marketing blasts ignore customer emotional state at the moment of engagement.
- Satisfaction Meter reads the customer's facial emotion in real time and matches the marketing message to that mood (e.g. happy → request a review, sad → send a discount voucher).
- **Scope boundaries** (important for evaluators):
  - Web upload only — no mobile app, no kiosk
  - Email channel only — no SMS or push
  - Single AWS region: `ap-southeast-1` (Singapore)
  - Personal-project scale, free-tier budget

---

## Slide 3 — High-Level Architecture Diagram

*A visual pipeline diagram showing the 6 stages below. Label each arrow with the AWS service handling the transition.*

```
[Browser / End User]
        │  (1) Request presigned URL (email + file type)
        ▼
[API Gateway] ──► [Lambda: URL Generator] ──► returns presigned S3 PUT URL
        │
        │  (2) Upload image directly to S3 (presigned URL, no server proxy)
        ▼
[S3 Bucket]  ──► (S3 Event Notification)
        │
        │  (3) Trigger on ObjectCreated
        ▼
[Lambda: Rekognition Handler] ──► [Amazon Rekognition DetectFaces]
        │                              returns emotion confidence scores
        │  (4) Store result
        ▼
[DynamoDB: capture table]
        │
        │  (5) Determine dominant emotion → select SES template
        ▼
[Lambda: SES Dispatcher] ──► [Amazon SES] ──► [End User's Inbox]
        │
        │  (6) Write emailSentAt + templateUsed back to DynamoDB
        ▼
[DynamoDB] ◄── [API Gateway: GET /results/{submissionId}] ◄── [Caller]
```

**Key design principle**: images never pass through a server proxy — they go directly from the browser to S3 via a presigned URL. This keeps Lambda stateless and avoids unnecessary data transfer costs.

---

## Slide 4 — Service Map (Full Stack at a Glance)

| Layer | AWS Service | Role |
|---|---|---|
| Upload / Ingestion | API Gateway + Lambda + S3 | Presigned URL generation, direct browser-to-S3 upload |
| Emotion Detection | Lambda + Amazon Rekognition | Trigger on S3 event; call DetectFaces; extract dominant emotion |
| Messaging | Lambda + Amazon SES | Map emotion to template; dispatch transactional email |
| Persistence | Amazon DynamoDB | Store submission record; TTL-based 30-day expiry |
| Results API | API Gateway + Lambda | GET endpoint — retrieve emotion result and email status |
| Infrastructure as Code | AWS CDK (TypeScript) | Four stacks: `capture`, `inference`, `messaging`, `api` |
| Identity & Access | AWS IAM | Least-privilege role per Lambda function |
| Config / Secrets | SSM Parameter Store | Store credentials without incurring Secrets Manager fees |
| CI/CD | GitHub Actions + IAM OIDC | Push to `main` → synth → test → deploy; no stored AWS credentials |
| Observability | Amazon CloudWatch | Lambda error rates, Rekognition latency, SES delivery metrics |

---

## Slide 5 — Ingestion Layer: API Gateway + Lambda + S3

### What it does
The front end calls a REST endpoint (`POST /upload`) to get a **presigned S3 PUT URL**. The browser then uploads the image directly to S3 — no Lambda handles the image bytes.

### Why these services
- **API Gateway**: managed HTTP front door — no servers to run, scales automatically, fits within free tier.
- **Presigned URLs**: offload the large file transfer to S3's infrastructure rather than routing it through Lambda (Lambda has a 6 MB payload limit on API Gateway proxy responses; a photo can easily exceed this). Also eliminates per-byte Lambda compute cost.
- **S3** (SSE-S3 / AES-256): object storage for raw images. AWS-managed encryption at no additional cost (KMS customer-managed keys cost $1/month — excluded by design).

### Key design decisions
- Lifecycle rule: **delete objects after 30 days** — images are sensitive personal data; once emotion features are extracted they need not persist.
- No public access on the bucket — the presigned URL grants time-limited, single-object PUT permission only.
- `submissionId` (UUID) generated server-side at presigned URL request time, used as S3 key prefix and DynamoDB primary key.

---

## Slide 6 — Processing Layer: Lambda + Amazon Rekognition

### What it does
An **S3 ObjectCreated event** triggers a Lambda function automatically when an image lands in the bucket. The Lambda calls Rekognition `DetectFaces`, receives confidence scores for each detected emotion, selects the dominant one, and writes the result to DynamoDB.

### Why these services
- **Lambda (event-driven)**: stateless, serverless, zero idle cost — ideal for a sporadic trigger like image upload.
- **Amazon Rekognition `DetectFaces`**: purpose-built managed API for face and emotion analysis. No model training, no GPU provisioning, no ML expertise required. Returns structured confidence scores per emotion label (HAPPY, SAD, SURPRISED, ANGRY, CALM, NEUTRAL, etc.).

### Deep dive: Rekognition response handling
- The API returns an array of `FaceDetails`, each with an `Emotions` list of `{Type, Confidence}` pairs.
- Lambda sorts by `Confidence` descending and takes `Type` of index 0 → dominant emotion.
- If no face is detected (empty `FaceDetails`), the Lambda writes `dominantEmotion: "NONE"` and skips email dispatch.
- Raw face attribute bytes (bounding boxes, landmarks) are **never logged** — only the dominant emotion label and confidence scores are persisted. This separates biometric data from PII.

### Emotion → Template mapping (5 initial templates)
| Detected Emotion | Marketing Action |
|---|---|
| HAPPY | Request a product review |
| SAD | Send a voucher / discount |
| SURPRISED | Flash deal offer |
| ANGRY | Apology + discount |
| NEUTRAL / CALM / OTHER | General promotional offer |

---

## Slide 7 — Messaging Layer: Lambda + Amazon SES

### What it does
After DynamoDB is updated with the emotion result, the processing Lambda (or a separate SES dispatcher Lambda) selects the matching SES template and calls `SendEmail` / `SendTemplatedEmail`. It then writes `emailSentAt` and `templateUsed` back to the DynamoDB record.

### Why SES (not Pinpoint, SNS, or third-party)
- **SES** handles transactional email natively, requires no journey builder, and falls within the AWS free tier at expected volume.
- **Pinpoint** was the original plan — dropped because it adds per-message cost and operational complexity (campaigns, journeys, analytics dashboards) that is not justified for a single-email-per-submission use case.
- **SNS** is a pub/sub bus, not an email composition layer.
- Third-party ESPs (SendGrid, Mailchimp) break the AWS-native constraint without adding value at this scale.

### Key configuration points
- SES sending identity requires **domain verification** (DKIM + SPF records). This is a mandatory setup step before live traffic.
- For the semester demo, SES can be used in **sandbox mode** (only verified recipient addresses), which is acceptable for a controlled demo audience.
- Templates stored as **SES templates** (named, versioned) rather than inline Lambda strings — keeps email content decoupled from application logic.

---

## Slide 8 — Persistence Layer: Amazon DynamoDB

### What it does
Stores one item per submission. The GET results endpoint reads from this table.

### Schema (single table)
| Attribute | Type | Notes |
|---|---|---|
| `submissionId` (PK) | String (UUID) | Generated at presigned URL request time |
| `email` | String | Identity anchor; never logged alongside face bytes |
| `s3Key` | String | S3 object path |
| `dominantEmotion` | String | e.g. `"HAPPY"` |
| `emotionScores` | Map | Full `{Type: Confidence}` map from Rekognition |
| `emailSentAt` | ISO-8601 String | Populated after SES dispatch |
| `templateUsed` | String | SES template name |
| `timestamp` | Number (Unix epoch) | Submission time |
| `ttl` | Number (Unix epoch) | `timestamp + 30 days`; DynamoDB auto-deletes expired items |

### Why DynamoDB
- Key-value / document access pattern (look up by `submissionId`) — DynamoDB is the natural fit.
- Serverless, no cluster to manage.
- TTL is a native, zero-cost feature — no scheduled Lambda needed to purge old records.
- Contrast with Aurora/RDS: relational joins are unnecessary here; a relational engine would add baseline instance cost.

---

## Slide 9 — Results API: API Gateway + Lambda

### What it does
`GET /results/{submissionId}` returns the stored emotion result, email delivery status, and template used for a given submission.

### Design notes
- A dedicated Lambda reads from DynamoDB by PK and returns a JSON response — simple, stateless.
- No authentication layer for the semester scope. If demoed publicly, a time-limited signed URL or API key would be added.
- This endpoint closes the feedback loop for integration testing: submit → poll GET → confirm fields populated.

---

## Slide 10 — Infrastructure as Code: AWS CDK (TypeScript)

### What it does
CDK synthesises AWS CloudFormation templates from TypeScript code. Four stacks map to bounded contexts:

| CDK Stack | Resources it owns |
|---|---|
| `capture` | S3 bucket, presigned URL Lambda, API Gateway |
| `inference` | Rekognition-trigger Lambda, DynamoDB table |
| `messaging` | SES dispatcher Lambda, SES templates |
| `api` | GET results Lambda, API Gateway route |

### Why CDK over raw CloudFormation or Terraform
- CDK is AWS-native, TypeScript (team familiarity), and generates CloudFormation under the hood — no separate tool to install in CI.
- Higher-level constructs reduce boilerplate (e.g., `LambdaRestApi` auto-creates the integration wiring).
- Modular stacks enforce separation of concerns — changes to the messaging stack don't risk re-deploying capture infrastructure.

---

## Slide 11 — DevOps: GitHub Actions + IAM OIDC

### What it does
On push to `main`, the GitHub Actions workflow runs:
1. `cdk synth` — validate the CloudFormation output
2. Unit tests
3. `cdk deploy --all` — deploy all stacks

### Why OIDC (not stored AWS credentials)
- GitHub OIDC federation lets the Actions runner assume an IAM role via a signed JWT — **no AWS access key or secret key is stored in GitHub Secrets**.
- This is a security best practice: credentials cannot be leaked from a secrets store because they don't exist in one. GitHub's OIDC token is short-lived and tied to the specific repo + branch.
- IAM trust policy on the role restricts assumption to the project repo only.

---

## Slide 12 — Identity & Secrets: IAM + SSM Parameter Store

### IAM (least-privilege per Lambda)
- Each Lambda function gets its own IAM execution role with only the permissions it needs:
  - Presigned URL Lambda: `s3:PutObject` on the upload bucket only.
  - Rekognition Lambda: `rekognition:DetectFaces`, `dynamodb:PutItem`.
  - SES Lambda: `ses:SendEmail` / `ses:SendTemplatedEmail`, `dynamodb:UpdateItem`.
  - Results Lambda: `dynamodb:GetItem`.
- No Lambda has `*` action or `*` resource — isolation limits blast radius if a function is compromised.

### SSM Parameter Store (Standard tier)
- Stores any runtime configuration (e.g., SES sender address, DynamoDB table name) as SecureString parameters.
- **Free** at Standard tier (up to 10,000 parameters, standard throughput).
- Secrets Manager was evaluated and explicitly excluded: it costs $0.40/secret/month regardless of usage volume, which breaks the $0 budget target.

---

## Slide 13 — Observability: Amazon CloudWatch

### What it monitors
- **Lambda**: invocation count, error rate, duration (p50/p99) — alerts if Rekognition Lambda errors spike.
- **Rekognition**: latency per `DetectFaces` call (custom metric emitted from Lambda).
- **SES**: delivery rate, bounce rate, complaint rate (SES publishes to CloudWatch natively).
- **API Gateway**: 4xx/5xx rates, latency.

### Why CloudWatch (not Datadog, Grafana Cloud, etc.)
- CloudWatch is the native AWS observability layer — Lambda, DynamoDB, and SES publish metrics here automatically with no agent required.
- 10 custom metrics, 5 dashboards, and standard alarms are free under the CloudWatch free tier.
- Third-party tools would require exporting telemetry, adding cost and an external dependency not justified at this scale.

---

## Slide 14 — Cost & Free-Tier Analysis

All services are targeted at **$0 AWS spend** for a semester-length project.

| Service | Free Tier Allowance | Expected Usage | Cost |
|---|---|---|---|
| Amazon S3 | 5 GB storage, 20k GET, 2k PUT / month | < 1 GB photos, < 500 uploads | $0 |
| Amazon Rekognition | 5,000 `DetectFaces` calls / month (12 months) | < 500 calls | $0 |
| AWS Lambda | 1M requests + 400k GB-s compute / month | < 10k invocations | $0 |
| Amazon API Gateway | 1M REST API calls / month (12 months) | < 10k calls | $0 |
| Amazon DynamoDB | 25 GB storage + 25 WCU + 25 RCU / month (always free) | Negligible | $0 |
| Amazon SES | 3,000 messages / month (in-region Lambda send) | < 500 emails | $0 |
| CloudWatch | 10 custom metrics, 5 alarms / month | < 10 | $0 |
| SSM Parameter Store | 10,000 parameters (Standard tier) | < 20 | $0 |
| IAM | Always free | — | $0 |
| GitHub Actions | 2,000 CI minutes / month (free plan) | < 100 mins | $0 |

**Services explicitly excluded to stay at $0:**
- **KMS Customer-Managed Keys** → $1.00/key/month regardless of usage. SSE-S3 (AWS-managed) provides encryption at no cost.
- **AWS Secrets Manager** → $0.40/secret/month. SSM Parameter Store SecureString provides equivalent functionality for free.
- **Amazon Pinpoint** → per-message cost + journey overhead. SES covers the transactional email use case without the cost.
- **VPC Endpoints** → hourly charge per endpoint. Not required given no compliance need to keep traffic off the public internet.

**Total projected AWS cost: $0**

---

## Slide 15 — Design Trade-offs & Lessons Learned

| Decision | Alternative Considered | Why We Chose What We Did |
|---|---|---|
| SES over Pinpoint | Pinpoint (original plan) | Pinpoint adds campaign/journey cost and complexity; SES handles transactional single-email perfectly |
| DynamoDB over RDS/Aurora | Aurora Serverless | Access pattern is pure key-value; no relational joins needed; Aurora has a minimum ACU cost |
| SSE-S3 over KMS CMK | KMS customer-managed key | CMK costs $1/month regardless of usage — breaks $0 budget; SSE-S3 is AES-256 and free |
| SSM Parameter Store over Secrets Manager | Secrets Manager | Secrets Manager costs $0.40/secret/month; SSM Standard is free |
| GitHub Actions + OIDC over CodePipeline | AWS CodePipeline | Team is GitHub-native; OIDC eliminates credential storage; CodePipeline adds per-pipeline cost |
| Presigned URL (direct S3 upload) over Lambda proxy | Lambda receives image and forwards to S3 | Lambda has 6 MB payload cap via API Gateway; presigned approach is unlimited, lower latency, lower cost |
| Single CDK stack per bounded context | Monolithic CDK app | Modular stacks reduce re-deployment blast radius and clarify ownership boundaries |

---

## Slide 16 — Summary

- **8 AWS services** working together in a fully serverless, event-driven pipeline.
- **End-to-end target**: image upload → emotion detected → personalised email sent in **< 5 seconds**.
- **$0 projected cost** through deliberate service selection and free-tier-first design.
- Every design choice is traceable to a constraint (cost, latency, scope) — not default selections.

*"The goal wasn't to use the most AWS services — it was to use exactly the right ones."*

---

## Appendix A — Data Flow Sequence (detailed)

1. User fills web form (email + photo file) → browser calls `POST /upload` on API Gateway.
2. Lambda (URL Generator) creates a UUID `submissionId`, writes a pending DynamoDB record (`email`, `s3Key`, `timestamp`, `ttl`), returns presigned S3 PUT URL + `submissionId`.
3. Browser PUTs image bytes directly to S3 using the presigned URL.
4. S3 fires `ObjectCreated` notification → invokes Rekognition Lambda.
5. Rekognition Lambda calls `DetectFaces` → sorts emotion scores → determines dominant emotion → updates DynamoDB record with `dominantEmotion` + `emotionScores`.
6. SES Dispatcher Lambda reads the dominant emotion, selects matching SES template, calls `SendTemplatedEmail` → updates DynamoDB with `emailSentAt` + `templateUsed`.
7. End user receives personalised email in inbox.
8. Any caller can query `GET /results/{submissionId}` → Lambda reads DynamoDB → returns JSON response.

---

## Appendix B — IAM Role Summary

| Lambda | Key Permissions |
|---|---|
| URL Generator | `s3:PutObject` (upload bucket, scoped to `submissionId/*`) · `dynamodb:PutItem` |
| Rekognition Handler | `rekognition:DetectFaces` · `dynamodb:UpdateItem` · `s3:GetObject` (upload bucket) |
| SES Dispatcher | `ses:SendTemplatedEmail` · `dynamodb:UpdateItem` |
| Results Reader | `dynamodb:GetItem` |

All roles also have the standard `logs:CreateLogGroup` / `logs:PutLogEvents` for CloudWatch Logs — granted via the AWS-managed `AWSLambdaBasicExecutionRole`.
