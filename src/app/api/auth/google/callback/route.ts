export async function GET() {
  return Response.json(
    {
      status: "GOOGLE_OAUTH_PLACEHOLDER",
      message: "Google OAuth production callback is not enabled in demo mode.",
    },
    { status: 501 }
  )
}
