"use client"

import type { CSSProperties, ReactNode } from "react"

import { ChatMessage } from "@/app/_components/chat-message"

import {
  appNavItems,
  type AppNavId,
  type PublishState,
} from "./app-workspace-model"

type ReferenceFlowScreensProps = {
  readonly activeNavId: AppNavId
  readonly onPublish: () => void
  readonly onSelect: (navId: AppNavId) => void
  readonly publish: PublishState
}

type FlowCardProps = {
  readonly children: ReactNode
  readonly title: string
}

type MetricTileProps = {
  readonly label: string
  readonly trend: string
  readonly value: string
}

const countryRows = [
  ["🇯🇵", "일본", "인근 업종 인기 · 객단가 적합", "1위"],
  ["🇨🇳", "중국", "홍대 상권 방문 비중 높음", "2위"],
  ["🇺🇸", "미국", "영어권 기본 타겟", "3위"],
] as const

const reportMetrics = [
  { label: "총 노출", trend: "▲ 38%", value: "12,480" },
  { label: "프로필 조회", trend: "▲ 22%", value: "1,920" },
  { label: "신규 리뷰", trend: "▲ 5건", value: "17건" },
  { label: "쿠폰 사용", trend: "▲ 11건", value: "34건" },
] as const

function FlowNav({
  activeNavId,
  onSelect,
}: Pick<ReferenceFlowScreensProps, "activeNavId" | "onSelect">) {
  return (
    <nav aria-label="화면 단계" className="gx-flow-nav">
      {appNavItems.map((item) => (
        <button
          aria-current={item.id === activeNavId ? "page" : undefined}
          className="gx-flow-tab"
          key={item.id}
          onClick={() => onSelect(item.id)}
          type="button"
        >
          {item.label}
        </button>
      ))}
    </nav>
  )
}

function ChatDivider({ children }: { readonly children: ReactNode }) {
  return <div className="gx-chat-divider">{children}</div>
}

function FlowCard({ children, title }: FlowCardProps) {
  return (
    <article className="gx-ref-card gx-rise">
      <header className="gx-ref-card-header">
        <span aria-hidden="true" className="gx-card-dot" />
        <strong>{title}</strong>
      </header>
      <div className="gx-ref-card-body">{children}</div>
    </article>
  )
}

function ChoiceButton({
  children,
  onClick,
  tone = "primary",
}: {
  readonly children: ReactNode
  readonly onClick?: () => void
  readonly tone?: "primary" | "ghost"
}) {
  return (
    <button className="gx-choice-chip" data-tone={tone} onClick={onClick} type="button">
      {children}
    </button>
  )
}

function MetricTile({ label, trend, value }: MetricTileProps) {
  return (
    <div className="gx-report-tile">
      <span>{label}</span>
      <strong>{value}</strong>
      <em>{trend}</em>
    </div>
  )
}

function OnboardingSnapshot() {
  return (
    <>
      <ChatDivider>STEP 1 · 온보딩 / 구글비즈니스프로필 세팅</ChatDivider>
      <ChatMessage
        message="안녕하세요 사장님! 👋 저는 가게의 글로벌 마케팅을 도와드릴 글로컬엑스예요. 먼저 가게를 등록할게요. 네이버 플레이스 링크나 가게 이름을 알려주시겠어요?"
        speaker="assistant"
      />
      <div className="gx-actions-row">
        <ChoiceButton>네이버 플레이스 링크 붙여넣기</ChoiceButton>
        <ChoiceButton tone="ghost">상호명으로 검색</ChoiceButton>
      </div>
    </>
  )
}

function PhotoScreen({ onSelect }: Pick<ReferenceFlowScreensProps, "onSelect">) {
  return (
    <>
      <ChatDivider>STEP 2 · 사진 자동 고도화</ChatDivider>
      <ChatMessage
        message='"이번 주말 브런치 신메뉴 홍보하고 싶어요. 사진 3장 올릴게요"'
        speaker="owner"
      />
      <ChatMessage speaker="assistant">
        좋아요! 메시지에서 뭘 홍보하려는지 분석했어요.{" "}
        <b>(FT-07 분석)</b>
      </ChatMessage>
      <FlowCard title="🎯 의도 분석 결과">
        <dl className="gx-check-list">
          <div>
            <dt>홍보 목적</dt>
            <dd>주말 신메뉴 프로모션</dd>
          </div>
          <div>
            <dt>업종</dt>
            <dd>브런치 카페</dd>
          </div>
          <div>
            <dt>SEO 키워드 힌트</dt>
            <dd>브런치, 주말, 신메뉴</dd>
          </div>
        </dl>
      </FlowCard>
      <ChatMessage speaker="assistant">
        올려주신 사진 화질을 확인했어요. 1장이 저해상도라 AI 깨끗하게 만들고 +
        배경 정리를 했어요. <b>(FT-08)</b>
      </ChatMessage>
      <FlowCard title="🖼️ 이미지 품질 개선 (FT-08)">
        <div className="gx-image-compare">
          <div data-tone="muted">
            <span>원본 · 저해상도</span>
            <strong>흐릿한 사진</strong>
          </div>
          <div data-tone="accent">
            <span>AI 보정 ✨</span>
            <strong>선명 · 배경정리</strong>
          </div>
        </div>
      </FlowCard>
      <ChatMessage speaker="assistant">
        각 채널에 맞는 크기로 자동 변환했어요. <b>(FT-09 크기 변환)</b>
      </ChatMessage>
      <FlowCard title="📐 채널별 크기 변환 (FT-09)">
        <ul className="gx-size-list">
          <li>
            <span>인스타 피드</span>
            <strong>1:1 / 4:5</strong>
          </li>
          <li>
            <span>인스타 릴스/스토리</span>
            <strong>9:16</strong>
          </li>
          <li>
            <span>구글비즈니스프로필 게시물</span>
            <strong>4:3 / 16:9</strong>
          </li>
        </ul>
      </FlowCard>
      <ChatMessage speaker="assistant">
        포스팅을 더 잘 나가게 하려면 <b>음식 클로즈업 1장</b>이 더 있으면
        좋아요. 추가해 주실 수 있을까요? <b>(FT-10 소스 요청)</b>
      </ChatMessage>
      <div className="gx-actions-row">
        <ChoiceButton>📷 사진 추가 업로드</ChoiceButton>
        <ChoiceButton onClick={() => onSelect("posting")} tone="ghost">
          이대로 진행
        </ChoiceButton>
      </div>
    </>
  )
}

function PostingScreen({
  onPublish,
  publish,
}: Pick<ReferenceFlowScreensProps, "onPublish" | "publish">) {
  return (
    <>
      <ChatDivider>STEP 3 · 다채널 자동 포스팅</ChatDivider>
      <ChatMessage speaker="assistant">
        사진 준비 끝! 구글 트렌드 키워드를 결합해 채널 공통 핵심 메시지를 만들고,
        채널별 맞춤 형태로 재가공했어요. <b>(FT-11·12)</b>
        <br />
        완성된 거 확인해주세요 👇
      </ChatMessage>
      <FlowCard title="📨 완성된 게시물을 확인해주세요 (FT-13)">
        <div className="gx-post-tabs" role="tablist">
          <span role="tab" aria-selected="true">
            📍 구글비즈니스프로필
          </span>
          <span role="tab">📷 인스타그램</span>
        </div>
        <div className="gx-post-image">브런치 신메뉴 · 1:1</div>
        <p className="gx-post-copy">
          주말 한정 🥞 인생 브런치가 홍대에 떴습니다. 따뜻한 수플레 팬케이크와
          직접 내린 핸드드립 한 잔, 지금 만나보세요 ☕✨
        </p>
        <div className="gx-hashtag-row">
          <span>#홍대브런치</span>
          <span>#주말브런치</span>
          <span>#수플레팬케이크</span>
          <span>#hongdaecafe</span>
        </div>
        <div className="gx-channel-select">
          <p>업로드 채널 선택</p>
          <span>✓ 구글비즈니스프로필</span>
          <span>✓ 인스타그램</span>
        </div>
      </FlowCard>
      <div className="gx-actions-row">
        <ChoiceButton tone="ghost">✏️ 수정</ChoiceButton>
        <ChoiceButton onClick={onPublish}>🚀 게시물 발행</ChoiceButton>
      </div>
      {publish.kind === "loading" ? (
        <ChatMessage message="GBP 게시 상태를 확인하는 중" speaker="assistant" />
      ) : null}
      {publish.kind === "blocked" ? (
        <ChatMessage message={publish.message} speaker="assistant" />
      ) : null}
      {publish.kind === "published" ? (
        <ChatMessage message={publish.message} speaker="assistant" />
      ) : null}
    </>
  )
}

function ReviewsScreen() {
  return (
    <>
      <ChatDivider>STEP 4 · 스마트 리뷰 관리</ChatDivider>
      <ChatMessage speaker="assistant">
        🔔 새 리뷰가 달렸어요! 구글비즈니스프로필에 영어 리뷰가 등록됐어요.{" "}
        <b>(FT-16 실시간 달렸어요)</b>
      </ChatMessage>
      <FlowCard title="💬 리뷰 분석 & 답변 추천 (FT-17)">
        <div className="gx-review-card">
          <span>★★★★★</span>
          <small>Google · 🇺🇸 영어</small>
          <p>
            &quot;Amazing soufflé pancake! The vibe was so cozy. Will definitely
            come back.&quot;
          </p>
          <em>→ 번역: 수플레 팬케이크 최고였어요! 분위기도 아늑했어요.</em>
          <strong>긍정 · 영어</strong>
        </div>
        <p className="gx-card-note">톤을 골라주세요 (선택 시 자동 번역·등록)</p>
        <div className="gx-reply-list">
          <button type="button">😊 친근하게 <span>AI 생성</span></button>
          <button type="button">🙏 정중하게 <span>AI 생성</span></button>
          <button type="button">✨ 위트있게 <span>AI 생성</span></button>
        </div>
      </FlowCard>
      <div className="gx-actions-row">
        <ChoiceButton tone="ghost">⚠️ 악성 리뷰가 들어오면?</ChoiceButton>
      </div>
    </>
  )
}

function TargetsScreen() {
  return (
    <>
      <ChatDivider>STEP 5 · 타겟 국가 추천</ChatDivider>
      <ChatMessage speaker="assistant">
        사장님 가게(브런치 카페·홍대·객단가 1.8만원)를 분석했어요. 우선 업종 기반
        기본 타겟을 추천드려요. <b>(FT-20 기본 추천)</b>
      </ChatMessage>
      <FlowCard title="🌏 기본 타겟 국가 추천 (FT-20 기본 추천)">
        <div className="gx-country-list">
          {countryRows.map(([flag, name, copy, rank]) => (
            <div className="gx-country-row" key={name}>
              <span>{flag}</span>
              <div>
                <strong>{name}</strong>
                <small>{copy}</small>
              </div>
              <em>{rank}</em>
            </div>
          ))}
        </div>
      </FlowCard>
      <div className="gx-actions-row">
        <ChoiceButton>📊 구글비즈니스프로필 인사이트로 정밀 추천</ChoiceButton>
        <ChoiceButton tone="ghost">기본 추천으로 진행</ChoiceButton>
      </div>
    </>
  )
}

function ReportScreen({ onSelect }: Pick<ReferenceFlowScreensProps, "onSelect">) {
  return (
    <>
      <ChatDivider>STEP 6 · 성과 리포팅</ChatDivider>
      <ChatMessage speaker="assistant">
        사장님, 한 주 고생하셨어요! 📈 이번 주 성과를 정리했어요.{" "}
        <b>(FT-24 자동 수집 · FT-25 주간 리포트)</b>
      </ChatMessage>
      <FlowCard title="📊 주간 성과 리포트 · 5/26~6/1">
        <div className="gx-report-grid">
          {reportMetrics.map((metric) => (
            <MetricTile key={metric.label} {...metric} />
          ))}
        </div>
        <div className="gx-country-bars">
          <p>국가별 노출 (현지화 후)</p>
          <span style={{ "--bar": "88%" } as CSSProperties}>🇰🇷 한국</span>
          <span style={{ "--bar": "74%" } as CSSProperties}>🇯🇵 일본</span>
          <span style={{ "--bar": "52%" } as CSSProperties}>🇹🇼 대만</span>
          <span style={{ "--bar": "38%" } as CSSProperties}>🇺🇸 미국</span>
        </div>
        <p className="gx-card-note">
          요약 — 일본 타겟 현지화가 적중했어요! 노출이 전주 대비 크게 늘었고,
          쿠폰 사용도 증가했어요.
        </p>
      </FlowCard>
      <div className="gx-actions-row">
        <ChoiceButton onClick={() => onSelect("dashboard")}>
          📊 성과 대시보드 자세히 보기
        </ChoiceButton>
        <ChoiceButton tone="ghost">어떤 게시물이 제일 잘됐어?</ChoiceButton>
        <ChoiceButton tone="ghost">쿠폰 사용은 몇 건?</ChoiceButton>
      </div>
    </>
  )
}

function DashboardScreen({
  onBack,
}: {
  readonly onBack: () => void
}) {
  return (
    <section className="gx-dashboard">
      <header className="gx-dashboard-head">
        <button aria-label="뒤로" onClick={onBack} type="button">←</button>
        <div>
          <h1>성과 대시보드</h1>
          <p>2026.05.26 ~ 06.01 · 주간</p>
        </div>
        <button aria-label="공유" type="button">↗</button>
      </header>
      <div className="gx-segmented">
        <button aria-current="true" type="button">이번 주</button>
        <button type="button">지난 4주</button>
        <button type="button">전체</button>
      </div>
      <section className="gx-hero-metric">
        <p>이번 주 총 노출 (Impressions)</p>
        <strong>12,480</strong>
        <span>▲ 전주 대비 38% · 역대 최고</span>
        <div className="gx-week-bars" aria-label="요일별 노출">
          <i style={{ height: "36%" }} />
          <i style={{ height: "48%" }} />
          <i style={{ height: "42%" }} />
          <i style={{ height: "64%" }} />
          <i style={{ height: "58%" }} />
          <i style={{ height: "86%" }} />
          <i style={{ height: "72%" }} />
        </div>
      </section>
      <div className="gx-dashboard-grid">
        {reportMetrics.slice(1).map((metric) => (
          <MetricTile key={metric.label} {...metric} />
        ))}
        <MetricTile label="신규 팔로워" trend="▲ 60%" value="+208" />
      </div>
      <FlowCard title="📡 채널별 노출 비중">
        <div className="gx-donut-row">
          <div className="gx-donut"><span>12.4K<br />총 노출</span></div>
          <div className="gx-donut-legend">
            <p><i data-tone="orange" />인스타그램 <b>62% · 7,740</b></p>
            <p><i data-tone="mint" />구글비즈니스프로필 <b>38% · 4,740</b></p>
            <small>릴스 1건이 전체 노출의 34% 기여</small>
          </div>
        </div>
      </FlowCard>
      <FlowCard title="🌏 국가별 노출">
        <div className="gx-country-bars gx-dashboard-bars">
          <span style={{ "--bar": "92%" } as CSSProperties}>🇯🇵 일본 <b>4,210</b></span>
          <span style={{ "--bar": "78%" } as CSSProperties}>🇰🇷 한국 <b>3,460</b></span>
          <span style={{ "--bar": "56%" } as CSSProperties}>🇹🇼 대만 <b>2,180</b></span>
          <span style={{ "--bar": "42%" } as CSSProperties}>🇺🇸 미국 <b>1,490</b></span>
        </div>
      </FlowCard>
      <FlowCard title="🏆 TOP 게시물">
        <ol className="gx-top-posts">
          <li><b>🥞 수플레 팬케이크 릴스</b><span>인스타 릴스 · 노출 4,210</span></li>
          <li><b>☕ 주말 브런치 신메뉴</b><span>구글비즈니스프로필 · 노출 2,180</span></li>
          <li><b>📸 핸드드립 스토리</b><span>인스타 스토리 · 노출 1,540</span></li>
        </ol>
      </FlowCard>
      <FlowCard title="💡 AI 인사이트">
        <p className="gx-card-note">
          일본 타겟 현지화가 적중했어요. 음식 클로즈업 + 9:16 영상 포맷이 노출의
          34%를 만들어냈어요. 다음 주는 같은 포맷으로 대만 타겟 콘텐츠를 늘리는
          걸 추천드려요.
        </p>
      </FlowCard>
    </section>
  )
}

export function ReferenceFlowScreens({
  activeNavId,
  onPublish,
  onSelect,
  publish,
}: ReferenceFlowScreensProps) {
  if (activeNavId === "dashboard") {
    return <DashboardScreen onBack={() => onSelect("report")} />
  }

  return (
    <section className="gx-chat-stage" aria-label="글로컬엑스 작업 흐름">
      <FlowNav activeNavId={activeNavId} onSelect={onSelect} />
      {activeNavId === "onboarding" ? <OnboardingSnapshot /> : null}
      {activeNavId === "photo" ? <PhotoScreen onSelect={onSelect} /> : null}
      {activeNavId === "posting" ? (
        <PostingScreen onPublish={onPublish} publish={publish} />
      ) : null}
      {activeNavId === "reviews" ? <ReviewsScreen /> : null}
      {activeNavId === "targets" ? <TargetsScreen /> : null}
      {activeNavId === "report" ? <ReportScreen onSelect={onSelect} /> : null}
    </section>
  )
}
