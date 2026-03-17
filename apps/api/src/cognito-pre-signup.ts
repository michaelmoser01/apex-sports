/**
 * Pre-sign-up trigger. When REQUIRE_SIGNUP_VERIFICATION is not 'true', auto-confirms
 * so dev/stage skip email verification. Set REQUIRE_SIGNUP_VERIFICATION=true and
 * redeploy to test the full verification code workflow, then unset and redeploy to turn off.
 */
export const handler = async (event: {
  response: { autoConfirmUser: boolean; autoVerifyEmail: boolean };
}) => {
  const requireVerification = process.env.REQUIRE_SIGNUP_VERIFICATION === "true";
  if (!requireVerification) {
    event.response.autoConfirmUser = true;
    event.response.autoVerifyEmail = true;
  }
  return event;
};
