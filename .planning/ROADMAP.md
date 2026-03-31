# Roadmap: Google OAuth2 Authentication Integration

**Created:** 2026-03-30
**Core Value:** Users can authenticate with Google OAuth2 and immediately start using Claude Relay Service without manual API key creation or LDAP configuration.

## Milestone 1: Google OAuth2 Integration

**Target:** Complete replacement of LDAP with Google OAuth2 authentication
**Duration:** 3 phases
**Success Criteria:** Users can log in with Google and receive API keys automatically

---

## Phase 1: Google OAuth2 Backend Foundation

**Goal:** Implement Google OAuth2 authentication flow and callback handling

**Duration:** 2-3 days
**Risk Level:** Medium
**Dependencies:** None
**Plans:** 3 plans
**Requirements:** [AUTH-01, AUTH-02, AUTH-03, AUTH-04, SYS-05]

Plans:
- [x] 01-01-PLAN.md — Google OAuth2 configuration and core service module
- [x] 01-02-PLAN.md — OAuth2 authentication routes and app wiring
- [x] 01-03-PLAN.md — Authentication middleware enhancement and integration verification

### Requirements Covered
- AUTH-01: User can initiate Google OAuth2 login flow from web interface
- AUTH-02: System exchanges OAuth2 authorization code for user profile data
- AUTH-03: System validates Google OAuth2 tokens and user permissions
- AUTH-04: Authentication middleware supports Google OAuth2 tokens
- SYS-05: Backend routes handle Google OAuth2 callback processing

### Key Deliverables
- Google OAuth2 configuration setup
- OAuth2 authentication routes (`/auth/google`, `/auth/google/callback`)
- Google OAuth2 service module
- Updated authentication middleware
- Token validation and user profile extraction

### Success Criteria
- Google OAuth2 flow completes successfully
- User profile data is extracted from Google
- Authentication middleware validates OAuth2 tokens
- Error handling for OAuth2 failures

---

## Phase 2: User Management & API Key Automation

**Goal:** Create users from Google profiles and auto-generate API keys

**Duration:** 2-3 days
**Risk Level:** Medium
**Dependencies:** Phase 1 complete
**Plans:** 2 plans
**Requirements:** [USER-01, USER-02, USER-03, USER-04, APIKEY-01, APIKEY-02, APIKEY-03, APIKEY-04, APIKEY-05]

Plans:
- [x] 02-01-PLAN.md — Service layer: userService enhancement and googleLoginService orchestration
- [x] 02-02-PLAN.md — Route integration: OAuth callback wiring and full test coverage

### Requirements Covered
- USER-01: New user accounts are automatically created from Google profile data
- USER-02: User profile uses Google ID as primary username identifier
- USER-03: System stores Google email, display name, and avatar URL
- USER-04: User profiles integrate with existing Redis-based user management
- APIKEY-01: System automatically generates full-permission API key on first login
- APIKEY-02: Generated API key follows existing `cr_` prefix format
- APIKEY-03: API key has all service permissions enabled by default
- APIKEY-04: User receives API key immediately in login response
- APIKEY-05: API key creation integrates with existing apiKeyService

### Key Deliverables
- Google user profile to internal user mapping
- Automatic user creation on first OAuth2 login
- API key auto-generation service
- User profile storage with Google data
- Login response including API key

### Success Criteria
- New users created automatically from Google profiles
- API keys generated with full permissions
- User data properly stored in Redis
- Complete authentication response with API key

---

## Phase 3: System Integration & LDAP Replacement

**Goal:** Replace LDAP system completely and update user interfaces

**Duration:** 2-3 days
**Risk Level:** High
**Dependencies:** Phase 1-2 complete
**Plans:** 3 plans
**Requirements:** [USER-05, SYS-01, SYS-02, SYS-03, SYS-04]

Plans:
- [x] 03-01-PLAN.md — Backend LDAP removal: delete ldapService, remove LDAP routes, update auth middleware and OEM settings
- [x] 03-02-PLAN.md — Frontend update: Google OAuth2 login redirect, ldapEnabled to googleOAuthEnabled migration, user management UI enhancement
- [ ] 03-03-PLAN.md — Integration testing, build verification, and human end-to-end validation

### Requirements Covered
- USER-05: User management interface displays Google-authenticated users correctly
- SYS-01: Google OAuth2 completely replaces LDAP authentication endpoints
- SYS-02: Session management works with Google OAuth2 authentication
- SYS-03: Existing API key validation and middleware remain functional
- SYS-04: User interface login flow redirects to Google OAuth2

### Key Deliverables
- Remove LDAP authentication routes
- Update frontend login interface
- Update user management UI for Google users
- Session management with OAuth2 tokens
- Complete system testing and validation

### Success Criteria
- LDAP authentication endpoints removed
- Frontend redirects to Google OAuth2
- User management displays Google user data
- Existing API keys continue working
- Full end-to-end authentication flow functional

---

## Risk Assessment

### High-Risk Areas
- **Phase 3**: Complete LDAP removal could break existing functionality
- **Session Management**: OAuth2 token lifecycle vs current session approach
- **User Data Migration**: Existing users during transition period

### Mitigation Strategies
- Comprehensive testing at each phase
- Backup of existing authentication before removal
- Feature flags for gradual rollout if needed
- Rollback plan for each phase

---

## Success Metrics

### Technical Metrics
- Google OAuth2 authentication success rate > 98%
- API key generation time < 2 seconds
- User profile creation success rate 100%
- Existing API key functionality preserved

### User Experience Metrics
- Single-click Google login flow
- Immediate API key availability
- Zero manual configuration required
- Consistent user interface experience

---

## Post-Milestone 1

### Future Enhancements (Milestone 2+)
- Google Workspace domain restrictions
- Enhanced API key configuration options
- User profile synchronization
- Administrative OAuth2 controls
- Migration tools for existing LDAP deployments

---

*Roadmap created: 2026-03-30*
*Last updated: 2026-03-31 after Phase 3 planning*
