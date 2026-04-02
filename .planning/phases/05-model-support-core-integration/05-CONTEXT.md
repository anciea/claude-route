# Phase 5: Model Support & Core Integration - Context

**Gathered:** 2026-04-02 (auto-generated from roadmap)
**Status:** Ready for planning

<domain>
## Phase Boundary

Enable Vertex AI accounts to serve Claude 4.6 model requests through unified API format. Clients can request Claude 4.6 Opus and Sonnet models via existing API endpoints. System converts Claude API requests to Vertex AI format internally while maintaining seamless integration with existing sticky session scheduling, concurrent request control, and error handling systems.

</domain>

<decisions>
## Implementation Decisions

### Model Support Architecture
- **D-01:** Support Claude 4.6 series models: claude-opus-4-6, claude-sonnet-4-6
- **D-02:** Follow existing relay service patterns (geminiRelayService.js, claudeRelayService.js)
- **D-03:** Create VertexRelayService for API format conversion
- **D-04:** Use existing account scheduler integration patterns

### API Format Conversion
- **D-05:** Maintain unified Claude API format for client requests
- **D-06:** Convert internally to Vertex AI Partner Model API format
- **D-07:** Use correct Vertex AI endpoint pattern: projects/{project}/locations/{location}/publishers/anthropic/models/{model}:rawPredict
- **D-08:** Map model parameters (temperature, max_tokens, etc.) correctly between formats
- **D-09:** Handle anthropic_version header for Vertex AI (vertex-2023-10-16)

### Scheduling and Session Integration
- **D-10:** Integrate Vertex AI accounts with existing sticky session system
- **D-11:** Support concurrent request control and queueing via existing Redis patterns
- **D-12:** Use existing account scheduler architecture (UnifiedScheduler)
- **D-13:** Follow existing session-sticky account selection patterns

### Authentication and Error Handling
- **D-14:** Use Google Cloud access tokens from Phase 4 account service
- **D-15:** Handle Google Cloud authentication errors with exponential backoff
- **D-16:** Implement Vertex AI-specific error parsing and response formatting
- **D-17:** Support HTTP 429 "Resource Exhausted" and 5XX error patterns
- **D-18:** Integrate with existing 529 detection and account exclusion logic

### Request/Response Processing
- **D-19:** Convert Claude API message format to Vertex AI format
- **D-20:** Handle streaming responses through existing streaming infrastructure
- **D-21:** Extract usage statistics (input/output tokens) from Vertex AI responses
- **D-22:** Integrate with existing AbortController patterns for client disconnection

### Claude's Discretion
- Exact error message formatting for Vertex AI-specific issues
- Request timeout values and retry intervals
- Usage statistics extraction details from Vertex AI response format

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Existing Relay Service Patterns
- `src/services/relay/geminiRelayService.js` — Google service integration patterns and error handling
- `src/services/relay/claudeRelayService.js` — Claude API format and response processing
- `src/services/relay/azureOpenaiRelayService.js` — Multi-provider request conversion patterns
- `src/services/scheduler/unifiedScheduler.js` — Account selection and session management

### Account and Authentication
- `src/services/account/vertexAiAccountService.js` — Vertex AI account management from Phase 4
- `src/utils/commonHelper.js` — Encryption utilities and helper functions
- `src/middleware/auth.js` — Authentication middleware patterns

### Request Processing Infrastructure
- `src/handlers/` — Request/response format conversion patterns
- `src/utils/streamingHelper.js` — Streaming response utilities (if exists)
- `src/utils/abortHelper.js` — AbortController and cleanup patterns

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- Existing relay service architecture supports multiple providers
- Unified scheduler handles account selection and session stickiness
- Google authentication patterns already established in geminiRelayService
- Streaming infrastructure supports real-time response processing
- AbortController cleanup patterns prevent resource leaks

### Established Patterns
- All relay services follow consistent interface: processRequest, handleResponse, extractUsage
- Account schedulers integrate via selectAvailableAccount and session management
- Error handling follows structured response format with provider-specific details
- Request conversion happens in dedicated handler or service layers

### Integration Points
- Vertex AI accounts available through Phase 4 vertexAiAccountService
- Existing scheduler infrastructure ready for new provider integration
- Google Cloud authentication tokens available from account service
- Streaming and usage capture infrastructure ready for extension

</code_context>

<specifics>
## Specific Ideas

- Vertex AI Partner Model API uses different endpoint format than standard Google APIs
- Claude 4.6 model names must match exact Vertex AI format: claude-opus-4-6, claude-sonnet-4-6
- anthropic_version header required for proper Vertex AI API compatibility
- Usage statistics format in Vertex AI responses may differ from other providers
- Google Cloud access token refresh patterns should follow existing google-auth-library usage

</specifics>

<deferred>
## Deferred Ideas

None — analysis stayed within phase scope

</deferred>

---

*Phase: 05-model-support-core-integration*
*Context created: 2026-04-02*