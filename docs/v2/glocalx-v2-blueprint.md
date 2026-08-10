# GlocalX V2 Product, Operations, and Delivery Blueprint

**Status:** Implementation-ready planning baseline  
**Prepared:** 16 July 2026  
**Audience:** Founders, investors, product, design, engineering, customer success, and operations  
**Decision represented:** Move from a broad self-service application to a focused customer portal plus a separate operator dashboard.

---

## Executive summary

GlocalX V2 should be built as a managed local-marketing service with software as its delivery system. The customer experience becomes deliberately small: sign in with Google, connect a Google Business Profile, submit a few images and a short promotional brief, talk to support, and approve or reject finished materials. The operational complexity moves behind a separate admin dashboard where GlocalX staff and AI jointly handle onboarding, customer support, creative production, approval, and multi-platform publishing.

This is not a cosmetic redesign. It changes the operating model:

1. The customer no longer makes image-enhancement or production decisions.
2. GlocalX owns the production workflow until a publish-ready version is available.
3. The customer retains final go or no-go authority before any post is published.
4. Customer support is presented as one continuous assistant, while the admin side can move a conversation among automated AI, AI-assisted human, and human-only modes.
5. Every support message carries structured product context so an operator can see what the user was doing and where they became blocked.
6. Review and performance sections remain visually and behaviorally unchanged, backed by deterministic stub data until those workstreams resume.

The recommended technical shape is one repository with two separately deployed web applications and shared packages:

- Customer portal: the simplified V2 experience.
- Admin operations dashboard: access management, support, creative workflow, approvals, and publishing.
- Shared platform: domain models, database, integrations, design tokens, audit logging, and background jobs.
- Worker runtime: durable media-processing and publishing jobs outside request-response functions.

The first release should launch Google Business Profile publishing first and Instagram second, while modeling publication as a channel-independent job so additional platforms can be added without rewriting the approval workflow.

The plan assumes two full-stack engineers, one product/design owner, and part-time operations involvement. Under that assumption, a pilot-ready release is approximately ten weeks after a one-week deployment recovery phase. A smaller team should plan for twelve to fourteen weeks.

### Immediate blocker discovered in the deployment audit

The repository is connected to Vercel and the latest main-branch commit has a successful Vercel build status. However, the documented production URL, https://glocalx-mvp-tawny.vercel.app, returned DEPLOYMENT_NOT_FOUND on 16 July 2026. The local Vercel credential is also no longer valid, so the current alias mapping could not be inspected from the CLI.

This is a deployment alias or project-linkage issue rather than evidence of a failed application build. It must be resolved before any external pilot because Google and Kakao OAuth redirect URIs depend on a stable public hostname.

### What this package delivers

- A current-state audit of the application and deployment model.
- A V2 product definition and explicit scope boundary.
- Customer and administrator journeys.
- Google sign-in and Business Profile access design.
- Contextual support chat and AI-to-human handoff design.
- Managed creative-production and approval workflows.
- Multi-platform publishing architecture.
- Proposed domain model, API surface, events, background jobs, and security controls.
- Deployment topology, migration strategy, phased roadmap, acceptance criteria, test plan, risks, metrics, and founder decisions.
- An investor narrative that makes no unsupported traction, market-size, pricing, or fundraising claims.

---

## 1. Strategic product decision

### 1.1 V1 question

The existing application asks whether a store owner can operate local marketing with an assistant embedded in a broad self-service product. It exposes onboarding, source-business extraction, content preparation, image enhancement choices, publishing, reviews, targets, reporting, and dashboard views.

That breadth creates two problems:

- Owners must still understand and make marketing-production decisions.
- GlocalX has limited operational visibility when a user is confused, blocked, or dissatisfied.

### 1.2 V2 answer

V2 asks a narrower, more commercially useful question:

> Can GlocalX become the accountable operating layer between a local business owner and the channels where that business must stay visible?

The product should make a simple promise: connect the store once, send what is happening, review the finished material, and let GlocalX handle the work.

### 1.3 Product principles

| Principle                              | Product consequence                                                                                              |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Reduce owner decisions                 | Owners provide raw inputs and final approval; GlocalX makes intermediate production decisions.                   |
| Keep humans reachable                  | AI provides speed, but every conversation can be taken over by an authorized operator without starting over.     |
| Preserve customer authority            | No publication occurs before an explicit approval of an immutable creative version.                              |
| Send context with requests             | Support receives route, stage, recent actions, relevant status, and safe error metadata with every conversation. |
| Design operations as a product         | Queues, assignments, service levels, recovery tools, and audit records are first-class features.                 |
| Separate identity from authorization   | Google sign-in and Google Business Profile management consent are distinct user actions and OAuth grants.        |
| Make every external action recoverable | Publishing is idempotent, observable, retryable, and capable of partial success.                                 |
| Do not imply future capability         | Review and performance views remain clearly stub-backed until their data pipelines are funded and scheduled.     |

### 1.4 Non-goals for the pilot

- A full social-media management suite.
- A self-service image editor or customer-facing enhancement selector.
- Autonomous publishing without customer approval.
- Rebuilding reviews, performance analytics, targets, or reporting.
- A generalized CRM.
- Complex campaign calendars, paid-ad buying, or attribution.
- Full automation of Google agency-access workflows that Google requires users or agencies to complete in Business Profile Manager.
- Native mobile applications.

---

## 2. Current-state audit

### 2.1 Repository and runtime

The current codebase is a Next.js App Router application using Next 16.3.0-canary.40 and React, with TypeScript, Zod contracts, Vitest, Playwright, PostgreSQL support, and a local SQLite path. It is substantially more mature than a visual prototype.

The application already includes:

- Email, Google, and Kakao authentication.
- Encrypted OAuth token storage and rate limiting.
- Google Business Profile account and location setup state.
- Production and stub integration boundaries.
- OpenAI-backed conversation and marketing paths.
- Google Business Profile information, posts, reviews, and performance integrations.
- Naver integration.
- Post drafts and publication attempts.
- Review and reply data.
- Job, audit, conversation, and event records.
- CI checks for linting, types, tests, formatting, and builds.

The most important current architectural boundary is the integration adapter layer in src/integrations/index.ts. V2 should preserve and strengthen that boundary instead of placing external API logic directly in routes or React components.

### 2.2 Current customer application

The customer navigation model contains onboarding, photo, posting, reviews, targets, report, and dashboard surfaces. A conversation composer already participates in most of the workspace.

The existing marketing workflow exposes:

- Intent analysis.
- Before-and-after image enhancement.
- Customer-facing creative suggestions and choices.
- Google Business Profile and Instagram-style previews.

V2 should keep the visual language but change the decision structure. Customers submit source assets and a short brief, then leave the workflow until a finished version is ready for approval.

### 2.3 Current data model strengths

The PostgreSQL migration already models users, roles, stores, authentication identities, OAuth connections, Google Business Profile accounts and locations, post drafts, publication attempts, reviews, replies, jobs, audits, conversations, messages, slots, and events.

These are useful foundations. In particular:

- Existing OWNER and ADMIN roles can seed a richer role model.
- OAuth connection and GBP location records can be migrated instead of discarded.
- Post drafts and publish attempts can be evolved into channel-independent creative versions and publication jobs.
- Audit logging should become mandatory for all admin actions.

### 2.4 Gaps relative to V2

| Area                 | Current condition                                    | V2 gap                                                                                                             |
| -------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Admin experience     | ADMIN exists as a role                               | No dedicated admin surface, queue model, assignment flow, or staff authentication policy.                          |
| Support messages     | Owner and assistant roles                            | No human-agent identity, takeover mode, assignment, service-level tracking, or structured context snapshot.        |
| Media                | Images can move through route contracts as data URLs | No durable object storage, derivative lineage, signed uploads, retention, or versioned creative packages.          |
| Marketing production | Customer participates in enhancement choices         | No internal production queue, internal review, customer approval artifact, or revision loop.                       |
| Publishing           | Google Business Profile is the effective live target | No channel-independent job model, Instagram production integration, partial failure, or recovery console.          |
| GBP onboarding       | OAuth and setup states exist                         | Sign-in and management consent need explicit separation; agency access requests need a guided, trackable workflow. |
| Background work      | Job records cover a limited set of tasks             | Creative and publishing workflows need durable execution, leases, retries, dead-letter handling, and idempotency.  |
| Tenancy              | Store and user ownership exists                      | Merchant organizations and staff organization memberships need explicit tenant boundaries.                         |
| Analytics            | Reviews/performance surfaces exist                   | They must be frozen behind deterministic fixtures, not accidentally presented as live V2 capability.               |

### 2.5 Deployment audit

#### Repository workflow

- main is intended to remain production-deployable.
- dev is the staging integration branch.
- Short-lived feature branches should branch from dev and merge back to dev.
- CI runs for pushes and pull requests affecting dev and main.
- Feature and staging previews are supplied by Vercel Git integration.

#### Observed deployment state

- The latest main commit had a successful Vercel build status.
- The documented production alias returned an HTTP 404 with DEPLOYMENT_NOT_FOUND.
- The local Vercel token could not authenticate.
- The repository’s local Vercel project linkage exists, but the public alias cannot be trusted until it is checked in an authenticated Vercel account.

#### Phase-zero recovery actions

1. Authenticate to the correct Vercel team.
2. Confirm which Vercel project owns the current Git repository.
3. Attach or replace the production domain and verify an HTTP 200 response.
4. Create a stable staging hostname for dev.
5. Confirm that feature previews never use production databases, object storage, OAuth credentials, or webhooks.
6. Update Google and Kakao OAuth redirect URIs to the repaired production and staging callback URLs.
7. Run the login, GBP connection, and callback smoke tests on both environments.
8. Record the verified URLs in the repository deployment runbook.

The production alias issue is a release blocker. It is not a reason to delay blueprint and implementation work, but it must be closed before inviting pilot stores.

---

## 3. Visual and interaction direction

V2 should look like the existing GlocalX application, not like a generic enterprise dashboard.

### 3.1 Existing design tokens to retain

| Token          | Value   | Use                                                         |
| -------------- | ------- | ----------------------------------------------------------- |
| Canvas         | #0c0b10 | Browser background and high-contrast presentation surfaces. |
| App surface    | #fbf9f6 | Main warm customer workspace.                               |
| Card           | #ffffff | Content cards, sheets, and focused work panels.             |
| Ink            | #191720 | Primary text.                                               |
| Ink soft       | #48424f | Secondary text.                                             |
| Muted          | #938c9c | Labels and metadata.                                        |
| Line           | #ece7ef | Dividers and subtle outlines.                               |
| Field border   | #8b8494 | Form control outlines.                                      |
| Accent orange  | #ff6a3d | Primary actions and brand emphasis.                         |
| Accent pressed | #e8542a | Pressed and active action states.                           |
| Accent soft    | #fff1ec | Selected and highlighted backgrounds.                       |
| Mint           | #15bd97 | Successful, connected, ready, and healthy states.           |
| Mint soft      | #e6f8f2 | Status chips and success panels.                            |
| Blue           | #3d6bff | Informational and system-linked actions.                    |

Use the existing Pretendard-first system font stack, a 4-pixel spacing base, approximately 22-pixel major radii, 14-pixel form radii, and the current soft elevated shadow.

### 3.2 Customer portal

- Mobile-first and calm.
- One primary task per surface.
- Minimal navigation: Home, Create, Approvals, Reviews, Performance, and Account.
- A persistent support launcher at the lower corner on desktop.
- A compact support rail when expanded on wide screens.
- A bottom-sheet or full-screen chat experience on mobile.
- Clear status language: action required, GlocalX working, ready for review, scheduled, published, or needs attention.

### 3.3 Admin dashboard

- Uses the same color, type, radius, icon, and status system.
- Denser desktop information architecture with a left navigation rail, queue list, work detail, and contextual right rail.
- Status color must never be the only signal; every state includes a text label and icon.
- The admin UI may be operationally dense, but it should retain the warm surface and orange brand rather than switching to a cold blue enterprise palette.

### 3.4 Shared components

The two applications should consume a shared UI package containing tokens and primitives, but they should not be forced into identical page layouts. The customer portal optimizes for confidence and low effort. The admin dashboard optimizes for throughput and situational awareness.

---

## 4. V2 product scope

### 4.1 Customer portal information architecture

| Surface       | Purpose                                      | Pilot capability                                                                                 |
| ------------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Sign in       | Establish customer identity                  | Google sign-in is primary; existing methods may remain temporarily for migration.                |
| Connect store | Connect Google Business Profile and location | Explicit consent, account and location selection, organization-access guidance, status tracking. |
| Home          | Show the next meaningful action              | Connection status, active request status, approval tasks, recent publication.                    |
| Create        | Submit source images and a short brief       | Direct upload, validation, preview, description, optional timing and channel preferences.        |
| Approvals     | Decide on finished creative                  | Preview an immutable version, approve, request revision, or reject with feedback.                |
| Support       | Ask for help anywhere                        | Persistent assistant with contextual telemetry and transparent human takeover.                   |
| Reviews       | Preserve current future-facing surface       | Existing UI and deterministic stub data remain untouched.                                        |
| Performance   | Preserve current future-facing surface       | Existing UI and deterministic stub data remain untouched.                                        |
| Account       | Connection and consent management            | Store, GBP status, notification preferences, privacy, disconnect and data requests.              |

### 4.2 Admin dashboard information architecture

| Surface                 | Purpose                                                                                      |
| ----------------------- | -------------------------------------------------------------------------------------------- |
| Operations home         | Workload, service-level risk, failures, approvals waiting, and publications due.             |
| Access queue            | Track Google consent, location selection, invitations, agency requests, and verification.    |
| Support inbox           | Prioritized conversations with assignment, context, AI mode, and response tools.             |
| Marketing queue         | Requests organized by production state, priority, due time, assignee, and blocker.           |
| Creative workspace      | Original assets, brief, derivatives, notes, versions, internal review, and delivery.         |
| Approval center         | Waiting decisions, revision feedback, decision history, and immutable approved snapshot.     |
| Publishing console      | Channel connections, schedules, jobs, attempts, remote IDs, failures, and recovery.          |
| Customers and stores    | Identity, membership, store, location, consent, conversation, request, and activity history. |
| Team and roles          | Staff access, role assignment, and account status.                                           |
| Audit and system health | Sensitive actions, integration health, job health, and security review.                      |

### 4.3 Role model

| Role               | Core permissions                                                                               |
| ------------------ | ---------------------------------------------------------------------------------------------- |
| Customer owner     | Manage store connection, submit requests, approve or reject creative, manage customer members. |
| Customer member    | Submit requests and chat; approval permission is configurable.                                 |
| Support agent      | View assigned customer context and conversations; respond and change support mode.             |
| Creative operator  | Work on assigned marketing requests and creative versions.                                     |
| Publisher          | Manage channel connections, schedules, publication jobs, and recovery.                         |
| Operations manager | Reassign work, override priorities, inspect service levels, and approve internal release.      |
| Platform admin     | Manage roles, integration configuration, policies, and security settings.                      |
| Auditor            | Read-only access to records, decisions, and audit history.                                     |

Permissions should be explicit actions rather than hard-coded role checks. Roles are named bundles of actions, and sensitive operations require recent authentication.

---

## 5. Customer journeys

### 5.1 Journey A: sign in and connect an existing Google Business Profile

1. The customer selects Continue with Google.
2. GlocalX requests only identity scopes: openid, email, and profile.
3. The customer enters the portal and sees Connect your Business Profile as the primary action.
4. The customer selects Connect Business Profile.
5. GlocalX starts a separate, incremental consent flow for the business.manage scope and requests offline access where appropriate.
6. After the callback, GlocalX lists accessible GBP accounts and locations.
7. The customer selects the correct location.
8. GlocalX verifies usable access, stores encrypted refresh credentials, and records the selected account and location.
9. The customer sees Connected and proceeds to Create.

Identity and Business Profile authorization must not be bundled into one unexplained consent screen. The customer should understand why GlocalX needs each permission and be able to disconnect it later.

### 5.2 Journey B: GlocalX needs organization access

Google Business Profile access belongs to individual profiles, business groups, or organizations; API access to a Cloud project does not grant access to a location. GlocalX must model this as a business access workflow, not only an OAuth callback.

Preferred flow:

1. Customer signs in and completes Business Profile consent.
2. GlocalX detects that the selected location is not accessible at the required level or the customer explicitly chooses Invite GlocalX.
3. GlocalX explains that the business owner should remain primary owner and GlocalX should receive manager or approved business-group access.
4. The portal shows the GlocalX organization or business-group identifier and precise Google UI instructions.
5. Where Google and caller permissions allow an invitation API path, GlocalX may create an admin invitation and record the invitation resource.
6. Where Google requires Business Profile Manager interaction, the portal links to the correct workflow and tracks the request as awaiting external action.
7. The access queue shows owner action required, GlocalX action required, Google review, or verification.
8. A scheduled verifier checks whether the account and location are now accessible.
9. On success, the connection becomes active; on timeout, support is prompted to intervene.

Do not claim that all organization-access requests can be completed automatically. Google’s agency and business-group flows may require manual actions in Business Profile Manager.

### 5.3 Journey C: submit marketing material

1. The customer opens Create.
2. The customer uploads one or more images.
3. Client-side checks cover type, count, size, dimensions, and obvious duplicates.
4. Files upload directly to object storage using short-lived signed upload credentials.
5. The customer enters a short description answering what is happening and how it should be promoted.
6. Optional structured inputs capture desired timing, offer dates, language, and channel preferences.
7. The customer reviews the raw inputs and selects Send to GlocalX.
8. The request enters Submitted; the portal immediately shows that GlocalX is reviewing it.
9. The customer does not see enhancement variants or production controls.

### 5.4 Journey D: approve or revise

1. GlocalX marks a creative version Ready for customer.
2. The customer receives an in-app and configured external notification.
3. The approval page shows the exact image, copy, channel adaptations, schedule, and any required disclaimers.
4. Approve records the exact creative version and a content hash.
5. Request revision requires actionable feedback and returns the request to production.
6. Reject closes the version and optionally the request, depending on the selected reason.
7. Approved versions move to scheduling and publishing.
8. Any content change after approval creates a new version and requires a new approval.

### 5.5 Journey E: ask for help

1. The support launcher is visible on every active customer surface, including preserved review and performance pages.
2. The customer sends a natural-language message.
3. The backend attaches a safe context snapshot: current surface, workflow stage, most recent relevant action, status, safe error code, store, client version, locale, and timestamp.
4. AI answers automatically if the conversation mode and policy allow it.
5. If confidence is low, the request is sensitive, the customer asks for a person, or a service rule triggers, the conversation moves to an operator queue.
6. The operator receives the full conversation plus structured context, then replies in the same thread.
7. The customer sees whether a message came from the GlocalX assistant or a named GlocalX team member.
8. The customer never needs to restart or repeat the problem during takeover.

---

## 6. Support and AI-to-human handoff

### 6.1 Conversation modes

| Mode       | Behavior                                                    | Customer presentation                 |
| ---------- | ----------------------------------------------------------- | ------------------------------------- |
| AI_AUTO    | AI may respond directly under policy.                       | GlocalX assistant label.              |
| AI_SUGGEST | AI drafts, but a human must review and send.                | Named team member when sent.          |
| HUMAN      | Only an assigned human can send customer-visible responses. | Named team member.                    |
| CLOSED     | Conversation is resolved and read-only until reopened.      | Resolution summary and reopen action. |

Mode changes are explicit, audited, and visible to authorized staff. AI must not silently resume after a human has taken over; a human or policy-controlled resolution action returns the thread to AI_AUTO.

### 6.2 Required context snapshot

Every new customer message should reference a server-created context snapshot. It should include:

- Application and client version.
- Customer organization, store, and selected GBP location identifiers.
- Current route and normalized surface.
- Current workflow stage and status.
- Entity in focus, such as marketing request or approval ID.
- Last meaningful action and timestamp.
- Safe failure category, request correlation ID, and sanitized error code.
- Connection state for relevant external services.
- Browser class, locale, and timezone when useful.
- Feature flags affecting the visible experience.

It must not include:

- OAuth access or refresh tokens.
- Raw cookies or authorization headers.
- Full payment or government identifiers.
- Image bytes.
- Unbounded browser logs.
- Any field that the receiving operator or AI does not need.

### 6.3 Escalation rules

Automatically route to human review when:

- The customer explicitly requests a person.
- GBP access is denied, revoked, contested, or pending longer than the service threshold.
- A customer disputes a published item or approval record.
- A publication partially succeeds.
- The message concerns deletion, privacy, legal rights, billing disputes, or suspected account compromise.
- The AI lacks grounded information or falls below a configured confidence threshold.
- Negative sentiment repeats across messages without resolution.
- A high-value or at-risk store is tagged for proactive handling.

### 6.4 Admin support workspace

The inbox should provide:

- Queue tabs for unassigned, mine, waiting on customer, waiting on GlocalX, service-level risk, and resolved.
- Sort by priority, age, customer value, and workflow severity.
- Conversation mode and assignee at the top of the thread.
- A context rail with current surface, store status, request status, recent errors, and account connections.
- AI summary, suggested response, relevant playbook, and cited internal data.
- Actions to change mode, assign, add internal note, link an incident, or resolve.
- A timeline of messages, context snapshots, mode changes, assignments, and linked business events.

### 6.5 AI safety and quality controls

- Ground answers in GlocalX product state, approved playbooks, and safe integration data.
- Treat external content and uploaded text as untrusted input.
- Require human review for destructive, legal, privacy, credential, access-control, and irreversible publishing guidance.
- Redact or omit secrets before prompt construction.
- Log model, prompt template version, tool calls, confidence signal, and outcome without storing unnecessary sensitive content.
- Make the customer-visible sender identity accurate.
- Measure answer acceptance, containment, handoff rate, repeat contact, resolution time, and post-resolution satisfaction.

---

## 7. Managed marketing workflow

### 7.1 Canonical state machine

| State                | Owner           | Meaning                                                           | Allowed next states                           |
| -------------------- | --------------- | ----------------------------------------------------------------- | --------------------------------------------- |
| SUBMITTED            | Customer        | Inputs were received and are immutable as a submission snapshot.  | TRIAGED, CANCELED                             |
| TRIAGED              | Operations      | Scope, channel, due time, and assignee are set.                   | IN_PRODUCTION, NEEDS_CUSTOMER_INPUT, CANCELED |
| NEEDS_CUSTOMER_INPUT | Customer        | Required source information is missing.                           | TRIAGED, CANCELED                             |
| IN_PRODUCTION        | Creative        | Assets and copy are being prepared.                               | INTERNAL_REVIEW, BLOCKED                      |
| BLOCKED              | Operations      | External or internal dependency prevents progress.                | IN_PRODUCTION, CANCELED                       |
| INTERNAL_REVIEW      | Operations      | A version is checked for quality, brand, policy, and channel fit. | IN_PRODUCTION, READY_FOR_CUSTOMER             |
| READY_FOR_CUSTOMER   | Customer        | A specific version awaits a decision.                             | APPROVED, REVISION_REQUESTED, REJECTED        |
| REVISION_REQUESTED   | Creative        | Customer feedback requires a new version.                         | IN_PRODUCTION                                 |
| REJECTED             | Customer        | Customer does not authorize this version.                         | IN_PRODUCTION, CANCELED                       |
| APPROVED             | System          | Customer approved an immutable version.                           | SCHEDULED, CANCELED                           |
| SCHEDULED            | Publisher       | Channel jobs and timing are ready.                                | PUBLISHING, CANCELED                          |
| PUBLISHING           | Worker          | One or more channel jobs are running.                             | PUBLISHED, PARTIAL_FAILURE, FAILED            |
| PARTIAL_FAILURE      | Publisher       | At least one channel succeeded and one did not.                   | PUBLISHING, PUBLISHED, FAILED                 |
| FAILED               | Publisher       | Required publication did not complete.                            | PUBLISHING, CANCELED                          |
| PUBLISHED            | System          | Required channel jobs completed.                                  | —                                             |
| CANCELED             | Authorized user | Work ended without publication.                                   | —                                             |

Every transition records actor, timestamp, prior state, next state, reason, and linked entity or attempt.

### 7.2 Creative version rules

- Original uploads are never overwritten.
- Every derivative references its source asset, transformation purpose, generator or tool version, operator, and creation time.
- A customer-facing creative package is versioned.
- Internal notes are never exposed accidentally in the customer payload.
- A package contains channel-specific media, copy, alt text, links, offer dates, location references, and policy notes.
- A ready package is frozen before delivery.
- Approval binds the customer, version ID, rendered content hash, channels, intended schedule, decision, and timestamp.
- Any post-approval change requires a new version and decision.

### 7.3 Admin creative workspace

The workspace should show:

- Customer brief and source images.
- Store profile, tone, location, recent publications, and known constraints.
- Production checklist.
- Derivative gallery and lineage.
- Copy editor with channel-specific limits and validation.
- Internal comments and assignment history.
- Preview at representative channel sizes.
- Policy warnings and missing alt text.
- Create version, submit for internal review, return to production, and send to customer actions.

### 7.4 Service-level model

Service levels should be stored as policies, not scattered constants. A policy may define:

- Time to triage.
- Time to first support response.
- Time to first ready creative.
- Maximum customer-wait reminder interval.
- Approval expiry and schedule cutoff.
- Publication retry window.
- Escalation thresholds.

Initial values are founder and operations decisions. The implementation should support them without hard-coding an unvalidated promise.

---

## 8. Publishing design

### 8.1 Channel strategy

Launch in this order:

1. Google Business Profile local posts.
2. Instagram, after account eligibility, permissions, review requirements, and business linkage are validated.
3. Additional platforms only after the first two channels have reliable job metrics and recovery playbooks.

The current interface can preview Instagram-like content, but a preview is not proof that production publishing is connected. The deck and customer UI must distinguish a planned channel from a live integration.

### 8.2 Publication job model

Approval creates one publication job per channel. Each job includes:

- Approved creative version ID.
- Customer organization and store.
- Platform connection.
- Channel and target account.
- Requested publish time.
- Payload snapshot.
- Idempotency key.
- Current status and attempt count.
- Lease owner and lease expiry.
- Remote resource ID and canonical URL when available.
- Last safe error category.
- Recovery owner and resolution notes.

The idempotency key should be deterministic for an approved version, channel, target, and requested schedule. A retry must not create a duplicate post when the first request succeeded but the acknowledgement was lost.

### 8.3 Attempt lifecycle

1. Worker claims a due job using a lease.
2. Worker revalidates approval and platform connection.
3. Worker adapts the frozen payload without changing customer-approved meaning.
4. Worker sends the platform request with trace correlation.
5. Worker records a sanitized request fingerprint and response.
6. On success, worker saves the remote ID and URL.
7. On retryable failure, worker schedules exponential backoff with jitter.
8. On terminal failure, worker moves the job to operator recovery.
9. Aggregate request status becomes PUBLISHED, PARTIAL_FAILURE, or FAILED.

### 8.4 Recovery console

Authorized operators need:

- Safe error details and attempt timeline.
- Connection-health check.
- Link to the exact approved version.
- Retry, reschedule, skip channel, or mark externally completed actions.
- Duplicate-detection and remote-ID search.
- Mandatory reason for manual overrides.
- Audit trail for every recovery action.

---

## 9. Google identity and Business Profile design

### 9.1 Separate grants

Google sign-in should request only identity scopes. A later Connect Business Profile action requests https://www.googleapis.com/auth/business.manage. This reduces surprise, clarifies purpose, and allows a customer to keep a GlocalX account even if they temporarily disconnect profile management.

### 9.2 Connection states

| State                  | Meaning                                                                | Customer action                    |
| ---------------------- | ---------------------------------------------------------------------- | ---------------------------------- |
| NOT_CONNECTED          | No usable GBP management grant.                                        | Connect Business Profile.          |
| CONSENT_IN_PROGRESS    | OAuth flow started but not complete.                                   | Finish or restart consent.         |
| CONSENT_GRANTED        | Grant exists; account/location not selected.                           | Select business and location.      |
| LOCATION_SELECTED      | Location is selected; operational access is being verified.            | Wait or respond to instructions.   |
| ACCESS_ACTION_REQUIRED | Owner or agency must complete a Google access action.                  | Follow invite/request steps.       |
| ACCESS_PENDING         | External action completed; verification pending.                       | Wait; support can inspect.         |
| ACTIVE                 | Required location operations are verified.                             | No action.                         |
| DEGRADED               | Some operations work, but a required permission or API is unavailable. | Review details or contact support. |
| REAUTH_REQUIRED        | Token expired, revoked, or missing required consent.                   | Reconnect.                         |
| DISCONNECTED           | Customer or admin deliberately removed the connection.                 | Reconnect if desired.              |

### 9.3 Google platform prerequisites

Before pilot:

- The Google Cloud project must have approved Google Business Profile API access and non-zero quota.
- OAuth consent, privacy policy, authorized domains, and redirect URIs must match the production identity.
- The application must request only justified scopes and pass any required verification.
- GlocalX must establish the correct organization or business-group operating account.
- Access and impersonation policies must follow Google’s authorized representative guidance.
- The owner should remain primary owner; GlocalX should use the minimum manager-level access that supports the service.
- Revocation and disconnect handling must be tested.

### 9.4 Official Google references

- [Implement OAuth for Business Profile APIs](https://developers.google.com/my-business/content/implement-oauth)
- [Basic setup for Business Profile APIs](https://developers.google.com/my-business/content/basic-setup)
- [API access and quota limits](https://developers.google.com/my-business/content/limits)
- [Business Profile API FAQ](https://developers.google.com/my-business/content/faq)
- [Accounts and organizations](https://developers.google.com/my-business/content/accounts)
- [Account Management API](https://developers.google.com/my-business/reference/accountmanagement/rest)
- [Create an account administrator invitation](https://developers.google.com/my-business/reference/accountmanagement/rest/v1/accounts.admins/create)
- [Add owners and managers](https://support.google.com/business/answer/3403100?hl=en)
- [Agency organization access](https://support.google.com/business/answer/7655924?hl=en)
- [Request ownership](https://support.google.com/business/answer/4566671?hl=en)
- [Authorized representative policy](https://support.google.com/business/answer/13763036?hl=en)
- [Local Posts API](https://developers.google.com/my-business/reference/rest/v4/accounts.locations.localPosts)
- [Business Profile API policies](https://developers.google.com/my-business/content/policies)

These sources should be rechecked during implementation because Google scopes, approval requirements, and endpoints can change.

---

## 10. Recommended system architecture

### 10.1 Deployment shape

Use a shared monorepo with independent customer and admin applications:

| Unit                  | Responsibility                                                  | Deployment                                                                |
| --------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------- |
| apps/customer         | Customer portal and customer-facing API routes                  | Separate Vercel project and hostname.                                     |
| apps/admin            | Staff dashboard and admin-only API routes                       | Separate Vercel project and hostname, protected by staff identity policy. |
| packages/domain       | State machines, permissions, domain types, and validation       | Versioned with both apps.                                                 |
| packages/db           | Schema, migrations, repositories, and tenant-safe query helpers | Shared package, environment-specific database.                            |
| packages/integrations | Google, Meta/Instagram, AI, notification, and storage adapters  | Shared package with explicit stub and production implementations.         |
| packages/ui           | GlocalX tokens, primitives, icons, and shared status components | Shared package; layouts remain application-specific.                      |
| workers/operations    | Media, notification, verification, and publication jobs         | Durable worker runtime separate from page requests.                       |

Separate deployment does not require separate repositories. Keeping one repository allows atomic changes to contracts and shared packages while Vercel project boundaries provide independent domains, environment variables, access controls, and release cadence.

### 10.2 Runtime components

#### Customer portal

- Server-rendered portal shell.
- Google identity session.
- Incremental GBP consent.
- Direct-to-storage media upload.
- Marketing request, approval, and support interfaces.
- Preserved review and performance fixtures.

#### Admin dashboard

- Staff authentication and authorization.
- Operations queues.
- Support and AI mode controls.
- Media and creative version management.
- Approval status.
- Publishing and recovery console.
- Audit and health views.

#### Shared application services

- Tenant and membership service.
- Identity and session service.
- Google connection and access service.
- Support conversation service.
- Marketing workflow service.
- Media service.
- Approval service.
- Publication orchestration service.
- Notification service.
- Audit service.

#### Data and execution

- Managed PostgreSQL as system of record.
- S3-compatible object storage for original and derived media. Vercel Blob is acceptable if the team chooses to remain Vercel-centric and its lifecycle and access controls meet requirements.
- Durable queue and worker for non-interactive work.
- Scheduled triggers for access verification, reminders, publication, reconciliation, and cleanup.
- Centralized structured logs, traces, job metrics, and alerting.

### 10.3 Architectural boundaries

1. React components call typed application APIs, not external platform SDKs.
2. Route handlers validate identity, tenancy, permission, and payload before calling domain services.
3. Domain services own transitions and invariants.
4. Integration adapters translate domain commands into platform-specific requests.
5. Workers call the same domain services and adapters as request handlers.
6. The database is the source of truth for state; the queue is delivery infrastructure, not the only record of work.
7. Object storage holds bytes; PostgreSQL holds metadata, ownership, lineage, and approval references.
8. All customer-visible changes and external side effects emit audit and domain events.

### 10.4 Environment topology

| Environment     | Customer app             | Admin app                        | Database and storage                                           | External credentials                                                |
| --------------- | ------------------------ | -------------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------- |
| Local           | Local ports              | Local ports                      | Local isolated database and development bucket                 | Stub by default; explicit developer opt-in for sandbox credentials. |
| Feature preview | Per-branch URL           | Per-branch URL if required       | Preview-safe isolated or shared non-production resources       | Never production credentials.                                       |
| Staging         | Stable dev hostname      | Stable admin staging hostname    | Dedicated staging database, bucket, queue, and encryption keys | Staging OAuth clients and test accounts.                            |
| Production      | Stable customer hostname | Stable restricted admin hostname | Dedicated production data services                             | Production OAuth clients, verified domains, and rotated secrets.    |

### 10.5 Background-work strategy

Do not run image processing or multi-channel publication as long-running Vercel request functions. A durable worker must support:

- At-least-once message delivery.
- Database-backed idempotency.
- Leases with expiry.
- Retry classes and exponential backoff.
- Dead-letter or operator-recovery queues.
- Concurrency limits per provider and tenant.
- Scheduled jobs.
- Trace correlation from UI action to external API.
- Graceful cancellation before external side effects.

The specific queue vendor may be selected during Phase 0. The domain contract should remain vendor-neutral.

---

## 11. Domain and data model

### 11.1 Tenant and identity

#### organizations

Represents either a merchant organization or the GlocalX staff organization.

Core fields: id, type, name, status, locale, timezone, created_at, updated_at.

#### organization_memberships

Core fields: organization_id, user_id, role_id, status, invited_by, joined_at, last_authenticated_at.

#### roles and permissions

Core fields: role_id, organization_type, name, permission actions, system_managed.

#### stores

Retain and migrate existing stores. Add merchant organization ownership, operational status, default locale, timezone, brand profile, and service policy reference.

### 11.2 Google connection and access

#### google_connections

Separates identity linkage from Business Profile management consent.

Core fields: user_id, google_subject, identity_scopes, management_scopes, encrypted refresh token reference, consented_at, last_refreshed_at, status, revoked_at.

#### gbp_accounts and gbp_locations

Retain external identifiers, display metadata, verification state, connection health, last successful API operation, and last synchronized time.

#### gbp_access_requests

Core fields:

- Customer organization and store.
- Requested account and location.
- Request type: user invitation, business group invitation, agency request, ownership request, or manual guidance.
- Required access level.
- External invitation or request identifier when available.
- Current state and responsible party.
- Requested by, requested at, deadline, last checked, and resolved at.
- Evidence and operator notes.

### 11.3 Support

#### support_conversations

Core fields: tenant, store, subject, mode, status, priority, assigned_team, assigned_user, service policy, first_response_due_at, resolution_due_at, opened_at, resolved_at.

#### support_messages

Expand sender roles to customer, AI assistant, human agent, system, and internal note. Keep sender identity, message visibility, model metadata where relevant, delivered time, and context snapshot reference.

#### support_context_events

Stores normalized, sanitized product context separately from prose.

Core fields: conversation, customer session, surface, workflow, stage, focused entity type and ID, last action, safe error category, correlation ID, connection summary, feature flags, client version, locale, timezone, captured_at.

#### support_assignments and mode_events

Record assignment, reassignment, queue movement, mode changes, actor, reason, and time.

### 11.4 Marketing and media

#### marketing_requests

Core fields: organization, store, title, customer brief, timing, requested channels, priority, state, service policy, current assignee, submission snapshot, due times, created_by, created_at.

#### media_assets

Core fields: owner organization, storage key, original filename, MIME type, byte size, pixel dimensions, checksum, upload status, malware scan state, retention class, created_by, created_at.

#### asset_derivatives

Core fields: source asset, derivative type, storage key, checksum, dimensions, transformation metadata, tool and version, operator, created_at.

#### creative_versions

Core fields: request, version number, status, image derivatives, common message, channel adaptations, alt text, links, schedule proposal, policy checks, internal review, customer payload snapshot, content hash, created_by, created_at.

#### approval_decisions

Core fields: creative version, customer actor, decision, structured reason, feedback, version hash, IP and user-agent security metadata where lawful and necessary, decided_at.

### 11.5 Platform connections and publication

#### platform_connections

Core fields: organization, store, platform, external account, encrypted credential reference, scopes, status, expires_at, last_verified_at, connection metadata.

#### publication_jobs

Core fields: creative version, platform connection, target, payload snapshot, idempotency key, scheduled_for, status, attempt_count, lease owner and expiry, remote ID, remote URL, error category, created_at, completed_at.

#### publication_attempts

Core fields: job, attempt number, request fingerprint, response status, provider request ID, safe error detail, retry classification, started_at, finished_at.

### 11.6 Audit and event model

Extend the existing audit table rather than creating an unrelated logging system. Sensitive records should capture:

- Actor type and actor ID.
- Acting organization.
- Customer organization.
- Action.
- Resource type and ID.
- Previous and next state summaries.
- Reason.
- Request correlation and source application.
- Timestamp.

Domain events should be transactional with state changes through an outbox pattern. This avoids publishing a queue event when the database transaction later fails.

### 11.7 Retention and deletion

The team must define:

- Retention for original and derivative media.
- Retention for conversation content and model metadata.
- Retention for audit records.
- Customer-requested deletion workflow.
- Legal holds if applicable.
- Token and credential deletion on disconnect.
- Whether published content and remote IDs remain after a customer closes an account.

Retention must be encoded as scheduled policy, not a manual cleanup promise.

---

## 12. API and event contract

### 12.1 Customer APIs

| Method and route                                | Purpose                                          | Important rules                                        |
| ----------------------------------------------- | ------------------------------------------------ | ------------------------------------------------------ |
| POST /api/v2/auth/google/start                  | Start identity sign-in.                          | Identity scopes only; state and PKCE.                  |
| POST /api/v2/gbp/connect/start                  | Start incremental GBP consent.                   | Requires customer session; management scope explained. |
| GET /api/v2/gbp/accounts                        | List accessible accounts.                        | Never return tokens; tenant and consent checks.        |
| POST /api/v2/gbp/location                       | Select a location.                               | Verify caller authority and location ownership.        |
| POST /api/v2/gbp/access-requests                | Start or record an organization-access workflow. | Record manual and API-assisted variants.               |
| POST /api/v2/uploads                            | Create signed upload intent.                     | Validate file policy before issuing credentials.       |
| POST /api/v2/marketing-requests                 | Submit brief and uploaded asset references.      | Assets must be owned, scanned, and complete.           |
| GET /api/v2/marketing-requests                  | List customer requests.                          | Tenant scoped; minimal payload.                        |
| GET /api/v2/creative-versions/:id               | Fetch customer-safe frozen version.              | No internal notes or unapproved derivatives.           |
| POST /api/v2/creative-versions/:id/decision     | Approve, revise, or reject.                      | Idempotent; exact version hash required.               |
| POST /api/v2/support/conversations              | Open or resume support.                          | Server creates context snapshot.                       |
| POST /api/v2/support/conversations/:id/messages | Send message.                                    | Message and context event written transactionally.     |

### 12.2 Admin APIs

| Method and route                                         | Purpose                              | Important rules                                |
| -------------------------------------------------------- | ------------------------------------ | ---------------------------------------------- |
| GET /api/admin/v2/queues                                 | Queue counts and service-level risk. | Staff permission and organization boundary.    |
| GET /api/admin/v2/support/conversations                  | Filtered support inbox.              | Pagination and least-privilege fields.         |
| POST /api/admin/v2/support/conversations/:id/assign      | Assign or reassign.                  | Audit reason for forced reassignment.          |
| POST /api/admin/v2/support/conversations/:id/mode        | Change AI or human mode.             | Explicit actor, reason, and policy validation. |
| POST /api/admin/v2/support/conversations/:id/messages    | Send human or approved AI draft.     | Accurate sender identity.                      |
| GET /api/admin/v2/marketing-requests                     | Production work queue.               | Filter by state, owner, due time, and blocker. |
| POST /api/admin/v2/marketing-requests/:id/transition     | Move a request.                      | Domain state machine only.                     |
| POST /api/admin/v2/creative-versions                     | Create a version.                    | Derivative ownership and validation.           |
| POST /api/admin/v2/creative-versions/:id/internal-review | Pass or return internal review.      | Checklist and reviewer identity.               |
| POST /api/admin/v2/creative-versions/:id/deliver         | Freeze and send to customer.         | Generate content hash and customer payload.    |
| GET /api/admin/v2/publication-jobs                       | Publishing and recovery queue.       | Sensitive actions separately permissioned.     |
| POST /api/admin/v2/publication-jobs/:id/retry            | Retry a job.                         | Idempotency and mandatory reason.              |
| GET /api/admin/v2/audit                                  | Search audit history.                | Read-only auditor permission and redaction.    |

Use versioned route namespaces and shared Zod schemas. API responses should return a stable machine-readable error code, safe customer message, correlation ID, and optional recovery action.

### 12.3 Domain events

Recommended event names:

- organization.member_added
- google.connection_consented
- gbp.location_selected
- gbp.access_requested
- gbp.access_activated
- gbp.reauthentication_required
- support.conversation_opened
- support.message_received
- support.mode_changed
- support.assigned
- support.resolved
- marketing.request_submitted
- marketing.request_state_changed
- creative.version_created
- creative.ready_for_customer
- creative.approved
- creative.revision_requested
- publication.job_scheduled
- publication.job_succeeded
- publication.job_failed
- publication.request_partially_failed

Every event includes event ID, schema version, aggregate type and ID, tenant ID, occurred time, actor summary, correlation ID, and payload appropriate to the event.

### 12.4 Notification triggers

Notify customers when:

- GBP access requires action.
- A creative version is ready.
- A question blocks production.
- A revision is ready.
- A scheduled publication succeeds or requires customer awareness.
- A support operator responds while the customer is offline.

Notify staff when:

- A service deadline is at risk.
- A human handoff is requested.
- GBP access remains pending beyond policy.
- A creative request is unassigned.
- Approval feedback arrives.
- Publication partially succeeds or exhausts retries.

Notifications should link to the exact portal or dashboard entity and must not expose sensitive content on lock screens or email subject lines.

---

## 13. Security, privacy, and control design

### 13.1 Staff access

- Use Google Workspace or equivalent staff SSO with an allowlisted domain.
- Require multi-factor authentication at the identity provider.
- Block public self-registration for admin.
- Use short admin sessions and step-up authentication for sensitive actions.
- Revoke access promptly when staff membership ends.
- Review privileged roles regularly.

### 13.2 Tenant isolation

- Resolve customer organization server-side from membership, never from a trusted client-provided organization ID alone.
- Require tenant criteria in every repository query.
- Add automated cross-tenant authorization tests.
- Separate GlocalX internal notes from customer-visible content at the schema and serialization layers.
- Avoid service-role credentials in browser code.

### 13.3 OAuth and credentials

- Use state and PKCE for OAuth flows.
- Encrypt refresh tokens with a versioned key-encryption scheme.
- Keep encryption keys outside the database.
- Support key rotation without forcing all customers to reconnect.
- Minimize requested scopes.
- Track grant time, scopes, verification, refresh health, and revocation.
- Never place tokens in logs, support context, analytics, or AI prompts.

### 13.4 Media security

- Upload directly to private storage with short-lived signed credentials.
- Validate MIME signature, extension, size, dimensions, and image-decoding success.
- Scan uploads for malware.
- Strip unsafe metadata when producing derivatives.
- Serve private previews through short-lived signed reads or authenticated proxy routes.
- Use random non-guessable storage keys.
- Restrict production operators to the media required for assigned work.

### 13.5 Approval and publication controls

- A publication job must reference an approved, frozen creative version.
- The worker rechecks approval immediately before external action.
- Any material mutation invalidates the approval.
- Manual override requires a dedicated permission and recorded reason.
- Publication idempotency is enforced in the database.
- Platform responses are sanitized before logs or staff display.

### 13.6 AI controls

- Build prompts from allowlisted fields.
- Isolate untrusted customer and external content.
- Version prompts and policies.
- Log human approval of AI-suggested messages.
- Provide a kill switch per organization, conversation, and global environment.
- Do not use customer content for model training unless contracts, consent, and provider settings explicitly support it.

### 13.7 Threat-model priorities

Before pilot, review at minimum:

- Cross-tenant data access.
- Stolen or over-scoped OAuth refresh tokens.
- Admin account takeover.
- Prompt injection through customer briefs or scraped business data.
- Unapproved or duplicate publication.
- Public media leakage.
- Forged approval requests.
- Queue replay and idempotency bypass.
- Staff access to unnecessary customer content.
- Sensitive data in logs and notifications.

---

## 14. Preservation of reviews and performance

The founders explicitly requested that review and performance dashboard sections remain untouched with stub data. Treat this as a compatibility requirement.

### 14.1 Implementation rules

- Preserve current routes and visual components.
- Preserve fixture shapes and deterministic outputs.
- Do not mix new production database queries into the stub views.
- Add the global support launcher without changing the internal page layout.
- Add a visible but quiet Future capability or Preview data label only if the current UI does not already make the data status clear.
- Keep API contracts behind a feature flag so a future live adapter can replace fixtures without redesigning the UI.
- Add visual regression baselines before monorepo extraction.

### 14.2 Acceptance criteria

- Desktop and mobile screenshots match approved current baselines within agreed visual-diff tolerance.
- Existing navigation links continue to work.
- Stub data is deterministic across local, preview, staging, and production.
- Chat context correctly identifies Reviews or Performance as the current surface.
- No user can infer that fixture numbers are live store performance.
- No V2 release is blocked on new reviews or performance integrations.

---

## 15. Delivery roadmap

### 15.1 Team assumption

Planning baseline:

- Two full-stack engineers.
- One product and design owner.
- Part-time operations and customer-success owner.
- Founder availability for weekly decisions.
- Security and legal review available at release gates.

This is an estimate, not a commitment. A smaller team or delayed Google and Meta approvals will extend elapsed time.

### 15.2 Phase 0: deployment recovery and contracts, week 1

Outcomes:

- Stable production and staging hostnames.
- Verified OAuth callback inventory.
- V2 architecture decision record.
- Monorepo migration plan.
- Environment and secret matrix.
- Google API access and quota application status confirmed.
- Instagram eligibility and review path documented.
- Current review and performance visual baselines captured.

Exit gate:

- Both stable hostnames return the expected application.
- CI is green.
- Production and staging data services are distinct.
- OAuth callbacks complete in staging.
- No unresolved architecture decision blocks database work.

### 15.3 Phase 1: application separation, identity, and GBP, weeks 2 to 3

Outcomes:

- Customer and admin applications build and deploy independently.
- Shared domain, database, integration, and UI packages.
- Staff SSO and role-based authorization.
- Separate Google identity and Business Profile consent.
- Account and location selection.
- Access-request tracking and operator queue.

Exit gate:

- A pilot user can sign in, connect a location, or receive an accurate guided access path.
- Unauthorized staff and cross-tenant access tests pass.
- Revocation and reconnect flows pass.

### 15.4 Phase 2: contextual support, weeks 4 to 5

Outcomes:

- Persistent customer chat.
- Structured context events.
- Admin inbox and assignment.
- AI_AUTO, AI_SUGGEST, HUMAN, and CLOSED modes.
- Transparent customer sender labels.
- Escalation and service-level timers.

Exit gate:

- An operator can reproduce the user’s location in the workflow from the context rail.
- A conversation moves from AI to human without losing history.
- Sensitive context fields are absent from prompts and logs.

### 15.5 Phase 3: marketing intake, production, and approval, weeks 6 to 8

Outcomes:

- Direct media uploads and scanning.
- Customer brief submission.
- Marketing queue and creative workspace.
- Asset lineage and creative versions.
- Internal review.
- Customer approval, revision, and rejection.
- Immutable approval evidence.

Exit gate:

- A request travels from source upload to approved frozen version.
- Internal notes never appear in customer payloads.
- Any content mutation after approval forces reapproval.

### 15.6 Phase 4: publishing, observability, and pilot, weeks 9 to 10

Outcomes:

- GBP publication jobs.
- Instagram publication path if platform eligibility is complete.
- Scheduling, idempotency, retries, partial failure, and recovery.
- Notifications.
- Operations metrics and alerts.
- Pilot runbook, incident process, and staff training.

Exit gate:

- Test locations publish successfully.
- Duplicate and ambiguous-success scenarios are recovered without double posting.
- Partial channel failure is visible and actionable.
- Operators complete a scripted end-to-end pilot rehearsal.

### 15.7 Contingency

If Instagram permissions are not ready, launch the pilot with GBP production publishing and an explicitly labeled operator-assisted Instagram step. Do not delay the entire service loop, and do not represent manual posting as an API integration.

---

## 16. Acceptance criteria by capability

### 16.1 Google identity and GBP

- Identity sign-in requests only identity scopes.
- GBP consent is a separate customer action with a clear purpose.
- Account and location selection is based on live authorized resources in production mode.
- Access status survives page reload and session changes.
- Pending manual access has instructions, responsible party, and last-checked time.
- Revoked credentials move the connection to REAUTH_REQUIRED.
- Tokens never reach browser responses or application logs.

### 16.2 Customer marketing intake

- Supported files upload without passing bytes through an application route.
- Invalid, oversized, corrupt, or unsafe files fail with actionable messages.
- Submission binds uploaded asset checksums and the customer brief.
- A duplicate submit request does not create duplicate work.
- After submit, the customer sees status and can chat but cannot edit internal production.

### 16.3 Admin creative workflow

- Queues filter and sort by state, assignment, due time, priority, and blocker.
- Only permitted operators can view source media.
- Derivatives retain source lineage.
- Internal review is required before customer delivery.
- Delivered creative has an immutable customer payload and hash.
- Revision feedback creates a new version sequence without overwriting history.

### 16.4 Approval

- Customer sees the exact channel payload to be published.
- Approval is idempotent.
- Stale browser approval against a superseded version is rejected.
- A post-approval content change invalidates scheduling and requires reapproval.
- Approval history is visible to authorized customer and admin users.

### 16.5 Publishing

- Every channel has an independent job and aggregate request status.
- Retries cannot create duplicate remote posts.
- Provider rate limits receive appropriate backoff.
- Missing or revoked connections stop before publication.
- Remote identifiers and links are stored on success.
- Partial failure has an operator workflow and customer-safe explanation.

### 16.6 Support

- Chat is reachable from every customer surface.
- Context contains surface, stage, last action, and safe error information.
- The admin sees the context beside the thread.
- Customer messages are not lost during AI-to-human takeover.
- AI cannot respond in HUMAN or CLOSED mode.
- AI and human senders are accurately labeled.
- Internal notes are never customer-visible.

### 16.7 Reviews and performance

- Existing surfaces retain their appearance and fixture behavior.
- New V2 data paths do not modify their values.
- Chat overlay works without layout regression.
- Stub status is not misrepresented as production data.

---

## 17. Testing and quality strategy

### 17.1 Automated test layers

#### Domain tests

- Marketing state transitions.
- Conversation mode transitions.
- Approval immutability.
- Permission actions.
- Idempotency-key construction.
- Retry classification.
- Aggregate publication status.

#### Repository and authorization tests

- Cross-tenant reads and writes fail.
- Customer and staff organization boundaries.
- Role and permission enforcement.
- Transactional outbox behavior.
- Lease acquisition and expiry.

#### Contract tests

- Zod request and response schemas.
- External adapter fixtures.
- Google token revocation and access changes.
- Platform rate-limit and ambiguous-success responses.
- Storage signed-upload policy.

#### Integration tests

- Google identity callback.
- Incremental GBP consent and location selection.
- Direct upload completion.
- Marketing request through approval.
- AI-to-human takeover.
- Publication retry and partial failure.

#### End-to-end tests

- New customer connects a store and submits a request.
- Customer follows a manual GBP access path.
- Operator produces and delivers a creative version.
- Customer requests a revision and later approves.
- Approved content publishes to a test location.
- Support receives route and stage context.
- Admin authorization and cross-tenant denial.

#### Visual regression

- Customer home, create, approval, reviews, and performance at desktop and mobile widths.
- Admin inbox, marketing queue, creative workspace, and recovery console.
- Chat closed, open, loading, human takeover, and error states.

### 17.2 Manual pilot rehearsal

Before external customers:

1. Create a clean test customer.
2. Complete identity and GBP consent.
3. Exercise both direct access and manual agency-access paths.
4. Submit valid and invalid media.
5. Send support messages from each major surface.
6. Move one thread from AI_AUTO to HUMAN and back under policy.
7. Create two creative versions and ensure only the latest can be approved.
8. Request a revision and inspect history.
9. Approve and publish.
10. Simulate a retryable error, ambiguous success, revoked connection, and partial failure.
11. Verify customer notifications and staff alerts.
12. Export the audit timeline for the complete case.

### 17.3 Definition of done

A story is done when:

- Acceptance criteria pass.
- Authorization and error paths are covered in proportion to risk.
- Accessibility and responsive behavior are checked.
- Logs and metrics are present for important state transitions.
- Customer and staff copy is approved.
- Database migrations have forward and recovery procedures.
- Integration secrets remain environment-scoped.
- Documentation and runbooks are updated.
- A reviewer exercises the feature through its user-facing surface.

---

## 18. Observability and operations

### 18.1 Required metrics

#### Product

- Sign-in completion.
- GBP consent completion.
- Location connection and access activation.
- Marketing request submission.
- Time from submission to triage.
- Time to first ready creative.
- Approval rate.
- Revision cycles per request.
- Publication success by channel.
- Active stores and posts per store.

#### Support

- First-response time.
- Resolution time.
- AI containment.
- AI suggestion acceptance.
- Human handoff rate.
- Reopen rate.
- Repeat contact by issue category.
- Customer satisfaction after resolution.

#### Reliability

- API latency and error rate.
- OAuth callback failures.
- Token refresh health.
- Queue age.
- Job success, retry, and dead-letter counts.
- Provider rate-limit events.
- Duplicate-prevention events.
- Notification delivery.
- Object-storage scan failures.

### 18.2 Alerts

Alert the responsible team when:

- OAuth callback failure exceeds baseline.
- Queue age threatens a service deadline.
- Publication failure or partial failure occurs.
- A provider rate limit is sustained.
- A platform connection becomes degraded across multiple stores.
- Media scanning or upload completion fails broadly.
- Cross-tenant authorization checks trigger.
- Admin sign-in anomalies occur.
- Audit or outbox processing falls behind.

### 18.3 Runbooks

Create and rehearse runbooks for:

- Production alias or domain loss.
- Google OAuth callback failure.
- Google API quota exhaustion.
- Revoked GBP connection.
- Instagram token expiry.
- Object-storage outage.
- Queue or worker outage.
- Duplicate-publication concern.
- Partial multi-channel publication.
- Customer disputes approval.
- Staff account compromise.
- Data-deletion request.

---

## 19. Pilot metrics and learning plan

The pilot should test the operating model, not just feature completion.

### 19.1 Activation funnel

1. Invited store.
2. Google identity established.
3. GBP consent granted.
4. Location selected.
5. Required access activated.
6. First marketing request submitted.
7. First creative approved.
8. First post published.
9. Second request submitted.

Track conversion and elapsed time between every step.

### 19.2 Service quality

- Median and 90th-percentile time to access activation.
- Median and 90th-percentile time to first ready creative.
- Approval on first version.
- Average revision cycles.
- On-time publication.
- Publication success by channel.
- Customer-reported quality and confidence.

### 19.3 Unit economics inputs

Do not claim gross margin until the service inputs are measured. Capture:

- Human support minutes per store.
- Creative operator minutes per request and revision.
- Publication recovery minutes.
- AI and media-processing cost.
- Storage and delivery cost.
- Notification and external API cost.
- Requests and posts per store per month.

These inputs support future pricing and service-tier decisions.

### 19.4 Pilot success gate

Founders should set numerical targets before recruiting the cohort. Recommended target categories are:

- Activation and access completion.
- Time to first value.
- First-version approval.
- Publication reliability.
- Human effort per request.
- Repeat usage.
- Customer willingness to pay.

The targets themselves remain founder decisions; this blueprint does not fabricate them.

---

## 20. Investor narrative

### 20.1 Problem

Local business owners do not lack marketing tools. They lack time, confidence, and an accountable operator who can turn imperfect store updates into approved, channel-ready communication.

### 20.2 Product

GlocalX turns a small input into a managed outcome:

1. Connect the store.
2. Send images and intent.
3. GlocalX prepares the campaign.
4. Approve it.
5. GlocalX publishes and supports the operation.

### 20.3 Why the two-surface model matters

The customer portal makes the promise simple. The admin dashboard makes delivery repeatable. AI handles immediate, repetitive, and context-rich work; humans handle ambiguity, trust, quality judgment, and exceptions. The software captures the full workflow so the service can improve rather than relying on private operator memory.

### 20.4 Potential defensibility

The defensible asset is not a generic chat interface or image filter. It is a structured operating dataset:

- What businesses submit.
- How production transforms it.
- Which versions customers approve.
- Where revisions occur.
- Which support interventions resolve blocks.
- Which channel payloads publish reliably.
- How much human work each outcome requires.

That data can improve routing, playbooks, creative assistance, quality control, service levels, and pricing. This is a forward-looking thesis, not proof of a moat today.

### 20.5 Business-model hypotheses

Possible hypotheses to test:

- Monthly subscription by store with a defined request or publication allowance.
- Higher tiers for faster turnaround, more channels, more locations, or human creative support.
- Setup or migration fee for complex multi-location access.
- Usage add-ons for requests, revisions, or posts above plan.

No pricing is approved in this document. The pilot should measure labor and infrastructure cost before committing to margins or scale claims.

### 20.6 Evidence investors should expect next

- A working customer-to-operator loop.
- Stable GBP access activation.
- Time-to-first-value data.
- Approval and revision behavior.
- Reliable publication.
- Repeat customer use.
- Human minutes and AI cost per request.
- Early willingness-to-pay evidence.

### 20.7 Claims that must remain TBD

- Total addressable market and market share.
- Revenue, growth, retention, or pipeline.
- Pricing.
- Customer count.
- Fundraising amount and use-of-funds percentages.
- Named platform partnerships.
- Instagram production availability until permissions are confirmed.

---

## 21. Key risks and mitigations

| Risk                                                 | Consequence                                            | Mitigation                                                                                                          |
| ---------------------------------------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| Google API access or quota is delayed                | GBP onboarding and publication cannot launch reliably. | Confirm status in Phase 0; preserve guided manual access and test accounts; do not recruit until quota is verified. |
| Agency access is modeled as fully automated          | Customers become stuck in an inaccurate flow.          | Model manual, invitation, agency, and ownership paths explicitly with responsible party and verification.           |
| Instagram permissions are delayed                    | Planned multi-platform promise is incomplete.          | Launch GBP first; label operator-assisted fallback honestly; keep channel-independent jobs.                         |
| AI responds after human takeover                     | Loss of customer trust and contradictory guidance.     | Enforce conversation mode server-side; audit mode changes; require explicit resume.                                 |
| Internal notes leak to customers                     | Privacy and trust incident.                            | Separate schema fields and serializers; contract tests; preview the exact customer payload.                         |
| Approval does not bind exact content                 | Disputed or unauthorized publication.                  | Freeze versions, hash payloads, reject stale decisions, and revalidate before publishing.                           |
| Duplicate posts after timeout                        | Customer-facing error and platform spam.               | Deterministic idempotency, remote reconciliation, and operator recovery.                                            |
| Media is stored in the database or public URLs       | Cost, performance, and privacy problems.               | Private object storage, signed access, metadata in PostgreSQL, retention policy.                                    |
| Admin becomes a collection of screens without queues | Operations do not scale.                               | Build assignment, deadlines, priority, and recovery around explicit work objects.                                   |
| Service labor exceeds price                          | Negative gross margin.                                 | Instrument human time from the pilot; set scope and service tiers from observed cost.                               |
| Stale production alias persists                      | OAuth and pilot access fail.                           | Make verified stable domains the Phase 0 release gate.                                                              |

---

## 22. Founder decisions required

These decisions do not block writing the code skeleton, but they do affect pilot scope and commercial claims:

1. Primary store segment or vertical.
2. Launch geography and supported languages.
3. Whether customer approval belongs only to owners or can be delegated.
4. Creative turnaround and support service-level promises.
5. Maximum images, requests, revisions, and channels per service tier.
6. Whether creative work is internal, partner-operated, or hybrid.
7. Exact GlocalX organization or business-group identity for GBP access.
8. Instagram account eligibility and app-review ownership.
9. Customer notification channels.
10. Pilot cohort size and selection.
11. Pricing hypotheses to test.
12. Funding ask and use of funds for the investor deck.
13. Retention and deletion policies.
14. Whether existing email and Kakao login remain during migration.

Use a weekly decision log. Decisions affecting data, permissions, external platform eligibility, or customer promises should be recorded as architecture or product decision records.

---

## 23. Recommended next actions

### Within two business days

- Recover authenticated Vercel access and stable aliases.
- Confirm Google Business Profile API access and quota.
- Name the GlocalX GBP organization or business group.
- Confirm the staff identity provider and allowed admin domain.
- Assign owners for product, engineering, operations, and platform approvals.

### Within one week

- Approve the monorepo and two-project deployment architecture.
- Baseline current review and performance screenshots.
- Select object storage, queue, worker runtime, notification provider, and observability stack.
- Validate the Instagram eligibility path.
- Convert the companion backlog into the chosen Jira project.
- Approve pilot metrics and founder decisions that affect scope.

### Before external pilot

- Complete every phase exit gate.
- Run the manual pilot rehearsal.
- Review the threat model.
- Confirm privacy, terms, consent copy, and data retention.
- Train operators on access, support, creative, approval, and publication recovery.
- Publish a customer-facing support and incident path.

---

## Appendix A. Traceability from founder request

| Founder request                       | Blueprint response                                                                                     |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Separate admin dashboard              | Independent admin application and Vercel project with shared packages.                                 |
| Google login                          | Identity-only Google sign-in.                                                                          |
| Onboard GBP                           | Incremental business.manage consent, account and location selection.                                   |
| Let GlocalX request access            | Track invitation, business-group, agency, ownership, and guided manual workflows.                      |
| Chat like an AI assistant             | Persistent GlocalX assistant in the customer portal.                                                   |
| Switch AI and human CS                | Four conversation modes, assignment, context, escalation, and audit.                                   |
| Send user activity and stuck stage    | Structured support context events attached server-side.                                                |
| Minimal marketing input               | Direct image uploads plus a short promotional brief.                                                   |
| Admin prepares posting-ready content  | Marketing queue, derivative lineage, creative workspace, and internal review.                          |
| User go or no-go                      | Immutable version approval, revision, rejection, and hash.                                             |
| Post to multiple platforms            | Per-channel publication jobs, GBP first, Instagram second, partial-failure recovery.                   |
| Keep review and performance untouched | Compatibility and visual-regression requirements with deterministic fixtures.                          |
| Follow visual theme                   | Existing GlocalX tokens and interaction language retained across both surfaces.                        |
| Explain to developers and investors   | Technical, operational, delivery, metric, risk, and investor sections plus companion deck and backlog. |

## Appendix B. Planning assumptions

- The current source code remains the migration base.
- PostgreSQL is the production system of record.
- The customer portal and admin dashboard remain web applications.
- Vercel remains the initial web hosting platform.
- External provider policies and approvals may change.
- Review and performance fixtures are legally and commercially safe to display as non-live data.
- Founders will supply claims, traction, pricing, cohort, and funding numbers before external investor circulation.

## Appendix C. Document control

This blueprint is a planning baseline. Any material change to customer authority, admin access, Google access method, approval semantics, publication side effects, or data retention should be reviewed by product, engineering, and operations and recorded in a dated decision log.
