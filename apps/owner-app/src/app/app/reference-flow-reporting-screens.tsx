"use client"

import { ChatMessage } from "@/app/_components/chat-message"

import type { AppNavId } from "./app-workspace-model"
import {
  barStyle,
  ChatDivider,
  ChoiceButton,
  FlowCard,
  MetricTile,
} from "./reference-flow-shared"

const countryRows = [
  ["일본", "인근 업종 인기 · 객단가 적합", "1위"],
  ["중국", "홍대 상권 방문 비중 높음", "2위"],
  ["미국", "영어권 기본 타겟", "3위"],
] as const

const reportMetrics = [
  { label: "총 노출", trend: "▲ 38%", value: "12,480" },
  { label: "프로필 조회", trend: "▲ 22%", value: "1,920" },
  { label: "신규 리뷰", trend: "▲ 5건", value: "17건" },
  { label: "쿠폰 사용", trend: "▲ 11건", value: "34건" },
] as const

export function TargetsScreen() {
  return (
    <>
      <ChatDivider>STEP 5 · 홍보할 국가</ChatDivider>
      <ChatMessage speaker="assistant">
        사장님 가게(브런치 카페·홍대·객단가 1.8만원)를 분석했어요. 우선 업종
        기반으로 홍보할 국가를 추천드려요.
      </ChatMessage>
      <FlowCard title="기본 홍보할 국가 추천">
        <div className="gx-country-list">
          {countryRows.map(([name, copy, rank]) => (
            <div className="gx-country-row" key={name}>
              <span>{rank}</span>
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
        <ChoiceButton>구글비즈니스프로필 인사이트로 정밀 추천</ChoiceButton>
        <ChoiceButton tone="ghost">기본 추천으로 진행</ChoiceButton>
      </div>
    </>
  )
}

export function ReportScreen({
  onSelect,
}: {
  readonly onSelect: (navId: AppNavId) => void
}) {
  return (
    <>
      <ChatDivider>STEP 6 · 주간 홍보 실적</ChatDivider>
      <ChatMessage speaker="assistant">
        사장님, 한 주 고생하셨어요! 이번 주 홍보 실적을 정리했어요.
      </ChatMessage>
      <FlowCard title="주간 홍보 실적 · 5/26~6/1">
        <div className="gx-report-grid">
          {reportMetrics.map((metric) => (
            <MetricTile key={metric.label} {...metric} />
          ))}
        </div>
        <div className="gx-country-bars">
          <p>국가별 노출 (현지화 후)</p>
          <span style={barStyle("88%")}>한국</span>
          <span style={barStyle("74%")}>일본</span>
          <span style={barStyle("52%")}>대만</span>
          <span style={barStyle("38%")}>미국</span>
        </div>
        <p className="gx-card-note">
          요약: 일본 타겟 현지화가 적중했어요. 노출이 전주 대비 크게 늘었고,
          쿠폰 사용도 증가했어요.
        </p>
      </FlowCard>
      <div className="gx-actions-row">
        <ChoiceButton onClick={() => onSelect("dashboard")}>
          홍보 실적 자세히 보기
        </ChoiceButton>
        <ChoiceButton tone="ghost">어떤 게시물이 제일 잘됐어?</ChoiceButton>
        <ChoiceButton tone="ghost">쿠폰 사용은 몇 건?</ChoiceButton>
      </div>
    </>
  )
}

export function DashboardScreen({ onBack }: { readonly onBack: () => void }) {
  return (
    <section className="gx-dashboard">
      <header className="gx-dashboard-head">
        <button aria-label="뒤로" onClick={onBack} type="button">
          ←
        </button>
        <div>
          <h1>홍보 실적 자세히 보기</h1>
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
      <FlowCard title="채널별 노출 비중">
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
      <FlowCard title="국가별 노출">
        <div className="gx-country-bars gx-dashboard-bars">
          <span style={barStyle("92%")}>
            일본 <b>4,210</b>
          </span>
          <span style={barStyle("78%")}>
            한국 <b>3,460</b>
          </span>
          <span style={barStyle("56%")}>
            대만 <b>2,180</b>
          </span>
          <span style={barStyle("42%")}>
            미국 <b>1,490</b>
          </span>
        </div>
      </FlowCard>
      <FlowCard title="TOP 게시물">
        <ol className="gx-top-posts">
          <li>
            <b>수플레 팬케이크 릴스</b>
            <span>인스타 릴스 · 노출 4,210</span>
          </li>
          <li>
            <b>주말 브런치 신메뉴</b>
            <span>구글비즈니스프로필 · 노출 2,180</span>
          </li>
          <li>
            <b>핸드드립 스토리</b>
            <span>인스타 스토리 · 노출 1,540</span>
          </li>
        </ol>
      </FlowCard>
      <FlowCard title="AI 인사이트">
        <p className="gx-card-note">
          일본 타겟 현지화가 적중했어요. 음식 클로즈업 + 9:16 영상 포맷이 노출의
          34%를 만들어냈어요. 다음 주는 같은 포맷으로 대만 타겟 콘텐츠를 늘리는
          걸 추천드려요.
        </p>
      </FlowCard>
    </section>
  )
}
