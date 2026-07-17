import type { Metadata } from "next"

import { OpsShell } from "./_components/ops-shell"

import "./globals.css"

export const metadata: Metadata = {
  title: "GlocalX Ops",
  description: "GlocalX operator dashboard",
  robots: { index: false, follow: false },
}

type RootLayoutProps = {
  readonly children: React.ReactNode
}

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="ko">
      <body>
        <OpsShell>{children}</OpsShell>
      </body>
    </html>
  )
}
