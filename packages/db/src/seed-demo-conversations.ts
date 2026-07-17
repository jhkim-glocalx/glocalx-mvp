import type { SqliteDatabase } from "./sqlite"

export function seedDemoConversationData(database: SqliteDatabase): void {
  const createdAt = "2026-06-04T00:00:00.000Z"

  database
    .prepare(
      "INSERT OR IGNORE INTO conversation_sessions (id, store_id, kind, state, status, selected_candidate_id, selected_candidate_json, support_metadata_json, created_at, updated_at, completed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    )
    .run(
      "demo-conversation-session",
      "demo-store",
      "onboarding",
      "profile_summary",
      "active",
      "naver-demo-candidate",
      JSON.stringify({ name: "브런치모먼트 홍대점" }),
      JSON.stringify({ channel: "support", phone: "[REDACTED_PHONE]" }),
      createdAt,
      createdAt,
      null
    )

  database
    .prepare(
      "INSERT OR IGNORE INTO conversation_messages (id, session_id, role, client_event_id, content, redacted_content, sequence, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
    )
    .run(
      "demo-conversation-message-owner",
      "demo-conversation-session",
      "owner",
      "demo-client-event",
      "전화번호는 02-1234-5678입니다.",
      "전화번호는 [REDACTED_PHONE]입니다.",
      1,
      createdAt
    )

  database
    .prepare(
      "INSERT OR IGNORE INTO conversation_messages (id, session_id, role, client_event_id, content, redacted_content, sequence, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
    )
    .run(
      "demo-conversation-message-assistant",
      "demo-conversation-session",
      "assistant",
      null,
      "확인했어요. 요약을 보여드릴게요.",
      "확인했어요. 요약을 보여드릴게요.",
      2,
      createdAt
    )

  database
    .prepare(
      "INSERT OR IGNORE INTO conversation_slot_values (id, session_id, slot_key, value, source, confidence, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
    )
    .run(
      "demo-conversation-slot-phone",
      "demo-conversation-session",
      "phone",
      "02-1234-5678",
      "owner_message",
      0.97,
      createdAt,
      createdAt
    )

  database
    .prepare(
      "INSERT OR IGNORE INTO conversation_events (id, session_id, client_event_id, event_type, response_message_id, public_response_json, redacted_payload_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
    )
    .run(
      "demo-conversation-event",
      "demo-conversation-session",
      "demo-client-event",
      "turn_recorded",
      "demo-conversation-message-assistant",
      JSON.stringify({ assistantMessage: "확인했어요. 요약을 보여드릴게요." }),
      JSON.stringify({
        ownerMessage: "전화번호는 [REDACTED_PHONE]입니다.",
      }),
      createdAt
    )
}
