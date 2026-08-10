# GlocalX V2 Jira-Ready Delivery Backlog

**Source:** GlocalX V2 Product, Operations, and Delivery Blueprint  
**Prepared:** 16 July 2026  
**Status:** Ready for backlog review and Jira project mapping  
**Planning assumption:** Two full-stack engineers, one product/design owner, and part-time operations support

This document is structured for Atlassian Jira creation but does not create external issues. The target Atlassian site, Jira project key, issue-type names, workflow statuses, required custom fields, and team velocity must be confirmed before import.

## Backlog rules

- Create each E0 through E9 item as an Epic first.
- Create child Stories or Tasks only after its Epic key exists.
- Replace local IDs such as E2-S03 with the created Jira key in dependencies.
- Treat point values as initial refinement estimates, not commitments.
- Do not schedule production pilot work until external platform access gates are satisfied.
- Include automated and manual verification in each implementation ticket rather than deferring all quality work to the end.
- Preserve customer authority: no publication story is complete without immutable approval validation.

## Milestones

| Milestone              | Target window | Epics      | Observable release gate                                                                                    |
| ---------------------- | ------------: | ---------- | ---------------------------------------------------------------------------------------------------------- |
| M0: Stable foundation  |        Week 1 | E0         | Stable staging and production URLs, green CI, isolated environments, callback inventory verified.          |
| M1: Connected store    |     Weeks 2-3 | E1, E2     | Customer and admin deploy separately; pilot user can sign in and connect or accurately request GBP access. |
| M2: Supported customer |     Weeks 4-5 | E3         | Contextual chat reaches an admin inbox and AI-to-human takeover retains history.                           |
| M3: Approved creative  |     Weeks 6-8 | E4, E5, E6 | A request moves from signed upload to an immutable customer approval.                                      |
| M4: Published pilot    |    Weeks 9-10 | E7, E8, E9 | Approved content publishes reliably; recovery and audit work; preserved sections remain visually stable.   |

## Cross-cutting definition of done

Every ticket must satisfy the applicable conditions:

- Acceptance criteria are demonstrated through the user-facing or operator-facing surface.
- Type, lint, format, and relevant automated tests pass.
- Customer organization and staff permission checks are enforced server-side.
- Error responses include a stable safe code and correlation ID.
- Important state changes produce structured logs, metrics, and audit events.
- Accessibility includes keyboard access, visible focus, labels, contrast, and reduced-motion behavior.
- Desktop and mobile behavior are checked where customer UI is affected.
- Migrations have forward execution and recovery notes.
- Secrets, OAuth tokens, raw headers, and private media never appear in logs, analytics, or AI prompts.
- Customer-visible copy is reviewed.
- Documentation, runbooks, and operational ownership are updated.

---

## E0 — Stabilize deployment and delivery foundations

### Epic outcome

Restore a dependable deployment baseline and document the environmental contracts required by the V2 split.

### Success criteria

- Production and staging use stable verified hostnames.
- Main, dev, and feature-branch deployment behavior matches repository policy.
- Production data and credentials cannot be reached from preview deployments.
- OAuth callbacks are validated against actual deployed URLs.

### E0-S01 — Repair Vercel project linkage and production alias

**Type:** Task  
**Estimate:** 3 points  
**Suggested sprint:** 0  
**Dependencies:** None

**Requirements**

- Authenticate to the correct Vercel team and repository project.
- Confirm the intended production project and attach the canonical domain.
- Record the owning team, project, domain, and rollback contact in the runbook.

**Acceptance criteria**

- Production hostname returns the expected application with HTTP 200.
- The former DEPLOYMENT_NOT_FOUND condition is no longer reproducible.
- A fresh main deployment updates the same production project.
- Verified URL and date are recorded without exposing credentials.

### E0-S02 — Establish stable staging deployment from dev

**Type:** Task  
**Estimate:** 3 points  
**Suggested sprint:** 0  
**Dependencies:** E0-S01

**Requirements**

- Configure a stable staging hostname for dev.
- Keep feature previews separate from the stable staging alias.
- Document promotion from feature branch to dev to main.

**Acceptance criteria**

- A push to dev updates the staging deployment.
- A feature push creates a preview without changing staging or production.
- Staging and production hostnames are visibly distinguishable.

### E0-S03 — Isolate environment data, storage, queues, and secrets

**Type:** Task  
**Estimate:** 5 points  
**Suggested sprint:** 0  
**Dependencies:** E0-S02

**Requirements**

- Create an environment matrix for database, object storage, queue, encryption keys, OAuth clients, webhooks, and notifications.
- Ensure previews cannot receive production credentials.
- Add startup validation for required variables by application and environment.

**Acceptance criteria**

- Staging cannot read or write production data or media.
- Missing or inconsistent configuration fails safely with a useful deployment error.
- Secret values are absent from build output and client bundles.

### E0-S04 — Verify CI and deployment release gates

**Type:** Task  
**Estimate:** 3 points  
**Suggested sprint:** 0  
**Dependencies:** E0-S02, E0-S03

**Requirements**

- Preserve lint, type, test, format, and build checks.
- Define branch protection for dev and main.
- Add a deployment smoke check for customer and admin health endpoints when they exist.

**Acceptance criteria**

- A deliberately failing check blocks merge.
- A passing feature branch can be promoted through dev without a merge commit when eligible.
- Release runbook names owner, rollback method, and verification steps.

### E0-S05 — Inventory OAuth callbacks and platform prerequisites

**Type:** Task  
**Estimate:** 3 points  
**Suggested sprint:** 0  
**Dependencies:** E0-S01, E0-S02

**Requirements**

- List Google identity, Google Business Profile, Kakao, and planned Meta callbacks by environment.
- Confirm Google Business Profile API access and non-zero quota.
- Record Instagram eligibility and app-review requirements.

**Acceptance criteria**

- Staging callbacks complete on staging hostnames.
- Production callback inventory matches provider consoles.
- Unknown or unapproved platform prerequisites are visible release risks with owners.

---

## E1 — Separate customer and admin applications with staff authorization

### Epic outcome

Create independent customer and staff surfaces that share domain, data, integrations, and design tokens without sharing public access policies.

### Success criteria

- Customer and admin applications build and deploy independently.
- Admin has no public registration path.
- Permissions are enforced as server-side actions.
- Both surfaces retain the GlocalX visual system.

### E1-S01 — Create the V2 monorepo application and package boundaries

**Type:** Task  
**Estimate:** 8 points  
**Suggested sprint:** 1  
**Dependencies:** E0-S03

**Requirements**

- Establish apps/customer, apps/admin, packages/domain, packages/db, packages/integrations, and packages/ui.
- Move code incrementally with temporary compatibility only where required.
- Configure independent build targets and shared TypeScript settings.

**Acceptance criteria**

- Customer and admin applications build without importing each other.
- Shared packages expose explicit public entry points.
- Existing customer routes continue during migration.
- Circular dependency checks pass.

### E1-S02 — Extract and document shared GlocalX design tokens

**Type:** Task  
**Estimate:** 3 points  
**Suggested sprint:** 1  
**Dependencies:** E1-S01

**Requirements**

- Publish current colors, typography, spacing, radii, shadows, focus styles, and status semantics through packages/ui.
- Preserve Pretendard-first typography and warm app surface.
- Provide primitives for buttons, fields, cards, status chips, dialogs, and accessible icons.

**Acceptance criteria**

- Customer and admin consume one token source.
- Orange, mint, blue, ink, surface, and line tokens match the current app.
- Components pass keyboard and contrast checks.

### E1-S03 — Implement staff SSO and account lifecycle

**Type:** Story  
**Estimate:** 5 points  
**Suggested sprint:** 1  
**Dependencies:** E1-S01

**Requirements**

- Use an approved staff identity provider and allowlisted organization.
- Disable public admin registration.
- Support active, suspended, and revoked staff memberships.

**Acceptance criteria**

- Authorized staff can enter admin.
- A non-staff Google account is denied without revealing internal details.
- Revoked staff loses access on the next authorization check.
- Sign-in and denial are audited.

### E1-S04 — Implement action-based RBAC and tenant-safe repositories

**Type:** Task  
**Estimate:** 8 points  
**Suggested sprint:** 1  
**Dependencies:** E1-S01, E1-S03

**Requirements**

- Define customer owner, customer member, support, creative, publisher, operations manager, platform admin, and auditor actions.
- Resolve tenant server-side.
- Add repository helpers requiring tenant context.

**Acceptance criteria**

- Cross-tenant read and write tests fail closed.
- UI hiding is not the only permission control.
- Manual publishing override requires a distinct permission.
- Permission-denied events include a correlation ID without sensitive resource data.

### E1-S05 — Build the admin shell and navigation

**Type:** Story  
**Estimate:** 5 points  
**Suggested sprint:** 1  
**Dependencies:** E1-S02, E1-S03

**Requirements**

- Create desktop-first navigation for operations, access, support, marketing, approvals, publishing, customers, team, audit, and health.
- Provide responsive fallback for narrower screens.
- Include current user, environment, and safe sign-out.

**Acceptance criteria**

- Every route has a permission-aware empty, loading, error, and denied state.
- Active navigation and focus are visually clear.
- Admin uses GlocalX tokens and does not resemble a generic blue dashboard.

---

## E2 — Implement Google identity and Business Profile access

### Epic outcome

Let a customer sign in with Google, deliberately grant Business Profile management access, select a location, and complete a tracked direct or organization-access path.

### Success criteria

- Identity and GBP consent are separate grants.
- Accounts and locations are selected from authorized live resources.
- Manual, invitation, agency, and ownership access paths are represented honestly.
- Operators can see responsibility and status.

### E2-S01 — Separate Google identity sign-in from GBP management consent

**Type:** Story  
**Estimate:** 5 points  
**Suggested sprint:** 1  
**Dependencies:** E1-S01

**Requirements**

- Limit sign-in to openid, email, and profile.
- Start business.manage consent only from Connect Business Profile.
- Use state, PKCE, secure callback validation, and appropriate offline access.

**Acceptance criteria**

- Signing in does not request Business Profile management permission.
- The connect action explains the management permission.
- Callback state mismatch fails closed and is logged safely.
- Tokens are encrypted and never returned to the browser.

### E2-S02 — Build GBP account and location selection

**Type:** Story  
**Estimate:** 5 points  
**Suggested sprint:** 1  
**Dependencies:** E2-S01

**Requirements**

- List accessible GBP accounts and locations.
- Show enough safe metadata to choose the right store.
- Save one selected operational location per connection flow.

**Acceptance criteria**

- Empty, one-location, multi-location, API error, and revoked-grant states are covered.
- A user cannot select an inaccessible location by modifying a request.
- Selection survives session renewal.

### E2-S03 — Add GBP connection and access state machine

**Type:** Task  
**Estimate:** 5 points  
**Suggested sprint:** 1  
**Dependencies:** E2-S01, E2-S02

**Requirements**

- Implement NOT_CONNECTED through ACTIVE, DEGRADED, REAUTH_REQUIRED, and DISCONNECTED states.
- Record actor, reason, and timestamps for state changes.
- Expose a customer-safe status model.

**Acceptance criteria**

- Invalid transitions are rejected.
- Revocation moves the connection to REAUTH_REQUIRED.
- Customer and admin show the same canonical state with role-appropriate detail.

### E2-S04 — Implement guided organization and agency access requests

**Type:** Story  
**Estimate:** 8 points  
**Suggested sprint:** 1  
**Dependencies:** E2-S03

**Requirements**

- Model user invitation, business-group invitation, agency request, ownership request, and manual guidance.
- Show the GlocalX organization identifier and Google instructions where required.
- Track responsible party, deadline, evidence, and external reference.

**Acceptance criteria**

- The UI never promises automation for a Google-manual step.
- The business owner remains primary owner in guidance.
- The queue distinguishes customer action, GlocalX action, Google review, and verification.
- Staff can add an internal note without exposing it to the customer.

### E2-S05 — Add access verification, reauthentication, and operator queue

**Type:** Task  
**Estimate:** 5 points  
**Suggested sprint:** 1  
**Dependencies:** E2-S03, E2-S04

**Requirements**

- Schedule safe access verification.
- Detect permission degradation and revocation.
- Create admin filters for pending, overdue, active, degraded, and reauthentication-required connections.

**Acceptance criteria**

- Verification is idempotent and provider-rate-limit aware.
- Overdue access requests notify the assigned operator.
- A successful verification activates the selected location.
- Reauthentication does not lose the selected store relationship.

---

## E3 — Deliver contextual support with AI and human handoff

### Epic outcome

Give every customer a continuous assistant while letting operations control whether AI responds, suggests, or yields entirely to a human.

### Success criteria

- Support is reachable from every customer surface.
- Safe structured context accompanies the conversation.
- AI-to-human takeover retains history and prevents unauthorized AI replies.
- Sender identity is transparent.

### E3-S01 — Add persistent customer chat shell

**Type:** Story  
**Estimate:** 5 points  
**Suggested sprint:** 2  
**Dependencies:** E1-S02

**Requirements**

- Add corner launcher and side rail on desktop.
- Add bottom sheet or full-screen chat on mobile.
- Preserve route content, especially review and performance pages.

**Acceptance criteria**

- Launcher is keyboard accessible and does not obscure primary actions.
- Conversation persists across supported routes.
- Offline, reconnecting, failed send, and retry states are understandable.

### E3-S02 — Capture safe structured product context

**Type:** Task  
**Estimate:** 5 points  
**Suggested sprint:** 2  
**Dependencies:** E3-S01

**Requirements**

- Capture normalized surface, workflow stage, focused entity, last action, safe error, correlation ID, connection summary, client version, locale, and timezone.
- Create snapshots server-side.
- Use an allowlist and size limit.

**Acceptance criteria**

- An operator can identify where the customer became stuck.
- OAuth tokens, cookies, headers, image bytes, and raw logs are absent.
- Context snapshots remain historically accurate when the customer changes pages.

### E3-S03 — Build admin support inbox and conversation timeline

**Type:** Story  
**Estimate:** 8 points  
**Suggested sprint:** 2  
**Dependencies:** E1-S05, E3-S02

**Requirements**

- Support unassigned, mine, waiting, at-risk, and resolved queues.
- Show messages, context snapshots, assignments, mode changes, and linked business events.
- Provide internal notes and safe customer/store context.

**Acceptance criteria**

- Filters, pagination, assignment, and real-time or near-real-time updates work.
- Internal notes cannot be serialized into customer responses.
- An operator can open the exact linked marketing request or access case.

### E3-S04 — Enforce conversation modes and transparent senders

**Type:** Story  
**Estimate:** 5 points  
**Suggested sprint:** 2  
**Dependencies:** E3-S03

**Requirements**

- Implement AI_AUTO, AI_SUGGEST, HUMAN, and CLOSED.
- Enforce mode at message-send time.
- Display GlocalX assistant or named team member accurately.

**Acceptance criteria**

- AI cannot send in HUMAN or CLOSED.
- A mode change records actor, reason, previous mode, and next mode.
- A human takeover does not reset the thread.
- AI resumes only after an authorized explicit action.

### E3-S05 — Add AI grounding, escalation, and quality metrics

**Type:** Task  
**Estimate:** 8 points  
**Suggested sprint:** 2  
**Dependencies:** E3-S02, E3-S04

**Requirements**

- Ground responses in approved product state and playbooks.
- Escalate low confidence, sensitive requests, explicit human requests, and repeated failure.
- Measure containment, acceptance, handoff, resolution, reopen, and satisfaction.

**Acceptance criteria**

- Sensitive categories require human review.
- Prompt construction excludes non-allowlisted fields.
- Model and prompt version are recorded without unnecessary sensitive content.
- A global and per-conversation AI kill switch works.

---

## E4 — Build minimal marketing intake and durable media handling

### Epic outcome

Let customers submit original images and a short promotional brief without exposing production decisions.

### Success criteria

- Files upload directly to private object storage.
- Marketing submissions are idempotent and bind immutable source snapshots.
- Customers see status, not enhancement controls.
- Operators receive complete, safe inputs.

### E4-S01 — Implement signed direct media uploads

**Type:** Story  
**Estimate:** 8 points  
**Suggested sprint:** 3  
**Dependencies:** E0-S03, E1-S04

**Requirements**

- Issue short-lived signed upload intents.
- Use private, non-guessable storage keys.
- Record file metadata and owner before completion.

**Acceptance criteria**

- Bytes do not pass through an application route.
- Upload credentials cannot write outside the assigned key and limits.
- Incomplete uploads expire and are cleaned safely.
- Cross-tenant reads fail.

### E4-S02 — Validate, scan, and normalize media

**Type:** Task  
**Estimate:** 5 points  
**Suggested sprint:** 3  
**Dependencies:** E4-S01

**Requirements**

- Validate signature, type, size, dimensions, decode success, and duplicate checksum.
- Scan for malware.
- Strip unsafe metadata from derivatives while preserving originals privately.

**Acceptance criteria**

- Invalid, corrupt, unsafe, and oversized files produce actionable safe errors.
- A failed scan prevents request submission.
- Validation and scan results are auditable.

### E4-S03 — Build the customer marketing brief form

**Type:** Story  
**Estimate:** 5 points  
**Suggested sprint:** 3  
**Dependencies:** E4-S01, E1-S02

**Requirements**

- Collect images, a short what-and-how description, optional timing, offer dates, language, and channel preference.
- Provide raw input preview.
- Remove image-enhancement and variant-selection controls.

**Acceptance criteria**

- Required inputs are clear and accessible.
- Navigation away and recoverable network errors do not silently lose work.
- Customer sees exactly the source package being submitted.

### E4-S04 — Create idempotent marketing request submission

**Type:** Task  
**Estimate:** 5 points  
**Suggested sprint:** 3  
**Dependencies:** E4-S02, E4-S03

**Requirements**

- Create the marketing request, source snapshot, and initial event transactionally.
- Require owned, complete, scanned assets.
- Protect against duplicate clicks and request retries.

**Acceptance criteria**

- One logical submit creates one request.
- Submission binds asset checksums and brief content.
- Failed transactions do not leave a visible request without valid assets.

### E4-S05 — Show customer request status and notifications

**Type:** Story  
**Estimate:** 3 points  
**Suggested sprint:** 3  
**Dependencies:** E4-S04

**Requirements**

- Show action required, GlocalX working, ready for review, scheduled, published, and needs attention.
- Link support to the request context.
- Notify on blocking questions and ready-for-review events.

**Acceptance criteria**

- Status is derived from the canonical workflow.
- Color is not the only status signal.
- Notifications link to the exact request and expose no private preview content in their subject.

---

## E5 — Build the admin creative-production workflow

### Epic outcome

Give GlocalX operators a traceable queue and workspace for turning source material into internally reviewed, customer-ready versions.

### Success criteria

- Production work has state, priority, assignee, due time, and blocker.
- Original assets are immutable and derivatives retain lineage.
- Internal review is required before customer delivery.
- Internal content is technically separated from customer payloads.

### E5-S01 — Implement the marketing workflow state machine

**Type:** Task  
**Estimate:** 8 points  
**Suggested sprint:** 3  
**Dependencies:** E4-S04

**Requirements**

- Implement SUBMITTED through PUBLISHED, failure, rejection, and cancellation states from the blueprint.
- Centralize transition permissions and invariants.
- Emit transition audit and domain events transactionally.

**Acceptance criteria**

- Invalid transitions fail without changing state.
- Every transition records actor, reason, prior state, next state, and time.
- Concurrent transitions cannot skip internal review or approval.

### E5-S02 — Build the admin marketing queue

**Type:** Story  
**Estimate:** 5 points  
**Suggested sprint:** 3  
**Dependencies:** E1-S05, E5-S01

**Requirements**

- Filter and sort by state, assignee, due time, priority, customer, and blocker.
- Support assignment and reassignment.
- Highlight service-level risk and unassigned work.

**Acceptance criteria**

- Queue counts reconcile with filtered results.
- Assignment updates are audited.
- Operators cannot see stores outside their permitted scope.
- Empty and backlog-overload states are actionable.

### E5-S03 — Add derivative lineage and private preview service

**Type:** Task  
**Estimate:** 5 points  
**Suggested sprint:** 3  
**Dependencies:** E4-S02

**Requirements**

- Link every derivative to its source, purpose, tool, version, operator, and checksum.
- Serve previews through short-lived signed reads or authenticated proxy routes.
- Define retention classes.

**Acceptance criteria**

- Original assets are never overwritten.
- Expired preview URLs cannot be reused.
- Deleting an unreferenced derivative does not delete its source.
- Lineage is visible to authorized operators.

### E5-S04 — Build the creative workspace

**Type:** Story  
**Estimate:** 8 points  
**Suggested sprint:** 3  
**Dependencies:** E5-S02, E5-S03

**Requirements**

- Show brief, source media, store profile, derivatives, channel copy, alt text, links, notes, and checklist.
- Provide channel-size previews and validation.
- Support draft version creation.

**Acceptance criteria**

- Draft changes cannot mutate a delivered version.
- Required channel fields are validated before internal review.
- Internal notes are explicitly marked and excluded from customer serialization.
- Keyboard operation covers primary authoring actions.

### E5-S05 — Enforce internal review and customer-safe delivery

**Type:** Story  
**Estimate:** 5 points  
**Suggested sprint:** 3  
**Dependencies:** E5-S04

**Requirements**

- Require a production checklist and authorized reviewer.
- Allow return to production with structured feedback.
- Freeze the customer payload and content hash on delivery.

**Acceptance criteria**

- Creator and reviewer separation can be configured by policy.
- Failed checks block delivery.
- Customer payload contains no internal notes, hidden derivatives, or unsafe provider metadata.
- Ready-for-customer notification references the frozen version.

---

## E6 — Deliver customer approval, rejection, and revision

### Epic outcome

Give the customer a clear go or no-go decision over the exact content and channel adaptations that GlocalX intends to publish.

### Success criteria

- Approval binds an immutable version and hash.
- Revision produces a new version rather than overwriting history.
- Stale or replayed decisions fail safely.
- Approval history is visible to authorized users and staff.

### E6-S01 — Build the customer approval center

**Type:** Story  
**Estimate:** 5 points  
**Suggested sprint:** 4  
**Dependencies:** E5-S05

**Requirements**

- Show media, copy, channel adaptations, schedule, alt text, and required disclaimers.
- Present approve, request revision, and reject actions.
- Distinguish current, superseded, decided, and expired versions.

**Acceptance criteria**

- Customer can inspect the exact planned payload at mobile and desktop widths.
- Superseded versions cannot show an active approval action.
- Current store and channel targets are clear.

### E6-S02 — Implement immutable approval decisions

**Type:** Task  
**Estimate:** 5 points  
**Suggested sprint:** 4  
**Dependencies:** E6-S01

**Requirements**

- Require version ID and content hash.
- Make decisions idempotent.
- Record customer actor, decision, feedback, and time.

**Acceptance criteria**

- A stale hash is rejected.
- Repeating the same request returns the existing decision.
- A different decision after final approval requires an authorized workflow.
- Audit history proves which content was approved.

### E6-S03 — Add revision and rejection workflows

**Type:** Story  
**Estimate:** 5 points  
**Suggested sprint:** 4  
**Dependencies:** E6-S02, E5-S01

**Requirements**

- Require actionable feedback for revision.
- Support structured rejection reasons.
- Return revision requests to production and preserve all prior versions.

**Acceptance criteria**

- A revision creates a new version sequence.
- Prior decisions remain read-only.
- Staff receive feedback and due-time updates.
- Rejection does not accidentally schedule publication.

### E6-S04 — Prevent post-approval mutation

**Type:** Task  
**Estimate:** 5 points  
**Suggested sprint:** 4  
**Dependencies:** E6-S02

**Requirements**

- Lock approved version payloads.
- Invalidate scheduling if a material field changes through an authorized clone.
- Revalidate approval immediately before publication.

**Acceptance criteria**

- Direct database or API mutation attempts fail through normal application access.
- A cloned changed version has no approval.
- Publication worker rejects a hash or approval mismatch before external side effects.

---

## E7 — Publish approved content to multiple platforms

### Epic outcome

Publish approved creative through reliable per-channel jobs, starting with Google Business Profile and adding Instagram when platform prerequisites are complete.

### Success criteria

- Every channel has an independent, idempotent job.
- GBP publication works against approved test locations.
- Instagram availability is represented accurately.
- Partial failure and ambiguous success are recoverable.

### E7-S01 — Implement channel-independent publication jobs

**Type:** Task  
**Estimate:** 8 points  
**Suggested sprint:** 4  
**Dependencies:** E6-S04, E0-S03

**Requirements**

- Store approved version, target, payload, schedule, idempotency key, lease, status, and remote result.
- Create one job per channel.
- Derive aggregate request status.

**Acceptance criteria**

- Duplicate scheduling creates no duplicate logical job.
- Channel success and failure are independent.
- Aggregate status correctly reports published, partial failure, or failed.
- Only approved frozen versions can create jobs.

### E7-S02 — Add durable worker execution, leases, and retries

**Type:** Task  
**Estimate:** 8 points  
**Suggested sprint:** 4  
**Dependencies:** E7-S01

**Requirements**

- Support at-least-once delivery, expiring leases, retry classification, exponential backoff with jitter, and dead-letter recovery.
- Apply per-provider concurrency and rate limits.
- Use transactional outbox delivery.

**Acceptance criteria**

- A crashed worker releases work after lease expiry.
- Retryable and terminal errors diverge correctly.
- Queue replay does not duplicate external posts.
- Queue age and failure metrics are available.

### E7-S03 — Implement Google Business Profile local-post publishing

**Type:** Story  
**Estimate:** 8 points  
**Suggested sprint:** 4  
**Dependencies:** E2-S05, E7-S02

**Requirements**

- Adapt the approved creative to the supported GBP Local Posts payload.
- Revalidate access and consent.
- Store remote ID and URL where available.

**Acceptance criteria**

- A test location receives the approved content.
- Revoked or degraded access stops before posting and creates a recovery action.
- Provider request IDs and safe errors are traceable.
- Remote success is reconciled after an acknowledgement timeout.

### E7-S04 — Implement Instagram connection and publishing path

**Type:** Story  
**Estimate:** 8 points  
**Suggested sprint:** 4 or deferred  
**Dependencies:** E0-S05, E7-S02

**Requirements**

- Validate business account linkage, scopes, review, media constraints, and token lifecycle.
- Adapt approved content without changing its customer-approved meaning.
- Feature-flag production availability.

**Acceptance criteria**

- Production publishing is enabled only when platform eligibility is verified.
- Customer UI distinguishes live integration from operator-assisted fallback.
- Token expiry and revoked access create recoverable states.
- Test business account receives the approved media and caption.

### E7-S05 — Build publishing console and partial-failure recovery

**Type:** Story  
**Estimate:** 8 points  
**Suggested sprint:** 4  
**Dependencies:** E7-S01, E7-S02, E7-S03

**Requirements**

- Show jobs, attempts, provider status, approved version, and safe errors.
- Provide retry, reschedule, skip, and mark externally completed actions under permission.
- Require reasons for overrides.

**Acceptance criteria**

- Operators can resolve a scripted partial failure without duplicate posting.
- Recovery actions are audited.
- Customer receives an accurate safe status.
- Duplicate-detection and remote reconciliation are available before manual retry.

---

## E8 — Add security, observability, notifications, and pilot operations

### Epic outcome

Make the service operable and safe enough for a controlled external pilot.

### Success criteria

- Important workflows have metrics, traces, alerts, and runbooks.
- Security controls protect tenants, credentials, media, approvals, and AI prompts.
- Notifications prompt the correct responsible party.
- The team completes a full pilot rehearsal.

### E8-S01 — Implement structured audit and domain-event outbox

**Type:** Task  
**Estimate:** 5 points  
**Suggested sprint:** 2  
**Dependencies:** E1-S04

**Requirements**

- Extend the existing audit system.
- Add transactional domain-event outbox records.
- Define actor, tenant, resource, transition, reason, source, and correlation fields.

**Acceptance criteria**

- State and outbox event commit atomically.
- Audit search redacts protected fields.
- Event replay is idempotent.
- Authorized auditor can trace one case end to end.

### E8-S02 — Instrument product, support, and reliability metrics

**Type:** Task  
**Estimate:** 5 points  
**Suggested sprint:** 4  
**Dependencies:** E3-S05, E7-S02

**Requirements**

- Capture activation funnel, time to ready, approval, revisions, publication, support, queue, OAuth, and connection health.
- Define event schemas and dashboards.
- Separate customer analytics from operational logs.

**Acceptance criteria**

- Metrics reconcile with sampled source records.
- No secret or unnecessary message content appears in telemetry.
- Operations can identify service-level risk and provider degradation.

### E8-S03 — Add customer and staff notifications

**Type:** Story  
**Estimate:** 5 points  
**Suggested sprint:** 4  
**Dependencies:** E2-S05, E5-S05, E6-S03, E7-S05

**Requirements**

- Notify customers for access actions, questions, ready versions, staff replies, and publication status.
- Notify staff for handoffs, overdue work, blocked production, and publication failure.
- Link to the exact entity.

**Acceptance criteria**

- Duplicate events do not send duplicate notifications.
- Subjects and lock-screen content contain no private creative or sensitive account detail.
- Delivery and failure are observable.
- Customer preferences are respected.

### E8-S04 — Complete V2 threat model and hardening

**Type:** Task  
**Estimate:** 8 points  
**Suggested sprint:** 4  
**Dependencies:** E1-S04, E2-S01, E4-S02, E6-S04, E7-S02

**Requirements**

- Review cross-tenant access, token theft, staff takeover, prompt injection, media leakage, forged approval, queue replay, and duplicate publication.
- Add prioritized mitigations.
- Review retention and deletion.

**Acceptance criteria**

- Critical and high findings are fixed or explicitly accepted by accountable owners before pilot.
- Token rotation and staff revocation are tested.
- Prompt injection exercises cannot expose secrets or bypass mode and approval controls.
- Security runbook names response owners.

### E8-S05 — Run pilot rehearsal and train operators

**Type:** Task  
**Estimate:** 5 points  
**Suggested sprint:** 4  
**Dependencies:** E2-S05, E3-S05, E6-S04, E7-S05, E8-S04

**Requirements**

- Exercise direct and manual GBP access, valid and invalid media, support takeover, revision, approval, publication, retry, ambiguous success, and partial failure.
- Train support, creative, publishing, and incident owners.
- Capture observed timing and human effort.

**Acceptance criteria**

- Every scenario has recorded evidence and outcome.
- Blocking defects are closed or pilot scope is explicitly reduced.
- Operators can complete their queue without developer database access.
- Pilot cohort, owner, support path, and success thresholds are documented.

---

## E9 — Preserve review and performance stub surfaces

### Epic outcome

Keep current review and performance experiences visually stable and deterministically stub-backed while the rest of the application moves to V2.

### Success criteria

- Existing routes, layouts, and fixture contracts remain intact.
- Chat can overlay the pages without regression.
- No stub value is presented as live store data.
- Future adapters can replace fixtures later.

### E9-S01 — Capture visual and contract baselines

**Type:** Task  
**Estimate:** 3 points  
**Suggested sprint:** 0  
**Dependencies:** None

**Requirements**

- Capture approved desktop and mobile screenshots.
- Record fixture payload contracts.
- Define visual-diff tolerance.

**Acceptance criteria**

- Baselines cover loading, content, empty, and relevant responsive states.
- Fixtures are deterministic.
- Baseline assets are available to CI without including customer data.

### E9-S02 — Isolate review and performance fixtures behind adapters

**Type:** Task  
**Estimate:** 3 points  
**Suggested sprint:** 1  
**Dependencies:** E1-S01, E9-S01

**Requirements**

- Keep fixture data independent of new production queries.
- Expose a stable adapter contract for future live data.
- Preserve current customer UI components.

**Acceptance criteria**

- V2 database changes do not alter displayed fixture values.
- Local, preview, staging, and production show the same fixture scenario.
- The adapter can be feature-flagged without changing the page API.

### E9-S03 — Integrate contextual chat without page regression

**Type:** Story  
**Estimate:** 3 points  
**Suggested sprint:** 2  
**Dependencies:** E3-S01, E9-S01

**Requirements**

- Add the global support launcher and Reviews or Performance context.
- Avoid covering page controls and mobile navigation.
- Preserve scroll and focus behavior.

**Acceptance criteria**

- Visual regression passes at approved desktop and mobile widths.
- Context snapshots identify the correct surface.
- Chat open and closed states remain keyboard accessible.

### E9-S04 — Label fixture-backed insights honestly

**Type:** Story  
**Estimate:** 2 points  
**Suggested sprint:** 2  
**Dependencies:** E9-S02

**Requirements**

- Reuse an existing preview or stub label if present.
- Otherwise add a quiet, non-disruptive label approved by product.
- Keep all existing information hierarchy intact.

**Acceptance criteria**

- A reasonable customer does not interpret figures as live data.
- Label is visible to assistive technology.
- Current layout and visual hierarchy do not materially change.

---

## Dependency summary

| Gate                     | Blocking work                                |
| ------------------------ | -------------------------------------------- |
| Stable environments      | E0-S01 through E0-S05                        |
| Admin access             | E1-S03 and E1-S04                            |
| Connected store          | E2-S01 through E2-S05                        |
| Human-supported customer | E3-S01 through E3-S05                        |
| Valid submission         | E4-S01 through E4-S04                        |
| Customer-ready version   | E5-S01 through E5-S05                        |
| Publish authorization    | E6-S01 through E6-S04                        |
| Production publication   | E7-S01 through E7-S05                        |
| External pilot           | E8-S01 through E8-S05 and E9 regression gate |

## Initial sizing summary

| Epic      |  Points | Primary window      |
| --------- | ------: | ------------------- |
| E0        |      17 | Sprint 0            |
| E1        |      29 | Sprint 1            |
| E2        |      28 | Sprint 1            |
| E3        |      31 | Sprint 2            |
| E4        |      26 | Sprint 3            |
| E5        |      31 | Sprint 3            |
| E6        |      20 | Sprint 4            |
| E7        |      40 | Sprint 4            |
| E8        |      28 | Sprints 2-4         |
| E9        |      11 | Sprints 0-2         |
| **Total** | **261** | Planning input only |

The total should not be divided mechanically by nominal velocity. Platform approvals, monorepo migration, staff availability, and operational rehearsal create dependencies that affect elapsed time.

## Jira publication procedure

Follow this sequence after the user supplies the Atlassian site and Jira project key:

1. Retrieve available Jira issue types and required fields for the project.
2. Map Epic, Story, Task, and any custom status or point fields.
3. Present the E0-E9 breakdown and issue count for confirmation.
4. Create one Epic at a time and capture its Jira key.
5. Create that Epic’s child tickets with the captured parent key.
6. Replace local dependency IDs with Jira issue links.
7. Add milestone, component, platform, risk, and release-gate labels as supported.
8. Return a summary containing direct links to every created Epic and child issue.

Recommended labels:

- glocalx-v2
- customer-portal
- admin-dashboard
- google-business-profile
- contextual-support
- creative-operations
- approval
- publishing
- security
- pilot
- preserved-stub

## Backlog review checklist

- Product confirms customer scope and non-goals.
- Engineering confirms package boundaries, storage, queue, and provider feasibility.
- Operations confirms queues, roles, service policies, and recovery actions.
- Security confirms privileged access, token, media, approval, and AI controls.
- Founders confirm vertical, geography, languages, service levels, pilot size, pricing hypothesis, and Instagram promise.
- Jira owner confirms project key, issue types, fields, workflow, and estimation scale.

Only after this review should the local backlog be materialized as external Atlassian issues.
