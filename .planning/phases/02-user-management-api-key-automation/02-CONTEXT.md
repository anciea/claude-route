# Phase 2: User Management & API Key Automation - Context

**Gathered:** 2026-03-31
**Status:** Ready for planning

<domain>
## Phase Boundary

Create users from Google profiles and auto-generate API keys on first login. Integrates automatic user creation and API key generation into the existing OAuth2 authentication flow to provide immediate service access.

</domain>

<decisions>
## Implementation Decisions

### User Creation Integration
- **D-01:** Integrate automatic user creation directly into existing authRoutes.js OAuth callback flow
- **D-02:** Use existing userService.createOrUpdateUser() method with Google profile data mapping
- **D-03:** Map Google ID as username, store email, displayName, firstName, lastName, and avatar URL

### API Key Generation Timing
- **D-04:** Generate API key immediately after successful user creation for seamless experience
- **D-05:** Use existing apiKeyService.generateApiKey() with full permissions configuration
- **D-06:** API keys follow existing `cr_` prefix format and permission system

### Authentication Response Format
- **D-07:** Return both session token and API key in OAuth callback response for immediate use
- **D-08:** Include API key in the authentication response JSON alongside user profile data
- **D-09:** Maintain backward compatibility with existing session management

### Error Recovery Strategy
- **D-10:** If user creation fails, abort API key generation and return authentication error
- **D-11:** If API key generation fails, still create user but return warning about API key creation
- **D-12:** Use Redis transaction patterns where possible for atomicity

### Claude's Discretion
- Exact error message wording for user creation failures
- API key naming convention for auto-generated keys
- Session token expiration timing

</decisions>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches based on existing codebase patterns.

</specifics>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

No external specs — requirements are fully captured in decisions above. Reference existing codebase patterns in userService.js and apiKeyService.js for implementation consistency.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **userService.createOrUpdateUser()**: Handles user creation/updates with Redis storage, supports role assignment
- **apiKeyService.generateApiKey()**: Supports full permission API key generation with existing format
- **authRoutes.js OAuth callback**: Already extracts Google profile data and validates domains
- **Redis session management**: Existing userService.createUserSession() for session token generation

### Established Patterns
- **User profile mapping**: Google profile → internal user structure already defined in authRoutes.js:112-119
- **Error handling**: Structured JSON responses with error/message fields
- **Security**: AES encryption for sensitive data, SHA-256 hashing for API keys
- **Architecture**: Clean Architecture with service layer separation

### Integration Points
- **OAuth callback flow**: Extend existing `/auth/google/callback` route in authRoutes.js
- **User management**: Connect to existing userService for user creation and session management
- **API key system**: Connect to existing apiKeyService for automated key generation
- **Redis storage**: Use existing Redis patterns for user data and API key storage

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 02-user-management-api-key-automation*
*Context gathered: 2026-03-31*