import { describe, expect, it } from "vitest"

import type { OrgLocation } from "@glocalx/integrations/gbp-contracts"

import { findAdoptionMatch } from "./adoption-matching"

const profile = {
  name: "라멘하우스 합정점",
  address: "서울 마포구 양화로 19",
  phone: "02-987-6543",
}

function location(overrides: Partial<OrgLocation>): OrgLocation {
  return {
    name: "locations/candidate",
    title: "라멘하우스 합정점",
    addressLine: "서울 마포구 양화로 19",
    phone: "02-987-6543",
    ...overrides,
  }
}

describe("findAdoptionMatch", () => {
  it("matches a hand-entered listing whose address uses the full administrative name", () => {
    const match = findAdoptionMatch(profile, [
      location({ addressLine: "서울특별시 마포구 양화로 19" }),
    ])

    expect(match?.location.name).toBe("locations/candidate")
    expect(match?.evidence).toEqual(["phone", "name", "address"])
  })

  it("treats a hyphenated and a +82 phone as the same number", () => {
    const match = findAdoptionMatch(profile, [
      location({ phone: "+82 2 987 6543", addressLine: "다른 주소" }),
    ])

    expect(match?.evidence).toEqual(["phone", "name"])
  })

  it("refuses a single shared signal", () => {
    // Same name, different branch: exactly the "OO커피 OO점" case that a
    // name-only match would wrongly attach.
    expect(
      findAdoptionMatch(profile, [
        location({
          phone: "02-111-2222",
          addressLine: "서울 강남구 테헤란로 1",
        }),
      ])
    ).toBeUndefined()
  })

  it("refuses to guess when two org listings match equally well", () => {
    expect(
      findAdoptionMatch(profile, [
        location({ name: "locations/first" }),
        location({ name: "locations/second" }),
      ])
    ).toBeUndefined()
  })

  it("ignores org listings belonging to other businesses", () => {
    expect(
      findAdoptionMatch(profile, [
        location({
          name: "locations/unrelated",
          title: "글로컬엑스 서면점",
          addressLine: "부산 서면로 39",
          phone: "051-000-0000",
        }),
      ])
    ).toBeUndefined()
  })

  it("does not match on a listing with no phone and a different address", () => {
    const noPhone: OrgLocation = {
      name: "locations/no-phone",
      title: "라멘하우스 합정점",
      addressLine: "서울 강남구 테헤란로 1",
    }

    expect(findAdoptionMatch(profile, [noPhone])).toBeUndefined()
  })
})
