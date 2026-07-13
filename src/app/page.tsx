import { MobileShell } from "@/app/_components/mobile-shell"

const authErrorMessages: Readonly<Record<string, string>> = {
  google_callback:
    "구글 로그인 처리 중 문제가 생겼습니다. 설정을 확인한 뒤 다시 시도해주세요.",
  google_config:
    "구글 로그인 설정이 아직 완료되지 않았습니다. Client ID와 Client Secret을 확인해주세요.",
  google_state:
    "구글 로그인 세션이 만료되었습니다. 로그인 버튼을 다시 눌러주세요.",
  kakao_callback:
    "카카오 로그인 처리 중 문제가 생겼습니다. 설정을 확인한 뒤 다시 시도해주세요.",
  kakao_client_secret:
    "카카오 Client Secret이 필요합니다. Kakao Developers의 Client Secret 값을 .env.local에 추가한 뒤 다시 시도해주세요.",
  kakao_config:
    "카카오 로그인 설정이 아직 완료되지 않았습니다. REST API 키와 Redirect URI를 확인해주세요.",
  kakao_state:
    "카카오 로그인 세션이 만료되었습니다. 로그인 버튼을 다시 눌러주세요.",
}

function firstParamValue(
  value: string | readonly string[] | undefined
): string {
  if (value === undefined) {
    return ""
  }

  if (typeof value === "string") {
    return value
  }

  return value[0] ?? ""
}

function authErrorMessageFor(
  authError: string | readonly string[] | undefined
): string | undefined {
  return authErrorMessages[firstParamValue(authError)]
}

function HomeView({
  authErrorMessage,
}: {
  readonly authErrorMessage?: string | undefined
}) {
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
            <h2 className="gx-login-headline" id="login-title">
              혼자서도
              <br />전 세계에 팝니다.
            </h2>
            <p className="gx-login-copy">
              우리가게도 외국인들을 줄세우고 싶어요.
              <br />
              <br />
              글로컬 엑스는 외국인에게 사장님 매장을 홍보하는 우리 가게를 잘
              아는 마케팅 직원이에요. 사진 한장과 최소한의 정보로 알아서 잘 딱
              깔끔하고 센스 있게 대신 홍보해드려요. 구글맵과 다양한 SNS와 다양한
              마케팅까지, 하루 천원대로 우리도 마케팅 직원 쓰자구요.
            </p>
          </header>

          {authErrorMessage === undefined ? null : (
            <p className="gx-auth-error" role="alert">
              {authErrorMessage}
            </p>
          )}

          <div className="gx-auth-actions">
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
                  K
                </span>
                <span>카카오로 3초 시작</span>
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
                  G
                </span>
                <span>구글로 시작</span>
              </button>
            </form>

            <form
              action="/login"
              aria-label="이메일 로그인"
              className="gx-login-form"
              method="get"
            >
              <button
                className="gx-login-provider gx-login-email"
                type="submit"
              >
                <span className="gx-login-provider-icon" aria-hidden="true">
                  @
                </span>
                <span>이메일로 시작</span>
              </button>
            </form>
          </div>

          <p className="gx-login-fineprint">
            계속 진행 시 이용약관 및 개인정보처리방침에 동의합니다
            <br />
            소셜 계정 또는 이메일로 안전하게 시작할 수 있어요.
          </p>
        </section>
      </MobileShell>
    </main>
  )
}

export default async function Home({ searchParams }: PageProps<"/">) {
  const params = await searchParams
  return (
    <HomeView authErrorMessage={authErrorMessageFor(params["auth_error"])} />
  )
}
