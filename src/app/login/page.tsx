import { EmailAuthPage } from "@/app/_components/email-auth-page"

export default async function Login({ searchParams }: PageProps<"/login">) {
  const params = await searchParams
  return <EmailAuthPage authError={params["auth_error"]} mode="login" />
}
