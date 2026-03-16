export const handler = async (event: {
  response: { autoConfirmUser: boolean; autoVerifyEmail: boolean };
}) => {
  event.response.autoConfirmUser = true;
  event.response.autoVerifyEmail = true;
  return event;
};
