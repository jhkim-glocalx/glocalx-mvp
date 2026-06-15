export async function readAppJsonResponse(
  response: Response,
  fallbackMessage: string
): Promise<unknown> {
  const text = await response.text()
  if (text.trim() === "") {
    return {
      status: "EMPTY_RESPONSE",
      message: fallbackMessage,
    }
  }

  try {
    const payload: unknown = JSON.parse(text)
    return payload
  } catch (error) {
    if (error instanceof SyntaxError) {
      return {
        status: "INVALID_JSON_RESPONSE",
        message: fallbackMessage,
      }
    }
    throw error
  }
}
