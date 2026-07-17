import { redirect } from "next/navigation"

import { getAdminSession } from "@/auth/server-session"

const authErrorMessages: Record<string, string> = {
  invalid_credentials: "이메일 또는 비밀번호가 올바르지 않습니다.",
  invalid_input: "이메일과 비밀번호를 입력해 주세요.",
  invalid_request: "요청을 확인할 수 없습니다. 다시 시도해 주세요.",
  try_again: "잠시 후 다시 시도해 주세요.",
}

type LoginPageProps = {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const session = await getAdminSession()
  if (session !== undefined) {
    redirect("/stores")
  }

  const params = await searchParams
  const authError = params["auth_error"]
  const errorMessage =
    typeof authError === "string" ? authErrorMessages[authError] : undefined

  return (
    <main className="ops-login">
      <form className="ops-login-card" action="/api/auth/login" method="post">
        <div className="ops-brand">
          GlocalX <span>Ops</span>
        </div>
        <p className="ops-login-hint">
          운영자 전용 콘솔입니다. 계정은 초대로만 발급됩니다.
        </p>
        {errorMessage !== undefined && (
          <p className="ops-login-error" role="alert">
            {errorMessage}
          </p>
        )}
        <label className="ops-field">
          이메일
          <input
            name="email"
            type="email"
            autoComplete="username"
            required
            autoFocus
          />
        </label>
        <label className="ops-field">
          비밀번호
          <input
            name="password"
            type="password"
            autoComplete="current-password"
            required
          />
        </label>
        <button type="submit" className="ops-primary-button">
          로그인
        </button>
      </form>
    </main>
  )
}
