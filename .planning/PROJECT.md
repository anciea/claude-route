# Google OAuth2 Authentication Integration

## What This Is

A complete replacement of the current LDAP authentication system with Google OAuth2, enabling users to log in using their Google accounts and automatically receive API keys for immediate service access.

## Core Value

Users can authenticate with Google OAuth2 and immediately start using Claude Relay Service without manual API key creation or LDAP configuration.

## Requirements

### Validated

- [x] **AUTH-01**: User can initiate Google OAuth2 login flow — Validated in Phase 1: Google OAuth2 Backend Foundation
- [x] **AUTH-02**: System exchanges OAuth2 authorization code for user profile data — Validated in Phase 1: Google OAuth2 Backend Foundation
- [x] **AUTH-03**: System validates Google OAuth2 tokens and user permissions — Validated in Phase 1: Google OAuth2 Backend Foundation
- [x] **AUTH-04**: Authentication middleware supports Google OAuth2 tokens — Validated in Phase 1: Google OAuth2 Backend Foundation
- [x] **SYS-05**: Backend routes handle Google OAuth2 callback processing — Validated in Phase 1: Google OAuth2 Backend Foundation

### Active

- [ ] **USER-01**: New user accounts are automatically created from Google profile data
- [ ] **USER-02**: User profile uses Google ID as username, stores email and basic info
- [ ] **APIKEY-01**: System automatically generates full-permission API key on first login
- [ ] **APIKEY-02**: User receives API key immediately after successful authentication
- [ ] **SYS-01**: Google OAuth2 completely replaces LDAP authentication system
- [ ] **SYS-02**: User management interface supports Google-authenticated users
- [ ] **SYS-03**: Existing user sessions and API keys remain functional during transition

### Out of Scope

- LDAP authentication retention — completely replaced by Google OAuth2
- Manual API key creation for new users — automated on first login
- Support for non-Google authentication methods — Google OAuth2 only
- Migration of existing LDAP users — clean replacement approach

## Context

**Current Authentication System:**
- LDAP-based authentication via `/user/login`
- Manual API key creation after login
- Session tokens for web interface access
- User profiles stored in Redis
- Complete user management system in place

**Technical Environment:**
- Express.js backend with Redis storage
- Existing OAuth helper utilities (`src/utils/oauthHelper.js`)
- Current API key generation system (`src/services/apiKeyService.js`)
- User management routes (`src/routes/userRoutes.js`)
- Clean Architecture pattern with service/handler separation

**Current State:**
- Phase 1 complete — Google OAuth2 backend foundation implemented
- Authentication routes `/auth/google` and `/auth/google/callback` functional
- GoogleOAuthService provides complete OAuth2 flow integration
- Authentication middleware enhanced with Google OAuth2 support
- Backward compatibility maintained for existing LDAP sessions

**Remaining Integration Points:**
- Modify user creation flow in `userService` for automatic user creation
- Integrate automatic API key generation on first login
- Replace LDAP endpoints with Google OAuth2 flow
- Update user management UI for Google-authenticated users

## Constraints

- **Architecture**: Must follow existing Clean Architecture patterns in codebase
- **Security**: Google OAuth2 tokens and user data must be encrypted in Redis storage
- **Compatibility**: Existing API key format (`cr_` prefix) and permissions system must be preserved
- **User Experience**: Single-step authentication and immediate API key access
- **Code Style**: Must follow existing code standards (no semicolons, single quotes, Prettier formatting)

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Google OAuth2 service architecture | Separate service layer for OAuth2 operations | ✓ Good |
| CSRF protection via Redis state | Secure state management with TTL | ✓ Good |
| Backward compatible middleware | Maintain existing LDAP session support | ✓ Good |
| Complete LDAP replacement | User wants simplified authentication flow | — Pending |
| Auto API key generation | Immediate user productivity after login | — Pending |
| Google ID as username | Unique identifier from Google OAuth2 | — Pending |
| Full permissions default | User specified unrestricted access for new users | — Pending |

---
*Last updated: 2026-03-30 after Phase 1: Google OAuth2 Backend Foundation completion*

## Evolution

**After each phase transition:**
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone:**
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state (users, feedback, metrics)