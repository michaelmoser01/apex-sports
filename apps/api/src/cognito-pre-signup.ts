/**
 * Pre-sign-up trigger. When REQUIRE_SIGNUP_VERIFICATION is not 'true' (default), auto-confirms
 * and auto-verifies email so sign-up skips the verification code step.
 * Deploy with REQUIRE_SIGNUP_VERIFICATION=true to test the full email code flow.
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
