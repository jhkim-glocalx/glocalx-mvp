import { randomUUID } from "node:crypto"

import type { Queryable } from "@glocalx/db"

// Operator actions on a conversation (reply, resolve) are audited so an
// out-of-band decision is traceable. audit_logs.actor_user_id FKs to users(id)
// — operators live in admin_users, not users — so the operator identity is
// carried in the redacted payload instead, and actor_user_id stays NULL.
export type AdminAuditAction =
  | "cs_reply"
  | "cs_resolve"
  | "cs_assign"
  | "cs_set_mode"
  | "cs_send_draft"
  | "cs_discard_draft"
  | "campaign_start_production"
  | "campaign_register_asset"
  | "campaign_set_final_copy"
  | "campaign_set_call_to_action"
  | "campaign_submit_for_review"
  | "campaign_mark_nudged"
  | "campaign_publish"
  | "org_credential_saved"
  // GBP org manager-access transitions. The natural operator actions carry their
  // own code; gbp_access_override marks a forced out-of-band state change, kept
  // distinct so the log separates "the flow advanced" from "an operator forced
  // it". gbp_access_note is a chase-note edit with no state change.
  | "gbp_access_send_invite"
  | "gbp_access_mark_pending"
  // The operator's verdict on an owner's "this listing is already mine" claim.
  // Confirming attaches an org-owned listing to a store on an operator's word
  // alone — no Google approval stands behind it — so it is the one access action
  // whose audit trail is the only record of who authorized the attachment.
  | "gbp_access_confirm_adoption"
  | "gbp_access_reject_adoption"
  | "gbp_access_grant"
  | "gbp_access_revoke"
  | "gbp_access_block"
  | "gbp_access_override"
  | "gbp_access_note"
  // The concierge setup path: an operator ran GBP setup on an owner's
  // behalf. Same actor_user_id-NULL pattern as the gbp_access_* actions —
  // the operator identity lives in the redacted payload.
  | "gbp_setup_run"
  // Admin dashboard soft delete: sessions invalidated, login blocked. The
  // deactivated user is the storeId-less subject here (audit_logs.store_id
  // is nullable), so the target user id lives in detail.
  | "user_deactivate"

export type AdminAuditEntry = {
  readonly action: AdminAuditAction
  readonly adminUserId: string
  // Optional because org-level actions (publishing credentials) belong to no
  // single store; audit_logs.store_id is nullable for exactly this case.
  readonly storeId?: string
  // Whichever subject the action acts on: chat actions carry a conversation,
  // production-queue actions carry a campaign request.
  readonly conversationId?: string
  readonly campaignRequestId?: string
  // Codes/ids only — never message bodies, briefs, copy, or other owner content.
  readonly detail?: Readonly<Record<string, string>>
}

export interface AdminAuditLogStore {
  record(entry: AdminAuditEntry): Promise<void>
}

export function createAdminAuditLogStore(
  queryable: Queryable
): AdminAuditLogStore {
  return {
    async record(entry) {
      const payload = {
        adminUserId: entry.adminUserId,
        ...(entry.conversationId === undefined
          ? {}
          : { conversationId: entry.conversationId }),
        ...(entry.campaignRequestId === undefined
          ? {}
          : { campaignRequestId: entry.campaignRequestId }),
        ...entry.detail,
      }
      await queryable.execute(
        `INSERT INTO audit_logs (
           id, store_id, actor_user_id, action, idempotency_key,
           redacted_payload_json, created_at
         ) VALUES (?, ?, NULL, ?, NULL, ?, ?)`,
        [
          randomUUID(),
          entry.storeId ?? null,
          entry.action,
          JSON.stringify(payload),
          new Date().toISOString(),
        ]
      )
    },
  }
}
