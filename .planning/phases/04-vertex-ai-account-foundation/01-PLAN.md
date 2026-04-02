# Plan 01: Vertex AI Account Service and Admin Routes

**Phase:** 4 — Vertex AI Account Foundation
**Goal:** Create the backend account service with encrypted credential storage, Service Account JSON validation, Google Cloud access token generation, and admin API routes for full CRUD management of Vertex AI accounts.
**Complexity:** High
**Requirements:** ACCOUNT-01, ACCOUNT-02, ACCOUNT-03, ACCOUNT-04, ACCOUNT-05, ACCOUNT-06, ACCOUNT-07

## Tasks

### Backend Account Service

- **T1:** Create `src/services/account/vertexAiAccountService.js` — Full account service following Azure OpenAI account service pattern
  - Use `createEncryptor` from `src/utils/commonHelper.js` with salt `'vertex-ai-account-salt'` (per D-06, D-07)
  - Redis key prefix: `vertex_ai:account:`, shared accounts key: `shared_vertex_ai_accounts`, session mapping prefix: `vertex_ai_session_account_mapping:`
  - Redis index: `vertex_ai:account:index`
  - `createAccount(options)` accepting: `name`, `description`, `projectId` (required, per D-04/ACCOUNT-04), `location` (default `'us-central1'`, per D-05/ACCOUNT-05), `serviceAccountJson` (required, per ACCOUNT-02), `accountType` ('shared'/'dedicated'), `priority`, `schedulable`, `isActive`, `proxy`, `groupId`, `disableAutoProtection`, `subscriptionExpiresAt`
  - Before storing, call `validateServiceAccountJson(json)` (see T2) to ensure JSON is valid (per D-08, D-09, ACCOUNT-06)
  - Encrypt entire Service Account JSON as a single string using `encrypt(JSON.stringify(serviceAccountJson))` before Redis storage (per D-02, D-03, ACCOUNT-03)
  - Store `projectId` and `location` as plain text fields (non-sensitive config)
  - `getAccount(accountId)` — retrieve and decrypt credentials (internal only, never return raw credentials to frontend)
  - `updateAccount(accountId, updates)` — update fields, re-encrypt if serviceAccountJson changes
  - `deleteAccount(accountId)` — remove from Redis, index, shared accounts set, and all account groups
  - `getAllAccounts()` — list all accounts, strip sensitive fields (`serviceAccountJson`), parse proxy, add `platform: 'vertex-ai'`, convert boolean strings
  - `getSharedAccounts()` — filter active shared accounts
  - `selectAvailableAccount(sessionId)` — session-sticky account selection with temp-unavailable check (same pattern as Azure OpenAI)
  - `isSubscriptionExpired(account)` — check `subscriptionExpiresAt`
  - `getAccessToken(accountId)` — generate Google Cloud access token from decrypted Service Account JSON (see T2)
  - Export as module with all functions

- **T2:** Implement Service Account JSON validation and Google Cloud access token generation within `vertexAiAccountService.js`
  - `validateServiceAccountJson(json)` function (per D-08, D-09, ACCOUNT-06):
    - Accept parsed JSON object
    - Verify required fields exist: `type`, `project_id`, `private_key`, `client_email`, `client_id`, `auth_uri`, `token_uri`
    - Verify `type === 'service_account'` (per D-09)
    - Verify `private_key` starts with `'-----BEGIN'` (basic format check)
    - Verify `client_email` matches pattern `*@*.iam.gserviceaccount.com`
    - Return `{ valid: true }` or `{ valid: false, error: 'descriptive message' }`
  - `generateAccessToken(serviceAccountJson)` function (per D-04, D-05, ACCOUNT-07):
    - Use `google-auth-library` package (already installed v10.1.0, per D-04)
    - Create `GoogleAuth` client from Service Account JSON using `new GoogleAuth({ credentials: serviceAccountJson, scopes: ['https://www.googleapis.com/auth/cloud-platform'] })` (per D-05)
    - Call `auth.getClient()` then `client.getAccessToken()` to obtain token
    - Return `{ accessToken, expiresAt }` on success
    - On failure, throw with descriptive error (per D-16)
    - Do NOT implement retry logic here (retry is for relay service in Phase 5)
  - `getAccessToken(accountId)` public method:
    - Retrieve account, decrypt `serviceAccountJson`
    - Parse JSON, call `generateAccessToken`
    - Return access token object
    - Handle and log errors with `logger.error`

### Admin API Routes

- **T3:** Create `src/routes/admin/vertexAiAccounts.js` and register in admin router
  - Follow Azure OpenAI admin routes pattern exactly (per D-13)
  - `GET /vertex-ai-accounts` — list all accounts with usage stats and group info (authenticateAdmin middleware)
  - `POST /vertex-ai-accounts` — create account:
    - Extract `name`, `description`, `projectId`, `location`, `serviceAccountJson`, `accountType`, `priority`, `schedulable`, `isActive`, `proxy`, `groupId`, `groupIds` from `req.body`
    - Validate required: `name`, `projectId`, `serviceAccountJson`
    - Parse `serviceAccountJson` (accept string or object, per D-14)
    - Call `validateServiceAccountJson` — return 400 with validation error if invalid
    - Optionally test authentication by calling `generateAccessToken` — warn but allow if Google Cloud unreachable
    - Call `createAccount` with validated data
    - Handle account group assignment if `groupId` or `groupIds` provided
    - Send webhook notification on success
    - Return `{ success: true, data: account }`
  - `PUT /vertex-ai-accounts/:id` — update account (same pattern as Azure OpenAI update)
  - `PUT /vertex-ai-accounts/:id/toggle` — toggle active status
  - `DELETE /vertex-ai-accounts/:id` — delete account
  - `POST /vertex-ai-accounts/:id/test` — test Service Account JSON by generating access token, return success/failure
  - Register route in `src/routes/admin/index.js`:
    - Add `const vertexAiAccountsRoutes = require('./vertexAiAccounts')`
    - Add `router.use('/', vertexAiAccountsRoutes)` in the direct-mount section
  - Use `authenticateAdmin` middleware on all routes
  - Use `formatAccountExpiry`, `mapExpiryField` from `./utils`
  - Use `webhookNotifier` for account create/update/delete notifications

## Implementation Details

### Key Files
- `src/services/account/vertexAiAccountService.js` — New: Account service with CRUD, encryption, validation, token generation
- `src/routes/admin/vertexAiAccounts.js` — New: Admin API routes for Vertex AI account management
- `src/routes/admin/index.js` — Modified: Register new route module
- `src/utils/commonHelper.js` — Read only: Use `createEncryptor` factory

### Dependencies
- Phase 3 complete (existing admin infrastructure, auth middleware)
- `google-auth-library` package already installed (v10.1.0)
- `src/utils/commonHelper.js` — `createEncryptor` factory
- `src/middleware/auth.js` — `authenticateAdmin`
- `src/models/redis.js` — Redis operations
- `src/utils/webhookNotifier.js` — Webhook notifications
- `src/routes/admin/utils.js` — `formatAccountExpiry`, `mapExpiryField`

### Testing Strategy
- Unit tests in `tests/vertexAiAccountService.test.js`:
  - Test `validateServiceAccountJson` with valid JSON, missing fields, wrong type, bad private_key format
  - Test `createAccount` stores encrypted data in Redis
  - Test `getAllAccounts` strips sensitive fields
  - Test `deleteAccount` cleans up index and groups
  - Mock `google-auth-library` for `generateAccessToken` tests
  - Mock Redis client
- Route tests verify request validation (400 on missing fields, 400 on invalid JSON)
- `npm run lint` passes
- `npm test -- vertexAiAccountService` passes

## Success Criteria
- [ ] `vertexAiAccountService.js` exports createAccount, getAccount, updateAccount, deleteAccount, getAllAccounts, getSharedAccounts, selectAvailableAccount, validateServiceAccountJson, generateAccessToken, getAccessToken
- [ ] Service Account JSON is encrypted before Redis storage using AES-256-CBC with vertex-ai-specific salt
- [ ] `validateServiceAccountJson` rejects JSON missing required fields or with wrong type
- [ ] `generateAccessToken` uses google-auth-library to produce a working access token from Service Account JSON
- [ ] Admin routes support full CRUD at `/admin/vertex-ai-accounts`
- [ ] Admin routes validate required fields and return structured error responses
- [ ] Test endpoint at `POST /admin/vertex-ai-accounts/:id/test` validates credentials against Google Cloud
- [ ] Routes registered in admin index.js
- [ ] `npm run lint` and `npm test -- vertexAiAccountService` pass
- [ ] All sensitive credentials encrypted, never returned to frontend in plaintext

---
*Created: 2026-04-01*
