import { requireAdminSession } from "@/auth/server-session"

import { OpsShell } from "../_components/ops-shell"

type OpsLayoutProps = {
  readonly children: React.ReactNode
}

// Every ops section requires an authenticated admin; /login lives outside
// this route group and stays reachable without a session.
export default async function OpsLayout({ children }: OpsLayoutProps) {
  const session = await requireAdminSession()

  return <OpsShell operatorName={session.displayName}>{children}</OpsShell>
}
