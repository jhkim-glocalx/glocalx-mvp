import { MobileShell } from "./mobile-shell"

type EmailAuthMode = "login" | "register"

const errorMessages: Readonly<
  Record<EmailAuthMode, Readonly<Record<string, string>>>
> = {
  login: {
    invalid_request: "안전하지 않은 요청입니다. 다시 시도해주세요.",
    invalid_credentials: "이메일 또는 비밀번호가 올바르지 않습니다.",
    invalid_input: "이메일과 비밀번호를 다시 확인해주세요.",
  },
  register: {
    invalid_request: "안전하지 않은 요청입니다. 다시 시도해주세요.",
    registration_unavailable:
      "회원가입 요청을 처리할 수 없습니다. 로그인하거나 다른 이메일을 사용해주세요.",
    invalid_input:
      "이름, 이메일, 비밀번호를 다시 확인해주세요. 비밀번호는 12자 이상이어야 합니다.",
  },
}

function firstParamValue(
  value: string | readonly string[] | undefined
): string {
  if (value === undefined) {
    return ""
  }
  return typeof value === "string" ? value : (value[0] ?? "")
}

export function EmailAuthPage({
  authError,
  mode,
}: {
  readonly authError: string | readonly string[] | undefined
  readonly mode: EmailAuthMode
}) {
  const message = errorMessages[mode][firstParamValue(authError)]
  const isRegistration = mode === "register"
  const formAction = isRegistration
    ? "/api/auth/email/register"
    : "/api/auth/email/login"

  return (
    <main className="gx-entry-page">
      <MobileShell screenClassName="gx-login-screen" testId="entry-device">
        <section aria-labelledby="email-auth-title" className="gx-login-panel">
          <header className="gx-login-header">
            <div className="gx-login-mark" aria-hidden="true">
              X
            </div>
            <h1 className="gx-login-headline" id="email-auth-title">
              {isRegistration ? "이메일로 시작해요." : "다시 만나서 반가워요."}
            </h1>
            <p className="gx-login-copy">
              {isRegistration
                ? "이름, 이메일, 비밀번호로 계정을 만드세요."
                : "가입한 이메일과 비밀번호로 로그인하세요."}
            </p>
          </header>

          {message === undefined ? null : (
            <p className="gx-auth-error" id="email-auth-error" role="alert">
              {message}
            </p>
          )}

          <form action={formAction} className="gx-auth-actions" method="post">
            {isRegistration ? (
              <label className="gx-login-form">
                <span className="gx-login-label">이름</span>
                <input
                  autoComplete="name"
                  className="gx-login-input"
                  name="displayName"
                  required
                  type="text"
                />
              </label>
            ) : null}
            <label className="gx-login-form">
              <span className="gx-login-label">이메일</span>
              <input
                aria-describedby={
                  message === undefined ? undefined : "email-auth-error"
                }
                autoComplete="email"
                className="gx-login-input"
                name="email"
                required
                type="email"
              />
            </label>
            <label className="gx-login-form">
              <span className="gx-login-label">비밀번호</span>
              <input
                aria-describedby={
                  message === undefined ? undefined : "email-auth-error"
                }
                autoComplete={
                  isRegistration ? "new-password" : "current-password"
                }
                className="gx-login-input"
                minLength={12}
                name="password"
                required
                type="password"
              />
            </label>
            <button className="gx-login-primary" type="submit">
              {isRegistration ? "이메일로 회원가입" : "이메일로 로그인"}
            </button>
          </form>

          <p className="gx-login-fineprint">
            {isRegistration ? "이미 계정이 있나요? " : "처음 사용하시나요? "}
            <a
              className="gx-login-link"
              href={isRegistration ? "/login" : "/register"}
            >
              {isRegistration ? "로그인" : "회원가입"}
            </a>
          </p>
        </section>
      </MobileShell>
    </main>
  )
}
