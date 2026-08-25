"use client"

import { useState } from "react"

import type { UserDirectoryEntry } from "@glocalx/db/support/user-directory-store"

import { deactivateUser, type DeactivateUserResult } from "./users-client"

function formatCreatedAt(createdAt: string): string {
  const parsed = new Date(createdAt)
  return Number.isNaN(parsed.getTime())
    ? createdAt
    : parsed.toLocaleDateString("ko-KR")
}

function upsert(
  users: readonly UserDirectoryEntry[],
  next: UserDirectoryEntry
): UserDirectoryEntry[] {
  return users.map((user) => (user.id === next.id ? next : user))
}

export function UsersConsole({
  initialUsers,
}: {
  readonly initialUsers: readonly UserDirectoryEntry[]
}) {
  const [users, setUsers] =
    useState<readonly UserDirectoryEntry[]>(initialUsers)
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function handleDeactivate(user: UserDirectoryEntry): Promise<void> {
    if (
      !window.confirm(
        `${user.email} 계정을 비활성화할까요? 로그인이 즉시 차단되고 모든 세션이 종료됩니다.`
      )
    ) {
      return
    }
    setPendingId(user.id)
    setError(null)
    const result: DeactivateUserResult = await deactivateUser(user.id)
    if (result.kind === "ok") {
      setUsers((current) => upsert(current, result.user))
    } else {
      setError(result.message)
    }
    setPendingId(null)
  }

  if (users.length === 0) {
    return (
      <>
        <h1 className="ops-page-title">사용자</h1>
        <div className="ops-empty">
          <strong>아직 사용자가 없습니다</strong>
          <p>사장님이 가입하면 여기에 계정이 표시됩니다.</p>
        </div>
      </>
    )
  }

  return (
    <>
      <h1 className="ops-page-title">사용자</h1>
      {error === null ? null : (
        <p className="ops-stores-error" role="alert">
          {error}
        </p>
      )}
      <ul className="ops-stores" data-testid="ops-users">
        {users.map((user) => (
          <li
            key={user.id}
            className="ops-store-card"
            data-testid={`user-card-${user.id}`}
          >
            <div className="ops-store-head">
              <span className="ops-store-name">{user.email}</span>
              <span
                className={
                  user.deactivatedAt === null
                    ? "ops-store-state ops-store-state-granted"
                    : "ops-store-state ops-store-state-revoked"
                }
                data-testid={`user-state-${user.id}`}
              >
                {user.deactivatedAt === null ? "활성" : "비활성화됨"}
              </span>
              <span className="ops-store-age">
                가입 {formatCreatedAt(user.createdAt)}
              </span>
            </div>
            <p className="ops-store-meta">
              {user.displayName} · {user.role}
              {user.storeName === null
                ? ""
                : user.storeCount > 1
                  ? ` · ${user.storeName} 외 ${user.storeCount - 1}곳`
                  : ` · ${user.storeName}`}
            </p>
            <div className="ops-store-actions">
              {user.deactivatedAt === null ? (
                <button
                  className="ops-store-btn"
                  data-testid={`user-deactivate-${user.id}`}
                  disabled={pendingId === user.id}
                  onClick={() => void handleDeactivate(user)}
                  type="button"
                >
                  비활성화
                </button>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </>
  )
}
