# Phase 4: Vertex AI Account Foundation - Context

**Gathered:** 2026-04-02 (assumptions mode)
**Status:** Ready for planning

<domain>
## Phase Boundary

Enable Vertex AI account creation with secure service account authentication. Admins can create new Vertex AI accounts in management interface, upload Service Account JSON credentials securely, and system validates credentials to generate working Google Cloud access tokens. Vertex AI accounts appear in account management with proper status indicators.

</domain>

<decisions>
## Implementation Decisions

### Account Service Architecture
- **D-01:** Follow established account service pattern with encrypted credential storage
- **D-02:** Use AES-256-CBC encryption consistent with existing providers
- **D-03:** Store account data in Redis following existing patterns

### Service Account JSON Authentication
- **D-04:** Use existing google-auth-library package (v10.1.0) for authentication
- **D-05:** Required OAuth scope: `https://www.googleapis.com/auth/cloud-platform`
- **D-06:** Encrypt Service Account JSON files using createEncryptor pattern from commonHelper.js
- **D-07:** Store encrypted credentials in Redis with provider-specific salt value

### Service Account JSON Validation
- **D-08:** Validate Service Account JSON contains required fields: type, project_id, private_key, client_email, client_id, auth_uri, token_uri
- **D-09:** Verify "type" field equals "service_account"
- **D-10:** Support optional region field for custom regions
- **D-11:** Validate service account has "Vertex AI User" role or equivalent permissions

### Admin Interface Integration
- **D-12:** Add vertex account type to existing admin interface PLATFORM_CONFIG mapping
- **D-13:** Create new admin route following `/admin/vertex-accounts` pattern
- **D-14:** Support multipart form data upload for Service Account JSON files
- **D-15:** Implement immediate encryption and temporary storage validation before persisting

### Error Handling
- **D-16:** Handle Google Cloud authentication errors gracefully
- **D-17:** Implement exponential backoff retry logic for transient errors
- **D-18:** Return structured error responses matching HTTP 429 "Resource Exhausted" format
- **D-19:** Support both 429 and 5XX error codes from Vertex AI

### Claude's Discretion
- Exact validation error message formatting
- Temporary credential storage cleanup timing
- Service account validation timeout values

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Account Management Architecture
- `src/services/account/claudeAccountService.js` — Reference implementation for encrypted credential storage pattern
- `src/services/account/azureOpenaiAccountService.js` — Multi-field configuration example
- `src/services/account/geminiAccountService.js` — Google service integration patterns
- `src/utils/commonHelper.js` — createEncryptor factory pattern and encryption utilities

### Admin Interface Patterns
- `web/admin-spa/src/stores/accounts.js` — PLATFORM_CONFIG mapping and frontend account management
- `src/routes/admin/geminiAccounts.js` — OAuth credential handling and session management
- `src/routes/admin/azureOpenaiAccounts.js` — Multi-field account configuration example

### Authentication and Middleware
- `src/middleware/auth.js` — Authentication middleware patterns
- `src/utils/oauthHelper.js` — OAuth flow utilities and session management
- `package.json` — Existing google-auth-library dependency

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `createEncryptor`: Factory for provider-specific AES encryption with salt values
- `google-auth-library`: Already installed (v10.1.0) for Gemini OAuth integration
- Admin route structure: Consistent `/admin/{provider}-accounts` pattern with session management
- Account service base pattern: Encryption, Redis storage, validation, error handling

### Established Patterns
- All sensitive credentials encrypted with AES-256-CBC before Redis storage
- Provider-specific salt values for encryption (e.g., 'claude_salt', 'gemini_salt')
- Session-based credential exchange during admin setup flows
- Consistent PLATFORM_CONFIG mapping in frontend stores for account management

### Integration Points
- Redis models for account data storage and retrieval
- Admin interface account creation and management workflows
- Existing Google service authentication patterns from Gemini integration
- Error handling and response formatting across all account services

</code_context>

<specifics>
## Specific Ideas

- Model naming correction needed: Use `claude-opus-4-6` and `claude-sonnet-4-6` (not claude-4.6-opus format in REQUIREMENTS.md)
- Service account JSON validation must be comprehensive before attempting authentication
- Google Cloud access token generation should follow existing OAuth helper patterns
- Admin interface should maintain visual consistency with other provider account management

</specifics>

<deferred>
## Deferred Ideas

None — analysis stayed within phase scope

</deferred>

---

*Phase: 04-vertex-ai-account-foundation*
*Context gathered: 2026-04-02*