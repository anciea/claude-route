---
phase: 06-advanced-features-admin-interface
plan: 02
subsystem: vertex-ai-cost-integration
tags: [vertex-ai, pricing, usage-statistics, cost-calculation]
dependency_graph:
  requires: [05-model-support-core-integration]
  provides: [vertex-ai-usage-tracking, cost-calculation-integration]
  affects: [pricing-service, vertex-relay-service]
tech_stack:
  added: []
  patterns: [cost-calculation-integration, usage-statistics-capture]
key_files:
  created: [tests/pricingService.vertex.test.js, tests/vertexRelayService.usage.test.js]
  modified: [src/services/pricingService.js, src/services/relay/vertexRelayService.js]
decisions:
  - decision: "Enhanced getModelPricing with Vertex AI model name mapping"
    rationale: "Support for claude-opus-4-6, claude-sonnet-4-6, claude-haiku-4-5 models with regional prefix handling"
    outcome: "Vertex AI models now recognized by pricing service"
  - decision: "Integrated pricingService.calculateCost in both streaming and non-streaming responses"
    rationale: "Consistent cost calculation across all Vertex AI request types"
    outcome: "Usage statistics include cost data for reporting and tracking"
metrics:
  duration: 45
  tasks_completed: 2
  files_modified: 4
  test_files_added: 2
  completion_date: "2026-04-02T03:30:00Z"
---

# Phase 06 Plan 02: Vertex AI Usage Statistics & Cost Integration Summary

**One-liner:** Integrated Vertex AI usage statistics capture and cost calculation with existing pricing service for comprehensive usage tracking and cost reporting.

## Objective Achieved

Successfully integrated Vertex AI usage statistics capture and cost calculation with the existing pricing service, ensuring accurate cost calculations and usage tracking that integrates seamlessly with the statistics system.

## Tasks Completed

### Task 1: Add Vertex AI model pricing support to pricing service ✓
- **Files:** `src/services/pricingService.js`, `tests/pricingService.vertex.test.js`
- **TDD Approach:** Created comprehensive tests covering model recognition, cost calculation, and regional variations
- **Implementation:** Extended `getModelPricing` method with Vertex AI model mapping and regional prefix handling
- **Key Features:**
  - Recognition of claude-opus-4-6, claude-sonnet-4-6, claude-haiku-4-5 model names
  - Regional prefix support (us-central1., etc.)
  - Partner Model format mapping (claude-3-opus@20240229, etc.)
  - Consistent cost calculation using existing pricing structure

### Task 2: Integrate usage capture and cost calculation in Vertex AI relay service ✓
- **Files:** `src/services/relay/vertexRelayService.js`, `tests/vertexRelayService.usage.test.js`
- **TDD Approach:** Created tests for usage capture, cost calculation, and response format integration
- **Implementation:** Enhanced both streaming and non-streaming response handlers with cost calculation
- **Key Features:**
  - Usage capture from Vertex AI responses (input_tokens, output_tokens)
  - Cost calculation using `pricingService.calculateCost`
  - Enhanced response format: `{ success, usage, cost, model, duration }`
  - Consistent handling for both streaming and non-streaming requests

## Technical Implementation

### Pricing Service Enhancements

**Model Recognition:**
- Added Vertex AI model mapping in `getModelPricing`
- Support for regional prefixes (us-central1., etc.)
- Partner Model format handling (claude-3-opus@20240229)
- Fallback mechanisms for model variants

**Cost Calculation:**
- Leverages existing `calculateCost` method
- Handles Vertex AI usage format naturally
- Supports input_tokens and output_tokens fields
- Maintains compatibility with existing pricing data structure

### Relay Service Integration

**Non-streaming Responses:**
- Added cost calculation before usage recording
- Enhanced response format with cost data
- Proper error handling and logging
- Duration tracking for performance monitoring

**Streaming Responses:**
- Cost calculation on final usage accumulation
- Integration with existing stream handler
- Consistent format with non-streaming responses
- Proper cleanup and error handling

## Verification Results

- [x] Usage statistics captured correctly from Vertex AI responses
- [x] Cost calculations work accurately using existing pricing service
- [x] Usage data format consistent with other providers for statistics integration
- [x] Both streaming and non-streaming requests generate proper usage data
- [x] Integration maintains existing architecture patterns and error handling

## Deviations from Plan

None - plan executed exactly as written.

## Key Integration Points

### With Existing Systems
- **PricingService:** Extended model recognition for Vertex AI models
- **ApiKeyService:** Usage recording maintains existing pattern
- **Vertex Stream Handler:** Cost calculation integrated with usage accumulation
- **Relay Service Pattern:** Maintains consistent response format across providers

### Data Flow
1. Vertex AI response received with usage data
2. Usage extracted (input_tokens, output_tokens)
3. Cost calculated using pricingService.calculateCost
4. Usage recorded via apiKeyService.recordUsage
5. Enhanced response returned with usage and cost data

## Technical Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Reuse existing calculateCost method | Vertex AI usage format compatible with current implementation | No additional cost calculation logic needed |
| Enhance response format consistently | Both streaming and non-streaming should have same cost data | Unified interface for cost tracking |
| Regional prefix handling | Vertex AI uses regional deployments | Flexible model name matching |
| Partner Model format support | Vertex AI Partner API uses different model names | Seamless integration with existing scheduling |

## Future Considerations

1. **Model Pricing Updates:** Monitor Vertex AI pricing changes and update pricing data accordingly
2. **Regional Pricing:** Consider regional pricing variations if implemented by Google Cloud
3. **Usage Analytics:** Cost data now available for detailed usage analytics and reporting
4. **Performance Monitoring:** Duration tracking enables performance optimization opportunities

## Known Stubs

None - all functionality fully implemented with proper data sources.

## Self-Check: PASSED

- [x] FOUND: tests/pricingService.vertex.test.js
- [x] FOUND: tests/vertexRelayService.usage.test.js
- [x] FOUND: Modified src/services/pricingService.js with Vertex AI model mapping
- [x] FOUND: Modified src/services/relay/vertexRelayService.js with cost calculation integration
- [x] Implementation meets all must_haves requirements
- [x] Key links verified: pricing service integration and usage statistics capture