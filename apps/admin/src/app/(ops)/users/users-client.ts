import type { UserDirectoryEntry } from "@glocalx/db/support/user-directory-store"

const usersUrl = "/api/users"

export type DeactivateUserResult =
  | { readonly kind: "ok"; readonly user: UserDirectoryEntry }
  | { readonly kind: "error"; readonly message: string }

export async function fetchUsers(): Promise<readonly UserDirectoryEntry[]> {
  const response = await fetch(usersUrl)
  if (!response.ok) {
    return []
  }
  const payload = (await response.json()) as {
    readonly users?: readonly UserDirectoryEntry[]
  }
  return payload.users ?? []
}

export async function deactivateUser(
  userId: string
): Promise<DeactivateUserResult> {
  const response = await fetch(`${usersUrl}/${userId}/deactivate`, {
    method: "POST",
  })
  if (!response.ok) {
    return {
      kind: "error",
      message:
        response.status === 404
          ? "이미 비활성화되었거나 존재하지 않는 사용자입니다."
          : "사용자를 비활성화하지 못했습니다.",
    }
  }
  const payload = (await response.json()) as {
    readonly user: UserDirectoryEntry
  }
  return { kind: "ok", user: payload.user }
}
