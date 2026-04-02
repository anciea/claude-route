# Roadmap: Google Cloud Vertex AI Integration

**Created:** 2026-04-01
**Core Value:** Clients can access Claude models through Google Cloud Vertex AI infrastructure using the same unified API and account management experience as other AI providers, with enterprise-grade authentication and billing through Google Cloud.

## Milestone 2: Google Cloud Vertex AI Integration

**Target:** Add Vertex AI as a new account type with full feature parity and enterprise integration
**Duration:** 3 phases
**Success Criteria:** Users can access Claude 4.6 models through Vertex AI with unified API format

## Previous Milestone: Google OAuth2 Integration (Complete)

- [x] **Phase 1: Google OAuth2 Backend Foundation** - Implement OAuth2 authentication flow and callback handling
- [x] **Phase 2: User Management & API Key Automation** - Create users from Google profiles and auto-generate API keys
- [x] **Phase 3: System Integration & LDAP Replacement** - Replace LDAP system completely and update user interfaces

---

## Phases

- [x] **Phase 4: Vertex AI Account Foundation** - Enable Vertex AI account creation with service account authentication
- [ ] **Phase 5: Model Support & Core Integration** - Add Claude 4.6 model support and API conversion layer
- [ ] **Phase 6: Advanced Features & Admin Interface** - Complete streaming support, usage tracking, and admin UI

---

## Phase Details

### Phase 4: Vertex AI Account Foundation (Complete)

**Goal**: Admins can create and manage Vertex AI accounts with secure service account authentication
**Depends on**: Phase 3
**Requirements**: ACCOUNT-01, ACCOUNT-02, ACCOUNT-03, ACCOUNT-04, ACCOUNT-05, ACCOUNT-06, ACCOUNT-07
**Success Criteria** (what must be TRUE):

  1. Admin can create new Vertex AI account in management interface
  2. Admin can upload and configure Service Account JSON credentials securely
  3. System validates Service Account JSON and generates working Google Cloud access tokens
  4. Vertex AI accounts appear in account management with proper status indicators

**Plans**: 2 plans

Plans:

- [x] 01-PLAN.md — Vertex AI account service (CRUD, encryption, validation, token generation) and admin API routes
- [x] 02-PLAN.md — Frontend integration (accounts store, HTTP APIs, PLATFORM_CONFIG) and build verification

### Phase 5: Model Support & Core Integration

**Goal**: Vertex AI accounts can serve Claude 4.6 model requests through unified API format
**Depends on**: Phase 4
**Requirements**: MODELS-01, MODELS-02, MODELS-03, MODELS-04, INTEGRATION-01, INTEGRATION-02, INTEGRATION-03, INTEGRATION-04, INTEGRATION-05, INTEGRATION-06, INTEGRATION-07
**Success Criteria** (what must be TRUE):

  1. Clients can request Claude 4.6 Opus and Sonnet models via unified Claude API format
  2. Vertex AI accounts integrate seamlessly with existing sticky session and scheduling system
  3. System converts Claude API requests to Vertex AI format and handles authentication errors gracefully
  4. Concurrent request control and queueing work correctly for Vertex AI accounts

**Plans**: 3 plans

Plans:

- [ ] 05-01-PLAN.md — Vertex AI relay service with Claude API format conversion and streaming support
- [ ] 05-02-PLAN.md — Vertex AI scheduler integration for sticky session and account selection
- [ ] 05-03-PLAN.md — Vertex AI route integration with existing Claude API endpoints

### Phase 6: Advanced Features & Admin Interface

**Goal**: Vertex AI integration has complete feature parity including streaming, usage tracking, and admin monitoring
**Depends on**: Phase 5
**Requirements**: FEATURES-01, FEATURES-02, FEATURES-03, FEATURES-04, FEATURES-05, FEATURES-06
**Success Criteria** (what must be TRUE):

  1. Streaming responses work correctly for Vertex AI Claude models with real-time token capture
  2. Usage statistics and cost calculations are accurate for Vertex AI requests
  3. Admin interface displays comprehensive Vertex AI account health and usage metrics
  4. Vertex AI usage integrates properly with existing statistics and reporting systems

**Plans**: 4 plans

Plans:

- [ ] 01-PLAN.md — Vertex AI streaming response support with real-time usage token capture
- [ ] 02-PLAN.md — Usage statistics capture and cost calculation integration with pricing service
- [ ] 03-PLAN.md — Admin interface components for Vertex AI account management and monitoring
- [ ] 04-PLAN.md — Statistics system integration for unified usage tracking and reporting

---

## Progress Table

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 4. Vertex AI Account Foundation | 2/2 | Complete | 2026-04-02 |
| 5. Model Support & Core Integration | 0/3 | Planning complete | - |
| 6. Advanced Features & Admin Interface | 0/4 | Planning complete | - |

---

## Risk Assessment

### High-Risk Areas

- **Phase 4**: Google Cloud service account authentication complexity ✓ RESOLVED
- **Phase 5**: API format conversion between Claude and Vertex AI formats
- **Phase 6**: Streaming response format differences and token capture accuracy

### Mitigation Strategies

- Leverage existing multi-provider architecture patterns
- Comprehensive testing with real Vertex AI endpoints
- Incremental integration with existing systems
- Rollback plan for each phase

---

## Success Metrics

### Technical Metrics

- Vertex AI account creation success rate > 95% ✓ ACHIEVED
- API format conversion accuracy 100%
- Streaming response delivery time comparable to other providers
- Usage tracking accuracy within 1% of Vertex AI reported usage

### User Experience Metrics

- Unified API experience identical to other Claude providers
- Account management workflow consistent with existing providers ✓ ACHIEVED
- Error messages clear and actionable for Google Cloud issues
- Admin interface provides sufficient Vertex AI-specific monitoring

---

*Roadmap created: 2026-04-01*
*Last updated: 2026-04-02 after Phase 5 planning*