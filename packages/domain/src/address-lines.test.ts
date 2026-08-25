import { describe, expect, it } from "vitest"

import {
  buildStorefrontAddressLines,
  type StructuredAddressParts,
} from "./address-lines"

type Case = {
  readonly label: string
  readonly address: string
  readonly parts: StructuredAddressParts
  readonly expected: string
}

const strippedCases: readonly Case[] = [
  {
    label: "광역시 abbreviated, as the 하레 listing was typed",
    address: "대전 유성구 어은로48번길 12 2층",
    parts: { administrativeArea: "대전광역시", locality: "유성구" },
    expected: "어은로48번길 12 2층",
  },
  {
    label: "광역시 spelled in full",
    address: "대전광역시 유성구 어은로48번길 12 2층",
    parts: { administrativeArea: "대전광역시", locality: "유성구" },
    expected: "어은로48번길 12 2층",
  },
  {
    label: "Seoul, which Google used to normalize on its own",
    address: "서울 마포구 양화로 19",
    parts: {
      administrativeArea: "서울특별시",
      locality: "마포구",
      sublocality: "서교동",
    },
    expected: "양화로 19",
  },
  {
    label: "도/시 where the geocoder reported the 시",
    address: "경기도 성남시 분당구 판교로 235",
    parts: { administrativeArea: "경기도", locality: "성남시" },
    expected: "분당구 판교로 235",
  },
  {
    label: "도/시/구 where the geocoder reported only the 구",
    address: "경기도 성남시 분당구 판교로 235",
    parts: { administrativeArea: "경기도", locality: "분당구" },
    expected: "판교로 235",
  },
  {
    label: "도 abbreviated non-prefixally",
    address: "충북 청주시 흥덕구 대신로 43",
    parts: { administrativeArea: "충청북도", locality: "청주시" },
    expected: "흥덕구 대신로 43",
  },
  {
    label: "군/면 keeps the 면 the geocoder did not return",
    address: "전남 구례군 마산면 화엄사로 539",
    parts: { administrativeArea: "전라남도", locality: "구례군" },
    expected: "마산면 화엄사로 539",
  },
  {
    label: "특별자치도 spelled in full",
    address: "제주특별자치도 제주시 첨단로 242",
    parts: { administrativeArea: "제주특별자치도", locality: "제주시" },
    expected: "첨단로 242",
  },
  {
    label: "강원 typed under its former name",
    address: "강원도 춘천시 중앙로 1",
    parts: { administrativeArea: "강원특별자치도", locality: "춘천시" },
    expected: "중앙로 1",
  },
  {
    label: "특별자치시 with no separate 구",
    address: "세종 한누리대로 2130",
    parts: {
      administrativeArea: "세종특별자치시",
      locality: "세종특별자치시",
    },
    expected: "한누리대로 2130",
  },
  {
    label: "구 typed without its suffix",
    address: "대전 유성 어은로48번길 12",
    parts: { administrativeArea: "대전광역시", locality: "유성구" },
    expected: "어은로48번길 12",
  },
  {
    label: "jibeon 동 that is being sent as sublocality",
    address: "부산 사하구 하단동 1-1",
    parts: {
      administrativeArea: "부산광역시",
      locality: "사하구",
      sublocality: "하단동",
    },
    expected: "1-1",
  },
  {
    label: "surrounding and repeated whitespace",
    address: "  대전   유성구  어은로48번길 12 ",
    parts: { administrativeArea: "대전광역시", locality: "유성구" },
    expected: "어은로48번길 12",
  },
]

const preservedCases: readonly Case[] = [
  {
    label: "jibeon 동 the geocoder never returned",
    address: "부산 사하구 하단동 1-1",
    parts: { administrativeArea: "부산광역시", locality: "사하구" },
    expected: "하단동 1-1",
  },
  {
    label: "a 동 that merely rhymes with the 구 being sent",
    address: "인천 중구 중동 1-1",
    parts: { administrativeArea: "인천광역시", locality: "중구" },
    expected: "중동 1-1",
  },
  {
    label: "a building block named 동",
    address: "대전 유성구 어은로 12 상가동 201호",
    parts: { administrativeArea: "대전광역시", locality: "유성구" },
    expected: "어은로 12 상가동 201호",
  },
  {
    label: "an address that never carried the prefix",
    address: "어은로48번길 12 2층",
    parts: { administrativeArea: "대전광역시", locality: "유성구" },
    expected: "어은로48번길 12 2층",
  },
  {
    label: "a different 시 than the one geocoding resolved",
    address: "경기도 수원시 팔달구 인계로 123",
    parts: { administrativeArea: "경기도", locality: "성남시" },
    expected: "수원시 팔달구 인계로 123",
  },
]

describe("buildStorefrontAddressLines", () => {
  it.each(strippedCases)(
    "drops the prefix Google already receives structurally — $label",
    ({ address, parts, expected }) => {
      expect(buildStorefrontAddressLines(address, parts)).toEqual([expected])
    }
  )

  it.each(preservedCases)(
    "keeps address detail Google is not otherwise given — $label",
    ({ address, parts, expected }) => {
      expect(buildStorefrontAddressLines(address, parts)).toEqual([expected])
    }
  )

  it("never leaves Google an empty street line", () => {
    expect(
      buildStorefrontAddressLines("대전 유성구", {
        administrativeArea: "대전광역시",
        locality: "유성구",
      })
    ).toEqual(["대전 유성구"])
    expect(
      buildStorefrontAddressLines("   ", {
        administrativeArea: "대전광역시",
        locality: "유성구",
      })
    ).toEqual(["   "])
  })
})
