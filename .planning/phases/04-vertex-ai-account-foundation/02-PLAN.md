---
phase: 04-vertex-ai-account-foundation
plan: 02
type: execute
wave: 2
depends_on: ["01"]
files_modified:
  - web/admin-spa/src/utils/http_apis.js
  - web/admin-spa/src/stores/accounts.js
autonomous: true
requirements:
  - ACCOUNT-01
  - ACCOUNT-04
  - ACCOUNT-05

must_haves:
  truths:
    - "Frontend accounts store includes vertex_ai in PLATFORM_CONFIG"
    - "HTTP API functions exist for Vertex AI account CRUD operations"
    - "fetchAllAccounts includes Vertex AI accounts in its Promise.all"
    - "deleteAccount and toggleAccount work for vertex_ai platform"
    - "Frontend builds successfully with new store changes"
  artifacts:
    - path: "web/admin-spa/src/utils/http_apis.js"
      provides: "HTTP API functions for Vertex AI account management"
      exports: ["getVertexAiAccountsApi", "createVertexAiAccountApi", "updateVertexAiAccountApi", "testVertexAiAccountApi"]
    - path: "web/admin-spa/src/stores/accounts.js"
      provides: "Pinia store with vertex_ai PLATFORM_CONFIG, state, and operations"
      contains: "vertex_ai"
  key_links:
    - from: "web/admin-spa/src/stores/accounts.js"
      to: "web/admin-spa/src/utils/http_apis.js"
      via: "import of Vertex AI API functions for store actions"
      pattern: "getVertexAiAccountsApi|createVertexAiAccountApi"
    - from: "web/admin-spa/src/stores/accounts.js"
      to: "/admin/vertex-ai-accounts"
      via: "PLATFORM_CONFIG endpoint mapping"
      pattern: "vertex_ai.*vertex-ai-accounts"
---

<objective>
Integrate Vertex AI accounts into the Vue admin SPA (accounts store, HTTP APIs, PLATFORM_CONFIG per D-12) so admins can create, view, update, and delete Vertex AI accounts through the management interface with proper status indicators.

Purpose: Complete the frontend integration for Vertex AI account management, enabling the admin interface to communicate with the backend routes created in Plan 01.
Output: Updated frontend stores and API utilities with full Vertex AI account support.
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
@.planning/phases/04-vertex-ai-account-foundation/04-01-SUMMARY.md

<interfaces>
<!-- Key patterns from existing frontend code the executor needs. -->

From web/admin-spa/src/utils/http_apis.js (existing API function pattern):
```javascript
// Pattern: export const get{Provider}AccountsApi = () => request({ url: '/admin/{provider}-accounts', method: 'GET' })
// Pattern: export const create{Provider}AccountApi = (data) => request({ url: '/admin/{provider}-accounts', method: 'POST', data })
// Pattern: export const update{Provider}AccountApi = (id, data) => request({ url: `/admin/{provider}-accounts/${id}`, method: 'PUT', data })
```

From web/admin-spa/src/stores/accounts.js (PLATFORM_CONFIG pattern):
```javascript
// PLATFORM_CONFIG maps provider key to { endpoint, stateKey }
// Example: gemini: { endpoint: 'gemini-accounts', stateKey: 'geminiAccounts' }
// Each provider has: ref([]) state, fetch function, create/update mutations
// fetchAllAccounts calls all fetch functions in Promise.all
// deleteAccount and toggleAccount use fetchMap for provider-specific refresh
```
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add Vertex AI account support to frontend stores and HTTP APIs</name>
  <files>web/admin-spa/src/utils/http_apis.js, web/admin-spa/src/stores/accounts.js</files>
  <action>
    Add Vertex AI HTTP API functions and store integration following the existing provider pattern. Per D-12, add vertex_ai to PLATFORM_CONFIG. Per D-13, use /admin/vertex-ai-accounts endpoint. Per D-14, support multipart form data upload for Service Account JSON files.

    In `web/admin-spa/src/utils/http_apis.js`, add these API functions following the existing pattern:
    - `export const getVertexAiAccountsApi = () => request({ url: '/admin/vertex-ai-accounts', method: 'GET' })`
    - `export const createVertexAiAccountApi = (data) => request({ url: '/admin/vertex-ai-accounts', method: 'POST', data })`
    - `export const updateVertexAiAccountApi = (id, data) => request({ url: '/admin/vertex-ai-accounts/${id}', method: 'PUT', data })`
    - `export const testVertexAiAccountApi = (id) => request({ url: '/admin/vertex-ai-accounts/${id}/test', method: 'POST' })`

    In `web/admin-spa/src/stores/accounts.js`:
    - Add `vertex_ai` to `PLATFORM_CONFIG`: `vertex_ai: { endpoint: 'vertex-ai-accounts', stateKey: 'vertexAiAccounts' }` (per D-12)
    - Add `const vertexAiAccounts = ref([])` reactive state
    - Add `vertexAiAccounts` to `stateMap`
    - Add `fetchVertexAiAccounts` function: `() => fetchAccounts(httpApis.getVertexAiAccountsApi, vertexAiAccounts)`
    - Add `fetchVertexAiAccounts()` to `fetchAllAccounts` Promise.all array
    - Add `createVertexAiAccount`: `(data) => mutateAccount(httpApis.createVertexAiAccountApi, fetchVertexAiAccounts, data)`
    - Add `updateVertexAiAccount`: `(id, data) => mutateAccount(httpApis.updateVertexAiAccountApi, fetchVertexAiAccounts, id, data)`
    - Add `vertexAiAccounts` to `reset()` function: `vertexAiAccounts.value = []`
    - Add `vertex_ai` to `deleteAccount` fetchMap: `vertex_ai: fetchVertexAiAccounts`
    - Export all new functions and state from the return object

    Run `npx prettier --write web/admin-spa/src/utils/http_apis.js web/admin-spa/src/stores/accounts.js` after changes.
  </action>
  <verify>
    <automated>npm run lint && npm run build:web</automated>
  </verify>
  <done>http_apis.js exports getVertexAiAccountsApi, createVertexAiAccountApi, updateVertexAiAccountApi, testVertexAiAccountApi. accounts.js PLATFORM_CONFIG includes vertex_ai with endpoint 'vertex-ai-accounts' and stateKey 'vertexAiAccounts'. fetchAllAccounts includes Vertex AI. deleteAccount and toggleAccount work for vertex_ai platform. Frontend builds successfully.</done>
</task>

<task type="auto">
  <name>Task 2: Full build verification and regression testing</name>
  <files>web/admin-spa/src/utils/http_apis.js, web/admin-spa/src/stores/accounts.js</files>
  <action>
    Run comprehensive verification to confirm no regressions from Plan 01 backend changes or Plan 02 frontend changes.

    1. Run `npm run lint` -- must pass with zero errors
    2. Run `npm test` -- all existing tests must pass (no regressions from backend changes in Plan 01)
    3. Run `npm run build:web` -- frontend must build successfully with new store changes
    4. Run `npm run format:check` -- verify formatting is consistent
    5. If any failures, fix the issues in the relevant files
    6. Verify the PLATFORM_CONFIG mapping is correct by checking that `vertex_ai` key exists in the accounts store with correct endpoint and stateKey
  </action>
  <verify>
    <automated>npm run lint && npm test && npm run build:web && npm run format:check</automated>
  </verify>
  <done>npm run lint passes. npm test passes with no regressions. npm run build:web succeeds. npm run format:check passes. PLATFORM_CONFIG contains vertex_ai with correct configuration.</done>
</task>

</tasks>

<verification>
- `npm run lint` passes with zero errors
- `npm test` passes (no regressions from Plan 01 backend changes)
- `npm run build:web` succeeds (no import/build errors)
- `npm run format:check` passes
- PLATFORM_CONFIG in accounts.js contains `vertex_ai` key
- http_apis.js exports all four Vertex AI API functions
</verification>

<success_criteria>
- http_apis.js exports getVertexAiAccountsApi, createVertexAiAccountApi, updateVertexAiAccountApi, testVertexAiAccountApi
- accounts.js PLATFORM_CONFIG includes vertex_ai with endpoint 'vertex-ai-accounts' and stateKey 'vertexAiAccounts' (per D-12)
- fetchAllAccounts includes Vertex AI accounts in its Promise.all
- deleteAccount and toggleAccount work for vertex_ai platform
- npm run build:web succeeds
- npm run lint passes
- npm test passes with no regressions
</success_criteria>

<output>
After completion, create `.planning/phases/04-vertex-ai-account-foundation/04-02-SUMMARY.md`
</output>
