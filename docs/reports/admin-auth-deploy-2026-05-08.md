# Admin Auth Stack Deploy + Smoke Test — 2026-05-08

**Date:** 2026-05-08  
**Stack:** `SatisfactionMeterAdminAuth`  
**Region:** `ap-southeast-1`

## Deployment

AdminApiUrl: `https://vfyxptzv5d.execute-api.ap-southeast-1.amazonaws.com/prod/`  
AdminLoginUrl: `https://vfyxptzv5d.execute-api.ap-southeast-1.amazonaws.com/prod/admin/login`

Stack ARN: `arn:aws:cloudformation:ap-southeast-1:860550672813:stack/SatisfactionMeterAdminAuth/cff254c0-4a45-11f1-8284-02a9cd32fa4b`

## SSM Parameters

- `/satisfaction-meter/admin/username` — String — created ✅
- `/satisfaction-meter/admin/password` — SecureString — created ✅

## Smoke Tests

| Test | Description | Expected | Result |
|------|-------------|----------|--------|
| T1 | POST /admin/login with correct credentials | HTTP 200 + `{"token":"..."}` | PASS ✅ |
| T2 | POST /admin/login with wrong password | HTTP 401 + `{"error":"Invalid credentials"}` | PASS ✅ |
| T3 | GET /admin/submissions with no Authorization header | HTTP 401 | PASS ✅ |
| T4 | GET /admin/submissions with valid Basic token | HTTP 200 + `{"submissions":[...],"analytics":{...}}` | PASS ✅ |

All 4 smoke tests passed.
