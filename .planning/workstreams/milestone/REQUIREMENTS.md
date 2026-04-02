# Requirements: Google Cloud Vertex AI Integration

**Defined:** 2026-04-01
**Core Value:** Clients can access Claude models through Google Cloud Vertex AI infrastructure using the same unified API and account management experience as other AI providers, with enterprise-grade authentication and billing through Google Cloud.

## v2.0 Requirements

Requirements for Vertex AI integration. Each maps to roadmap phases.

### Account Management

- [x] **ACCOUNT-01**: Admin can create new Vertex AI account in management interface
- [ ] **ACCOUNT-02**: Admin can upload Service Account JSON credentials for Vertex AI account
- [ ] **ACCOUNT-03**: System stores Service Account JSON credentials encrypted in Redis
- [x] **ACCOUNT-04**: Admin can configure Project ID for Vertex AI account
- [x] **ACCOUNT-05**: Admin can configure Location/Region for Vertex AI account
- [ ] **ACCOUNT-06**: System validates Service Account JSON credentials on account creation
- [ ] **ACCOUNT-07**: System generates Google Cloud Access Tokens from Service Account JSON

### Model Support

- [ ] **MODELS-01**: System supports Claude 4.6 Opus (claude-opus-4-6) model via Vertex AI
- [ ] **MODELS-02**: System supports Claude 4.6 Sonnet (claude-sonnet-4-6) model via Vertex AI
- [ ] **MODELS-03**: System maps model names correctly in API requests to Vertex AI
- [ ] **MODELS-04**: System handles model parameters (temperature, max_tokens, etc.) correctly

### System Integration

- [ ] **INTEGRATION-01**: Vertex AI accounts integrate with existing sticky session system
- [ ] **INTEGRATION-02**: Vertex AI requests support concurrent request control and queueing
- [ ] **INTEGRATION-03**: System handles Google Cloud authentication errors gracefully
- [ ] **INTEGRATION-04**: System handles Vertex AI API errors and provides meaningful responses
- [ ] **INTEGRATION-05**: System exposes unified Claude API format for Vertex AI accounts
- [ ] **INTEGRATION-06**: System converts Claude API requests to Vertex AI format internally
- [ ] **INTEGRATION-07**: Vertex AI accounts work with existing account scheduler system

### Feature Support

- [ ] **FEATURES-01**: System supports streaming responses from Vertex AI Claude models
- [ ] **FEATURES-02**: System captures usage statistics (input/output tokens) from Vertex AI responses
- [ ] **FEATURES-03**: System calculates costs based on Vertex AI usage statistics
- [ ] **FEATURES-04**: Admin interface displays Vertex AI account information and status
- [ ] **FEATURES-05**: Admin can monitor Vertex AI account health and usage
- [ ] **FEATURES-06**: System integrates Vertex AI usage into existing statistics system

## Completed (v1.0) Requirements

Previous milestone: Google OAuth2 Authentication Integration

### Authentication Flow (Complete)

- [x] **AUTH-01**: User can initiate Google OAuth2 login flow from web interface
- [x] **AUTH-02**: System exchanges OAuth2 authorization code for user profile data
- [x] **AUTH-03**: System validates Google OAuth2 tokens and user permissions
- [x] **AUTH-04**: Authentication middleware supports Google OAuth2 tokens

### User Management (Complete)

- [x] **USER-01**: New user accounts are automatically created from Google profile data
- [x] **USER-02**: User profile uses Google ID as primary username identifier
- [x] **USER-03**: System stores Google email, display name, and avatar URL
- [x] **USER-04**: User profiles integrate with existing Redis-based user management
- [x] **USER-05**: User management interface displays Google-authenticated users correctly

### API Key Generation (Complete)

- [x] **APIKEY-01**: System automatically generates full-permission API key on first login
- [x] **APIKEY-02**: Generated API key follows existing `cr_` prefix format
- [x] **APIKEY-03**: API key has all service permissions enabled by default
- [x] **APIKEY-04**: User receives API key immediately in login response
- [x] **APIKEY-05**: API key creation integrates with existing apiKeyService

### System Integration (Complete)

- [x] **SYS-01**: Google OAuth2 completely replaces LDAP authentication endpoints
- [x] **SYS-02**: Session management works with Google OAuth2 authentication
- [x] **SYS-03**: Existing API key validation and middleware remain functional
- [x] **SYS-04**: User interface login flow redirects to Google OAuth2
- [x] **SYS-05**: Backend routes handle Google OAuth2 callback processing

## Future Requirements

Deferred to future releases. Tracked but not in current roadmap.

### Enhanced Vertex AI Features

- **ENHANCED-01**: Support for additional Claude model versions as they become available
- **ENHANCED-02**: Multi-region failover for Vertex AI accounts
- **ENHANCED-03**: Advanced error recovery and retry strategies
- **ENHANCED-04**: Vertex AI-specific configuration options and optimizations

### OAuth2 Enhancements

- **ENH-01**: Support for Google Workspace domain restrictions
- **ENH-02**: Advanced API key configuration options on first login
- **ENH-03**: User profile synchronization with Google account changes
- **ENH-04**: Administrative controls for OAuth2 application permissions

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature                                   | Reason                                                             |
| ----------------------------------------- | ------------------------------------------------------------------ |
| Native Vertex AI API format support       | Unified Claude API format maintains consistency across providers   |
| Google Cloud IAM integration              | Service Account JSON authentication sufficient for initial release |
| Vertex AI fine-tuned models               | Standard Claude models only for simplicity                         |
| Claude 3.x model support via Vertex AI    | Focus on latest Claude 4.6 series for this milestone               |
| Direct Google Cloud billing integration   | Usage tracking through relay service sufficient                    |
| Multi-provider OAuth2 (GitHub, Microsoft) | Google-only per user specification                                 |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement    | Phase   | Status  |
| -------------- | ------- | ------- |
| ACCOUNT-01     | Phase 4 | Complete |
| ACCOUNT-02     | Phase 4 | Pending |
| ACCOUNT-03     | Phase 4 | Pending |
| ACCOUNT-04     | Phase 4 | Complete |
| ACCOUNT-05     | Phase 4 | Complete |
| ACCOUNT-06     | Phase 4 | Pending |
| ACCOUNT-07     | Phase 4 | Pending |
| MODELS-01      | Phase 5 | Pending |
| MODELS-02      | Phase 5 | Pending |
| MODELS-03      | Phase 5 | Pending |
| MODELS-04      | Phase 5 | Pending |
| INTEGRATION-01 | Phase 5 | Pending |
| INTEGRATION-02 | Phase 5 | Pending |
| INTEGRATION-03 | Phase 5 | Pending |
| INTEGRATION-04 | Phase 5 | Pending |
| INTEGRATION-05 | Phase 5 | Pending |
| INTEGRATION-06 | Phase 5 | Pending |
| INTEGRATION-07 | Phase 5 | Pending |
| FEATURES-01    | Phase 6 | Pending |
| FEATURES-02    | Phase 6 | Pending |
| FEATURES-03    | Phase 6 | Pending |
| FEATURES-04    | Phase 6 | Pending |
| FEATURES-05    | Phase 6 | Pending |
| FEATURES-06    | Phase 6 | Pending |

**Coverage:**

- v2.0 requirements: 25 total
- Mapped to phases: 25
- Unmapped: 0 ✓

---

_Requirements defined: 2026-04-01_
_Last updated: 2026-04-01 after roadmap creation_
