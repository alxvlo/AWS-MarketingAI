#!/usr/bin/env bash
# =============================================================
# Satisfaction Meter — Jira Ticket Bulk Creator
# Project: AWS (https://alexvelo799.atlassian.net)
# =============================================================
# USAGE:
#   export JIRA_EMAIL="your-atlassian-email@example.com"
#   export JIRA_TOKEN="your-api-token"   # get from: https://id.atlassian.net/manage-profile/security/api-tokens
#   bash push-tickets.sh
# =============================================================

set -euo pipefail

JIRA_BASE="https://alexvelo799.atlassian.net"
PROJECT_KEY="AWS"

if [[ -z "${JIRA_EMAIL:-}" || -z "${JIRA_TOKEN:-}" ]]; then
  echo "❌ ERROR: Set JIRA_EMAIL and JIRA_TOKEN environment variables first."
  echo "   export JIRA_EMAIL=you@email.com"
  echo "   export JIRA_TOKEN=your-api-token"
  exit 1
fi

AUTH=$(echo -n "${JIRA_EMAIL}:${JIRA_TOKEN}" | base64 | tr -d '\n')

create_ticket() {
  local summary="$1"
  local description="$2"
  local label_phase="$3"
  local label_tag="$4"

  local payload
  payload=$(cat <<EOF
{
  "fields": {
    "project": { "key": "${PROJECT_KEY}" },
    "summary": "${summary}",
    "description": {
      "type": "doc",
      "version": 1,
      "content": [
        {
          "type": "paragraph",
          "content": [{ "type": "text", "text": "${description}" }]
        }
      ]
    },
    "issuetype": { "name": "Task" },
    "labels": ["${label_phase}", "${label_tag}"]
  }
}
EOF
)

  response=$(curl -s --http1.1 -o /tmp/jira_response.json -w "%{http_code}" \
    -X POST \
    -H "Authorization: Basic ${AUTH}" \
    -H "Content-Type: application/json" \
    -d "${payload}" \
    "${JIRA_BASE}/rest/api/3/issue")

  if [[ "$response" == "201" ]]; then
    ticket_key=$(cat /tmp/jira_response.json | grep -o '"key":"[^"]*"' | head -1 | cut -d'"' -f4)
    echo "  ✅ Created ${ticket_key}: ${summary}"
  else
    echo "  ❌ FAILED (HTTP ${response}): ${summary}"
    cat /tmp/jira_response.json
    echo ""
  fi
}

# -------------------------------------------------------
# STEP 1: Move all existing tickets to DONE
# -------------------------------------------------------
echo ""
echo "📋 STEP 1: Fetching existing open tickets to mark as DONE..."

existing=$(curl -s --http1.1 \
  -H "Authorization: Basic ${AUTH}" \
  -H "Content-Type: application/json" \
  "${JIRA_BASE}/rest/api/3/search/jql?jql=project=${PROJECT_KEY}+AND+statusCategory+!=+Done&maxResults=100")

issue_keys=$(echo "$existing" | grep -o '"key":"AWS-[0-9]*"' | cut -d'"' -f4 || true)

if [[ -z "$issue_keys" ]]; then
  echo "  ℹ️  No open tickets found. Skipping."
else
  for key in $issue_keys; do
    # Get available transitions
    transitions=$(curl -s --http1.1 \
      -H "Authorization: Basic ${AUTH}" \
      "${JIRA_BASE}/rest/api/3/issue/${key}/transitions")

    done_id=$(echo "$transitions" | grep -o '"id":"[^"]*","name":"Done"' | head -1 | grep -o '"id":"[^"]*"' | cut -d'"' -f4)

    if [[ -z "$done_id" ]]; then
      done_id=$(echo "$transitions" | grep -oi '"id":"[^"]*","name":"[^"]*done[^"]*"' | head -1 | grep -o '"id":"[^"]*"' | cut -d'"' -f4)
    fi

    if [[ -n "$done_id" ]]; then
      curl -s --http1.1 -o /dev/null -w "" \
        -X POST \
        -H "Authorization: Basic ${AUTH}" \
        -H "Content-Type: application/json" \
        -d "{\"transition\":{\"id\":\"${done_id}\"}}" \
        "${JIRA_BASE}/rest/api/3/issue/${key}/transitions"
      echo "  ✅ Moved ${key} → Done"
    else
      echo "  ⚠️  Could not find Done transition for ${key}"
    fi
  done
fi

# -------------------------------------------------------
# STEP 2: Create new tickets
# -------------------------------------------------------
echo ""
echo "🚀 STEP 2: Creating new tickets..."

echo ""
echo "--- PHASE 2A: Image Pipeline Fix (BLOCKER) ---"
create_ticket \
  "Debug presigned URL flow — confirm 2-request pattern" \
  "Verify browser makes 2 requests: POST /upload to API Gateway for presigned URL, then PUT directly to S3. Check Network tab in DevTools. Confirm S3 key is returned in POST response and second PUT request fires." \
  "phase-2a" "bug"

create_ticket \
  "Validate image lands in S3 and triggers EventBridge Lambda" \
  "After PUT to S3 succeeds, verify S3 ObjectCreated event fires via EventBridge and Rek Handler Lambda is invoked. Add console.log at top of Rek Handler to confirm s3Key received." \
  "phase-2a" "bug"

create_ticket \
  "Add structured CloudWatch logging to Rek Handler Lambda" \
  "Log incoming S3 event, extracted bucket name and key, Rekognition API call params, and response emotion scores. Use JSON structured logs. Retention 30 days." \
  "phase-2a" "observability"

create_ticket \
  "Fix CORS headers on presigned URL Lambda response" \
  "If browser PUT to S3 is failing with CORS error, ensure Lambda returns correct CORS headers: Access-Control-Allow-Origin, Access-Control-Allow-Methods, Access-Control-Allow-Headers. Also verify S3 bucket CORS config allows PUT from web origin." \
  "phase-2a" "bug"

echo ""
echo "--- PHASE 2B: Input Validation & Robustness ---"
create_ticket \
  "Restrict file types to JPEG, PNG, WEBP in URL Generator Lambda" \
  "Validate Content-Type header in POST /upload request body. Accept only image/jpeg, image/png, image/webp. Return 400 with descriptive error for any other type. Do not issue presigned URL for invalid types." \
  "phase-2b" "security"

create_ticket \
  "Add 5MB file size limit in URL Generator Lambda" \
  "Validate file size in POST /upload request. Reject files over 5MB with 400 error. Return human-readable error message to frontend." \
  "phase-2b" "security"

create_ticket \
  "Implement emotion tie-breaking with priority order" \
  "When multiple emotions have equal top scores (e.g. 50 NEUTRAL / 50 SAD), resolve using this priority order: HAPPY > SURPRISED > CALM > NEUTRAL > SAD > ANGRY > FEARFUL. First emotion found in list wins. Store tieBreaker: true flag in DynamoDB record for debugging." \
  "phase-2b" "backend"

create_ticket \
  "Add Dead Letter Queues (DLQs) on async Lambdas" \
  "Configure DLQ (SQS) for Rek Handler Lambda and SES Dispatcher Lambda in CDK. Set maxReceiveCount=3. Log failed messages to CloudWatch. Enables replay of failed invocations without data loss." \
  "phase-2b" "reliability"

create_ticket \
  "Implement SES bounce and complaint handling" \
  "Set up SNS topic for SES bounce/complaint notifications. Lambda subscriber logs bounce events to DynamoDB and suppresses future emails to that address. Prevents SES account being flagged for spam." \
  "phase-2b" "reliability"

echo ""
echo "--- PHASE 2C: Webcam Capture ---"
create_ticket \
  "Add webcam feed to customer portal" \
  "Use browser MediaDevices API (getUserMedia) to render live webcam feed in customer portal. Handle permission denied gracefully with fallback message. Show feed in a styled container with aspect ratio maintained." \
  "phase-2c" "frontend"

create_ticket \
  "Integrate face-api.js for real-time face detection overlay" \
  "Load face-api.js (TinyFaceDetector model). Run detection loop on webcam feed. Render canvas overlay on top of video element. No AWS cost — purely client-side." \
  "phase-2c" "frontend"

create_ticket \
  "Green/red face outline based on detection status" \
  "Draw green bounding box outline when face is detected and centered in frame. Draw red outline when no face detected or face is out of frame. Smooth transition between states. Show status text: 'Face detected' / 'Position your face in the frame'." \
  "phase-2c" "frontend"

create_ticket \
  "Auto-snap photo when face is stable for 1.5 seconds" \
  "Track face detection stability. When face detected continuously for 1500ms, auto-capture snapshot using canvas.drawImage from video frame. Play shutter sound/animation on snap. Show countdown indicator (e.g. 3-2-1) before snap." \
  "phase-2c" "frontend"

create_ticket \
  "Replace webcam with snapshot preview and Send button" \
  "After auto-snap, hide webcam feed and show captured image preview. Display 'Send for Analysis' button and 'Retake' button. On Send: convert canvas snapshot to Blob, trigger existing presigned URL upload flow. On Retake: resume webcam feed." \
  "phase-2c" "frontend"

echo ""
echo "--- PHASE 2D: CI/CD ---"
create_ticket \
  "Set up GitHub Actions + OIDC CI/CD pipeline" \
  "Create .github/workflows/deploy.yml. On push to main: cdk synth, run tests, cdk deploy --all. Use OIDC IAM role (no stored AWS keys in GitHub secrets). Set up IAM OIDC provider in CDK if not yet done." \
  "phase-2d" "devops"

echo ""
echo "--- PHASE 3A: Analytics Backend ---"
create_ticket \
  "Build GET /analytics/emotions endpoint" \
  "Lambda that scans DynamoDB submissions table and aggregates counts by dominantEmotion. Returns JSON: { happy: N, sad: N, neutral: N, ... }. Protect with Lambda Authorizer. Cache result for 60s to avoid full table scan on every request." \
  "phase-3a" "backend"

create_ticket \
  "Build GET /analytics/campaigns endpoint" \
  "Lambda that queries DynamoDB campaigns table and returns delivery stats: total sent, per-template counts, emailSentAt range. Protect with Lambda Authorizer." \
  "phase-3a" "backend"

create_ticket \
  "Build GET /analytics/trends endpoint" \
  "Lambda that queries DynamoDB submissions by timestamp (last 30 days) and groups emotion counts by day. Returns array of { date, emotionCounts } for charting. Use DynamoDB scan with filter or GSI on timestamp if needed." \
  "phase-3a" "backend"

create_ticket \
  "Update DynamoDB campaigns table schema for analytics" \
  "Add fields: templateUsed, emailSentAt, submissionId to campaigns table records. Update SES Dispatcher Lambda to write these fields on every send. This powers the /analytics/campaigns endpoint." \
  "phase-3a" "backend"

echo ""
echo "--- PHASE 3B: Admin Portal ---"
create_ticket \
  "Build API Gateway Lambda Authorizer for admin routes" \
  "Lambda Authorizer that reads username/password from SSM Parameter Store (/satisfaction-meter/admin/username and /satisfaction-meter/admin/password). Validates Basic Auth header on all /analytics/* and /admin/* routes. Returns IAM policy." \
  "phase-3b" "security"

create_ticket \
  "Build admin login page" \
  "Simple HTML/JS login page at /admin. Sends credentials to a POST /admin/login endpoint. On success, stores token in sessionStorage. Redirects to dashboard. On fail, shows error. No Cognito — Lambda Authorizer handles auth." \
  "phase-3b" "frontend"

create_ticket \
  "Build admin dashboard — emotion distribution chart" \
  "Admin dashboard page fetches GET /analytics/emotions. Renders bar chart or pie chart showing distribution of detected emotions (happy, sad, neutral, etc.) using Chart.js or similar. Include total submission count." \
  "phase-3b" "frontend"

create_ticket \
  "Build admin dashboard — submission volume over time chart" \
  "Admin dashboard fetches GET /analytics/trends. Renders line chart of daily submission counts over last 30 days using Chart.js. X-axis: date, Y-axis: count. Show per-emotion breakdown as stacked lines." \
  "phase-3b" "frontend"

create_ticket \
  "Build admin dashboard — campaign performance table" \
  "Admin dashboard fetches GET /analytics/campaigns. Renders table: template name, emails sent, date range. Show which emotion template was used most. Include total sent count." \
  "phase-3b" "frontend"

create_ticket \
  "Add 7-day moving average trend display to admin dashboard" \
  "Compute 7-day simple moving average on client side from /analytics/trends data. Overlay on submission volume chart as a dashed trend line. Label it 'Trend (7-day avg)'. Helps professor see forecasting capability." \
  "phase-3b" "frontend"

echo ""
echo "--- PHASE 4: Polish & Observability ---"
create_ticket \
  "Set up CloudWatch dashboard for operational metrics" \
  "Create CloudWatch dashboard in CDK: Lambda error rates, Rekognition p99 latency, SES delivery rate, API Gateway 4xx/5xx counts. Name it satisfaction-meter-ops." \
  "phase-4" "observability"

create_ticket \
  "SES domain verification — DKIM and SPF setup" \
  "Complete SES sending identity setup: verify domain, configure DKIM (3 CNAME records), add SPF TXT record. Required for SES to send from custom domain. Document DNS records needed." \
  "phase-4" "infrastructure"

create_ticket \
  "CloudWatch Alarms with SNS alert to team Slack" \
  "Create CloudWatch Alarms for: Lambda error rate > 5%, SES bounce rate > 2%, API Gateway 5xx > 10/min. Route alerts via SNS to team Slack webhook. Configure in CDK." \
  "phase-4" "observability"

echo ""
echo "=========================================="
echo "✅ Done! All tickets created in project ${PROJECT_KEY}."
echo "View board: https://alexvelo799.atlassian.net/jira/software/projects/AWS/boards/36"
echo "=========================================="
