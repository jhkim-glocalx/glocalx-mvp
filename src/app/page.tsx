import { MobileShell } from "@/app/_components/mobile-shell"
import { appShellCopy } from "@/lib/app-shell"

export default function Home() {
  return (
    <main className="gx-entry-page">
      <MobileShell screenClassName="gx-login-screen" testId="entry-device">
        <section
          aria-labelledby="login-title"
          className="gx-login-panel"
          aria-label="로그인"
        >
          <header className="gx-login-header">
            <div className="gx-login-mark" aria-hidden="true">
              X
            </div>
            <p className="gx-login-kicker">GlocalX</p>
            <h1 className="gx-login-title" id="login-title">
              {appShellCopy.productName}
            </h1>
            <p className="gx-login-tagline">내 가게, 세계로</p>
            <h2 className="gx-login-headline">
              혼자서도
              <br />전 세계에 팝니다.
            </h2>
            <p className="gx-login-copy">
              우리가게도 외국인들을 줄세우고 싶어요. 글로컬엑스는 사진 한장과
              최소한의 정보로 알아서 잘 딱 깔끔하고 센스 있게 대신 홍보해드려요.
            </p>
          </header>

          <div className="gx-auth-actions">
            <form
              action="/api/auth/demo-login"
              aria-label="데모 로그인"
              className="gx-login-form"
              method="post"
            >
              <button className="gx-login-demo" type="submit">
                {appShellCopy.primaryAction}
              </button>
            </form>
            <form
              action="/api/auth/google/start"
              className="gx-login-form"
              method="post"
            >
              <button
                className="gx-login-provider gx-login-google"
                type="submit"
              >
                <span className="gx-login-provider-icon" aria-hidden="true">
                  <svg
                    aria-hidden="true"
                    className="gx-login-google-icon"
                    viewBox="0 0 24 24"
                  >
                    <path
                      d="M21.6 12.23c0-.78-.07-1.53-.2-2.23H12v4.22h5.37a4.59 4.59 0 0 1-1.99 3.01v2.5h3.23c1.89-1.74 2.99-4.31 2.99-7.5Z"
                      fill="#4285f4"
                    />
                    <path
                      d="M12 22c2.7 0 4.96-.89 6.61-2.41l-3.23-2.5c-.9.6-2.04.95-3.38.95-2.6 0-4.81-1.76-5.6-4.12H3.07v2.58A9.99 9.99 0 0 0 12 22Z"
                      fill="#34a853"
                    />
                    <path
                      d="M6.4 13.92a6.01 6.01 0 0 1 0-3.84V7.5H3.07a10.01 10.01 0 0 0 0 9l3.33-2.58Z"
                      fill="#fbbc05"
                    />
                    <path
                      d="M12 5.96c1.47 0 2.79.51 3.83 1.5l2.86-2.87C16.96 2.98 14.7 2 12 2a9.99 9.99 0 0 0-8.93 5.5l3.33 2.58C7.19 7.72 9.4 5.96 12 5.96Z"
                      fill="#ea4335"
                    />
                  </svg>
                </span>
                <span>Google로 계속하기</span>
              </button>
            </form>

            <form
              action="/api/auth/kakao/start"
              className="gx-login-form"
              method="post"
            >
              <button
                className="gx-login-provider gx-login-kakao"
                type="submit"
              >
                <span className="gx-login-provider-icon" aria-hidden="true">
                  <span className="gx-login-kakao-mark" />
                </span>
                <span>카카오로 계속하기</span>
              </button>
            </form>
          </div>

          <div className="gx-login-divider">
            <span>또는</span>
          </div>

          <form
            action="/api/auth/demo-login"
            className="gx-login-form"
            method="post"
          >
            <label className="gx-login-label" htmlFor="login-email">
              이메일
            </label>
            <input
              autoComplete="email"
              className="gx-login-input"
              id="login-email"
              name="email"
              placeholder="이메일 주소"
              type="email"
            />
            <button className="gx-login-primary" type="submit">
              이메일로 계속하기
            </button>
          </form>

          <p className="gx-login-fineprint">
            계속하면 서비스 이용약관 및 개인정보처리방침에 동의하는 것으로
            간주됩니다.
          </p>
        </section>
      </MobileShell>
    </main>
  )
}
