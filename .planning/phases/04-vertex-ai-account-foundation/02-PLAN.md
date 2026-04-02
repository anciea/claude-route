# Plan 02: Frontend Integration and End-to-End Verification

**Phase:** 4 — Vertex AI Account Foundation
**Goal:** Integrate Vertex AI accounts into the Vue admin SPA (accounts store, HTTP APIs, PLATFORM_CONFIG) so admins can create, view, update, and delete Vertex AI accounts through the management interface with proper status indicators.
**Complexity:** Medium
**Requirements:** ACCOUNT-01, ACCOUNT-04, ACCOUNT-05

## Tasks

### Frontend Store and API Integration

- **T1:** Add Vertex AI account support to frontend stores and HTTP APIs
  - In `web/admin-spa/src/utils/http_apis.js`, add these API functions following the existing pattern:
    ```
    export const getVertexAiAccountsApi = () => request({ url: '/admin/vertex-ai-accounts', method: 'GET' })
    export const createVertexAiAccountApi = (data) => request({ url: '/admin/vertex-ai-accounts', method: 'POST', data })
    export const updateVertexAiAccountApi = (id, data) => request({ url: `/admin/vertex-ai-accounts/${id}`, method: 'PUT', data })
    export const testVertexAiAccountApi = (id) => request({ url: `/admin/vertex-ai-accounts/${id}/test`, method: 'POST' })
    ```
  - In `web/admin-spa/src/stores/accounts.js`:
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
  - Run `npx prettier --write web/admin-spa/src/utils/http_apis.js web/admin-spa/src/stores/accounts.js`

### Build Verification and End-to-End Testing

- **T2:** Verify frontend builds and all backend tests pass
  - Run `npm run lint` — must pass with zero errors
  - Run `npm test` — all existing tests must pass (no regressions)
  - Run `npm run build:web` — frontend must build successfully with new store changes
  - Run `npm run format:check` — verify formatting is consistent
  - If any failures, fix the issues in the relevant files
  - Verify the PLATFORM_CONFIG mapping is correct by checking that `vertex_ai` key exists in the accounts store

## Implementation Details

### Key Files
- `web/admin-spa/src/utils/http_apis.js` — Modified: Add Vertex AI API functions
- `web/admin-spa/src/stores/accounts.js` — Modified: Add vertex_ai to PLATFORM_CONFIG, state, and operations

### Dependencies
- Plan 01 must be complete (admin routes at `/admin/vertex-ai-accounts` must exist)
- Existing frontend build infrastructure (Vite, Vue 3, Pinia)

### Testing Strategy
- `npm run build:web` succeeds (no TypeScript/import errors)
- `npm run lint` passes
- `npm test` passes (no regressions from backend changes in Plan 01)
- Manual verification: PLATFORM_CONFIG contains `vertex_ai` key with correct endpoint and stateKey

## Success Criteria
- [ ] `http_apis.js` exports `getVertexAiAccountsApi`, `createVertexAiAccountApi`, `updateVertexAiAccountApi`, `testVertexAiAccountApi`
- [ ] `accounts.js` PLATFORM_CONFIG includes `vertex_ai` with endpoint `'vertex-ai-accounts'` and stateKey `'vertexAiAccounts'`
- [ ] `fetchAllAccounts` includes Vertex AI accounts in its Promise.all
- [ ] `deleteAccount` and `toggleAccount` work for `vertex_ai` platform
- [ ] `npm run build:web` succeeds
- [ ] `npm run lint` passes
- [ ] `npm test` passes with no regressions

---
*Created: 2026-04-01*
