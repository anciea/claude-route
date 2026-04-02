# Phase 6: Advanced Features & Admin Interface - Context

**Gathered:** 2026-04-02 (auto-generated from roadmap)
**Status:** Ready for planning

<domain>
## Phase Boundary

Complete Vertex AI integration with full feature parity including streaming responses, usage statistics tracking, cost calculations, and comprehensive admin interface monitoring. System captures usage data accurately from Vertex AI responses, calculates costs based on token usage, and provides admin interface for monitoring account health and usage metrics. Streaming responses work correctly for Vertex AI Claude models with real-time token capture.

</domain>

<decisions>
## Implementation Decisions

### Streaming Response Support
- **D-01:** Follow existing streaming patterns from other providers (Claude, Gemini, OpenAI)
- **D-02:** Implement Server-Sent Events (SSE) for real-time response streaming
- **D-03:** Support Vertex AI streaming format conversion to unified Claude API format
- **D-04:** Handle streaming disconnection and cleanup via AbortController patterns
- **D-05:** Capture usage statistics in real-time during streaming

### Usage Statistics and Token Capture
- **D-06:** Extract input/output token counts from Vertex AI response metadata
- **D-07:** Follow existing usage capture patterns from other relay services
- **D-08:** Store usage data in Redis following established schemas
- **D-09:** Integrate with existing pricingService for cost calculations
- **D-10:** Support both streaming and non-streaming usage capture

### Cost Calculation and Pricing
- **D-11:** Extend pricingService.js to support Vertex AI pricing models
- **D-12:** Calculate costs based on input/output token usage from Vertex AI
- **D-13:** Follow existing cost calculation patterns from other providers
- **D-14:** Support per-model pricing for Claude 4.6 Opus and Sonnet
- **D-15:** Integrate cost data with existing statistics and reporting systems

### Admin Interface Enhancement
- **D-16:** Add Vertex AI account monitoring to existing admin interface
- **D-17:** Display account health status, usage metrics, and connection status
- **D-18:** Follow existing admin interface patterns and Vue 3 Composition API
- **D-19:** Support dark mode and responsive design following established patterns
- **D-20:** Show real-time usage statistics and cost analytics

### Statistics System Integration
- **D-21:** Integrate Vertex AI usage into existing statistics aggregation
- **D-22:** Support existing reporting and analytics queries
- **D-23:** Maintain compatibility with existing dashboard and metrics
- **D-24:** Follow established Redis schema for usage data storage
- **D-25:** Support historical usage tracking and trend analysis

### Claude's Discretion
- Exact streaming response format details
- Usage statistics aggregation intervals
- Admin interface layout and component organization
- Cost calculation precision and rounding

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Streaming Infrastructure
- `src/services/streamingService.js` — Existing streaming patterns (if exists)
- `src/services/relay/claudeRelayService.js` — Claude streaming implementation
- `src/services/relay/geminiRelayService.js` — Google service streaming patterns
- `src/utils/streamingHelper.js` — Streaming utilities and helpers

### Usage and Pricing Services
- `src/services/pricingService.js` — Cost calculation and pricing models
- `src/services/usageService.js` — Usage statistics tracking (if exists)
- `src/models/redis.js` — Redis schemas for usage data storage
- `src/utils/statsHelper.js` — Statistics aggregation utilities

### Admin Interface Components
- `web/admin-spa/src/` — Vue 3 admin interface architecture
- `web/admin-spa/src/stores/accounts.js` — Account management store patterns
- `web/admin-spa/src/services/http.js` — HTTP API integration patterns
- `web/admin-spa/src/components/` — Reusable UI components

### Integration Points
- `src/services/relay/vertexRelayService.js` — Phase 5 relay service foundation
- `src/services/scheduler/unifiedVertexScheduler.js` — Phase 5 scheduling integration
- `src/routes/api.js` — Phase 5 route integration

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- Existing streaming infrastructure supports real-time response processing
- PricingService already handles multi-provider cost calculations
- Admin interface Vue components support extensible account monitoring
- Redis usage tracking schemas ready for new provider integration
- Statistics aggregation system supports additional data sources

### Established Patterns
- All streaming implementations follow SSE patterns with AbortController cleanup
- Usage capture happens during response processing with immediate Redis storage
- Cost calculations use token-based pricing with per-model rate configurations
- Admin interface follows consistent PLATFORM_CONFIG patterns for new providers
- Statistics integration maintains historical data and real-time updates

### Integration Points
- Phase 5 VertexRelayService ready for streaming enhancement
- Existing pricing service needs Vertex AI model rate configuration
- Admin interface PLATFORM_CONFIG already includes vertex_ai mapping from Phase 4
- Statistics system ready for Vertex AI usage data integration

</code_context>

<specifics>
## Specific Ideas

- Vertex AI streaming responses may use different format than other providers
- Usage statistics extraction from Vertex AI requires specific response parsing
- Claude 4.6 pricing models need accurate rate configuration in pricingService
- Admin interface should show Vertex AI-specific health indicators and metrics
- Real-time usage tracking requires careful handling during streaming responses

</specifics>

<deferred>
## Deferred Ideas

None — analysis stayed within phase scope

</deferred>

---

*Phase: 06-advanced-features-admin-interface*
*Context created: 2026-04-02*