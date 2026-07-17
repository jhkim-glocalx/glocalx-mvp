import { EmailAuthPage } from "@/app/_components/email-auth-page"

export default async function Register({
  searchParams,
}: PageProps<"/register">) {
  const params = await searchParams
  return <EmailAuthPage authError={params["auth_error"]} mode="register" />
}
