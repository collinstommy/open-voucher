/**
 * E2E Integration Tests using convex-test
 *
 * Uses mocked Convex backend with fetch stubbing for Gemini/Telegram APIs.
 * Run with: npx vitest
 */

import { convexTest } from "convex-test";
import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { api, internal } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import { modules } from "../../convex/test.setup";


function mockGeminiResponse(type: string, expiryDate: string, barcode: string) {
  return {
    candidates: [{
      content: {
        parts: [{
          text: JSON.stringify({ type, expiryDate, barcode })
        }]
      }
    }]
  };
}

function mockTelegramResponse() {
  return { ok: true, result: { message_id: 123 } };
}

let sentMessages: { chatId: string; text?: string }[] = [];

type OCRSenario = "valid_10" | "valid_5" | "valid_20" | "expired" | "invalid_type"

function setupFetchMock(geminiScenario: OCRSenario = "valid_10") {
  sentMessages = [];

  const futureDate = new Date();
  futureDate.setDate(futureDate.getDate() + 14);
  const futureDateStr = futureDate.toISOString().split("T")[0];

  const pastDate = new Date();
  pastDate.setDate(pastDate.getDate() - 7);
  const pastDateStr = pastDate.toISOString().split("T")[0];

  const scenarios = {
    valid_5: mockGeminiResponse("5", futureDateStr, "1234567890001"),
    valid_10: mockGeminiResponse("10", futureDateStr, "1234567890002"),
    valid_20: mockGeminiResponse("20", futureDateStr, "1234567890003"),
    expired: mockGeminiResponse("10", pastDateStr, "1234567890004"),
    invalid_type: mockGeminiResponse("0", futureDateStr, "1234567890005"),
  };

  vi.stubGlobal("fetch", vi.fn(async (url: string, options?: RequestInit) => {
    // Mock Telegram sendMessage
    if (url.includes("api.telegram.org") && url.includes("/send")) {
      if (typeof options?.body === "string") {
        const body = JSON.parse(options.body);
        sentMessages.push({ chatId: body.chat_id, text: body.text });
      }
      return {
        ok: true,
        json: async () => mockTelegramResponse(),
        text: async () => JSON.stringify(mockTelegramResponse()),
      } as Response;
    }

    // Mock Telegram getFile
    if (url.includes("api.telegram.org") && url.includes("/getFile")) {
      return {
        ok: true,
        json: async () => ({ ok: true, result: { file_path: "test.jpg" } }),
      } as Response;
    }

    // Mock Telegram file download
    if (url.includes("api.telegram.org/file/")) {
      return {
        ok: true,
        blob: async () => new Blob(["fake-image"], { type: "image/jpeg" }),
      } as Response;
    }

    // Mock Gemini OCR
    if (url.includes("generativelanguage.googleapis.com")) {
      return {
        ok: true,
        json: async () => scenarios[geminiScenario],
      } as Response;
    }

    // Mock Convex storage (for image download in OCR)
    if (url.includes("convex.cloud") || url.includes("convex.site")) {
      return {
        ok: true,
        arrayBuffer: async () => new ArrayBuffer(100),
      } as Response;
    }

    // Fallback - shouldn't reach here in tests
    console.warn(`Unmocked fetch: ${url}`);
    return { ok: false, status: 404 } as Response;
  }));
}

describe("User Signup Flow", () => {
  beforeEach(() => {
    setupFetchMock();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test("new user with valid invite code is created", async () => {
    const t = convexTest(schema, modules);

    const inviteCode = await t.run(async (ctx) => {
      const codeId = await ctx.db.insert("inviteCodes", {
        code: "TESTCODE",
        maxUses: 100,
        usedCount: 0,
        createdAt: Date.now(),
      });
      return "TESTCODE";
    });

    const user = await t.mutation(internal.users.createUserWithInvite, {
      telegramChatId: "123456789",
      username: "testuser",
      firstName: "Test",
      inviteCode: inviteCode,
    });

    expect(user).toBeDefined();
    expect(user.isBanned).toBe(false);
  });

  test("validate invite code increments usage", async () => {
    const t = convexTest(schema, modules);

    await t.run(async (ctx) => {
      await ctx.db.insert("inviteCodes", {
        code: "SINGLEUSE",
        maxUses: 1,
        usedCount: 0,
        createdAt: Date.now(),
      });
    });

    const result = await t.mutation(internal.users.validateAndUseInviteCode, {
      code: "SINGLEUSE",
    });

    expect(result.valid).toBe(true);

    // Second use should fail
    const result2 = await t.mutation(internal.users.validateAndUseInviteCode, {
      code: "SINGLEUSE",
    });

    expect(result2.valid).toBe(false);
    expect(result2.reason).toContain("limit");
  });

  test("invalid invite code returns error", async () => {
    const t = convexTest(schema, modules);

    const result = await t.mutation(internal.users.validateAndUseInviteCode, {
      code: "DOESNOTEXIST",
    });

    expect(result.valid).toBe(false);
    expect(result.reason).toContain("Invalid");
  });
});

describe("Voucher Upload Flow", () => {
  beforeEach(() => {
    // Setup fetch mock with real dates
    setupFetchMock("valid_10");
    // Stub env vars for OCR
    vi.stubEnv("GOOGLE_GENERATIVE_AI_API_KEY", "test-api-key");
    // Enable fake timers with current real time
    vi.useFakeTimers({ now: Date.now() });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  test("upload voucher creates processing voucher", async () => {
    const t = convexTest(schema, modules);

    // Create a user
    const userId = await t.run(async (ctx) => {
      return await ctx.db.insert("users", {
        telegramChatId: "123456",
        coins: 20,
        isBanned: false,
        createdAt: Date.now(),
        lastActiveAt: Date.now(),
      });
    });

    const fakeStorageId = await t.run(async (ctx) => {
      return await ctx.storage.store(new Blob(["fake-image"]));
    });

    const voucherId = await t.mutation(internal.vouchers.uploadVoucher, {
      userId,
      imageStorageId: fakeStorageId,
    });

    expect(voucherId).toBeDefined();

    // Wait for scheduled OCR action to complete
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    // Check voucher is now available after OCR completed
    const voucher = await t.run(async (ctx) => {
      return await ctx.db.get(voucherId);
    });
    expect(voucher?.status).toBe("available");
    expect(voucher?.type).toBe("10");

    // Check user got coins from the upload
    const user = await t.run(async (ctx) => {
      return await ctx.db.get(userId);
    });
    expect(user?.coins).toBe(30); // 20 original + 10 for uploading €10 voucher
  });
});

describe("Voucher Claim Flow", () => {
  beforeEach(() => {
    setupFetchMock();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test("claim voucher deducts coins", async () => {
    const t = convexTest(schema, modules);

    // Create user with coins
    const userId = await t.run(async (ctx) => {
      return await ctx.db.insert("users", {
        telegramChatId: "123456",
        coins: 20,
        isBanned: false,
        createdAt: Date.now(),
        lastActiveAt: Date.now(),
      });
    });

    // Create an available voucher
    const imageStorageId = await t.run(async (ctx) => {
      return await ctx.storage.store(new Blob(["voucher-image"]));
    });

    await t.run(async (ctx) => {
      await ctx.db.insert("vouchers", {
        type: "10",
        status: "available",
        imageStorageId,
        uploaderId: userId,
        expiryDate: Date.now() + 7 * 24 * 60 * 60 * 1000,
        createdAt: Date.now(),
      });
    });

    // Claim the voucher
    const result = await t.mutation(internal.vouchers.requestVoucher, {
      userId,
      type: "10",
    });

    expect(result.success).toBe(true);
    expect(result.remainingCoins).toBe(10); // 20 - 10

    // Verify user coins were deducted
    const user = await t.run(async (ctx) => {
      return await ctx.db.get(userId);
    });

    expect(user?.coins).toBe(10);
  });

  test("claim with insufficient coins fails", async () => {
    const t = convexTest(schema, modules);

    // Create user with only 5 coins
    const userId = await t.run(async (ctx) => {
      return await ctx.db.insert("users", {
        telegramChatId: "123456",
        coins: 5,
        isBanned: false,
        createdAt: Date.now(),
        lastActiveAt: Date.now(),
      });
    });

    const result = await t.mutation(internal.vouchers.requestVoucher, {
      userId,
      type: "10",
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("Insufficient");
  });

  test("claim when no vouchers available fails", async () => {
    const t = convexTest(schema, modules);

    // Create user with coins
    const userId = await t.run(async (ctx) => {
      return await ctx.db.insert("users", {
        telegramChatId: "123456",
        coins: 20,
        isBanned: false,
        createdAt: Date.now(),
        lastActiveAt: Date.now(),
      });
    });

    // Try to claim without any vouchers in system
    const result = await t.mutation(internal.vouchers.requestVoucher, {
      userId,
      type: "10",
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe("No €10 vouchers currently available.");
  });
});

describe("OCR Flow with Mocked Gemini", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  test("valid voucher OCR awards coins to uploader", async () => {
    setupFetchMock("valid_10");
    const t = convexTest(schema, modules);

    // Create user
    const userId = await t.run(async (ctx) => {
      return await ctx.db.insert("users", {
        telegramChatId: "123456",
        coins: 0,
        isBanned: false,
        createdAt: Date.now(),
        lastActiveAt: Date.now(),
      });
    });

    // Create storage and voucher
    const imageStorageId = await t.run(async (ctx) => {
      return await ctx.storage.store(new Blob(["fake-image"]));
    });

    const voucherId = await t.run(async (ctx) => {
      return await ctx.db.insert("vouchers", {
        type: "0",
        status: "processing",
        imageStorageId,
        uploaderId: userId,
        expiryDate: 0,
        createdAt: Date.now(),
      });
    });

    // Simulate OCR completing with valid result
    await t.mutation(internal.vouchers.updateVoucherFromOcr, {
      voucherId,
      type: "10",
      expiryDate: Date.now() + 14 * 24 * 60 * 60 * 1000,
      barcodeNumber: "1234567890",
      ocrRawResponse: "{}",
    });

    // Wait for scheduled functions (Telegram notifications)
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    // Check voucher is now available
    const voucher = await t.run(async (ctx) => {
      return await ctx.db.get(voucherId);
    });
    expect(voucher?.status).toBe("available");
    expect(voucher?.type).toBe("10");

    // Check user got coins (10 for €10 voucher)
    const user = await t.run(async (ctx) => {
      return await ctx.db.get(userId);
    });
    expect(user?.coins).toBe(10);
  });

  test("expired voucher OCR fails and notifies user", async () => {
    setupFetchMock("expired");
    const t = convexTest(schema, modules);

    // Create user
    const userId = await t.run(async (ctx) => {
      return await ctx.db.insert("users", {
        telegramChatId: "123456",
        coins: 0,
        isBanned: false,
        createdAt: Date.now(),
        lastActiveAt: Date.now(),
      });
    });

    // Create storage and voucher
    const imageStorageId = await t.run(async (ctx) => {
      return await ctx.storage.store(new Blob(["fake-image"]));
    });

    const voucherId = await t.run(async (ctx) => {
      return await ctx.db.insert("vouchers", {
        type: "0",
        status: "processing",
        imageStorageId,
        uploaderId: userId,
        expiryDate: 0,
        createdAt: Date.now(),
      });
    });

    // Simulate OCR with expired date
    const pastDate = Date.now() - 7 * 24 * 60 * 60 * 1000;
    await t.mutation(internal.vouchers.updateVoucherFromOcr, {
      voucherId,
      type: "10",
      expiryDate: pastDate,
      barcodeNumber: "1234567890",
      ocrRawResponse: "{}",
    });

    // Wait for scheduled functions (Telegram notifications)
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    // Check voucher is expired
    const voucher = await t.run(async (ctx) => {
      return await ctx.db.get(voucherId);
    });
    expect(voucher?.status).toBe("expired");

    // Check user did NOT get coins
    const user = await t.run(async (ctx) => {
      return await ctx.db.get(userId);
    });
    expect(user?.coins).toBe(0);
  });

  test("duplicate barcode is rejected", async () => {
    setupFetchMock("valid_10");
    const t = convexTest(schema, modules);

    // Create user
    const userId = await t.run(async (ctx) => {
      return await ctx.db.insert("users", {
        telegramChatId: "123456",
        coins: 0,
        isBanned: false,
        createdAt: Date.now(),
        lastActiveAt: Date.now(),
      });
    });

    // Create first voucher with a barcode
    const imageStorageId1 = await t.run(async (ctx) => {
      return await ctx.storage.store(new Blob(["image1"]));
    });

    await t.run(async (ctx) => {
      await ctx.db.insert("vouchers", {
        type: "10",
        status: "available",
        imageStorageId: imageStorageId1,
        uploaderId: userId,
        expiryDate: Date.now() + 14 * 24 * 60 * 60 * 1000,
        barcodeNumber: "DUPLICATE123",
        createdAt: Date.now(),
      });
    });

    // Try to add second voucher with same barcode
    const imageStorageId2 = await t.run(async (ctx) => {
      return await ctx.storage.store(new Blob(["image2"]));
    });

    const voucherId2 = await t.run(async (ctx) => {
      return await ctx.db.insert("vouchers", {
        type: "0",
        status: "processing",
        imageStorageId: imageStorageId2,
        uploaderId: userId,
        expiryDate: 0,
        createdAt: Date.now(),
      });
    });

    // OCR returns same barcode
    await t.mutation(internal.vouchers.updateVoucherFromOcr, {
      voucherId: voucherId2,
      type: "10",
      expiryDate: Date.now() + 14 * 24 * 60 * 60 * 1000,
      barcodeNumber: "DUPLICATE123",
      ocrRawResponse: "{}",
    });

    await t.finishAllScheduledFunctions(vi.runAllTimers);

    // Check second voucher is rejected (status = expired for duplicates)
    const voucher2 = await t.run(async (ctx) => {
      return await ctx.db.get(voucherId2);
    });
    expect(voucher2?.status).toBe("expired");

    // User should not get coins
    const user = await t.run(async (ctx) => {
      return await ctx.db.get(userId);
    });
    expect(user?.coins).toBe(0);
  });
});

describe("Report Flow", () => {
  beforeEach(() => {
    setupFetchMock();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test("reporting voucher refunds coins when no replacement", async () => {
    const t = convexTest(schema, modules);

    // Create uploader
    const uploaderId = await t.run(async (ctx) => {
      return await ctx.db.insert("users", {
        telegramChatId: "uploader123",
        coins: 10,
        isBanned: false,
        createdAt: Date.now(),
        lastActiveAt: Date.now(),
      });
    });

    // Create claimer
    const claimerId = await t.run(async (ctx) => {
      return await ctx.db.insert("users", {
        telegramChatId: "claimer456",
        coins: 10,
        isBanned: false,
        createdAt: Date.now(),
        lastActiveAt: Date.now(),
      });
    });

    // Create claimed voucher
    const imageStorageId = await t.run(async (ctx) => {
      return await ctx.storage.store(new Blob(["voucher"]));
    });

    const voucherId = await t.run(async (ctx) => {
      return await ctx.db.insert("vouchers", {
        type: "10",
        status: "claimed",
        imageStorageId,
        uploaderId,
        claimerId,
        claimedAt: Date.now(),
        expiryDate: Date.now() + 7 * 24 * 60 * 60 * 1000,
        createdAt: Date.now(),
      });
    });

    // Report the voucher
    const result = await t.mutation(internal.vouchers.reportVoucher, {
      telegramChatId: "claimer456",
      voucherId,
    });

    expect(result.status).toBe("refunded");

    // Check claimer got coins back
    const claimer = await t.run(async (ctx) => {
      return await ctx.db.get(claimerId);
    });
    expect(claimer?.coins).toBe(20); // 10 + 10 refund
  });
});
