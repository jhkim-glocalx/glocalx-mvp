export function GET(): Response {
  return Response.json({ ok: true, service: "glocalx-admin" })
}
