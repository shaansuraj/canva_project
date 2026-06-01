export const SIGN_OUT_REDIRECT_STATUS = 303;

export function createSignOutRedirectUrl(requestUrl: string) {
  return new URL("/login", requestUrl);
}
