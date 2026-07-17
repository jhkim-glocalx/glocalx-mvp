import { createHash } from "node:crypto"

import type { NextRequest } from "next/server"

import type { AuthRateLimitRule } from "@/server/repositories/auth-rate-limit"

const loginWindowSeconds = 15 * 60
const registrationWindowSeconds = 60 * 60

function digest(value: string): string {
  return createHash("sha256").update(value).digest("base64url")
}

function readClientIdentifier(request: NextRequest): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip")?.trim() ||
    "unknown-client"
  )
}

export function createLoginRateLimitRules(
  request: NextRequest,
  email: string
): readonly [AuthRateLimitRule, AuthRateLimitRule] {
  return [
    {
      id: `login:account:${digest(email)}`,
      maximumAttempts: 5,
      windowSeconds: loginWindowSeconds,
    },
    {
      id: `login:client:${digest(readClientIdentifier(request))}`,
      maximumAttempts: 30,
      windowSeconds: loginWindowSeconds,
    },
  ]
}

export function createRegistrationRateLimitRules(
  request: NextRequest,
  email: string
): readonly [AuthRateLimitRule, AuthRateLimitRule] {
  return [
    {
      id: `register:account:${digest(email)}`,
      maximumAttempts: 3,
      windowSeconds: registrationWindowSeconds,
    },
    {
      id: `register:client:${digest(readClientIdentifier(request))}`,
      maximumAttempts: 10,
      windowSeconds: registrationWindowSeconds,
    },
  ]
}
