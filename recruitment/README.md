# BROOK recruitment — development only

Open preview.html for a no-network, memory-only demonstration. index.html and admin/index.html use the same implementation with the live adapter, but config.enabled remains false until release approval.

## Checks

From tests/recruitment: npm ci, then npm test. No production database is contacted. See SECURITY_TEST_PLAN.md for exact coverage and limitations. Package versions are locked.

## Isolation

Only recruitment paths, its proposed database script, tests, and its new Edge Function are changed. The shared AI-record, attendance and meals app source remains unchanged. Do not merge or apply production SQL before the backup/restore and approval gates in IMPLEMENTATION_PLAN.md.

## Current limits

The HQ list shows the newest 1,000 applicants and labels that limit; older records require additional pagination before the operational volume reaches it. Read-access audit logging and automated retention deletion are not implemented. The current audit covers writes; expiry dates are displayed for human review. Email automation and file uploads are not enabled.
