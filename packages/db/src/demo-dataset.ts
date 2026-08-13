import {
  demoCohortStoreIds,
  demoStoreId,
  demoUserId,
} from "./demo-identifiers.ts"

// Single source of truth for the deterministic demo dataset (Phase 5 cohort
// readiness). The two seeders — SQLite (INSERT OR IGNORE) and Postgres
// (ON CONFLICT DO UPDATE) — both serialize this same data, so the dialects can
// never drift the way they did before (Postgres used to seed only a user + one
// store while SQLite seeded a full happy-path store). Rows are plain data;
// object/array values are JSON columns (stringified for SQLite, passed through
// as jsonb for Postgres) and everything else is a scalar the column accepts.
//
// Two tiers:
//   - demoBaseTables — the happy-path `demo-store` and its rows. This is what
//     seedDemoData() writes and what ~40 unit tests seed as their fixture, so
//     it is preserved verbatim from the pre-Phase-5 seed. Tests read specific
//     ids (demo-gbp-location, demo-oauth-google, demo-post-draft,
//     demo-conversation-session, …), so these must not change.
//   - demoCohortTables — additional `demo-store-*` stores layered on top only
//     by the demo/staging seed path (db:reset, db:seed, db:pg:seed). They light
//     up every operator-visible pipeline state across the Stores, Queue, and
//     Inbox consoles without perturbing the unit-test fixture.

export type DemoValue =
  | string
  | number
  | boolean
  | null
  | Readonly<Record<string, unknown>>
  | ReadonlyArray<unknown>

export type DemoRow = Readonly<Record<string, DemoValue>>

export type DemoTable = {
  // A hardcoded table name — never request-derived — so both seeders can
  // interpolate it as an identifier safely.
  readonly table: string
  readonly rows: readonly DemoRow[]
}

// demo-store keeps its original 2026-06-04 timestamp; the cohort stores use
// later dates so (a) demo-store stays the oldest store the owner-app "oldest
// store" login resolves, and (b) the queue kanban orders them sensibly.
const HAPPY_PATH_AT = "2026-06-04T00:00:00.000Z"
const ONBOARDING_AT = "2026-07-28T02:00:00.000Z"
const INVITED_AT = "2026-07-24T05:00:00.000Z"
const PENDING_AT = "2026-07-25T06:00:00.000Z"
const REVIEW_AT = "2026-07-27T08:00:00.000Z"
const PARTIAL_AT = "2026-07-26T09:00:00.000Z"
const BLOCKED_AT = "2026-07-23T04:00:00.000Z"

// ---------------------------------------------------------------------------
// Base tier: the happy-path demo-store (verbatim from the pre-Phase-5 seed).
// ---------------------------------------------------------------------------

export const demoBaseTables: readonly DemoTable[] = [
  {
    table: "users",
    rows: [
      {
        id: demoUserId,
        email: "demo-owner@glocalx.example",
        display_name: "Demo Owner",
        role: "OWNER",
        created_at: HAPPY_PATH_AT,
      },
    ],
  },
  {
    table: "stores",
    rows: [
      {
        id: demoStoreId,
        owner_user_id: demoUserId,
        name: "브런치모먼트 홍대점",
        address: "서울 마포구 와우산로 123",
        phone: "02-123-4567",
        category: "브런치 카페",
        hours: "09:00 ~ 21:00",
        onboarding_status: "COMPLETED",
        created_at: HAPPY_PATH_AT,
      },
    ],
  },
  {
    table: "auth_identities",
    rows: [
      {
        id: "demo-auth-google",
        user_id: demoUserId,
        provider: "GOOGLE",
        provider_subject_id: "demo-google-login-subject",
        email: "demo-owner@glocalx.example",
        display_name: "Demo Owner",
        encrypted_access_token: "encrypted:demo-login-access-token",
        encrypted_refresh_token: "encrypted:demo-login-refresh-token",
        scopes_json: ["openid", "email", "profile"],
        expires_at: "2026-06-05T00:00:00.000Z",
        created_at: HAPPY_PATH_AT,
        updated_at: HAPPY_PATH_AT,
      },
    ],
  },
  {
    table: "business_profile_extractions",
    rows: [
      {
        id: "demo-extraction",
        store_id: demoStoreId,
        source: "NAVER_LOCAL",
        source_input: "https://naver.me/mybrunchcafe",
        status: "CONFIRMED",
        candidate_json: { name: "브런치모먼트 홍대점" },
        missing_fields_json: ["hours"],
        created_at: HAPPY_PATH_AT,
      },
    ],
  },
  {
    table: "oauth_connections",
    rows: [
      {
        id: "demo-oauth-google",
        store_id: demoStoreId,
        provider: "GOOGLE",
        subject_id: "demo-google-subject",
        encrypted_access_token: "encrypted:demo-access-token",
        encrypted_refresh_token: "encrypted:demo-refresh-token",
        scopes_json: ["https://www.googleapis.com/auth/business.manage"],
        expires_at: "2026-06-05T00:00:00.000Z",
        created_at: HAPPY_PATH_AT,
      },
    ],
  },
  {
    table: "gbp_accounts",
    rows: [
      {
        id: "demo-gbp-account",
        store_id: demoStoreId,
        google_account_id: "accounts/demo",
        account_name: "Demo GBP Account",
        created_at: HAPPY_PATH_AT,
      },
    ],
  },
  {
    table: "gbp_locations",
    rows: [
      {
        id: "demo-gbp-location",
        store_id: demoStoreId,
        gbp_account_id: "demo-gbp-account",
        google_location_id: "locations/demo",
        status: "VERIFIED",
        request_admin_rights_url: null,
        created_at: HAPPY_PATH_AT,
        updated_at: HAPPY_PATH_AT,
      },
    ],
  },
  {
    // Instagram link so demo-store has both publish channels eligible.
    table: "store_channel_links",
    rows: [
      {
        id: "demo-instagram-link",
        store_id: demoStoreId,
        channel: "instagram",
        external_account_ref: "17841400000000000",
        encrypted_token: null,
        status: "linked",
        created_at: HAPPY_PATH_AT,
        updated_at: HAPPY_PATH_AT,
      },
    ],
  },
  {
    // The campaign publish path publishes GBP from the ORG account, so without
    // this row every demo/e2e publish would correctly fail as unconfigured.
    table: "org_credentials",
    rows: [
      {
        id: "demo-org-google",
        provider: "google_org",
        encrypted_token: "encrypted:demo-org-access-token",
        encrypted_refresh_token: "encrypted:demo-org-refresh-token",
        expires_at: null,
        scopes: "https://www.googleapis.com/auth/business.manage",
        created_at: HAPPY_PATH_AT,
        updated_at: HAPPY_PATH_AT,
      },
    ],
  },
  {
    table: "post_drafts",
    rows: [
      {
        id: "demo-post-draft",
        store_id: demoStoreId,
        owner_intent: "주말 브런치 신메뉴 홍보",
        target_channel: "GBP",
        status: "DRAFT",
        korean_copy: "이번 주말 브런치 신메뉴를 만나보세요.",
        english_copy: "Try our new weekend brunch menu.",
        revision_of_draft_id: null,
        marketing_preview_json: null,
        created_at: HAPPY_PATH_AT,
      },
    ],
  },
  {
    table: "post_publish_attempts",
    rows: [
      {
        id: "demo-post-attempt",
        draft_id: "demo-post-draft",
        idempotency_key: "demo-post-publish-key",
        attempt_number: 1,
        status: "SUCCEEDED",
        gbp_post_id: "gbp-post-demo",
        public_url: "https://business.google.com/demo-post",
        error_code: null,
        created_at: HAPPY_PATH_AT,
      },
    ],
  },
  {
    table: "reviews",
    rows: [
      {
        id: "demo-review",
        store_id: demoStoreId,
        source_channel: "GBP",
        raw_review_id: "raw-review-demo",
        rating: 5,
        reviewer_name: "Alex",
        review_text: "Great brunch and kind staff.",
        detected_language: "en",
        sentiment: "POSITIVE",
        created_at: HAPPY_PATH_AT,
        reply_status: "SUGGESTED",
      },
    ],
  },
  {
    table: "review_replies",
    rows: [
      {
        id: "demo-review-reply",
        review_id: "demo-review",
        selected_tone: "polite",
        reply_text:
          "정성스러운 리뷰 감사합니다. 다시 찾아주시면 더 좋은 브런치로 보답하겠습니다.",
        translated_reply_text:
          "Thank you for your thoughtful review. We hope to welcome you again.",
        status: "DRAFT",
        gbp_reply_id: null,
        created_at: HAPPY_PATH_AT,
      },
    ],
  },
  {
    table: "conversation_sessions",
    rows: [
      {
        id: "demo-conversation-session",
        store_id: demoStoreId,
        kind: "onboarding",
        state: "profile_summary",
        status: "active",
        selected_candidate_id: "naver-demo-candidate",
        selected_candidate_json: { name: "브런치모먼트 홍대점" },
        support_metadata_json: {
          channel: "support",
          phone: "[REDACTED_PHONE]",
        },
        created_at: HAPPY_PATH_AT,
        updated_at: HAPPY_PATH_AT,
        completed_at: null,
      },
    ],
  },
  {
    table: "conversation_messages",
    rows: [
      {
        id: "demo-conversation-message-owner",
        session_id: "demo-conversation-session",
        role: "owner",
        client_event_id: "demo-client-event",
        content: "전화번호는 02-1234-5678입니다.",
        redacted_content: "전화번호는 [REDACTED_PHONE]입니다.",
        sequence: 1,
        created_at: HAPPY_PATH_AT,
      },
      {
        id: "demo-conversation-message-assistant",
        session_id: "demo-conversation-session",
        role: "assistant",
        client_event_id: null,
        content: "확인했어요. 요약을 보여드릴게요.",
        redacted_content: "확인했어요. 요약을 보여드릴게요.",
        sequence: 2,
        created_at: HAPPY_PATH_AT,
      },
    ],
  },
  {
    table: "conversation_slot_values",
    rows: [
      {
        id: "demo-conversation-slot-phone",
        session_id: "demo-conversation-session",
        slot_key: "phone",
        value: "02-1234-5678",
        source: "owner_message",
        confidence: 0.97,
        created_at: HAPPY_PATH_AT,
        updated_at: HAPPY_PATH_AT,
      },
    ],
  },
  {
    table: "conversation_events",
    rows: [
      {
        id: "demo-conversation-event",
        session_id: "demo-conversation-session",
        client_event_id: "demo-client-event",
        event_type: "turn_recorded",
        response_message_id: "demo-conversation-message-assistant",
        public_response_json: {
          assistantMessage: "확인했어요. 요약을 보여드릴게요.",
        },
        redacted_payload_json: {
          ownerMessage: "전화번호는 [REDACTED_PHONE]입니다.",
        },
        created_at: HAPPY_PATH_AT,
      },
    ],
  },
  {
    table: "job_runs",
    rows: [
      {
        id: "demo-job-run",
        store_id: demoStoreId,
        job_type: "REVIEW_SYNC",
        status: "SCHEDULED",
        idempotency_key: "demo-review-sync-key",
        run_after: "2026-06-04T00:15:00.000Z",
        attempts: 0,
        created_at: HAPPY_PATH_AT,
        updated_at: HAPPY_PATH_AT,
      },
    ],
  },
  {
    table: "audit_logs",
    rows: [
      {
        id: "demo-audit-log",
        store_id: demoStoreId,
        actor_user_id: demoUserId,
        action: "demo.seed",
        idempotency_key: "demo-seed-key",
        redacted_payload_json: { token: "[REDACTED]" },
        created_at: HAPPY_PATH_AT,
      },
    ],
  },
]

// ---------------------------------------------------------------------------
// Cohort tier: additional stores placing the operator consoles across every
// pipeline state. Layered on top of the base tier by the demo/staging seed
// path only (never by the unit-test seedDemoData fixture). All owned by
// demoUserId and all created after demo-store, so demo-store stays the oldest.
// ---------------------------------------------------------------------------

export const demoCohortTables: readonly DemoTable[] = [
  {
    table: "stores",
    rows: [
      {
        id: demoCohortStoreIds.onboarding,
        owner_user_id: demoUserId,
        name: "김밥천국 신촌점",
        address: "서울 서대문구 신촌로 45",
        phone: "02-320-1000",
        category: "분식",
        hours: "08:00 ~ 22:00",
        onboarding_status: "IN_PROGRESS",
        created_at: ONBOARDING_AT,
      },
      {
        id: demoCohortStoreIds.invited,
        owner_user_id: demoUserId,
        name: "동네빵집 망원점",
        address: "서울 마포구 망원로 12",
        phone: "02-333-2200",
        category: "베이커리",
        hours: "07:30 ~ 21:00",
        onboarding_status: "COMPLETED",
        created_at: INVITED_AT,
      },
      {
        id: demoCohortStoreIds.pending,
        owner_user_id: demoUserId,
        name: "헤어살롱 연남점",
        address: "서울 마포구 연남로 30",
        phone: "02-334-5566",
        category: "미용실",
        hours: "10:00 ~ 20:00",
        onboarding_status: "COMPLETED",
        created_at: PENDING_AT,
      },
      {
        id: demoCohortStoreIds.review,
        owner_user_id: demoUserId,
        name: "필라테스 합정점",
        address: "서울 마포구 양화로 60",
        phone: "02-337-7788",
        category: "필라테스 스튜디오",
        hours: "06:00 ~ 23:00",
        onboarding_status: "COMPLETED",
        created_at: REVIEW_AT,
      },
      {
        id: demoCohortStoreIds.partial,
        owner_user_id: demoUserId,
        name: "분식상회 상수점",
        address: "서울 마포구 독막로 20",
        phone: "02-338-9900",
        category: "분식",
        hours: "11:00 ~ 21:00",
        onboarding_status: "COMPLETED",
        created_at: PARTIAL_AT,
      },
      {
        id: demoCohortStoreIds.blocked,
        owner_user_id: demoUserId,
        name: "카페 홍대입구점",
        address: "서울 마포구 홍익로 5",
        phone: "02-339-1122",
        category: "카페",
        hours: "09:00 ~ 22:00",
        onboarding_status: "COMPLETED",
        created_at: BLOCKED_AT,
      },
    ],
  },
  {
    table: "business_profile_extractions",
    rows: [
      {
        id: "demo-extraction-onboarding",
        store_id: demoCohortStoreIds.onboarding,
        source: "NAVER_LOCAL",
        source_input: "https://naver.me/kimbabsinchon",
        status: "CANDIDATES_FOUND",
        candidate_json: { name: "김밥천국 신촌점" },
        missing_fields_json: ["hours", "category"],
        created_at: ONBOARDING_AT,
      },
    ],
  },
  {
    // gbp_accounts / gbp_locations for every cohort store that has reached GBP
    // setup. The onboarding store has not, so it gets neither — its owner
    // GBP-access card shows the "not yet requested" phase.
    table: "gbp_accounts",
    rows: [
      {
        id: "demo-gbp-account-invited",
        store_id: demoCohortStoreIds.invited,
        google_account_id: "accounts/demo-invited",
        account_name: "동네빵집 GBP",
        created_at: INVITED_AT,
      },
      {
        id: "demo-gbp-account-pending",
        store_id: demoCohortStoreIds.pending,
        google_account_id: "accounts/demo-pending",
        account_name: "헤어살롱 GBP",
        created_at: PENDING_AT,
      },
      {
        id: "demo-gbp-account-review",
        store_id: demoCohortStoreIds.review,
        google_account_id: "accounts/demo-review",
        account_name: "필라테스 GBP",
        created_at: REVIEW_AT,
      },
      {
        id: "demo-gbp-account-partial",
        store_id: demoCohortStoreIds.partial,
        google_account_id: "accounts/demo-partial",
        account_name: "분식상회 GBP",
        created_at: PARTIAL_AT,
      },
      {
        id: "demo-gbp-account-blocked",
        store_id: demoCohortStoreIds.blocked,
        google_account_id: "accounts/demo-blocked",
        account_name: "카페 홍대입구 GBP",
        created_at: BLOCKED_AT,
      },
    ],
  },
  {
    table: "gbp_locations",
    rows: [
      {
        id: "demo-gbp-location-invited",
        store_id: demoCohortStoreIds.invited,
        gbp_account_id: "demo-gbp-account-invited",
        google_location_id: "locations/demo-invited",
        status: "CLAIM_REQUIRED",
        request_admin_rights_url:
          "https://business.google.com/claim/demo-invited",
        created_at: INVITED_AT,
        updated_at: INVITED_AT,
      },
      {
        id: "demo-gbp-location-pending",
        store_id: demoCohortStoreIds.pending,
        gbp_account_id: "demo-gbp-account-pending",
        google_location_id: "locations/demo-pending",
        status: "VERIFICATION_PENDING",
        request_admin_rights_url: null,
        created_at: PENDING_AT,
        updated_at: PENDING_AT,
      },
      {
        id: "demo-gbp-location-review",
        store_id: demoCohortStoreIds.review,
        gbp_account_id: "demo-gbp-account-review",
        google_location_id: "locations/demo-review",
        status: "VERIFIED",
        request_admin_rights_url: null,
        created_at: REVIEW_AT,
        updated_at: REVIEW_AT,
      },
      {
        id: "demo-gbp-location-partial",
        store_id: demoCohortStoreIds.partial,
        gbp_account_id: "demo-gbp-account-partial",
        google_location_id: "locations/demo-partial",
        status: "VERIFIED",
        request_admin_rights_url: null,
        created_at: PARTIAL_AT,
        updated_at: PARTIAL_AT,
      },
      {
        id: "demo-gbp-location-blocked",
        store_id: demoCohortStoreIds.blocked,
        gbp_account_id: "demo-gbp-account-blocked",
        google_location_id: "locations/demo-blocked",
        status: "VERIFIED",
        request_admin_rights_url: null,
        created_at: BLOCKED_AT,
        updated_at: BLOCKED_AT,
      },
    ],
  },
  {
    // gbp_access_requests (Phase 4): the operator Stores console works this
    // table. One row per cohort store that has requested access, covering the
    // states the console renders. The onboarding store is deliberately absent
    // (its owner phase is "not yet requested"). demo-store is also absent on
    // purpose — the cross-app e2e harness seeds its own not_requested row for
    // demo-store and drives it through the flow, so a seeded row here would
    // collide on the one-request-per-store unique index.
    table: "gbp_access_requests",
    rows: [
      {
        id: "demo-gbp-access-invited",
        store_id: demoCohortStoreIds.invited,
        gbp_location_ref: "locations/demo-invited",
        state: "invited",
        note: "Invite email sent; owner has not accepted yet.",
        requested_at: INVITED_AT,
        granted_at: null,
        created_at: INVITED_AT,
        updated_at: INVITED_AT,
      },
      {
        id: "demo-gbp-access-pending",
        store_id: demoCohortStoreIds.pending,
        gbp_location_ref: "locations/demo-pending",
        state: "pending",
        note: "Owner accepted; waiting on Google to propagate access.",
        requested_at: PENDING_AT,
        granted_at: null,
        created_at: PENDING_AT,
        updated_at: PENDING_AT,
      },
      {
        id: "demo-gbp-access-review",
        store_id: demoCohortStoreIds.review,
        gbp_location_ref: "locations/demo-review",
        state: "granted",
        note: "Access granted; ready to publish once material is approved.",
        requested_at: REVIEW_AT,
        granted_at: REVIEW_AT,
        created_at: REVIEW_AT,
        updated_at: REVIEW_AT,
      },
      {
        id: "demo-gbp-access-partial",
        store_id: demoCohortStoreIds.partial,
        gbp_location_ref: "locations/demo-partial",
        state: "granted",
        note: "Access granted; GBP publishes succeed.",
        requested_at: PARTIAL_AT,
        granted_at: PARTIAL_AT,
        created_at: PARTIAL_AT,
        updated_at: PARTIAL_AT,
      },
      {
        id: "demo-gbp-access-blocked",
        store_id: demoCohortStoreIds.blocked,
        gbp_location_ref: "locations/demo-blocked",
        state: "blocked",
        note: "Owner cannot locate the GBP invite; escalated to chat.",
        requested_at: BLOCKED_AT,
        granted_at: null,
        created_at: BLOCKED_AT,
        updated_at: BLOCKED_AT,
      },
    ],
  },
  {
    // demo-store-partial links Instagram as `expired` — that is what makes its
    // Instagram publish fail while GBP succeeds (partially_published).
    table: "store_channel_links",
    rows: [
      {
        id: "demo-instagram-link-partial",
        store_id: demoCohortStoreIds.partial,
        channel: "instagram",
        external_account_ref: "17841400000000001",
        encrypted_token: null,
        status: "expired",
        created_at: PARTIAL_AT,
        updated_at: PARTIAL_AT,
      },
    ],
  },
  {
    // Campaign queue: one request per campaign-bearing store, spanning the
    // states an operator triages. nudged_at is set only where the owner has
    // already been nudged about the state they are in.
    table: "campaign_requests",
    rows: [
      {
        // Attached to the happy-path demo-store (which lives in the base tier),
        // so the queue shows a fully published campaign without the base
        // fixture carrying campaign rows the unit tests don't expect.
        id: "demo-campaign-published",
        store_id: demoStoreId,
        brief: "주말 브런치 신메뉴 런칭 홍보",
        status: "published",
        final_copy:
          "이번 주말, 브런치모먼트의 새 시즌 메뉴를 가장 먼저 만나보세요.",
        nudged_at: null,
        created_at: HAPPY_PATH_AT,
        updated_at: HAPPY_PATH_AT,
      },
      {
        id: "demo-campaign-submitted",
        store_id: demoCohortStoreIds.invited,
        brief: "신상 크루아상 출시 안내",
        status: "submitted",
        final_copy: null,
        nudged_at: null,
        created_at: INVITED_AT,
        updated_at: INVITED_AT,
      },
      {
        id: "demo-campaign-in-production",
        store_id: demoCohortStoreIds.pending,
        brief: "가을 헤어 프로모션 (10% 할인)",
        status: "in_production",
        final_copy: null,
        nudged_at: null,
        created_at: PENDING_AT,
        updated_at: PENDING_AT,
      },
      {
        id: "demo-campaign-ready-for-review",
        store_id: demoCohortStoreIds.review,
        brief: "신규 회원 1:1 체험 수업 홍보",
        status: "ready_for_review",
        final_copy: "몸이 가벼워지는 첫 걸음, 필라테스 합정점 1:1 체험 수업.",
        nudged_at: REVIEW_AT,
        created_at: REVIEW_AT,
        updated_at: REVIEW_AT,
      },
      {
        id: "demo-campaign-partial",
        store_id: demoCohortStoreIds.partial,
        brief: "떡볶이 세트 리뉴얼 홍보",
        status: "partially_published",
        final_copy: "매콤함이 돌아왔다. 분식상회 떡볶이 세트 리뉴얼.",
        nudged_at: null,
        created_at: PARTIAL_AT,
        updated_at: PARTIAL_AT,
      },
      {
        id: "demo-campaign-changes-requested",
        store_id: demoCohortStoreIds.blocked,
        brief: "신규 원두 입고 이벤트",
        status: "changes_requested",
        final_copy: null,
        nudged_at: BLOCKED_AT,
        created_at: BLOCKED_AT,
        updated_at: BLOCKED_AT,
      },
    ],
  },
  {
    // Assets only where they add demo value (a reviewable/published campaign
    // shows its material). Stub blob URLs sign fine — StubMediaStore's signer
    // only appends query params. meta_json carries the sizeBytes the queue
    // view reads.
    table: "campaign_assets",
    rows: [
      {
        id: "demo-asset-published-original",
        request_id: "demo-campaign-published",
        kind: "original",
        blob_url:
          "https://stub.blob.glocalx.internal/demo-store/brunch-original.jpg",
        content_type: "image/jpeg",
        width: 1600,
        height: 1200,
        meta_json: { sizeBytes: 482000 },
        uploaded_by: "owner",
        created_at: HAPPY_PATH_AT,
      },
      {
        id: "demo-asset-published-processed",
        request_id: "demo-campaign-published",
        kind: "processed",
        blob_url:
          "https://stub.blob.glocalx.internal/demo-store/brunch-processed.jpg",
        content_type: "image/jpeg",
        width: 1080,
        height: 1080,
        meta_json: { sizeBytes: 310000 },
        uploaded_by: "admin",
        created_at: HAPPY_PATH_AT,
      },
      {
        id: "demo-asset-review-original",
        request_id: "demo-campaign-ready-for-review",
        kind: "original",
        blob_url:
          "https://stub.blob.glocalx.internal/demo-store-review/pilates-original.jpg",
        content_type: "image/jpeg",
        width: 1600,
        height: 1067,
        meta_json: { sizeBytes: 521000 },
        uploaded_by: "owner",
        created_at: REVIEW_AT,
      },
      {
        id: "demo-asset-review-processed",
        request_id: "demo-campaign-ready-for-review",
        kind: "processed",
        blob_url:
          "https://stub.blob.glocalx.internal/demo-store-review/pilates-processed.jpg",
        content_type: "image/jpeg",
        width: 1080,
        height: 1080,
        meta_json: { sizeBytes: 298000 },
        uploaded_by: "admin",
        created_at: REVIEW_AT,
      },
      {
        id: "demo-asset-partial-processed",
        request_id: "demo-campaign-partial",
        kind: "processed",
        blob_url:
          "https://stub.blob.glocalx.internal/demo-store-partial/tteokbokki-processed.jpg",
        content_type: "image/jpeg",
        width: 1080,
        height: 1080,
        meta_json: { sizeBytes: 265000 },
        uploaded_by: "admin",
        created_at: PARTIAL_AT,
      },
    ],
  },
  {
    table: "campaign_review_events",
    rows: [
      {
        id: "demo-review-event-published",
        request_id: "demo-campaign-published",
        actor: "owner",
        decision: "go",
        note: "좋아요, 이대로 게시해주세요.",
        created_at: HAPPY_PATH_AT,
      },
      {
        id: "demo-review-event-changes",
        request_id: "demo-campaign-changes-requested",
        actor: "owner",
        decision: "changes_requested",
        note: "원두 원산지를 문구에 넣어주세요.",
        created_at: BLOCKED_AT,
      },
    ],
  },
  {
    // demo-store-partial published on GBP but failed Instagram (its link is
    // expired) — that split is what makes the request partially_published.
    table: "publish_jobs",
    rows: [
      {
        id: "demo-publish-published-gbp",
        request_id: "demo-campaign-published",
        channel: "gbp",
        status: "published",
        external_ref: "gbp-post-demo-campaign",
        external_url:
          "https://www.google.com/search?kgmid=gbp-post-demo-campaign",
        attempt_count: 1,
        last_error: null,
        idempotency_key: "demo-campaign-published-gbp",
        created_at: HAPPY_PATH_AT,
        updated_at: HAPPY_PATH_AT,
      },
      {
        id: "demo-publish-published-instagram",
        request_id: "demo-campaign-published",
        channel: "instagram",
        status: "published",
        external_ref: "ig-post-demo-campaign",
        external_url: "https://www.instagram.com/p/ig-post-demo-campaign/",
        attempt_count: 1,
        last_error: null,
        idempotency_key: "demo-campaign-published-instagram",
        created_at: HAPPY_PATH_AT,
        updated_at: HAPPY_PATH_AT,
      },
      {
        id: "demo-publish-partial-gbp",
        request_id: "demo-campaign-partial",
        channel: "gbp",
        status: "published",
        external_ref: "gbp-post-partial",
        external_url: "https://www.google.com/search?kgmid=gbp-post-partial",
        attempt_count: 1,
        last_error: null,
        idempotency_key: "demo-campaign-partial-gbp",
        created_at: PARTIAL_AT,
        updated_at: PARTIAL_AT,
      },
      {
        id: "demo-publish-partial-instagram",
        request_id: "demo-campaign-partial",
        channel: "instagram",
        status: "failed",
        external_ref: null,
        external_url: null,
        attempt_count: 3,
        last_error: "Instagram channel link expired — reconnect required.",
        idempotency_key: "demo-campaign-partial-instagram",
        created_at: PARTIAL_AT,
        updated_at: PARTIAL_AT,
      },
    ],
  },
  {
    // CS chat inbox (cs_conversations / cs_messages) — distinct from the
    // onboarding conversation_sessions in the base tier. Covers the three
    // postures an operator sees: a human-mode open thread, an ai_draft thread
    // with an unsent AI draft, and a flagged thread handed off for attention.
    table: "cs_conversations",
    rows: [
      {
        id: "demo-cs-conversation-active",
        store_id: demoCohortStoreIds.onboarding,
        mode: "human",
        status: "open",
        assigned_admin_id: null,
        flagged_at: null,
        flag_reason: null,
        created_at: ONBOARDING_AT,
        updated_at: ONBOARDING_AT,
      },
      {
        id: "demo-cs-conversation-ai-draft",
        store_id: demoCohortStoreIds.pending,
        mode: "ai_draft",
        status: "open",
        assigned_admin_id: null,
        flagged_at: null,
        flag_reason: null,
        created_at: PENDING_AT,
        updated_at: PENDING_AT,
      },
      {
        id: "demo-cs-conversation-handoff",
        store_id: demoCohortStoreIds.blocked,
        mode: "human",
        status: "open",
        assigned_admin_id: null,
        flagged_at: BLOCKED_AT,
        flag_reason: "Owner blocked on GBP invite; needs a human.",
        created_at: BLOCKED_AT,
        updated_at: BLOCKED_AT,
      },
    ],
  },
  {
    table: "cs_messages",
    rows: [
      {
        id: "demo-cs-message-active-owner",
        conversation_id: "demo-cs-conversation-active",
        sender: "owner",
        author_kind: "user",
        author_admin_id: null,
        body: "가게 정보 등록은 어디서 이어서 하나요?",
        created_at: ONBOARDING_AT,
        owner_read_at: ONBOARDING_AT,
        admin_read_at: null,
        status: "sent",
      },
      {
        id: "demo-cs-message-ai-draft-owner",
        conversation_id: "demo-cs-conversation-ai-draft",
        sender: "owner",
        author_kind: "user",
        author_admin_id: null,
        body: "프로모션 언제부터 게시되나요?",
        created_at: PENDING_AT,
        owner_read_at: PENDING_AT,
        admin_read_at: null,
        status: "sent",
      },
      {
        // An AI-composed draft the operator has not sent yet — never
        // owner-visible until an operator sends it (status = 'draft').
        id: "demo-cs-message-ai-draft-reply",
        conversation_id: "demo-cs-conversation-ai-draft",
        sender: "assistant",
        author_kind: "ai",
        author_admin_id: null,
        body: "사진 보정이 끝나면 바로 게시돼요. 보통 1~2일 정도 걸립니다.",
        created_at: PENDING_AT,
        owner_read_at: null,
        admin_read_at: null,
        status: "draft",
      },
      {
        id: "demo-cs-message-handoff-owner",
        conversation_id: "demo-cs-conversation-handoff",
        sender: "owner",
        author_kind: "user",
        author_admin_id: null,
        body: "구글에서 온 초대 메일을 못 찾겠어요.",
        created_at: BLOCKED_AT,
        owner_read_at: BLOCKED_AT,
        admin_read_at: null,
        status: "sent",
      },
    ],
  },
]

// The full demo/staging dataset: base happy-path store plus the cohort stores.
export const demoTables: readonly DemoTable[] = [
  ...demoBaseTables,
  ...demoCohortTables,
]
