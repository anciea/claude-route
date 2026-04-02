---
phase: 06-advanced-features-admin-interface
plan: 03B
type: execute
wave: 4
depends_on: [06-03]
files_modified: [web/admin-spa/src/router/index.js, web/admin-spa/src/stores/stats.js]
autonomous: true
requirements: [FEATURES-05]

must_haves:
  truths:
    - "Vertex AI accounts page is accessible via admin interface navigation"
    - "Statistics system includes Vertex AI usage data in frontend stores"
    - "Admin interface can fetch and display Vertex AI usage statistics"
  artifacts:
    - path: "web/admin-spa/src/router/index.js"
      provides: "Vertex AI accounts route"
      contains: "vertex-ai.*route"
      min_lines: 5
    - path: "web/admin-spa/src/stores/stats.js"
      provides: "Vertex AI statistics integration"
      contains: "vertexAi.*stats"
      min_lines: 10
  key_links:
    - from: "router/index.js"
      to: "VertexAi.vue"
      via: "route component mapping"
      pattern: "component.*VertexAi"
    - from: "stores/stats.js"
      to: "HTTP API"
      via: "statistics API calls"
      pattern: "http.*vertex.*ai"
---

<objective>
Complete Vertex AI admin interface integration with routing and statistics system.

Purpose: Ensure Vertex AI accounts are accessible through navigation and statistics are properly integrated with frontend stores.
Output: Complete routing setup and statistics integration for Vertex AI admin interface.
</objective>

<execution_context>
@/Users/liou/js_project/claude-relay-service/.claude/get-shit-done/workflows/execute-plan.md
@/Users/liou/js_project/claude-relay-service/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/phases/06-advanced-features-admin-interface/06-03-PLAN.md

# Existing routing and statistics patterns
@web/admin-spa/src/router/index.js
@web/admin-spa/src/stores/stats.js
@web/admin-spa/src/utils/http_apis.js

# Project UI requirements
@CLAUDE.md
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add Vertex AI accounts routing</name>
  <files>web/admin-spa/src/router/index.js</files>
  <action>
    Add Vertex AI accounts route to the admin interface router following established routing patterns from other provider account pages.

    Router integration needed:
    - Add route to router/index.js: `/admin/accounts/vertex-ai` -> VertexAi.vue
    - Follow existing account routing patterns from Claude, OpenAI, etc.
    - Ensure proper navigation integration and breadcrumb support
    - Import VertexAi view component properly
    - Maintain route organization and consistency

    Follow patterns from existing provider routes for consistency and proper navigation flow.
  </action>
  <verify>
    <automated>npm run lint && npm run build:web</automated>
  </verify>
  <done>Vertex AI accounts page is accessible via /admin/accounts/vertex-ai route with proper navigation</done>
</task>

<task type="auto">
  <name>Task 2: Integrate Vertex AI statistics in frontend store</name>
  <files>web/admin-spa/src/stores/stats.js</files>
  <action>
    Extend statistics store to support Vertex AI statistics following decisions D-21 through D-25 from CONTEXT.md.

    Statistics store integration per D-21 (integrate into existing aggregation) and D-22 (support existing reporting):
    - Add functions: fetchVertexAiStats, getVertexAiUsageByPeriod
    - Integrate with existing HTTP API patterns for /admin/stats/vertex-ai
    - Support time period filtering (daily, weekly, monthly) per D-25 (historical tracking)
    - Include cost calculations and token usage tracking per D-24 (established Redis schema)
    - Follow existing statistics store patterns for other providers

    Integration requirements per D-23 (maintain compatibility):
    - Maintain compatibility with existing dashboard and metrics
    - Support existing reporting and analytics queries per D-22
    - Follow established patterns for statistics data structure
    - Ensure Pinia store reactivity and state management consistency
    - Handle loading states and error conditions properly

    Reference existing provider statistics integration patterns for consistency.
  </action>
  <verify>
    <automated>npm run lint && npm run build:web</automated>
  </verify>
  <done>Statistics store supports Vertex AI data fetching and integrates with existing statistics system</done>
</task>

</tasks>

<verification>
- Vertex AI accounts page is accessible through admin interface navigation
- Statistics store can fetch and manage Vertex AI usage data
- Integration maintains existing architecture patterns
- Routing follows established admin interface patterns
</verification>

<success_criteria>
- Navigation to Vertex AI accounts works correctly
- Statistics integration provides Vertex AI usage data to components
- Frontend stores handle Vertex AI data consistently with other providers
- All routing and statistics patterns maintain consistency
</success_criteria>

<output>
After completion, create `.planning/phases/06-advanced-features-admin-interface/06-03B-SUMMARY.md`
</output>