export async function readAppJsonResponse(
  response: Response,
  fallbackMessage: string
): Promise<unknown> {
  // Read text first because response.json() throws before callers can apply UI-safe fallbacks.
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
      // Malformed browser/API responses are converted into normal parser input, not thrown UI errors.
      return {
        status: "INVALID_JSON_RESPONSE",
        message: fallbackMessage,
      }
    }
    throw error
  }
}
