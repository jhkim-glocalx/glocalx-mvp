"use client"

/* eslint-disable @next/next/no-img-element */

import { useRef, useState, type KeyboardEvent } from "react"

import { ChatMessage } from "@/app/_components/chat-message"

import {
  platformPreviewKey,
  type MarketingCaptionTranslation,
  type MarketingTranslationLocale,
  type PlatformPostPreview,
} from "./app-workspace-model"
import { ChatDivider, ChoiceButton, FlowCard } from "./reference-flow-shared"
import type { ReferenceFlowScreensProps } from "./reference-flow-screens"

function tabLabel(preview: PlatformPostPreview): string {
  if (preview.platform === "INSTAGRAM") {
    return "Instagram"
  }
  return "GBP"
}

function statusMessageForPreview(options: {
  readonly activePreview: PlatformPostPreview | undefined
  readonly publish: ReferenceFlowScreensProps["publish"]
}): string | null {
  if (options.activePreview === undefined) {
    return null
  }
  if (
    options.publish.kind !== "idle" &&
    options.publish.targetChannel !== options.activePreview.platform
  ) {
    return null
  }
  if (options.publish.kind === "loading") {
    return `${tabLabel(options.activePreview)} 게시 상태를 확인하는 중`
  }
  if (options.publish.kind === "blocked") {
    return options.publish.message
  }
  if (options.publish.kind === "published") {
    return "게시 요청이 완료됐습니다."
  }
  return `${tabLabel(options.activePreview)} 게시물이 준비됐습니다.`
}

function previewActionLabel(preview: PlatformPostPreview | undefined): string {
  if (preview === undefined) {
    return "게시물 발행"
  }
  if (preview.platform === "INSTAGRAM") {
    return "Instagram에 게시하기"
  }
  return "GBP에 게시하기"
}

function translationForLocale(
  translations: readonly MarketingCaptionTranslation[],
  locale: MarketingTranslationLocale | null
): MarketingCaptionTranslation | undefined {
  if (locale === null) {
    return undefined
  }
  return translations.find((translation) => translation.locale === locale)
}

export function PostingScreen({
  activePreviewKey,
  draft,
  imageAssets,
  onPreviewChange,
  onPublish,
  publish,
}: Pick<
  ReferenceFlowScreensProps,
  | "activePreviewKey"
  | "draft"
  | "imageAssets"
  | "onPreviewChange"
  | "onPublish"
  | "publish"
>) {
  const [activeTranslationLocale, setActiveTranslationLocale] =
    useState<MarketingTranslationLocale | null>("en")
  const previewTabRefs = useRef<(HTMLButtonElement | null)[]>([])

  if (draft.kind !== "ready") {
    return (
      <>
        <ChatDivider>STEP 3 · 여러 SNS 자동홍보</ChatDivider>
        <ChatMessage
          message="사진과 알리고 싶은 말이나 단어를 먼저 분석하면 채널별 게시물 미리보기가 생성됩니다."
          speaker="assistant"
        />
      </>
    )
  }

  const platformPreviews = draft.platformPreviews
  const selectedPreview =
    platformPreviews.find(
      (preview) => platformPreviewKey(preview) === activePreviewKey
    ) ?? platformPreviews[0]
  const selectedPreviewKey =
    selectedPreview === undefined
      ? activePreviewKey
      : platformPreviewKey(selectedPreview)
  const publishLocked =
    selectedPreview !== undefined &&
    (publish.kind === "loading" ||
      (publish.kind === "published" &&
        publish.targetChannel === selectedPreview.platform))
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
  const publishStatusMessage = statusMessageForPreview({
    activePreview: selectedPreview,
    publish,
  })
  const selectedTranslation = translationForLocale(
    selectedPreview?.translations ?? [],
    activeTranslationLocale
  )

  function handleTranslationToggle(locale: MarketingTranslationLocale) {
    setActiveTranslationLocale((currentLocale) =>
      currentLocale === locale ? null : locale
    )
  }

  function handlePreviewKeyDown(
    event: KeyboardEvent<HTMLButtonElement>,
    index: number
  ) {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") {
      return
    }
    event.preventDefault()
    const offset = event.key === "ArrowRight" ? 1 : -1
    const nextIndex =
      (index + offset + platformPreviews.length) % platformPreviews.length
    const nextPreview = platformPreviews[nextIndex]
    if (nextPreview !== undefined) {
      onPreviewChange(platformPreviewKey(nextPreview))
      previewTabRefs.current[nextIndex]?.focus()
    }
  }

  return (
    <>
      <ChatDivider>STEP 3 · 여러 SNS 자동홍보</ChatDivider>
      <ChatMessage speaker="assistant">
        사진 보정과 문구 생성이 끝났습니다. 채널과 언어별 미리보기를 확인한 뒤
        업로드해주세요.
      </ChatMessage>
      <FlowCard title="완성된 게시물을 확인해주세요">
        <div className="gx-post-tabs" role="tablist">
          {platformPreviews.map((preview, index) => (
            <button
              aria-controls="post-preview-panel"
              aria-label={preview.label}
              aria-selected={platformPreviewKey(preview) === selectedPreviewKey}
              id={`post-preview-tab-${platformPreviewKey(preview)}`}
              key={platformPreviewKey(preview)}
              onKeyDown={(event) => handlePreviewKeyDown(event, index)}
              onClick={() => onPreviewChange(platformPreviewKey(preview))}
              ref={(element) => {
                previewTabRefs.current[index] = element
              }}
              role="tab"
              tabIndex={
                platformPreviewKey(preview) === selectedPreviewKey ? 0 : -1
              }
              type="button"
            >
              {tabLabel(preview)}
            </button>
          ))}
        </div>
        <div
          aria-labelledby={`post-preview-tab-${selectedPreviewKey}`}
          className="gx-post-image gx-post-image-live"
          id="post-preview-panel"
          role="tabpanel"
          style={{
            aspectRatio:
              selectedPreview?.aspectRatio === "4:3" ? "4 / 3" : "1 / 1",
          }}
        >
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
        <div className="gx-post-caption-stack">
          <p className="gx-post-copy">
            {selectedPreview?.copy ?? draft.koreanCopy}
          </p>
          {selectedPreview?.translations.length === 0 ||
          selectedPreview === undefined ? null : (
            <div className="gx-translation-toggle" role="group">
              {selectedPreview.translations.map((translation) => (
                <button
                  aria-pressed={activeTranslationLocale === translation.locale}
                  key={translation.locale}
                  onClick={() => handleTranslationToggle(translation.locale)}
                  type="button"
                >
                  {translation.label}
                </button>
              ))}
            </div>
          )}
          {selectedTranslation === undefined ? null : (
            <p className="gx-post-copy gx-post-copy-translation">
              <span>{selectedTranslation.label}</span>
              {selectedTranslation.copy}
            </p>
          )}
        </div>
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
      <div className="gx-actions-row gx-publish-actions">
        {publishStatusMessage === null ? null : (
          <p aria-live="polite" className="gx-publish-status" role="status">
            {publishStatusMessage}
          </p>
        )}
        {selectedPreview === undefined ? null : (
          <ChoiceButton
            disabled={publishLocked}
            onClick={() => onPublish(selectedPreview.platform)}
          >
            {previewActionLabel(selectedPreview)}
          </ChoiceButton>
        )}
      </div>
    </>
  )
}
