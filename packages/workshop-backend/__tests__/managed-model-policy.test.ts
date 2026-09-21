import { describe, expect, it, vi } from "vitest";
import type { AiChatAuthorInfo, AiModelConfig } from "@gadgets/workshop-shared/api";
import { UserDurableObject, type UserAiModelRecord } from "../src/user.js";

const MODELS = [
  "@cf/zai-org/glm-5.3",
  "@cf/zai-org/glm-5.3-flash",
  "@cf/zai-org/glm-5.2",
  "@cf/moonshotai/kimi-k2.6",
  "@cf/moonshotai/kimi-k2.7-code",
  "@cf/deepseek-ai/deepseek-v4-flash-0731",
  "@cf/deepseek-ai/deepseek-v4-pro-0813",
];
const QUICK_MODEL = "@cf/zai-org/glm-5.3-flash";
const LEGACY_ID = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";

function subject() {
  const legacy: UserAiModelRecord = {
    profile: { type: "agent", id: LEGACY_ID, name: "Legacy" },
    config: { provider: "cloudflare", model: LEGACY_ID, apiToken: "" },
  };
  const quickModel = { get: vi.fn(() => LEGACY_ID), put: vi.fn() };
  const preferredModel = { get: vi.fn(() => LEGACY_ID), put: vi.fn() };
  const aiModels = {
    list: vi.fn(() => [legacy]),
    get: vi.fn((id: string) => id === LEGACY_ID ? legacy : undefined),
    put: vi.fn(),
    delete: vi.fn(),
  };
  const user = Object.create(UserDurableObject.prototype) as UserDurableObject;
  Object.assign(user, {
    env: {
      CF_AI_GATEWAY: "peer-point-os",
      CF_AI_GATEWAY_ACCOUNT_ID: "account-id",
      CF_AI_GATEWAY_PROVIDERS: "cloudflare",
      CF_AI_GATEWAY_MODELS: MODELS.join(","),
      CF_AI_GATEWAY_QUICK_MODEL: QUICK_MODEL,
      WORKERS_AI: {} as Ai,
    } as Cloudflare.Env,
    storage: {
      aiModels,
      quickModel,
      preferredModel,
      profile: {
        get: () => ({ type: "user", id: "profile-id", name: "User" }) as AiChatAuthorInfo,
      },
      trustedAccessEmail: { get: () => "person@example.com" },
    },
  });
  return { user, aiModels, quickModel, preferredModel };
}

describe("managed model policy", () => {
  it("advertises only the seven deployment models and ignores stored legacy models", async () => {
    const { user } = subject();
    await expect(user.listModels()).resolves.toHaveLength(7);
    await expect(user.listModels()).resolves.not.toContainEqual(
      expect.objectContaining({ id: LEGACY_ID }),
    );
    await expect(user.getChatContext(LEGACY_ID)).rejects.toThrow("No such model");
    await expect(user.getChatContext(MODELS[0])).resolves.toMatchObject({
      aiModel: { config: { provider: "cloudflare", model: MODELS[0] } },
      quickModel: { provider: "cloudflare", model: QUICK_MODEL },
    });
  });

  it("rejects user-added, preferred, and quick-model bypasses", async () => {
    const { user, aiModels, quickModel, preferredModel } = subject();
    const profile: AiChatAuthorInfo = { type: "agent", id: LEGACY_ID, name: "Legacy" };
    const config: AiModelConfig = { provider: "cloudflare", model: LEGACY_ID, apiToken: "" };

    await expect(user.addModel(profile, config)).rejects.toThrow("Custom models are disabled");
    expect(aiModels.put).not.toHaveBeenCalled();
    await expect(user.setPreferredModel(LEGACY_ID)).rejects.toThrow("No such model");
    await expect(user.getPreferredModel()).resolves.toBeNull();
    expect(preferredModel.put).not.toHaveBeenCalled();
    await expect(user.setQuickModel(null)).rejects.toThrow("quick model is managed");
    await expect(user.getQuickModel()).resolves.toBe(QUICK_MODEL);
    await expect(user.setQuickModel(QUICK_MODEL)).resolves.toBeUndefined();
    expect(quickModel.put).not.toHaveBeenCalled();
  });
});
