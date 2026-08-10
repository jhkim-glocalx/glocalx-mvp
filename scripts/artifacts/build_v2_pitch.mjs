import fs from "node:fs/promises"
import path from "node:path"
import {
  Presentation,
  PresentationFile,
} from "/Users/jaehun/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/@oai/artifact-tool/dist/artifact_tool.mjs"

const ROOT = "/Users/jaehun/01_projects/glocalx-mvp"
const OUTPUT = path.join(ROOT, "outputs/v2/glocalx-v2-investor-pitch.pptx")
const RENDER_DIR = "/private/tmp/glocalx-v2/slides/rendered"
const SCREENSHOTS = path.join(
  ROOT,
  "docs/qa/store-retrieval-gbp-setup/screenshots"
)

const C = {
  canvas: "#0C0B10",
  surface: "#FBF9F6",
  card: "#FFFFFF",
  ink: "#191720",
  inkSoft: "#48424F",
  muted: "#938C9C",
  line: "#ECE7EF",
  border: "#8B8494",
  orange: "#FF6A3D",
  orangeDark: "#E8542A",
  orangeSoft: "#FFF1EC",
  mint: "#15BD97",
  mintSoft: "#E6F8F2",
  blue: "#3D6BFF",
  blueSoft: "#EEF2FF",
}

const W = 1280
const H = 720
const PAGE = { left: 64, top: 48, width: 1152, height: 624 }

function addText(slide, text, position, options = {}) {
  const shape = slide.shapes.add({
    geometry: "textbox",
    position,
    fill: "none",
    line: { style: "solid", fill: "none", width: 0 },
  })
  shape.text = text
  shape.text.style = {
    fontSize: options.fontSize ?? 20,
    color: options.color ?? C.ink,
    bold: options.bold ?? false,
    alignment: options.alignment ?? "left",
    verticalAlignment: options.verticalAlignment ?? "top",
    autoFit: options.autoFit ?? "shrinkText",
    insets: options.insets ?? { top: 0, right: 0, bottom: 0, left: 0 },
    typeface: options.typeface ?? "Arial",
    lineSpacing: options.lineSpacing,
  }
  return shape
}

function addRect(slide, position, options = {}) {
  return slide.shapes.add({
    geometry: options.geometry ?? "roundRect",
    position,
    fill: options.fill ?? C.card,
    line: {
      style: "solid",
      fill: options.lineFill ?? "none",
      width: options.lineWidth ?? 0,
    },
    borderRadius: options.borderRadius ?? "rounded-2xl",
    shadow: options.shadow,
  })
}

function addCircle(slide, position, fill, lineFill = "none") {
  return slide.shapes.add({
    geometry: "ellipse",
    position,
    fill,
    line: {
      style: "solid",
      fill: lineFill,
      width: lineFill === "none" ? 0 : 1,
    },
  })
}

function addPill(slide, text, position, options = {}) {
  addRect(slide, position, {
    fill: options.fill ?? C.orangeSoft,
    lineFill: options.lineFill ?? "none",
    lineWidth: options.lineWidth ?? 0,
    borderRadius: "rounded-full",
  })
  addText(slide, text, position, {
    fontSize: options.fontSize ?? 14,
    color: options.color ?? C.orange,
    bold: true,
    alignment: "center",
    verticalAlignment: "middle",
    insets: { top: 0, right: 8, bottom: 0, left: 8 },
  })
}

function addFooter(slide, number, dark = false) {
  addText(
    slide,
    "GLOCALX  /  V2 INVESTOR BRIEF",
    { left: 64, top: 682, width: 340, height: 18 },
    { fontSize: 10, color: dark ? "#7E7886" : C.muted, bold: true }
  )
  addText(
    slide,
    String(number).padStart(2, "0"),
    { left: 1170, top: 682, width: 46, height: 18 },
    {
      fontSize: 10,
      color: dark ? "#7E7886" : C.muted,
      bold: true,
      alignment: "right",
    }
  )
}

function addHeader(slide, number, eyebrow, title, subtitle = "", dark = false) {
  const titleColor = dark ? C.card : C.ink
  const bodyColor = dark ? "#C9C4CE" : C.inkSoft
  addText(
    slide,
    eyebrow.toUpperCase(),
    { left: 64, top: 48, width: 500, height: 20 },
    {
      fontSize: 13,
      color: C.orange,
      bold: true,
    }
  )
  addText(
    slide,
    title,
    { left: 64, top: 82, width: 1152, height: 58 },
    {
      fontSize: 40,
      color: titleColor,
      bold: true,
    }
  )
  if (subtitle) {
    addText(
      slide,
      subtitle,
      { left: 64, top: 143, width: 1080, height: 48 },
      {
        fontSize: 18,
        color: bodyColor,
      }
    )
  }
  addRect(
    slide,
    { left: 64, top: 194, width: 72, height: 4 },
    {
      geometry: "rect",
      fill: C.orange,
      borderRadius: 0,
    }
  )
  addFooter(slide, number, dark)
}

function addCard(slide, position, title, body, options = {}) {
  addRect(slide, position, {
    fill: options.fill ?? C.card,
    lineFill: options.lineFill ?? C.line,
    lineWidth: options.lineWidth ?? 1,
    shadow: options.shadow ?? "shadow-sm",
  })
  if (options.number) {
    addPill(
      slide,
      options.number,
      {
        left: position.left + 22,
        top: position.top + 20,
        width: 50,
        height: 28,
      },
      {
        fill: options.pillFill ?? C.orangeSoft,
        color: options.pillColor ?? C.orange,
        fontSize: 13,
      }
    )
  }
  const topOffset = options.number ? 62 : 26
  addText(
    slide,
    title,
    {
      left: position.left + 24,
      top: position.top + topOffset,
      width: position.width - 48,
      height: options.titleHeight ?? 54,
    },
    {
      fontSize: options.titleSize ?? 24,
      color: options.titleColor ?? C.ink,
      bold: true,
    }
  )
  addText(
    slide,
    body,
    {
      left: position.left + 24,
      top: position.top + topOffset + (options.bodyOffset ?? 58),
      width: position.width - 48,
      height: position.height - topOffset - (options.bodyOffset ?? 58) - 20,
    },
    {
      fontSize: options.bodySize ?? 17,
      color: options.bodyColor ?? C.inkSoft,
      lineSpacing: 1.08,
    }
  )
}

function addBulletList(slide, items, position, options = {}) {
  const gap = options.gap ?? 54
  items.forEach((item, index) => {
    const top = position.top + index * gap
    addCircle(
      slide,
      { left: position.left, top: top + 7, width: 10, height: 10 },
      options.dotColor ?? C.orange
    )
    addText(
      slide,
      item,
      {
        left: position.left + 24,
        top,
        width: position.width - 24,
        height: options.itemHeight ?? 44,
      },
      {
        fontSize: options.fontSize ?? 18,
        color: options.color ?? C.inkSoft,
        bold: options.bold ?? false,
      }
    )
  })
}

async function addScreenshot(slide, filename, position, alt, options = {}) {
  addRect(
    slide,
    {
      left: position.left - 6,
      top: position.top - 6,
      width: position.width + 12,
      height: position.height + 12,
    },
    {
      fill: options.frameFill ?? C.card,
      lineFill: options.lineFill ?? C.line,
      lineWidth: options.lineWidth ?? 1,
      shadow: "shadow-lg",
      borderRadius: options.borderRadius ?? "rounded-2xl",
    }
  )
  const bytes = await fs.readFile(path.join(SCREENSHOTS, filename))
  slide.images.add({
    blob: bytes,
    contentType: "image/png",
    alt,
    fit: options.fit ?? "cover",
    crop: options.crop,
    position,
    geometry: "roundRect",
    borderRadius: options.borderRadius ?? "rounded-xl",
  })
}

function addArrow(slide, position, dark = false, direction = "→") {
  addText(slide, direction, position, {
    fontSize: 27,
    color: dark ? "#7E7886" : C.muted,
    bold: true,
    alignment: "center",
    verticalAlignment: "middle",
  })
}

async function writeBlob(filePath, blob) {
  await fs.writeFile(filePath, new Uint8Array(await blob.arrayBuffer()))
}

function createPresentation() {
  return Presentation.create({ slideSize: { width: W, height: H } })
}

async function buildSlide1(presentation) {
  const slide = presentation.slides.add()
  slide.background.fill = C.canvas
  addPill(
    slide,
    "V2  /  MANAGED SERVICE PLATFORM",
    { left: 64, top: 54, width: 272, height: 32 },
    { fill: "#261812", color: C.orange, fontSize: 13 }
  )
  addText(
    slide,
    "The operating system\nfor managed local growth",
    { left: 64, top: 132, width: 760, height: 166 },
    { fontSize: 52, color: C.card, bold: true }
  )
  addText(
    slide,
    "A focused customer portal. A separate operator dashboard.\nAI speed with human accountability.",
    { left: 64, top: 332, width: 690, height: 82 },
    { fontSize: 22, color: "#C9C4CE" }
  )
  addRect(
    slide,
    { left: 64, top: 454, width: 710, height: 108 },
    {
      fill: "#19171F",
      lineFill: "#302D37",
      lineWidth: 1,
    }
  )
  addText(
    slide,
    "Connect the store  →  send images + intent  →  approve  →  publish",
    { left: 90, top: 482, width: 660, height: 52 },
    { fontSize: 20, color: C.card, bold: true, verticalAlignment: "middle" }
  )
  addRect(
    slide,
    { left: 916, top: 42, width: 282, height: 626 },
    {
      fill: "#1C1920",
      lineFill: C.orange,
      lineWidth: 2,
      shadow: "shadow-lg",
      borderRadius: "rounded-3xl",
    }
  )
  await addScreenshot(
    slide,
    "mobile-03-app-home.png",
    { left: 932, top: 58, width: 250, height: 576 },
    "Current GlocalX mobile customer workspace",
    {
      fit: "contain",
      frameFill: "#1C1920",
      lineFill: "none",
      borderRadius: "rounded-2xl",
    }
  )
  addText(
    slide,
    "Investor planning brief  /  July 2026",
    { left: 64, top: 628, width: 420, height: 22 },
    { fontSize: 13, color: "#7E7886", bold: true }
  )
  addFooter(slide, 1, true)
}

function buildSlide2(presentation) {
  const slide = presentation.slides.add()
  slide.background.fill = C.surface
  addHeader(
    slide,
    2,
    "The problem",
    "Local owners do not need one more marketing tool.",
    "They need the work finished, with trust and control."
  )
  const cards = [
    {
      number: "01",
      title: "Inputs are imperfect",
      body: "Store owners have photos, offers, and intent—not campaign-ready assets or channel specifications.",
    },
    {
      number: "02",
      title: "Channels fragment the work",
      body: "Every profile, format, credential, schedule, and failure path adds operational burden.",
    },
    {
      number: "03",
      title: "Trust cannot be automated away",
      body: "Owners still need final authority, clear accountability, and a human when the situation is ambiguous.",
    },
  ]
  cards.forEach((card, index) =>
    addCard(
      slide,
      { left: 64 + index * 385, top: 244, width: 352, height: 328 },
      card.title,
      card.body,
      {
        number: card.number,
        fill: index === 1 ? C.orangeSoft : C.card,
        lineFill: index === 1 ? "#FFD0BF" : C.line,
        titleSize: 25,
        bodySize: 18,
      }
    )
  )
  addText(
    slide,
    "GlocalX V2 turns those constraints into an operating model.",
    { left: 64, top: 612, width: 840, height: 32 },
    { fontSize: 20, color: C.orange, bold: true }
  )
}

async function buildSlide3(presentation) {
  const slide = presentation.slides.add()
  slide.background.fill = C.canvas
  addHeader(
    slide,
    3,
    "What V1 taught us",
    "Breadth can reintroduce the decisions the owner hired us to remove.",
    "Product learning, not traction evidence.",
    true
  )
  await addScreenshot(
    slide,
    "desktop-06-app-post.png",
    { left: 64, top: 236, width: 538, height: 374 },
    "Current GlocalX post preparation interface",
    { fit: "cover", frameFill: "#19171F", lineFill: "#302D37" }
  )
  await addScreenshot(
    slide,
    "desktop-08-app-insights.png",
    { left: 678, top: 236, width: 538, height: 374 },
    "Current GlocalX insights interface",
    { fit: "cover", frameFill: "#19171F", lineFill: "#302D37" }
  )
  addPill(
    slide,
    "OWNER DECISIONS",
    { left: 88, top: 252, width: 162, height: 28 },
    { fill: "#261812", color: C.orange, fontSize: 12 }
  )
  addPill(
    slide,
    "FUTURE-FACING DATA",
    { left: 702, top: 252, width: 184, height: 28 },
    { fill: "#13251F", color: C.mint, fontSize: 12 }
  )
  addText(
    slide,
    "V2 keeps the visual confidence—and moves production complexity behind the service.",
    { left: 64, top: 636, width: 1040, height: 28 },
    { fontSize: 18, color: "#C9C4CE", bold: true }
  )
}

function buildSlide4(presentation) {
  const slide = presentation.slides.add()
  slide.background.fill = C.surface
  addHeader(
    slide,
    4,
    "The V2 wedge",
    "A smaller product. A stronger promise.",
    "Managed outcome instead of self-service marketing software."
  )
  addRect(
    slide,
    { left: 64, top: 242, width: 472, height: 336 },
    {
      fill: C.canvas,
      lineFill: C.canvas,
      shadow: "shadow-lg",
    }
  )
  addText(
    slide,
    "Connect\nSend\nApprove",
    { left: 104, top: 278, width: 360, height: 220 },
    { fontSize: 44, color: C.card, bold: true }
  )
  addText(
    slide,
    "Three customer verbs.",
    { left: 104, top: 518, width: 340, height: 34 },
    { fontSize: 18, color: C.orange, bold: true }
  )
  addArrow(slide, { left: 558, top: 376, width: 64, height: 54 })
  addRect(
    slide,
    { left: 642, top: 242, width: 574, height: 336 },
    {
      fill: C.card,
      lineFill: C.line,
      lineWidth: 1,
      shadow: "shadow-sm",
    }
  )
  addPill(
    slide,
    "GLOCALX OPERATES",
    { left: 680, top: 274, width: 174, height: 30 },
    { fill: C.orangeSoft, color: C.orange, fontSize: 12 }
  )
  addBulletList(
    slide,
    [
      "Business Profile access and health",
      "Customer support with live product context",
      "Creative production and internal review",
      "Approval evidence and revision history",
      "Per-channel publishing and recovery",
    ],
    { left: 684, top: 330, width: 468, height: 220 },
    { fontSize: 18, gap: 44, itemHeight: 38 }
  )
}

function buildSlide5(presentation) {
  const slide = presentation.slides.add()
  slide.background.fill = C.canvas
  addHeader(
    slide,
    5,
    "Customer journey",
    "The customer participates only where authority matters.",
    "Google identity and Business Profile consent remain separate.",
    true
  )
  const steps = [
    ["01", "Sign in", "Google identity"],
    ["02", "Connect", "GBP consent + location"],
    ["03", "Send", "Images + short brief"],
    ["04", "Approve", "Go / revise / no-go"],
    ["05", "Published", "Status + support"],
  ]
  steps.forEach((step, index) => {
    const x = 64 + index * 230
    addCard(
      slide,
      { left: x, top: 246, width: 204, height: 268 },
      step[1],
      step[2],
      {
        number: step[0],
        fill: index === 3 ? "#182821" : "#19171F",
        lineFill: index === 3 ? C.mint : "#302D37",
        lineWidth: index === 3 ? 2 : 1,
        pillFill: index === 3 ? "#17362C" : "#261812",
        pillColor: index === 3 ? C.mint : C.orange,
        titleColor: C.card,
        bodyColor: "#BEB8C4",
        titleSize: 23,
        bodySize: 17,
        shadow: undefined,
      }
    )
    if (index < steps.length - 1) {
      addArrow(slide, { left: x + 204, top: 344, width: 26, height: 40 }, true)
    }
  })
  addRect(
    slide,
    { left: 184, top: 560, width: 912, height: 66 },
    {
      fill: "#19171F",
      lineFill: "#302D37",
      lineWidth: 1,
    }
  )
  addText(
    slide,
    "Customer authority: grant access  •  supply intent  •  approve exact content",
    { left: 216, top: 579, width: 850, height: 30 },
    { fontSize: 18, color: C.card, bold: true, alignment: "center" }
  )
  addText(
    slide,
    "Google access may require an owner or agency action in Business Profile Manager; V2 tracks that responsibility instead of pretending it is fully automatic.",
    { left: 64, top: 642, width: 1120, height: 24 },
    { fontSize: 12, color: "#7E7886", alignment: "center" }
  )
}

function buildSlide6(presentation) {
  const slide = presentation.slides.add()
  slide.background.fill = C.surface
  addHeader(
    slide,
    6,
    "One service, two surfaces",
    "Separate deployments. Shared domain. One accountable workflow."
  )
  addCard(
    slide,
    { left: 64, top: 238, width: 536, height: 156 },
    "Customer portal",
    "Connect • submit • approve • chat\nReviews + performance preserved",
    {
      fill: C.card,
      lineFill: "#FFD0BF",
      lineWidth: 2,
      titleSize: 28,
      bodySize: 18,
      bodyOffset: 50,
    }
  )
  addCard(
    slide,
    { left: 680, top: 238, width: 536, height: 156 },
    "Admin operations",
    "Access • support • creative • publish\nQueues + assignments + recovery",
    {
      fill: C.card,
      lineFill: "#B9EBDD",
      lineWidth: 2,
      titleSize: 28,
      bodySize: 18,
      bodyOffset: 50,
    }
  )
  addArrow(slide, { left: 604, top: 296, width: 72, height: 48 }, false, "↔")
  addArrow(slide, { left: 580, top: 402, width: 120, height: 50 }, false, "↓")
  addRect(
    slide,
    { left: 200, top: 454, width: 880, height: 112 },
    {
      fill: C.canvas,
      lineFill: C.canvas,
      shadow: "shadow-md",
    }
  )
  addText(
    slide,
    "Shared domain  •  Postgres  •  object storage  •  audit  •  events  •  worker",
    { left: 238, top: 483, width: 804, height: 44 },
    {
      fontSize: 23,
      color: C.card,
      bold: true,
      alignment: "center",
      verticalAlignment: "middle",
    }
  )
  const external = [
    ["Google", C.blueSoft, C.blue],
    ["Instagram", C.orangeSoft, C.orange],
    ["AI", C.mintSoft, C.mint],
    ["Notifications", C.card, C.inkSoft],
  ]
  external.forEach((item, index) =>
    addPill(
      slide,
      item[0],
      { left: 242 + index * 206, top: 600, width: 178, height: 36 },
      {
        fill: item[1],
        color: item[2],
        lineFill: C.line,
        lineWidth: 1,
        fontSize: 14,
      }
    )
  )
}

async function buildSlide7(presentation) {
  const slide = presentation.slides.add()
  slide.background.fill = C.canvas
  addHeader(
    slide,
    7,
    "Customer portal",
    "Less work for the owner. More control at the moments that matter.",
    "",
    true
  )
  await addScreenshot(
    slide,
    "desktop-01-login.png",
    { left: 64, top: 202, width: 616, height: 428 },
    "Current GlocalX Google login experience",
    { fit: "cover", frameFill: "#19171F", lineFill: "#302D37" }
  )
  addPill(
    slide,
    "VISUAL SYSTEM RETAINED",
    { left: 88, top: 224, width: 206, height: 30 },
    { fill: "#261812", color: C.orange, fontSize: 12 }
  )
  addBulletList(
    slide,
    [
      "Google sign-in",
      "Explicit Business Profile connection",
      "Images + short promotion brief",
      "Finished-version approval",
      "Persistent contextual support",
    ],
    { left: 744, top: 242, width: 448, height: 300 },
    { fontSize: 21, color: C.card, dotColor: C.mint, gap: 58, itemHeight: 44 }
  )
  addRect(
    slide,
    { left: 744, top: 560, width: 448, height: 70 },
    {
      fill: "#19171F",
      lineFill: "#302D37",
      lineWidth: 1,
    }
  )
  addText(
    slide,
    "Reviews and performance remain untouched with deterministic stub data.",
    { left: 768, top: 579, width: 400, height: 38 },
    { fontSize: 16, color: "#C9C4CE", bold: true, alignment: "center" }
  )
}

function buildSlide8(presentation) {
  const slide = presentation.slides.add()
  slide.background.fill = C.surface
  addHeader(
    slide,
    8,
    "Admin operations",
    "The dashboard is not a reporting layer. It is the service delivery system."
  )
  addRect(
    slide,
    { left: 64, top: 224, width: 1152, height: 418 },
    {
      fill: C.card,
      lineFill: C.line,
      lineWidth: 1,
      shadow: "shadow-md",
    }
  )
  addRect(
    slide,
    { left: 64, top: 224, width: 198, height: 418 },
    {
      fill: C.canvas,
      lineFill: C.canvas,
      borderRadius: "rounded-xl",
    }
  )
  addText(
    slide,
    "OPERATIONS",
    { left: 88, top: 252, width: 140, height: 22 },
    {
      fontSize: 12,
      color: C.orange,
      bold: true,
    }
  )
  const nav = [
    "Support inbox",
    "GBP access",
    "Marketing queue",
    "Approvals",
    "Publishing",
    "Audit",
  ]
  nav.forEach((item, index) => {
    if (index === 2) {
      addRect(
        slide,
        { left: 80, top: 340 + index * 42, width: 166, height: 34 },
        {
          fill: "#261812",
          borderRadius: "rounded-lg",
        }
      )
    }
    addText(
      slide,
      item,
      { left: 96, top: 346 + index * 42, width: 134, height: 24 },
      {
        fontSize: 15,
        color: index === 2 ? C.orange : "#C9C4CE",
        bold: index === 2,
      }
    )
  })
  addText(
    slide,
    "Marketing queue",
    { left: 292, top: 252, width: 360, height: 34 },
    {
      fontSize: 25,
      color: C.ink,
      bold: true,
    }
  )
  addPill(
    slide,
    "12 ACTIVE",
    { left: 626, top: 252, width: 112, height: 28 },
    {
      fill: C.orangeSoft,
      color: C.orange,
      fontSize: 12,
    }
  )
  const rows = [
    ["Sora Coffee", "Internal review", "42 min"],
    ["Mira Bakery", "Needs input", "1 h"],
    ["Namu Studio", "In production", "2 h"],
    ["Hanok Table", "Ready for customer", "Today"],
  ]
  rows.forEach((row, index) => {
    const y = 314 + index * 66
    addRect(
      slide,
      { left: 288, top: y, width: 560, height: 52 },
      {
        fill: index === 0 ? C.orangeSoft : C.surface,
        lineFill: index === 0 ? "#FFD0BF" : C.line,
        lineWidth: 1,
        borderRadius: "rounded-lg",
      }
    )
    addText(
      slide,
      row[0],
      { left: 306, top: y + 14, width: 170, height: 24 },
      {
        fontSize: 16,
        color: C.ink,
        bold: true,
      }
    )
    addText(
      slide,
      row[1],
      { left: 482, top: y + 14, width: 210, height: 24 },
      {
        fontSize: 14,
        color: C.inkSoft,
      }
    )
    addText(
      slide,
      row[2],
      { left: 728, top: y + 14, width: 94, height: 24 },
      {
        fontSize: 14,
        color: C.muted,
        alignment: "right",
      }
    )
  })
  addRect(
    slide,
    { left: 876, top: 244, width: 316, height: 374 },
    {
      fill: C.surface,
      lineFill: C.line,
      lineWidth: 1,
      borderRadius: "rounded-xl",
    }
  )
  addText(
    slide,
    "Context rail",
    { left: 900, top: 270, width: 250, height: 30 },
    {
      fontSize: 22,
      color: C.ink,
      bold: true,
    }
  )
  addPill(
    slide,
    "INTERNAL REVIEW",
    { left: 900, top: 318, width: 172, height: 28 },
    {
      fill: C.mintSoft,
      color: C.mint,
      fontSize: 11,
    }
  )
  addBulletList(
    slide,
    [
      "Store + GBP health",
      "Brief + source assets",
      "Assignee + SLA",
      "Conversation + errors",
      "Approval + publish history",
    ],
    { left: 900, top: 372, width: 250, height: 210 },
    { fontSize: 15, gap: 39, itemHeight: 31, dotColor: C.orange }
  )
}

function buildSlide9(presentation) {
  const slide = presentation.slides.add()
  slide.background.fill = C.canvas
  addHeader(
    slide,
    9,
    "AI speed. Human accountability.",
    "One conversation for the customer; four explicit operating modes for GlocalX.",
    "",
    true
  )
  const modes = [
    ["AI_AUTO", "AI may reply", "#153329", C.mint],
    ["AI_SUGGEST", "Human reviews", "#261812", C.orange],
    ["HUMAN", "Human only", "#18213A", "#7F9BFF"],
    ["CLOSED", "Resolved", "#252229", "#A7A1AD"],
  ]
  modes.forEach((mode, index) => {
    const x = 64 + index * 294
    addRect(
      slide,
      { left: x, top: 230, width: 270, height: 126 },
      {
        fill: mode[2],
        lineFill: mode[3],
        lineWidth: 1,
      }
    )
    addText(
      slide,
      mode[0],
      { left: x + 22, top: 252, width: 226, height: 30 },
      {
        fontSize: 18,
        color: mode[3],
        bold: true,
      }
    )
    addText(
      slide,
      mode[1],
      { left: x + 22, top: 300, width: 226, height: 30 },
      {
        fontSize: 17,
        color: C.card,
      }
    )
  })
  addRect(
    slide,
    { left: 64, top: 398, width: 1152, height: 194 },
    {
      fill: "#19171F",
      lineFill: "#302D37",
      lineWidth: 1,
    }
  )
  const flow = [
    ["Customer message", C.orange],
    ["Safe context snapshot", C.blue],
    ["AI answer or draft", C.mint],
    ["Human takeover", "#A88BFF"],
    ["Same thread", C.orange],
  ]
  flow.forEach((item, index) => {
    const x = 88 + index * 222
    addCircle(slide, { left: x, top: 444, width: 42, height: 42 }, item[1])
    addText(
      slide,
      String(index + 1),
      { left: x, top: 444, width: 42, height: 42 },
      {
        fontSize: 16,
        color: C.card,
        bold: true,
        alignment: "center",
        verticalAlignment: "middle",
      }
    )
    addText(
      slide,
      item[0],
      { left: x - 24, top: 500, width: 164, height: 46 },
      {
        fontSize: 15,
        color: C.card,
        bold: true,
        alignment: "center",
      }
    )
    if (index < flow.length - 1) {
      addArrow(slide, { left: x + 138, top: 450, width: 54, height: 36 }, true)
    }
  })
  addText(
    slide,
    "AI cannot send in HUMAN or CLOSED mode. Sender identity stays accurate.",
    { left: 64, top: 620, width: 1152, height: 28 },
    { fontSize: 18, color: C.orange, bold: true, alignment: "center" }
  )
}

function buildSlide10(presentation) {
  const slide = presentation.slides.add()
  slide.background.fill = C.surface
  addHeader(
    slide,
    10,
    "The managed creative loop",
    "Production moves behind the curtain; approval remains the control point."
  )
  addText(
    slide,
    "CUSTOMER",
    { left: 64, top: 236, width: 134, height: 24 },
    {
      fontSize: 13,
      color: C.muted,
      bold: true,
    }
  )
  addText(
    slide,
    "GLOCALX",
    { left: 64, top: 420, width: 134, height: 24 },
    {
      fontSize: 13,
      color: C.muted,
      bold: true,
    }
  )
  addRect(
    slide,
    { left: 192, top: 226, width: 220, height: 94 },
    {
      fill: C.orangeSoft,
      lineFill: "#FFD0BF",
      lineWidth: 1,
    }
  )
  addText(
    slide,
    "Submit\nimages + intent",
    { left: 216, top: 248, width: 172, height: 52 },
    {
      fontSize: 21,
      color: C.ink,
      bold: true,
      alignment: "center",
    }
  )
  addArrow(slide, { left: 430, top: 252, width: 74, height: 44 })
  addRect(
    slide,
    { left: 522, top: 226, width: 284, height: 94 },
    {
      fill: C.mintSoft,
      lineFill: "#B9EBDD",
      lineWidth: 2,
    }
  )
  addText(
    slide,
    "Approve  /  revise  /  reject",
    { left: 548, top: 252, width: 232, height: 42 },
    {
      fontSize: 21,
      color: C.ink,
      bold: true,
      alignment: "center",
    }
  )
  addArrow(slide, { left: 824, top: 252, width: 74, height: 44 })
  addRect(
    slide,
    { left: 916, top: 226, width: 236, height: 94 },
    {
      fill: C.blueSoft,
      lineFill: "#C9D3FF",
      lineWidth: 1,
    }
  )
  addText(
    slide,
    "Published status",
    { left: 940, top: 252, width: 188, height: 42 },
    {
      fontSize: 21,
      color: C.ink,
      bold: true,
      alignment: "center",
    }
  )
  addArrow(slide, { left: 288, top: 332, width: 52, height: 72 }, false, "↓")
  addArrow(slide, { left: 638, top: 332, width: 52, height: 72 }, false, "↑")
  addArrow(slide, { left: 1008, top: 332, width: 52, height: 72 }, false, "↑")
  const ops = [
    ["Triage", C.card],
    ["Produce", C.orangeSoft],
    ["Internal review", C.mintSoft],
    ["Freeze version", C.card],
    ["Schedule + publish", C.blueSoft],
  ]
  ops.forEach((item, index) => {
    const x = 192 + index * 194
    addRect(
      slide,
      { left: x, top: 454, width: 170, height: 92 },
      {
        fill: item[1],
        lineFill: C.line,
        lineWidth: 1,
        borderRadius: "rounded-xl",
      }
    )
    addText(
      slide,
      item[0],
      { left: x + 14, top: 478, width: 142, height: 42 },
      {
        fontSize: 17,
        color: C.ink,
        bold: true,
        alignment: "center",
        verticalAlignment: "middle",
      }
    )
    if (index < ops.length - 1) {
      addArrow(slide, { left: x + 170, top: 480, width: 24, height: 34 })
    }
  })
  addRect(
    slide,
    { left: 192, top: 584, width: 960, height: 54 },
    {
      fill: C.canvas,
      lineFill: C.canvas,
      borderRadius: "rounded-xl",
    }
  )
  addText(
    slide,
    "Every content change after approval creates a new version and requires a new decision.",
    { left: 218, top: 599, width: 908, height: 26 },
    { fontSize: 17, color: C.card, bold: true, alignment: "center" }
  )
}

function buildSlide11(presentation) {
  const slide = presentation.slides.add()
  slide.background.fill = C.canvas
  addHeader(
    slide,
    11,
    "Why the model can compound",
    "The asset is the structured operating workflow—not a generic chatbot or image filter.",
    "",
    true
  )
  addCircle(
    slide,
    { left: 500, top: 258, width: 280, height: 280 },
    "#211E26",
    C.orange
  )
  addCircle(slide, { left: 550, top: 308, width: 180, height: 180 }, C.orange)
  addText(
    slide,
    "OPERATING\nDATASET",
    { left: 535, top: 352, width: 210, height: 92 },
    {
      fontSize: 23,
      color: C.card,
      bold: true,
      alignment: "center",
      verticalAlignment: "middle",
    }
  )
  const nodes = [
    [92, 240, "Inputs", "What stores submit"],
    [92, 466, "Interventions", "What resolves blocks"],
    [900, 240, "Creative", "What gets approved"],
    [900, 466, "Reliability", "What publishes"],
    [500, 566, "Economics", "What human work costs"],
  ]
  nodes.forEach((node, index) => {
    const width = index === 4 ? 280 : 288
    addRect(
      slide,
      { left: node[0], top: node[1], width, height: 110 },
      {
        fill: "#19171F",
        lineFill: index === 4 ? C.mint : "#302D37",
        lineWidth: 1,
        shadow: "shadow-sm",
      }
    )
    addText(
      slide,
      node[2],
      { left: node[0] + 22, top: node[1] + 22, width: width - 44, height: 28 },
      {
        fontSize: 20,
        color: index === 4 ? C.mint : C.orange,
        bold: true,
        alignment: "center",
      }
    )
    addText(
      slide,
      node[3],
      { left: node[0] + 22, top: node[1] + 62, width: width - 44, height: 26 },
      {
        fontSize: 15,
        color: "#C9C4CE",
        alignment: "center",
      }
    )
  })
  addText(
    slide,
    "This is a defensibility thesis—not proof of a moat today.",
    {
      left: 380,
      top: 214,
      width: 520,
      height: 28,
    },
    {
      fontSize: 16,
      color: "#7E7886",
      bold: true,
      alignment: "center",
    }
  )
}

function buildSlide12(presentation) {
  const slide = presentation.slides.add()
  slide.background.fill = C.surface
  addHeader(
    slide,
    12,
    "Business model hypotheses",
    "Price the managed outcome only after measuring the work required to deliver it."
  )
  addPill(
    slide,
    "HYPOTHESES — NOT APPROVED PRICING",
    { left: 866, top: 144, width: 350, height: 34 },
    {
      fill: C.orangeSoft,
      color: C.orange,
      fontSize: 12,
    }
  )
  const models = [
    [
      "01",
      "Base subscription",
      "Per store\nDefined request or publication allowance",
    ],
    [
      "02",
      "Service tiers",
      "Turnaround\nChannels\nLocations\nHuman creative support",
    ],
    ["03", "Usage add-ons", "Requests\nRevisions\nPosts above plan"],
  ]
  models.forEach((model, index) =>
    addCard(
      slide,
      { left: 64 + index * 385, top: 238, width: 352, height: 300 },
      model[1],
      model[2],
      {
        number: model[0],
        fill: index === 1 ? C.orangeSoft : C.card,
        lineFill: index === 1 ? "#FFD0BF" : C.line,
        titleSize: 25,
        bodySize: 18,
      }
    )
  )
  addRect(
    slide,
    { left: 64, top: 574, width: 1152, height: 72 },
    {
      fill: C.canvas,
      lineFill: C.canvas,
    }
  )
  addText(
    slide,
    "Pilot inputs: human minutes  +  AI cost  +  media cost  +  recovery effort  +  repeat usage",
    { left: 96, top: 595, width: 1088, height: 30 },
    { fontSize: 19, color: C.card, bold: true, alignment: "center" }
  )
}

function buildSlide13(presentation) {
  const slide = presentation.slides.add()
  slide.background.fill = C.canvas
  addHeader(
    slide,
    13,
    "The pilot measures the operating model",
    "Success is a funnel, a service level, and a unit-economics question.",
    "",
    true
  )
  const quadrants = [
    [
      "Activation",
      ["GBP connected", "Access activated", "First request"],
      C.orange,
    ],
    [
      "Service quality",
      ["Time to ready", "First-version approval", "Revision cycles"],
      C.mint,
    ],
    [
      "Reliability",
      ["Publish success", "Partial failure", "Recovery time"],
      C.blue,
    ],
    [
      "Unit economics",
      ["Human minutes", "AI + media cost", "Requests per store"],
      "#A88BFF",
    ],
  ]
  quadrants.forEach((item, index) => {
    const x = index % 2 === 0 ? 64 : 656
    const y = index < 2 ? 232 : 438
    addRect(
      slide,
      { left: x, top: y, width: 560, height: 176 },
      {
        fill: "#19171F",
        lineFill: item[2],
        lineWidth: 1,
      }
    )
    addText(
      slide,
      item[0],
      { left: x + 26, top: y + 24, width: 250, height: 32 },
      {
        fontSize: 24,
        color: item[2],
        bold: true,
      }
    )
    item[1].forEach((metric, metricIndex) => {
      addCircle(
        slide,
        { left: x + 28, top: y + 76 + metricIndex * 30, width: 8, height: 8 },
        item[2]
      )
      addText(
        slide,
        metric,
        {
          left: x + 52,
          top: y + 68 + metricIndex * 30,
          width: 250,
          height: 24,
        },
        {
          fontSize: 16,
          color: C.card,
        }
      )
      addRect(
        slide,
        {
          left: x + 344,
          top: y + 76 + metricIndex * 30,
          width: 162,
          height: 8,
        },
        {
          geometry: "rect",
          fill: "#302D37",
          borderRadius: 0,
        }
      )
      addRect(
        slide,
        {
          left: x + 344,
          top: y + 76 + metricIndex * 30,
          width: 54 + metricIndex * 24,
          height: 8,
        },
        {
          geometry: "rect",
          fill: item[2],
          borderRadius: 0,
        }
      )
    })
  })
  addText(
    slide,
    "Targets are set before cohort recruitment. Values remain TBD in this deck.",
    { left: 64, top: 636, width: 1152, height: 28 },
    { fontSize: 17, color: "#7E7886", bold: true, alignment: "center" }
  )
}

function buildSlide14(presentation) {
  const slide = presentation.slides.add()
  slide.background.fill = C.surface
  addHeader(
    slide,
    14,
    "Ten-week path to a pilot",
    "Assumption: two full-stack engineers, one product/design owner, part-time operations."
  )
  const phases = [
    ["0", "Recover", "1 wk", C.ink],
    ["1", "Connect", "2 wks", C.orange],
    ["2", "Support", "2 wks", C.mint],
    ["3", "Produce", "3 wks", "#A88BFF"],
    ["4", "Publish", "2 wks", C.blue],
  ]
  const widths = [112, 224, 224, 336, 224]
  let x = 64
  phases.forEach((phase, index) => {
    addRect(
      slide,
      { left: x, top: 248, width: widths[index] - 8, height: 94 },
      {
        fill: phase[3],
        lineFill: phase[3],
        borderRadius: index === 0 || index === 4 ? "rounded-xl" : "rounded-md",
      }
    )
    addText(
      slide,
      "PHASE " + phase[0],
      { left: x + 16, top: 266, width: widths[index] - 40, height: 20 },
      {
        fontSize: 11,
        color: C.card,
        bold: true,
      }
    )
    addText(
      slide,
      phase[1],
      { left: x + 16, top: 298, width: widths[index] - 40, height: 26 },
      {
        fontSize: 18,
        color: C.card,
        bold: true,
      }
    )
    x += widths[index]
  })
  const gates = [
    ["Week 1", "Stable domains + OAuth callbacks"],
    ["Week 3", "Connected store + staff RBAC"],
    ["Week 5", "Contextual AI / human support"],
    ["Week 8", "Approved immutable creative"],
    ["Week 10", "Reliable GBP pilot + recovery"],
  ]
  gates.forEach((gate, index) => {
    const left = 64 + index * 230
    addCircle(
      slide,
      { left: left, top: 392, width: 18, height: 18 },
      phases[index][3]
    )
    addText(
      slide,
      gate[0],
      { left: left + 32, top: 386, width: 146, height: 26 },
      {
        fontSize: 16,
        color: C.ink,
        bold: true,
      }
    )
    addText(
      slide,
      gate[1],
      { left, top: 430, width: 202, height: 80 },
      {
        fontSize: 15,
        color: C.inkSoft,
      }
    )
  })
  addRect(
    slide,
    { left: 64, top: 550, width: 1152, height: 90 },
    {
      fill: C.orangeSoft,
      lineFill: "#FFD0BF",
      lineWidth: 1,
    }
  )
  addText(
    slide,
    "Phase 0 release blocker",
    { left: 92, top: 572, width: 274, height: 28 },
    {
      fontSize: 20,
      color: C.orange,
      bold: true,
    }
  )
  addText(
    slide,
    "Repair the detached public Vercel alias and re-verify all OAuth callback URLs before inviting stores.",
    { left: 388, top: 570, width: 792, height: 48 },
    { fontSize: 18, color: C.ink, bold: true }
  )
}

function buildSlide15(presentation) {
  const slide = presentation.slides.add()
  slide.background.fill = C.canvas
  addPill(
    slide,
    "THE V2 INVESTMENT CASE",
    { left: 64, top: 56, width: 246, height: 32 },
    {
      fill: "#261812",
      color: C.orange,
      fontSize: 13,
    }
  )
  addText(
    slide,
    "A smaller product.\nA stronger operating model.",
    { left: 64, top: 132, width: 760, height: 150 },
    { fontSize: 50, color: C.card, bold: true }
  )
  addText(
    slide,
    "GlocalX turns messy local-business inputs into approved, published outcomes—and captures the workflow required to improve delivery.",
    { left: 64, top: 316, width: 756, height: 92 },
    { fontSize: 21, color: "#C9C4CE" }
  )
  addRect(
    slide,
    { left: 64, top: 462, width: 520, height: 142 },
    {
      fill: "#19171F",
      lineFill: "#302D37",
      lineWidth: 1,
    }
  )
  addText(
    slide,
    "What capital unlocks",
    { left: 92, top: 486, width: 260, height: 30 },
    {
      fontSize: 22,
      color: C.orange,
      bold: true,
    }
  )
  addText(
    slide,
    "Platform build  •  operator tooling\nPlatform approvals  •  controlled pilot",
    { left: 92, top: 534, width: 448, height: 56 },
    { fontSize: 17, color: C.card }
  )
  addRect(
    slide,
    { left: 618, top: 462, width: 598, height: 142 },
    {
      fill: "#182821",
      lineFill: C.mint,
      lineWidth: 1,
    }
  )
  addText(
    slide,
    "Next proof points",
    { left: 648, top: 486, width: 280, height: 30 },
    {
      fontSize: 22,
      color: C.mint,
      bold: true,
    }
  )
  addText(
    slide,
    "Activated GBP access  •  first value\nApproval quality  •  repeat use  •  delivery cost",
    { left: 648, top: 534, width: 530, height: 56 },
    { fontSize: 17, color: C.card }
  )
  addPill(
    slide,
    "FUNDING ASK + PRICING: TBD AFTER FOUNDER DECISIONS",
    { left: 324, top: 632, width: 632, height: 36 },
    { fill: "#261812", color: C.orange, fontSize: 13 }
  )
  addFooter(slide, 15, true)
}

async function main() {
  await fs.mkdir(path.dirname(OUTPUT), { recursive: true })
  await fs.rm(RENDER_DIR, { recursive: true, force: true })
  await fs.mkdir(RENDER_DIR, { recursive: true })

  const presentation = createPresentation()
  await buildSlide1(presentation)
  buildSlide2(presentation)
  await buildSlide3(presentation)
  buildSlide4(presentation)
  buildSlide5(presentation)
  buildSlide6(presentation)
  await buildSlide7(presentation)
  buildSlide8(presentation)
  buildSlide9(presentation)
  buildSlide10(presentation)
  buildSlide11(presentation)
  buildSlide12(presentation)
  buildSlide13(presentation)
  buildSlide14(presentation)
  buildSlide15(presentation)

  if (presentation.slides.items.length !== 15) {
    throw new Error("Expected 15 slides")
  }

  for (const [index, slide] of presentation.slides.items.entries()) {
    const stem = "slide-" + String(index + 1).padStart(2, "0")
    const png = await presentation.export({ slide, format: "png", scale: 0.75 })
    await writeBlob(path.join(RENDER_DIR, stem + ".png"), png)
    const layout = await slide.export({ format: "layout" })
    await fs.writeFile(
      path.join(RENDER_DIR, stem + ".layout.json"),
      await layout.text()
    )
  }

  const pptx = await PresentationFile.exportPptx(presentation)
  await pptx.save(OUTPUT)
  const stats = await fs.stat(OUTPUT)
  process.stdout.write(
    "created=" +
      OUTPUT +
      "\n" +
      "bytes=" +
      stats.size +
      "\n" +
      "slides=" +
      presentation.slides.items.length +
      "\n" +
      "renders=" +
      RENDER_DIR +
      "\n"
  )
}

main().catch((error) => {
  process.stderr.write(String(error?.stack ?? error) + "\n")
  process.exitCode = 1
})
