import { z } from "zod"

const emailSchema = z.string().trim().toLowerCase().email().max(254)
const passwordSchema = z.string().min(12).max(256)

const emailLoginFormSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
})

const emailRegistrationFormSchema = emailLoginFormSchema.extend({
  displayName: z.string().trim().min(1).max(80),
})

export type EmailLoginForm = z.infer<typeof emailLoginFormSchema>
export type EmailRegistrationForm = z.infer<typeof emailRegistrationFormSchema>

function readTextValue(formData: FormData, name: string): string {
  const value = formData.get(name)
  return typeof value === "string" ? value : ""
}

export function parseEmailLoginForm(
  formData: FormData
): EmailLoginForm | undefined {
  const parsed = emailLoginFormSchema.safeParse({
    email: readTextValue(formData, "email"),
    password: readTextValue(formData, "password"),
  })
  return parsed.success ? parsed.data : undefined
}

export function parseEmailRegistrationForm(
  formData: FormData
): EmailRegistrationForm | undefined {
  const parsed = emailRegistrationFormSchema.safeParse({
    displayName: readTextValue(formData, "displayName"),
    email: readTextValue(formData, "email"),
    password: readTextValue(formData, "password"),
  })
  return parsed.success ? parsed.data : undefined
}
