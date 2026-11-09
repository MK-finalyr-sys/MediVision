# Phase 4 proposal — approval required; NOT IMPLEMENTED

Keep the 40-record, on-device experience as the unconditional baseline. An optional, explicit **online lookup** could be offered only after the existing low-confidence pharmacist message. Never upload a photograph or a medicine cabinet by default.

- A Netlify/Vercel serverless function would receive a user-confirmed medicine search string, validate length/rate limits and proxy a real search API. Search would be restricted to manufacturer labels, government references and established medical-reference domains.
- A server-side LLM would extract only source-supported ingredient/name facts and conservative label sections into the existing validated schema. Require retrievable source URLs and quotations, reject conflicting or insufficient evidence, and return the pharmacist fallback rather than an uncited answer.
- No diagnosis, personalized dosing, interactions beyond the explicitly scoped salt guard, or free-form drug chat. Clearly label online results as unverified and separate from the reviewed offline list.
- Keys would exist only in server environment variables. The client receives neither API keys nor provider tokens. Minimize logs, redact health-related queries, document retention and obtain an explicit online-lookup consent action.
- A server-side feature flag would be OFF by default. Timeouts, missing keys, exhausted budget or provider errors leave manual offline search and the exact pharmacist message fully functional.
- Provisional budget envelope: **US$10–30 per 1,000 online lookups**, assuming a paid search request plus a short grounded-model response. This is an architectural estimate, not a verified quote; select providers and verify their current published pricing only after approval. Add hard monthly quotas and a kill switch before launch.

Approval must cover the providers, budget, consent/retention policy and clinical evaluation plan. No runtime RAG endpoints, keys, SDKs or client flags have been added.
