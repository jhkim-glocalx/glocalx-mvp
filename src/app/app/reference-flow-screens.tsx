"use client"

/* eslint-disable @next/next/no-img-element */

import type { CSSProperties, FormEvent, ReactNode } from "react"

import { ChatMessage } from "@/app/_components/chat-message"
import { ExtractionPanel } from "@/app/onboarding/onboarding-panels"
import type {
  ExtractionState,
  StoreProfileDraft,
} from "@/app/onboarding/onboarding-model"

import {
  appNavItems,
  type AppNavId,
  type DraftImagePreview,
  type DraftState,
  type MarketingImageAsset,
  type MarketingPlatform,
  type PublishState,
} from "./app-workspace-model"

type ReferenceFlowScreensProps = {
  readonly activeNavId: AppNavId
  readonly activePlatform: MarketingPlatform
  readonly draft: DraftState
  readonly imageAssets: readonly MarketingImageAsset[]
  readonly intent: string
  readonly onDraftSubmit: () => void
  readonly onImageFiles: (files: FileList | null) => void
  readonly onIntentChange: (intent: string) => void
  readonly onPlatformChange: (platform: MarketingPlatform) => void
  readonly onComposerPreset: (message: string) => void
  readonly onboardingExtraction: ExtractionState
  readonly onboardingProfileDraft: StoreProfileDraft | undefined
  readonly onboardingSubmittedInput: string
  readonly onOnboardingCandidateSelect: (candidate: StoreProfileDraft) => void
  readonly onPublish: () => void
  readonly onSelect: (navId: AppNavId) => void
  readonly onSuggestionAccept: () => void
  readonly onSuggestionSkip: () => void
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
    <button
      className="gx-choice-chip"
      data-tone={tone}
      onClick={onClick}
      type="button"
    >
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

function OnboardingSnapshot({
  onComposerPreset,
  onboardingExtraction,
  onboardingProfileDraft,
  onboardingSubmittedInput,
  onOnboardingCandidateSelect,
}: Pick<
  ReferenceFlowScreensProps,
  | "onComposerPreset"
  | "onboardingExtraction"
  | "onboardingProfileDraft"
  | "onboardingSubmittedInput"
  | "onOnboardingCandidateSelect"
>) {
  return (
    <>
      <ChatDivider>STEP 1 · 온보딩 / 구글비즈니스프로필 세팅</ChatDivider>
      <ChatMessage
        message="안녕하세요 사장님! 👋 저는 가게의 글로벌 마케팅을 도와드릴 글로컬엑스예요. 먼저 가게를 등록할게요. 네이버 플레이스 링크나 가게 이름을 알려주시겠어요?"
        speaker="assistant"
      />
      <div className="gx-actions-row">
        <ChoiceButton
          onClick={() => onComposerPreset("https://naver.me/mybrunchcafe")}
        >
          네이버 플레이스 링크 붙여넣기
        </ChoiceButton>
        <ChoiceButton
          onClick={() => onComposerPreset("브런치모먼트")}
          tone="ghost"
        >
          상호명으로 검색
        </ChoiceButton>
      </div>
      <ExtractionPanel
        extraction={onboardingExtraction}
        onCandidateSelect={onOnboardingCandidateSelect}
        profileDraft={onboardingProfileDraft}
        submittedInput={onboardingSubmittedInput}
      />
    </>
  )
}

function AssetThumbs({
  imageAssets,
}: {
  readonly imageAssets: readonly MarketingImageAsset[]
}) {
  if (imageAssets.length === 0) {
    return (
      <div className="gx-upload-empty">
        <strong>이미지 자리</strong>
        <span>메뉴, 매장, 이벤트 사진을 올릴 수 있습니다.</span>
      </div>
    )
  }

  return (
    <div className="gx-upload-grid" aria-label="업로드된 이미지">
      {imageAssets.map((asset) => (
        <figure key={asset.id}>
          <img alt={asset.name} src={asset.dataUrl} />
          <figcaption>{asset.name}</figcaption>
        </figure>
      ))}
    </div>
  )
}

function ImageComparison({
  image,
  imageAssets,
}: {
  readonly image: DraftImagePreview
  readonly imageAssets: readonly MarketingImageAsset[]
}) {
  const asset = imageAssets.find((candidate) => candidate.id === image.assetId)
  const originalSrc = asset?.dataUrl
  const editedSrc = image.editedDataUrl ?? originalSrc

  return (
    <div className="gx-image-compare gx-image-compare-live">
      <figure>
        {originalSrc === undefined ? null : (
          <img alt={`${image.originalLabel} 원본`} src={originalSrc} />
        )}
        <figcaption>
          <span>원본</span>
          <strong>{image.originalLabel}</strong>
        </figcaption>
      </figure>
      <figure>
        {editedSrc === undefined ? null : (
          <img
            alt={image.altText}
            src={editedSrc}
            style={{
              filter:
                image.editedDataUrl === null ? image.cssFilter : undefined,
            }}
          />
        )}
        <figcaption>
          <span>{image.editedLabel}</span>
          <strong>
            {image.qualityScore}점 · {image.cropFocus}
          </strong>
        </figcaption>
      </figure>
      <p>{image.editSummary}</p>
    </div>
  )
}

function PhotoScreen({
  draft,
  imageAssets,
  intent,
  onDraftSubmit,
  onImageFiles,
  onIntentChange,
  onSelect,
  onSuggestionAccept,
  onSuggestionSkip,
}: Pick<
  ReferenceFlowScreensProps,
  | "draft"
  | "imageAssets"
  | "intent"
  | "onDraftSubmit"
  | "onImageFiles"
  | "onIntentChange"
  | "onSelect"
  | "onSuggestionAccept"
  | "onSuggestionSkip"
>) {
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    onDraftSubmit()
  }

  return (
    <>
      <ChatDivider>STEP 2 · 사진 자동 고도화</ChatDivider>
      <ChatMessage speaker="assistant">
        먼저 게시물에 쓸 이미지와 홍보 의도를 함께 볼게요. 이미지의 목적, 보정
        방향, 채널별 문구까지 한 번에 준비합니다.
      </ChatMessage>
      <FlowCard title="이미지 + 홍보 의도">
        <form className="gx-marketing-form" onSubmit={handleSubmit}>
          <label className="gx-upload-picker">
            <input
              accept="image/png,image/jpeg,image/webp"
              multiple
              onChange={(event) => onImageFiles(event.currentTarget.files)}
              type="file"
            />
            <span>이미지 업로드</span>
          </label>
          <AssetThumbs imageAssets={imageAssets} />
          <label className="gx-intent-field">
            <span>홍보 의도</span>
            <textarea
              onChange={(event) => onIntentChange(event.currentTarget.value)}
              value={intent}
            />
          </label>
          <button
            className="gx-choice-chip"
            disabled={draft.kind === "loading"}
            type="submit"
          >
            AI 분석 및 이미지 개선
          </button>
        </form>
      </FlowCard>
      {draft.kind === "loading" ? (
        <ChatMessage
          message="이미지와 홍보 의도를 분석하는 중"
          speaker="assistant"
        />
      ) : null}
      {draft.kind === "error" ? (
        <ChatMessage message={draft.message} speaker="assistant" />
      ) : null}
      {draft.kind === "ready" ? (
        <>
          <ChatMessage message={intent} speaker="owner" />
          {draft.intentAnalysis === null ? null : (
            <FlowCard title="의도 분석 결과">
              <dl className="gx-check-list">
                <div>
                  <dt>목표</dt>
                  <dd>{draft.intentAnalysis.objective}</dd>
                </div>
                <div>
                  <dt>고객</dt>
                  <dd>{draft.intentAnalysis.audience}</dd>
                </div>
                <div>
                  <dt>키워드</dt>
                  <dd>{draft.intentAnalysis.keywords.join(", ")}</dd>
                </div>
              </dl>
            </FlowCard>
          )}
          {draft.images.length > 0 ? (
            <FlowCard title="이미지 개선 결과">
              <div className="gx-image-result-list">
                {draft.images.map((image) => (
                  <ImageComparison
                    image={image}
                    imageAssets={imageAssets}
                    key={image.assetId}
                  />
                ))}
              </div>
            </FlowCard>
          ) : null}
          {draft.suggestion === null ? null : (
            <FlowCard title="스마트 제안">
              <div className="gx-suggestion-card">
                <strong>{draft.suggestion.title}</strong>
                <p>{draft.suggestion.message}</p>
                <small>{draft.suggestion.rationale}</small>
              </div>
              <div className="gx-actions-row">
                <ChoiceButton onClick={onSuggestionAccept}>
                  제안 반영
                </ChoiceButton>
                <ChoiceButton onClick={onSuggestionSkip} tone="ghost">
                  제안 없이 진행
                </ChoiceButton>
              </div>
            </FlowCard>
          )}
          <div className="gx-actions-row">
            <ChoiceButton onClick={() => onSelect("posting")}>
              게시물 미리보기
            </ChoiceButton>
          </div>
        </>
      ) : null}
    </>
  )
}

function PostingScreen({
  activePlatform,
  draft,
  imageAssets,
  onPlatformChange,
  onPublish,
  publish,
}: Pick<
  ReferenceFlowScreensProps,
  | "activePlatform"
  | "draft"
  | "imageAssets"
  | "onPlatformChange"
  | "onPublish"
  | "publish"
>) {
  if (draft.kind !== "ready") {
    return (
      <>
        <ChatDivider>STEP 3 · 다채널 자동 포스팅</ChatDivider>
        <ChatMessage
          message="이미지와 홍보 의도를 먼저 분석하면 채널별 게시물 미리보기가 생성됩니다."
          speaker="assistant"
        />
      </>
    )
  }

  const selectedPreview =
    draft.platformPreviews.find(
      (preview) => preview.platform === activePlatform
    ) ?? draft.platformPreviews[0]
  const selectedImage =
    selectedPreview === undefined
      ? undefined
      : draft.images.find(
          (image) => image.assetId === selectedPreview.imageAssetId
        )
  const selectedAsset =
    selectedPreview?.imageAssetId === null || selectedPreview === undefined
      ? undefined
      : imageAssets.find((asset) => asset.id === selectedPreview.imageAssetId)
  const imageSrc = selectedImage?.editedDataUrl ?? selectedAsset?.dataUrl
  const platformLabel = (preview: { readonly platform: MarketingPlatform }) =>
    preview.platform === "GBP" ? "GBP" : "Instagram"
  const publishStatusMessage =
    publish.kind === "loading"
      ? "GBP 게시 상태를 확인하는 중"
      : publish.kind === "blocked"
        ? "게시 전 Google 비즈니스 프로필 인증이 필요합니다."
        : publish.kind === "published"
          ? "게시 요청이 완료됐습니다."
          : null

  return (
    <>
      <ChatDivider>STEP 3 · 다채널 자동 포스팅</ChatDivider>
      <ChatMessage speaker="assistant">
        이미지 개선과 문구 생성이 끝났습니다. 업로드 전에 채널별 미리보기를
        확인해주세요.
      </ChatMessage>
      <FlowCard title="완성된 게시물을 확인해주세요">
        <div className="gx-post-tabs" role="tablist">
          {draft.platformPreviews.map((preview) => (
            <button
              aria-label={preview.label}
              aria-selected={preview.platform === activePlatform}
              key={preview.platform}
              onClick={() => onPlatformChange(preview.platform)}
              role="tab"
              type="button"
            >
              {platformLabel(preview)}
            </button>
          ))}
        </div>
        <div className="gx-post-image gx-post-image-live">
          {imageSrc === undefined ? (
            <span>{selectedPreview?.aspectRatio ?? "1:1"}</span>
          ) : (
            <img
              alt={selectedImage?.altText ?? "게시 미리보기 이미지"}
              src={imageSrc}
              style={{
                filter:
                  selectedImage?.editedDataUrl === null
                    ? selectedImage.cssFilter
                    : undefined,
              }}
            />
          )}
          <strong>{selectedPreview?.aspectRatio ?? "1:1"}</strong>
        </div>
        <p className="gx-post-copy">
          {selectedPreview?.copy ?? draft.koreanCopy}
        </p>
        <div className="gx-hashtag-row">
          {(selectedPreview?.hashtags ?? []).map((hashtag) => (
            <span key={hashtag}>{hashtag}</span>
          ))}
        </div>
        <div className="gx-channel-select">
          <p>업로드 전 체크</p>
          {(selectedPreview?.uploadNotes ?? []).map((note) => (
            <span key={note}>✓ {note}</span>
          ))}
        </div>
      </FlowCard>
      {publish.kind === "loading" ? (
        <ChatMessage
          message="GBP 게시 상태를 확인하는 중"
          speaker="assistant"
        />
      ) : null}
      {publish.kind === "blocked" ? (
        <ChatMessage message={publish.message} speaker="assistant" />
      ) : null}
      {publish.kind === "published" ? (
        <ChatMessage message={publish.message} speaker="assistant" />
      ) : null}
      <div className="gx-actions-row gx-publish-actions">
        {publishStatusMessage === null ? null : (
          <p className="gx-publish-status">{publishStatusMessage}</p>
        )}
        <ChoiceButton onClick={onPublish}>게시물 발행</ChoiceButton>
      </div>
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
          <button type="button">
            😊 친근하게 <span>AI 생성</span>
          </button>
          <button type="button">
            🙏 정중하게 <span>AI 생성</span>
          </button>
          <button type="button">
            ✨ 위트있게 <span>AI 생성</span>
          </button>
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
        사장님 가게(브런치 카페·홍대·객단가 1.8만원)를 분석했어요. 우선 업종
        기반 기본 타겟을 추천드려요. <b>(FT-20 기본 추천)</b>
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

function ReportScreen({
  onSelect,
}: Pick<ReferenceFlowScreensProps, "onSelect">) {
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

function DashboardScreen({ onBack }: { readonly onBack: () => void }) {
  return (
    <section className="gx-dashboard">
      <header className="gx-dashboard-head">
        <button aria-label="뒤로" onClick={onBack} type="button">
          ←
        </button>
        <div>
          <h1>성과 대시보드</h1>
          <p>2026.05.26 ~ 06.01 · 주간</p>
        </div>
        <button aria-label="공유" type="button">
          ↗
        </button>
      </header>
      <div className="gx-segmented">
        <button aria-current="true" type="button">
          이번 주
        </button>
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
          <div className="gx-donut">
            <span>
              12.4K
              <br />총 노출
            </span>
          </div>
          <div className="gx-donut-legend">
            <p>
              <i data-tone="orange" />
              인스타그램 <b>62% · 7,740</b>
            </p>
            <p>
              <i data-tone="mint" />
              구글비즈니스프로필 <b>38% · 4,740</b>
            </p>
            <small>릴스 1건이 전체 노출의 34% 기여</small>
          </div>
        </div>
      </FlowCard>
      <FlowCard title="🌏 국가별 노출">
        <div className="gx-country-bars gx-dashboard-bars">
          <span style={{ "--bar": "92%" } as CSSProperties}>
            🇯🇵 일본 <b>4,210</b>
          </span>
          <span style={{ "--bar": "78%" } as CSSProperties}>
            🇰🇷 한국 <b>3,460</b>
          </span>
          <span style={{ "--bar": "56%" } as CSSProperties}>
            🇹🇼 대만 <b>2,180</b>
          </span>
          <span style={{ "--bar": "42%" } as CSSProperties}>
            🇺🇸 미국 <b>1,490</b>
          </span>
        </div>
      </FlowCard>
      <FlowCard title="🏆 TOP 게시물">
        <ol className="gx-top-posts">
          <li>
            <b>🥞 수플레 팬케이크 릴스</b>
            <span>인스타 릴스 · 노출 4,210</span>
          </li>
          <li>
            <b>☕ 주말 브런치 신메뉴</b>
            <span>구글비즈니스프로필 · 노출 2,180</span>
          </li>
          <li>
            <b>📸 핸드드립 스토리</b>
            <span>인스타 스토리 · 노출 1,540</span>
          </li>
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
  activePlatform,
  draft,
  imageAssets,
  intent,
  onDraftSubmit,
  onImageFiles,
  onIntentChange,
  onPlatformChange,
  onComposerPreset,
  onboardingExtraction,
  onboardingProfileDraft,
  onboardingSubmittedInput,
  onOnboardingCandidateSelect,
  onPublish,
  onSelect,
  onSuggestionAccept,
  onSuggestionSkip,
  publish,
}: ReferenceFlowScreensProps) {
  if (activeNavId === "dashboard") {
    return <DashboardScreen onBack={() => onSelect("report")} />
  }

  return (
    <section className="gx-chat-stage" aria-label="글로컬엑스 작업 흐름">
      <FlowNav activeNavId={activeNavId} onSelect={onSelect} />
      {activeNavId === "onboarding" ? (
        <OnboardingSnapshot
          onComposerPreset={onComposerPreset}
          onboardingExtraction={onboardingExtraction}
          onboardingProfileDraft={onboardingProfileDraft}
          onboardingSubmittedInput={onboardingSubmittedInput}
          onOnboardingCandidateSelect={onOnboardingCandidateSelect}
        />
      ) : null}
      {activeNavId === "photo" ? (
        <PhotoScreen
          draft={draft}
          imageAssets={imageAssets}
          intent={intent}
          onDraftSubmit={onDraftSubmit}
          onImageFiles={onImageFiles}
          onIntentChange={onIntentChange}
          onSelect={onSelect}
          onSuggestionAccept={onSuggestionAccept}
          onSuggestionSkip={onSuggestionSkip}
        />
      ) : null}
      {activeNavId === "posting" ? (
        <PostingScreen
          activePlatform={activePlatform}
          draft={draft}
          imageAssets={imageAssets}
          onPlatformChange={onPlatformChange}
          onPublish={onPublish}
          publish={publish}
        />
      ) : null}
      {activeNavId === "reviews" ? <ReviewsScreen /> : null}
      {activeNavId === "targets" ? <TargetsScreen /> : null}
      {activeNavId === "report" ? <ReportScreen onSelect={onSelect} /> : null}
    </section>
  )
}
