---
status: testing
phase: 04-vertex-ai-account-foundation
source: [04-01-SUMMARY.md, 04-02-SUMMARY.md]
started: 2026-04-02T09:50:00Z
updated: 2026-04-02T09:50:00Z
---

## Current Test

number: 1
name: Cold Start Smoke Test
expected: |
  Kill any running server/service. Clear ephemeral state (temp DBs, caches, lock files). Start the application from scratch. Server boots without errors, any seed/migration completes, and a primary query (health check, homepage load, or basic API call) returns live data.
awaiting: user response

## Tests

### 1. Cold Start Smoke Test
expected: Kill any running server/service. Clear ephemeral state (temp DBs, caches, lock files). Start the application from scratch. Server boots without errors, any seed/migration completes, and a primary query (health check, homepage load, or basic API call) returns live data.
result: [pending]

### 2. Create Vertex AI Account
expected: Access admin management interface, find option to create new Vertex AI account. Form appears with fields for account name, Project ID, Location/Region, and Service Account JSON upload.
result: [pending]

### 3. Upload Service Account JSON
expected: In account creation form, upload a valid Service Account JSON file. System accepts the file, validates format, and shows confirmation that credentials were encrypted and stored securely.
result: [pending]

### 4. Configure Project and Location
expected: In account creation form, enter Google Cloud Project ID and select Location/Region. System accepts values and stores configuration for the Vertex AI account.
result: [pending]

### 5. Validate Service Account Credentials
expected: After uploading Service Account JSON, system validates the credentials format. Shows validation status (success/error) with descriptive messages for any issues found.
result: [pending]

### 6. Test Account Connection
expected: Admin can test Vertex AI account credentials against Google Cloud. System attempts to generate access token and reports connection status (success/failure) with error details if needed.
result: [pending]

### 7. View Account in Management Interface
expected: Created Vertex AI accounts appear in the account management list with proper status indicators (active/inactive), account type label, and configuration details visible.
result: [pending]

### 8. Account CRUD Operations
expected: Admin can view, edit, and delete Vertex AI accounts through the management interface. Update operations preserve encrypted credentials, delete operations clean up properly.
result: [pending]

## Summary

total: 8
passed: 0
issues: 0
pending: 8
skipped: 0
blocked: 0

## Gaps

[none yet]