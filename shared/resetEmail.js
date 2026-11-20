// Resend may report the rejected key as a generic validation error.
export function resendKeyRejected(error) {
  return ["invalid_api_key", "missing_api_key"].includes(error?.name) ||
    /^api key is invalid[.!]?$/i.test(error?.message?.trim() ?? "");
}
