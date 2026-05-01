#!/usr/bin/env bash
# =============================================================
# Satisfaction Meter — Phase 3B Admin Portal Tickets (ADDITIVE)
# 3A is already DONE. This only adds missing 3B tickets.
# Project: AWS (https://alexvelo799.atlassian.net)
# =============================================================
# USAGE:
#   export JIRA_EMAIL="your-atlassian-email@example.com"
#   export JIRA_TOKEN="your-api-token"
#   bash push-3b-tickets.sh
# =============================================================

set -euo pipefail

JIRA_BASE="https://alexvelo799.atlassian.net"
PROJECT_KEY="AWS"

if [[ -z "${JIRA_EMAIL:-}" || -z "${JIRA_TOKEN:-}" ]]; then
  echo "❌ ERROR: Set JIRA_EMAIL and JIRA_TOKEN environment variables first."
  exit 1
fi

AUTH=$(echo -n "${JIRA_EMAIL}:${JIRA_TOKEN}" | base64)

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

  response=$(curl -s -o /tmp/jira_response.json -w "%{http_code}" \
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

echo ""
echo "🚀 Adding Phase 3B admin portal tickets (3A already done)..."

echo ""
echo "--- PHASE 3B: Admin Portal Auth & Frontend ---"

create_ticket \
  "Protect /analytics/* endpoints behind Lambda Authorizer" \
  "Update API Gateway CDK stack to attach the Lambda Authorizer to all /analytics/* routes (emotions, campaigns, trends). Verify unauthorized requests return 401. Update frontend to send credentials header with each analytics request." \
  "phase-3b" "security"

create_ticket \
  "Wire admin dashboard frontend to real /analytics/* endpoints" \
  "Replace mock data in frontend/lib/mockAnalytics.ts with real fetch calls to GET /analytics/emotions, GET /analytics/trends, GET /analytics/campaigns. Pass admin credentials in Authorization header. Handle loading and error states in each dashboard section." \
  "phase-3b" "frontend"

echo ""
echo "=========================================="
echo "✅ Done! Phase 3B tickets added to project ${PROJECT_KEY}."
echo "View board: https://alexvelo799.atlassian.net/jira/software/projects/AWS/boards/36"
echo "=========================================="
