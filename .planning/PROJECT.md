# Google OAuth2 Authentication Integration

## What This Is

A complete replacement of the current LDAP authentication system with Google OAuth2, enabling users to log in using their Google accounts and automatically receive API keys for immediate service access.

## Core Value

Users can authenticate with Google OAuth2 and immediately start using Claude Relay Service without manual API key creation or LDAP configuration.

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] **AUTH-01**: User can initiate Google OAuth2 login flow
- [ ] **AUTH-02**: System exchanges OAuth2 authorization code for user profile
- [ ] **AUTH-03**: New user accounts are automatically created from Google profile data
- [ ] **AUTH-04**: User profile uses Google ID as username, stores email and basic info
- [ ] **AUTH-05**: System automatically generates full-permission API key on first login
- [ ] **AUTH-06**: User receives API key immediately after successful authentication
- [ ] **AUTH-07**: Existing user sessions and API keys remain functional during transition
- [ ] **AUTH-08**: Google OAuth2 completely replaces LDAP authentication system
- [ ] **AUTH-09**: User management interface supports Google-authenticated users
- [ ] **AUTH-10**: Session management works with Google OAuth2 tokens

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

**Integration Points:**
- Replace `/user/login` endpoint
- Modify user creation flow in `userService`
- Integrate with existing API key generation
- Update authentication middleware
- Maintain existing user management UI

## Constraints

- **Architecture**: Must follow existing Clean Architecture patterns in codebase
- **Security**: Google OAuth2 tokens and user data must be encrypted in Redis storage
- **Compatibility**: Existing API key format (`cr_` prefix) and permissions system must be preserved
- **User Experience**: Single-step authentication and immediate API key access
- **Code Style**: Must follow existing code standards (no semicolons, single quotes, Prettier formatting)

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Complete LDAP replacement | User wants simplified authentication flow | — Pending |
| Auto API key generation | Immediate user productivity after login | — Pending |
| Google ID as username | Unique identifier from Google OAuth2 | — Pending |
| Full permissions default | User specified unrestricted access for new users | — Pending |

---
*Last updated: 2026-03-30 after initial project definition*

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