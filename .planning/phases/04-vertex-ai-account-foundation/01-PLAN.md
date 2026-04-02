---
phase: 04-vertex-ai-account-foundation
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/services/account/vertexAiAccountService.js
  - src/routes/admin/vertexAiAccounts.js
  - src/routes/admin/index.js
  - tests/vertexAiAccountService.test.js
autonomous: true
requirements:
  - ACCOUNT-01
  - ACCOUNT-02
  - ACCOUNT-03
  - ACCOUNT-04
  - ACCOUNT-05
  - ACCOUNT-06
  - ACCOUNT-07

must_haves:
  truths:
    - "Vertex AI account can be created with Service Account JSON, Project ID, and Location"
    - "Service Account JSON credentials are encrypted before Redis storage"
    - "Invalid Service Account JSON is rejected with descriptive error"
    - "System generates Google Cloud access token from valid Service Account JSON"
    - "Admin API routes provide full CRUD for Vertex AI accounts"
    - "Sensitive credentials are never returned to frontend in plaintext"
  artifacts:
    - path: "src/services/account/vertexAiAccountService.js"
      provides: "Entity Layer account service with CRUD, encryption, validation, token generation"
      exports: ["createAccount", "getAccount", "updateAccount", "deleteAccount", "getAllAccounts", "getSharedAccounts", "selectAvailableAccount", "validateServiceAccountJson", "generateAccessToken", "getAccessToken"]
    - path: "src/routes/admin/vertexAiAccounts.js"
      provides: "Framework Layer admin API routes for Vertex AI account management"
      exports: ["router"]
    - path: "src/routes/admin/index.js"
      provides: "Updated admin router with Vertex AI routes registered"
    - path: "tests/vertexAiAccountService.test.js"
      provides: "Unit tests for account service validation, encryption, CRUD"
  key_links:
    - from: "src/routes/admin/vertexAiAccounts.js"
      to: "src/services/account/vertexAiAccountService.js"
      via: "require import for CRUD operations"
      pattern: "require.*vertexAiAccountService"
    - from: "src/services/account/vertexAiAccountService.js"
      to: "src/utils/commonHelper.js"
      via: "createEncryptor factory for AES-256-CBC encryption"
      pattern: "createEncryptor.*vertex"
    - from: "src/services/account/vertexAiAccountService.js"
      to: "src/models/redis.js"
      via: "Redis operations for account storage"
      pattern: "redis\\.(hset|hget|hdel|sadd|srem)"
    - from: "src/routes/admin/index.js"
      to: "src/routes/admin/vertexAiAccounts.js"
      via: "router.use registration"
      pattern: "router\\.use.*vertexAiAccounts"
---

<objective>
Create the backend Vertex AI account service (Entity Layer per Clean Architecture, per CLAUDE.md) with AES-256-CBC encrypted credential storage (per CLAUDE.md security constraints), Service Account JSON validation, Google Cloud access token generation, and admin API routes (Framework Layer) for full CRUD management of Vertex AI accounts.

Purpose: Enable admins to create and manage Vertex AI accounts with secure service account authentication, fulfilling all ACCOUNT-* requirements for Phase 4.
Output: Working account service, admin routes, and unit tests.
</objective>

<execution_context>
@/Users/liou/js_project/claude-relay-service/.claude/get-shit-done/workflows/execute-plan.md
@/Users/liou/js_project/claude-relay-service/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/workstreams/milestone/ROADMAP.md
@.planning/workstreams/milestone/REQUIREMENTS.md
@.planning/phases/04-vertex-ai-account-foundation/04-CONTEXT.md

<interfaces>
<!-- Key types and contracts the executor needs. Extracted from canonical references in CONTEXT.md. -->
<!-- Executor should use these directly -- no codebase exploration needed. -->

From src/utils/commonHelper.js (encryption factory):
```javascript
// createEncryptor(salt) returns { encrypt(text), decrypt(encrypted) }
// Uses AES-256-CBC with ENCRYPTION_KEY env var and provider-specific salt
const createEncryptor = (salt) => { ... }
```

From src/services/account/azureOpenaiAccountService.js (reference pattern):
```javascript
// Account service pattern: CRUD with encryption, Redis storage, index management
// Redis key patterns: {provider}:account:{id}, {provider}:account:index, shared_{provider}_accounts
// Exports: createAccount, getAccount, updateAccount, deleteAccount, getAllAccounts, getSharedAccounts, selectAvailableAccount
```

From src/routes/admin/azureOpenaiAccounts.js (reference route pattern):
```javascript
// Admin route pattern: authenticateAdmin middleware, CRUD endpoints
// GET /{provider}-accounts, POST /{provider}-accounts, PUT /{provider}-accounts/:id
// PUT /{provider}-accounts/:id/toggle, DELETE /{provider}-accounts/:id
// POST /{provider}-accounts/:id/test (credential validation)
```

From src/middleware/auth.js:
```javascript
const { authenticateAdmin } = require('../middleware/auth')
```

From src/routes/admin/utils.js:
```javascript
const { formatAccountExpiry, mapExpiryField } = require('./utils')
```
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Create Vertex AI account service with encrypted storage and validation</name>
  <files>src/services/account/vertexAiAccountService.js, tests/vertexAiAccountService.test.js</files>
  <behavior>
    - validateServiceAccountJson with valid JSON returns { valid: true }
    - validateServiceAccountJson with missing required fields returns { valid: false, error: descriptive }
    - validateServiceAccountJson with type !== 'service_account' returns { valid: false }
    - validateServiceAccountJson with bad private_key format returns { valid: false }
    - validateServiceAccountJson with bad client_email format returns { valid: false }
    - createAccount stores encrypted serviceAccountJson in Redis (AES-256-CBC)
    - createAccount calls validateServiceAccountJson and rejects invalid JSON
    - getAllAccounts strips serviceAccountJson from returned accounts
    - deleteAccount removes from Redis index and shared accounts set
    - generateAccessToken uses google-auth-library to produce access token
  </behavior>
  <action>
    Create `src/services/account/vertexAiAccountService.js` as an Entity Layer service (per CLAUDE.md Clean Architecture -- entity layer holds account management and data models).

    Follow the Azure OpenAI account service pattern (`src/services/account/azureOpenaiAccountService.js`).

    ENCRYPTION (per D-02, D-06, D-07, ACCOUNT-03): Use `createEncryptor` from `src/utils/commonHelper.js` with salt `'vertex-ai-account-salt'` for AES-256-CBC encryption (per CLAUDE.md security constraint: "Sensitive data must be AES encrypted"). Encrypt entire Service Account JSON as `encrypt(JSON.stringify(serviceAccountJson))`.

    REDIS KEYS (per D-03): Prefix `vertex_ai:account:`, index `vertex_ai:account:index`, shared key `shared_vertex_ai_accounts`, session mapping `vertex_ai_session_account_mapping:`.

    ACCOUNT CREATION (per D-01, ACCOUNT-01, ACCOUNT-02, ACCOUNT-04, ACCOUNT-05):
    `createAccount(options)` accepts: name, description, projectId (required), location (default 'us-central1'), serviceAccountJson (required), accountType, priority, schedulable, isActive, proxy, groupId, disableAutoProtection, subscriptionExpiresAt.
    Validate JSON via `validateServiceAccountJson` before storing (per D-08, D-09, ACCOUNT-06).
    Store projectId and location as plain text (non-sensitive config).

    VALIDATION (per D-08, D-09, ACCOUNT-06):
    `validateServiceAccountJson(json)`: Verify required fields (type, project_id, private_key, client_email, client_id, auth_uri, token_uri). Verify type === 'service_account'. Verify private_key starts with '-----BEGIN'. Verify client_email matches *@*.iam.gserviceaccount.com.

    TOKEN GENERATION (per D-04, D-05, ACCOUNT-07):
    `generateAccessToken(serviceAccountJson)`: Use `google-auth-library` v10.1.0 (per D-04). Create `GoogleAuth` with credentials and scope `https://www.googleapis.com/auth/cloud-platform` (per D-05). Call auth.getClient() then client.getAccessToken(). Return { accessToken, expiresAt }. On failure, throw with descriptive error (per D-16). No retry logic (per D-17: retry is for relay service in Phase 5).

    `getAccessToken(accountId)`: Retrieve account, decrypt serviceAccountJson, parse JSON, call generateAccessToken. Handle and log errors with logger.error.

    CRUD: getAccount, updateAccount (re-encrypt if serviceAccountJson changes), deleteAccount (remove from index, shared set, account groups), getAllAccounts (strip sensitive fields, add platform: 'vertex-ai'), getSharedAccounts, selectAvailableAccount (session-sticky with temp-unavailable check), isSubscriptionExpired.

    Write tests FIRST in `tests/vertexAiAccountService.test.js`. Mock redis, logger, google-auth-library. Follow existing test patterns with jest.mock() and jest.resetModules().
  </action>
  <verify>
    <automated>npm test -- vertexAiAccountService</automated>
  </verify>
  <done>vertexAiAccountService.js exports all required functions. validateServiceAccountJson correctly accepts/rejects JSON. Credentials encrypted with AES-256-CBC before Redis storage. All unit tests pass.</done>
</task>

<task type="auto">
  <name>Task 2: Create admin API routes and register in admin router</name>
  <files>src/routes/admin/vertexAiAccounts.js, src/routes/admin/index.js</files>
  <action>
    Create `src/routes/admin/vertexAiAccounts.js` as a Framework Layer component (per CLAUDE.md Clean Architecture -- framework layer handles HTTP routing, request validation, response formatting).

    Follow Azure OpenAI admin routes pattern exactly (per D-13).

    ROUTES (per D-13, ACCOUNT-01):
    - `GET /vertex-ai-accounts` -- list all accounts with usage stats and group info (authenticateAdmin middleware)
    - `POST /vertex-ai-accounts` -- create account (per D-14):
      - Extract name, description, projectId, location, serviceAccountJson, accountType, priority, schedulable, isActive, proxy, groupId, groupIds from req.body
      - Validate required fields: name, projectId, serviceAccountJson
      - Parse serviceAccountJson (accept string or object per D-14)
      - Call validateServiceAccountJson -- return 400 with validation error if invalid (per D-08, D-09)
      - Optionally test auth by calling generateAccessToken -- warn but allow if Google Cloud unreachable (per D-16)
      - Handle account group assignment if groupId or groupIds provided
      - Send webhook notification on success
      - Return { success: true, data: account }
    - `PUT /vertex-ai-accounts/:id` -- update account (same pattern as Azure OpenAI update)
    - `PUT /vertex-ai-accounts/:id/toggle` -- toggle active status
    - `DELETE /vertex-ai-accounts/:id` -- delete account
    - `POST /vertex-ai-accounts/:id/test` -- test Service Account JSON by generating access token (per ACCOUNT-07)

    Use `authenticateAdmin` middleware on all routes. Use `formatAccountExpiry`, `mapExpiryField` from `./utils`. Use `webhookNotifier` for create/update/delete notifications.

    REGISTER in `src/routes/admin/index.js`:
    - Add `const vertexAiAccountsRoutes = require('./vertexAiAccounts')`
    - Add `router.use('/', vertexAiAccountsRoutes)` in the direct-mount section

    Run `npx prettier --write src/routes/admin/vertexAiAccounts.js src/routes/admin/index.js` after implementation.
  </action>
  <verify>
    <automated>npm run lint && npm test -- vertexAiAccountService</automated>
  </verify>
  <done>Admin routes support full CRUD at /admin/vertex-ai-accounts. Routes validate required fields and return structured error responses (per D-16). Test endpoint validates credentials against Google Cloud. Routes registered in admin index.js. Lint passes.</done>
</task>

</tasks>

<verification>
- `npm run lint` passes with zero errors
- `npm test -- vertexAiAccountService` passes all tests
- `src/routes/admin/index.js` requires and mounts vertexAiAccounts routes
- vertexAiAccountService.js uses createEncryptor with vertex-ai-specific salt for AES-256-CBC encryption
- getAllAccounts never returns serviceAccountJson in response
- validateServiceAccountJson rejects JSON missing required fields or with wrong type
</verification>

<success_criteria>
- vertexAiAccountService.js exports createAccount, getAccount, updateAccount, deleteAccount, getAllAccounts, getSharedAccounts, selectAvailableAccount, validateServiceAccountJson, generateAccessToken, getAccessToken
- Service Account JSON is encrypted before Redis storage using AES-256-CBC with vertex-ai-specific salt (per D-02, D-06, CLAUDE.md security constraints)
- validateServiceAccountJson rejects JSON missing required fields or with wrong type (per D-08, D-09)
- generateAccessToken uses google-auth-library to produce a working access token from Service Account JSON (per D-04, D-05)
- Admin routes support full CRUD at /admin/vertex-ai-accounts (per D-13)
- Admin routes validate required fields and return structured error responses (per D-16)
- Test endpoint at POST /admin/vertex-ai-accounts/:id/test validates credentials against Google Cloud
- Routes registered in admin index.js
- npm run lint and npm test -- vertexAiAccountService pass
- All sensitive credentials encrypted, never returned to frontend in plaintext (per CLAUDE.md security constraints)
</success_criteria>

<output>
After completion, create `.planning/phases/04-vertex-ai-account-foundation/04-01-SUMMARY.md`
</output>
