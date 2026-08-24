// Google renders a storefrontAddress by printing the structured administrative
// fields (administrativeArea / locality / sublocality) in front of addressLines.
// A Korean owner-confirmed address already opens with those same parts, so
// passing it through verbatim double-prints the 시/구: the live listing created
// 2026-08-13 rendered as "대전광역시 유성구 대전 유성구 어은로48번길 12 2층".
//
// Google does often collapse the duplicate itself: a validateOnly sweep on
// 2026-08-23 sent the raw address for 서울/대전/전남 and got the stripped form
// echoed back every time. But the 하레 listing above proves that normalization
// is conditional, not guaranteed — the one thing it carried that the sweep did
// not is a trailing unit ("2층"). Rather than depend on a rule we cannot see,
// the redundant prefix is removed here so the rendered listing is correct
// whether Google normalizes or not.
//
// The stripping rule is deliberately narrow: a leading token is dropped only
// when it names a part this same body already sends structurally. Whatever is
// removed is therefore still delivered to Google, and a 동/리 the geocoder never
// returned (the meaningful half of a jibeon address) is never touched.

export type StructuredAddressParts = {
  readonly administrativeArea: string
  readonly locality: string
  readonly sublocality?: string
}

// The 17 시/도 with the abbreviations owners actually type. Most abbreviate by
// prefix ("대전" of "대전광역시"), but the 도 pairs do not ("충북" of "충청북도"),
// so every accepted spelling is listed rather than derived.
const PROVINCE_ALIASES: readonly (readonly string[])[] = [
  ["서울특별시", "서울시", "서울"],
  ["부산광역시", "부산시", "부산"],
  ["대구광역시", "대구시", "대구"],
  ["인천광역시", "인천시", "인천"],
  ["광주광역시", "광주시", "광주"],
  ["대전광역시", "대전시", "대전"],
  ["울산광역시", "울산시", "울산"],
  ["세종특별자치시", "세종시", "세종"],
  ["경기도", "경기"],
  ["강원특별자치도", "강원도", "강원"],
  ["충청북도", "충북"],
  ["충청남도", "충남"],
  ["전북특별자치도", "전라북도", "전북"],
  ["전라남도", "전남"],
  ["경상북도", "경북"],
  ["경상남도", "경남"],
  ["제주특별자치도", "제주도", "제주"],
]

// Sub-province units are commonly typed without their suffix ("유성" for
// "유성구"), but only ever by dropping exactly one of these characters.
const UNIT_SUFFIXES = ["시", "군", "구", "읍", "면", "동", "가", "리"] as const

// Only the first few tokens of an address can be administrative; scanning
// further risks reading a building or unit name as one.
const MAX_PREFIX_TOKENS = 4

export function buildStorefrontAddressLines(
  address: string,
  parts: StructuredAddressParts
): readonly string[] {
  const tokens = address.split(/\s+/).filter((token) => token !== "")
  if (tokens.length === 0) {
    return [address]
  }

  const structured = [
    parts.administrativeArea,
    parts.locality,
    ...(parts.sublocality === undefined ? [] : [parts.sublocality]),
  ]

  // Cut after the LAST leading token Google already receives structurally.
  // Scanning past a non-matching token — rather than stopping at it — clears the
  // whole redundant prefix when the geocoder skipped a level the owner typed,
  // e.g. the 시 in "경기도 성남시 분당구" when only the 구 came back. The scan
  // still only crosses administrative-looking tokens, so a road or building name
  // ends it immediately.
  let cut = 0
  for (
    let index = 0;
    index < Math.min(tokens.length, MAX_PREFIX_TOKENS);
    index += 1
  ) {
    const token = tokens[index] as string
    if (structured.some((value) => isSameAdministrativeUnit(token, value))) {
      cut = index + 1
      continue
    }
    if (!looksAdministrative(token)) {
      break
    }
  }

  const remainder = tokens.slice(cut).join(" ")
  // An address consisting of nothing but parts already sent would leave Google
  // with an empty street line, so keep the original rather than send nothing.
  return remainder === "" ? [tokens.join(" ")] : [remainder]
}

function isSameAdministrativeUnit(token: string, value: string): boolean {
  if (token === value) {
    return true
  }
  const tokenProvince = canonicalProvince(token)
  if (tokenProvince !== undefined) {
    return tokenProvince === canonicalProvince(value)
  }
  return isSuffixDrop(token, value) || isSuffixDrop(value, token)
}

// True when `short` is `long` minus exactly one unit suffix ("유성" / "유성구").
// Requiring that exact relationship — rather than comparing both with their
// suffixes stripped — keeps distinct neighbours like 중구 and 중동 apart.
function isSuffixDrop(short: string, long: string): boolean {
  return UNIT_SUFFIXES.some((suffix) => long === `${short}${suffix}`)
}

function canonicalProvince(value: string): string | undefined {
  return PROVINCE_ALIASES.find((aliases) => aliases.includes(value))?.[0]
}

function looksAdministrative(token: string): boolean {
  return /[시군구읍면동리]$/.test(token)
}
