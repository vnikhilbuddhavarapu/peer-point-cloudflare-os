import { describe, expect, it } from "vitest";
import { env } from "cloudflare:workers";
import type { UserDurableObject } from "../src/user.js";

declare module "cloudflare:workers" {
  interface ProvidedEnv {
    TEST_USER: DurableObjectNamespace<UserDurableObject>;
  }
}

describe("UserDurableObject Cloudflare Access identity", () => {
  it("stores and refreshes only the trusted Access email in chat context", async () => {
    const user = env.TEST_USER.getByName("access-email-refresh");

    await expect(
      user.authenticateFromCfAccess("first@example.com", true),
    ).resolves.toBe(true);
    await expect(user.getChatContext(null)).resolves.toMatchObject({
      trustedAccessEmail: "first@example.com",
    });

    await expect(
      user.authenticateFromCfAccess("refreshed@example.com", false),
    ).resolves.toBe(false);
    const context = await user.getChatContext(null);
    expect(context.trustedAccessEmail).toBe("refreshed@example.com");
    expect(context.profile.id).toBe("first@example.com");
  }, 15000);

  it("does not expose a trusted Access email before Access authentication", async () => {
    const context =
      await env.TEST_USER.getByName("no-access-email").getChatContext(null);
    expect(context.trustedAccessEmail).toBeUndefined();
  });
});
