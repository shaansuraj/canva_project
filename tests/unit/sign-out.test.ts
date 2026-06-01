import { describe, expect, it } from "vitest";

import { createSignOutRedirectUrl, SIGN_OUT_REDIRECT_STATUS } from "@/lib/auth/sign-out";

describe("sign-out redirect", () => {
  it("redirects direct visits back to login on the same origin", () => {
    expect(createSignOutRedirectUrl("https://hexmoncollab.vercel.app/auth/sign-out").toString()).toBe("https://hexmoncollab.vercel.app/login");
  });

  it("uses 303 so POST sign-out forms complete as a safe GET redirect", () => {
    expect(SIGN_OUT_REDIRECT_STATUS).toBe(303);
  });
});
