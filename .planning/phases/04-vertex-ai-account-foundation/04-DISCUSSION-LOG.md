# Phase 4: Vertex AI Account Foundation - Discussion Log (Assumptions Mode)

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions captured in CONTEXT.md — this log preserves the analysis.

**Date:** 2026-04-02T00:00:00Z
**Phase:** 04-vertex-ai-account-foundation
**Mode:** assumptions
**Areas analyzed:** Account Service Architecture, Service Account JSON Authentication, Admin Interface Integration, Service Account JSON Upload Security

## Assumptions Presented

### Account Service Architecture
| Assumption | Confidence | Evidence |
|------------|-----------|----------|
| Follow established account service pattern with encrypted credential storage | Confident | src/services/account/*.js files show consistent AES-256-CBC encryption pattern |

### Service Account JSON Authentication Implementation
| Assumption | Confidence | Evidence |
|------------|-----------|----------|
| Use existing google-auth-library with AES encryption pattern | Likely → Confident | package.json shows google-auth-library v10.1.0 installed, Gemini service shows Google integration patterns |

### Admin Interface Integration
| Assumption | Confidence | Evidence |
|------------|-----------|----------|
| Add to existing admin interface following established pattern | Confident | web/admin-spa/src/stores/accounts.js PLATFORM_CONFIG mapping, admin routes follow /admin/{provider}-accounts pattern |

### Service Account JSON Upload Security
| Assumption | Confidence | Evidence |
|------------|-----------|----------|
| Use multipart form data with immediate encryption and validation | Likely → Confident | OAuth flows in admin routes show session-based credential exchange patterns |

## Corrections Made

No corrections — all assumptions confirmed.

## External Research

- **Google Cloud Vertex AI API authentication:** OAuth scope `https://www.googleapis.com/auth/cloud-platform` required (Source: Google Cloud Documentation)
- **Vertex AI Claude model naming:** claude-opus-4-6, claude-sonnet-4-6 format (Source: Vertex AI Partner Models Documentation)
- **Vertex AI error handling:** HTTP 429 with structured error format, exponential backoff recommended (Source: Vertex AI Error Documentation)
- **Service Account JSON validation:** Must contain type, project_id, private_key, client_email and 6 other required fields (Source: Google IAM Documentation)