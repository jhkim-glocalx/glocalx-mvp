import { demoStoreId, demoUserId } from "../../../auth/demo-identifiers.ts"

import type { PostgresClient } from "./connection.ts"

export async function seedPostgresDemoData(sql: PostgresClient): Promise<void> {
  await sql`
    INSERT INTO users (id, email, display_name, role, created_at)
    VALUES (
      ${demoUserId},
      'demo-owner@glocalx.example',
      'Demo Owner',
      'OWNER',
      now()
    )
    ON CONFLICT (id) DO UPDATE SET
      email = EXCLUDED.email,
      display_name = EXCLUDED.display_name,
      role = EXCLUDED.role
  `
  await sql`
    INSERT INTO stores (
      id,
      owner_user_id,
      name,
      address,
      category,
      onboarding_status,
      created_at
    )
    VALUES (
      ${demoStoreId},
      ${demoUserId},
      'GlocalX Demo Store',
      'Seoul, Korea',
      'Cafe',
      'COMPLETED',
      now()
    )
    ON CONFLICT (id) DO UPDATE SET
      owner_user_id = EXCLUDED.owner_user_id,
      name = EXCLUDED.name,
      address = EXCLUDED.address,
      category = EXCLUDED.category,
      onboarding_status = EXCLUDED.onboarding_status
  `
  await sql`
    INSERT INTO audit_logs (
      id,
      store_id,
      actor_user_id,
      action,
      idempotency_key,
      redacted_payload_json,
      created_at
    )
    VALUES (
      'demo-seed-audit-log',
      ${demoStoreId},
      ${demoUserId},
      'demo.seed',
      'demo-seed-key',
      '{}'::jsonb,
      now()
    )
    ON CONFLICT (id) DO UPDATE SET
      store_id = EXCLUDED.store_id,
      actor_user_id = EXCLUDED.actor_user_id,
      action = EXCLUDED.action,
      idempotency_key = EXCLUDED.idempotency_key,
      redacted_payload_json = EXCLUDED.redacted_payload_json
  `
  console.log("Seeded Postgres deterministic demo owner and store")
}
