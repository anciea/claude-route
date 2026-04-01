# Google Cloud Vertex AI Integration

## What This Is

Adding Google Cloud Vertex AI as a new account type to the Claude Relay Service, enabling clients to use Claude models through Google Cloud's Vertex AI platform with unified API format, full feature parity, and complete integration into the existing account management and scheduling system.

## Core Value

Clients can access Claude models through Google Cloud Vertex AI infrastructure using the same unified API and account management experience as other AI providers, with enterprise-grade authentication and billing through Google Cloud.

## Requirements

### Validated

- ✓ **Multi-provider account management** — existing (supports Claude, Gemini, OpenAI, AWS Bedrock, Azure OpenAI, Droid, CCR)
- ✓ **Service account credential encryption** — existing (AES encryption for sensitive data in Redis)
- ✓ **Unified Claude API format** — existing (consistent API format across providers)
- ✓ **Sticky session scheduling** — existing (content hash-based account binding)
- ✓ **Concurrent request control** — existing (Redis Sorted Set with queue support)
- ✓ **Streaming response support** — existing (SSE with real-time usage capture)
- ✓ **Usage statistics tracking** — existing (token counting and cost calculation)
- ✓ **Error handling and retries** — existing (529 detection, account exclusion, cleanup)
- ✓ **Clean Architecture patterns** — existing (service/handler separation, dependency layers)

### Active

- [ ] **VERTEX-01**: New 'vertex' account type in account management system
- [ ] **VERTEX-02**: Vertex AI account creation with Project ID, Location/Region, and Service Account JSON
- [ ] **VERTEX-03**: Service account JSON credential encryption and secure storage in Redis
- [ ] **VERTEX-04**: VertexAccountService for account validation and token management
- [ ] **VERTEX-05**: VertexRelayService for Claude API to Vertex AI format conversion
- [ ] **VERTEX-06**: Support for Claude 4.6 series models (opus-4-6, sonnet-4-6, haiku-4-5)
- [ ] **VERTEX-07**: Google Cloud Access Token generation and refresh from service account
- [ ] **VERTEX-08**: Vertex AI API integration with proper endpoint formatting
- [ ] **VERTEX-09**: Streaming response support using Vertex AI's streaming format
- [ ] **VERTEX-10**: Usage token capture from Vertex AI responses
- [ ] **VERTEX-11**: Error handling for Google Cloud authentication and API errors
- [ ] **VERTEX-12**: Integration with existing account scheduler and sticky sessions
- [ ] **VERTEX-13**: Concurrent request tracking for Vertex AI accounts
- [ ] **VERTEX-14**: Account status monitoring and 529 handling
- [ ] **VERTEX-15**: Admin interface support for Vertex AI account management

### Out of Scope

- Native Vertex AI API format support — unified Claude API format only
- Multi-region failover — single region per account configuration
- Google Cloud IAM integration — service account JSON authentication only
- Vertex AI fine-tuned models — standard Claude models only
- Direct Google Cloud billing integration — usage tracking through relay service only

## Context

**Current System Architecture:**

- Multi-provider AI API relay service with account-based routing
- Clean Architecture with service/handler separation
- Redis-based account and session management with AES encryption
- Sticky session scheduling based on request content hashing
- Concurrent request control with queue management
- Streaming response support with real-time usage capture
- Comprehensive error handling and account health monitoring

**Existing Account Types:**

- Claude (official/console), Gemini, OpenAI, AWS Bedrock, Azure OpenAI, Droid, CCR
- Each has dedicated AccountService and RelayService implementations
- Unified scheduling through account type-specific schedulers

**Google Cloud Vertex AI:**

- Enterprise-grade Claude API access through Google Cloud
- Service account-based authentication
- Regional deployment with configurable locations
- Support for latest Claude 4.6 model series
- Standard streaming and usage reporting capabilities

**Integration Points:**

- Account management system for credential storage and validation
- Unified scheduler for request routing and load balancing
- Streaming response handler for SSE transmission
- Usage tracking system for cost calculation and reporting
- Admin interface for account configuration and monitoring

## Constraints

- **Architecture**: Must follow existing Clean Architecture patterns and service/handler separation
- **Security**: Service account JSON credentials must be AES encrypted in Redis storage
- **Compatibility**: Must integrate with existing account scheduler and sticky session system
- **API Format**: Must use unified Claude API format, not native Vertex AI format
- **Models**: Support limited to Claude 4.6 series (opus-4-6, sonnet-4-6, haiku-4-5)
- **Authentication**: Service account JSON only, no other Google Cloud auth methods
- **Code Style**: Must follow existing code standards (no semicolons, single quotes, Prettier formatting)

## Key Decisions

| Decision                       | Rationale                                             | Outcome   |
| ------------------------------ | ----------------------------------------------------- | --------- |
| Unified API format             | Consistent client experience across providers         | — Pending |
| Service account authentication | Most common and reliable Google Cloud auth method     | — Pending |
| Account type integration       | Leverage existing multi-provider architecture         | — Pending |
| Claude 4.6 series focus        | Latest and most capable models available on Vertex AI | — Pending |
| Regional configuration         | Single region per account for simplicity              | — Pending |

---

_Last updated: 2026-04-01 after project initialization_

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd:transition`):

1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd:complete-milestone`):

1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state
