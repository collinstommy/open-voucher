/**
 * E2E Integration Tests using convex-test
 *
 * Uses mocked Convex backend with fetch stubbing for Gemini/Telegram APIs.
 * Run with: bun run test
 */

import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { internal } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import { modules } from "../test.setup";


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

// Helper to create a text message
function createTelegramMessage(text: string, chatId: string = "123456", username: string = "testuser") {
  // Parse chatId as number if it's numeric, otherwise use it as-is
  const numericChatId = isNaN(Number(chatId)) ? chatId : Number(chatId);
  return {
    message_id: Math.floor(Math.random() * 100000),
    chat: { id: numericChatId },
    from: { id: numericChatId, username, first_name: "Test" },
    text,
    date: Math.floor(Date.now() / 1000),
  };
}

// Helper to create a photo message
function createTelegramPhotoMessage(chatId: string = "123456") {
  // Parse chatId as number if it's numeric, otherwise use it as-is
  const numericChatId = isNaN(Number(chatId)) ? chatId : Number(chatId);
  return {
    message_id: Math.floor(Math.random() * 100000),
    chat: { id: numericChatId },
    from: { id: numericChatId, username: "testuser", first_name: "Test" },
    photo: [
      { file_id: "small_photo_id", width: 100, height: 100 },
      { file_id: "large_photo_id", width: 800, height: 600 },
    ],
    date: Math.floor(Date.now() / 1000),
  };
}

// Helper to create a callback query
function createTelegramCallback(data: string, chatId: string = "123456") {
  // Parse chatId as number if it's numeric, otherwise use it as-is
  const numericChatId = isNaN(Number(chatId)) ? chatId : Number(chatId);
  return {
    id: "callback_id_" + Math.floor(Math.random() * 100000),
    data,
    message: {
      message_id: Math.floor(Math.random() * 100000),
      chat: { id: numericChatId },
    },
    from: { id: numericChatId, username: "testuser", first_name: "Test" },
  };
}

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
    if (url.includes("api.telegram.org") && url.includes("/sendMessage")) {
      let body: any = {};
      if (options?.body instanceof FormData) {
        body = Object.fromEntries(options.body as any);
      } else if (typeof options?.body === "string") {
        body = JSON.parse(options.body);
      }
      sentMessages.push({ chatId: body.chat_id, text: body.text });
      return {
        ok: true,
        json: async () => mockTelegramResponse(),
      } as Response;
    }

    // Mock Telegram answerCallbackQuery
    if (url.includes("api.telegram.org") && url.includes("/answerCallbackQuery")) {
      return {
        ok: true,
        json: async () => ({ ok: true, result: true }),
      } as Response;
    }

    // Mock Telegram getFile endpoint
    if (url.includes("api.telegram.org") && url.includes("/getFile")) {
      return {
        ok: true,
        json: async () => ({
          ok: true,
          result: {
            file_path: "test/file/path.jpg"
          }
        }),
      } as Response;
    }

    // Mock Telegram file download
    if (url.includes("api.telegram.org/file/")) {
      return {
        ok: true,
        arrayBuffer: async () => new ArrayBuffer(100),
        blob: async () => new Blob(["fake-image"], { type: "image/jpeg" }),
      } as Response;
    }

    // Mock Telegram sendPhoto
    if (url.includes("api.telegram.org") && url.includes("/sendPhoto")) {
      let body: any = {};
      if (options?.body instanceof FormData) {
         sentMessages.push({
             chatId: options.body.get("chat_id") as string,
             text: options.body.get("caption") as string
         });
      }
      return {
        ok: true,
        json: async () => mockTelegramResponse(),
      } as Response;
    }

    // Mock Gemini OCR
    if (url.includes("generativelanguage.googleapis.com")) {
      return {
        ok: true,
        json: async () => scenarios[geminiScenario],
      } as Response;
    }

    // Mock Convex storage (for image download in OCR and voucher claims)
    if (url.includes("convex.cloud") || url.includes("convex.site")) {
      return {
        ok: true,
        arrayBuffer: async () => new ArrayBuffer(100),
        blob: async () => new Blob(["voucher-image"], { type: "image/jpeg" }),
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
    vi.stubEnv("TELEGRAM_BOT_TOKEN", "test-bot-token");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  test("new user with valid invite code is created via Telegram message", async () => {
    const t = convexTest(schema, modules);
    const chatId = "123456789";

    const inviteCode = await t.run(async (ctx) => {
      const codeId = await ctx.db.insert("inviteCodes", {
        code: "TESTCODE",
        maxUses: 100,
        usedCount: 0,
        createdAt: Date.now(),
      });
      return "TESTCODE";
    });

    // Simulate sending "code TESTCODE"
    await t.action(internal.telegram.handleTelegramMessage, {
      message: createTelegramMessage(`code ${inviteCode}`, chatId),
    });

    // Check user created
    const user = await t.run(async (ctx) => {
        return await ctx.db.query("users").withIndex("by_chat_id", q => q.eq("telegramChatId", chatId)).first();
    });

    expect(user).toBeDefined();
    expect(user?.isBanned).toBe(false);

    // Verify welcome message
    const welcomeMsg = sentMessages.find(m => m.chatId === chatId && m.text?.includes("Welcome to the Dunnes Voucher Bot"));
    expect(welcomeMsg).toBeDefined();
  });

  test("validate invite code increments usage via Telegram message", async () => {
    const t = convexTest(schema, modules);
    const chatId = "987654321";

    await t.run(async (ctx) => {
      await ctx.db.insert("inviteCodes", {
        code: "SINGLEUSE",
        maxUses: 1,
        usedCount: 0,
        createdAt: Date.now(),
      });
    });

    // First use: Should succeed (uses mock message)
    await t.action(internal.telegram.handleTelegramMessage, {
      message: createTelegramMessage("code SINGLEUSE", chatId),
    });

    const user = await t.run(async (ctx) => {
        return await ctx.db.query("users").withIndex("by_chat_id", q => q.eq("telegramChatId", chatId)).first();
    });
    expect(user).toBeDefined();

    // Second use: Should fail (new user from different chat)
     const chatId2 = "987654322";
    await t.action(internal.telegram.handleTelegramMessage, {
      message: createTelegramMessage("code SINGLEUSE", chatId2),
    });

    // Verify failure message
    const errorMsg = sentMessages.find(m => m.chatId === chatId2 && m.text?.includes("limit"));
    expect(errorMsg).toBeDefined();
  });

  test("invalid invite code returns error via Telegram message", async () => {
    const t = convexTest(schema, modules);
    const chatId = "111222333";

    await t.action(internal.telegram.handleTelegramMessage, {
      message: createTelegramMessage("code DOESNOTEXIST", chatId),
    });

    // Verify failure message
    const errorMsg = sentMessages.find(m => m.chatId === chatId && m.text?.includes("Invalid"));
    expect(errorMsg).toBeDefined();

    // Verify user NOT created
    const user = await t.run(async (ctx) => {
        return await ctx.db.query("users").withIndex("by_chat_id", q => q.eq("telegramChatId", chatId)).first();
    });
    expect(user).toBeNull();
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

  test("upload voucher creates processing voucher via Telegram webhook", async () => {
    const t = convexTest(schema, modules);
    const chatId = "123456";

    // Create a user
    const userId = await t.run(async (ctx) => {
      return await ctx.db.insert("users", {
        telegramChatId: chatId,
        coins: 20,
        isBanned: false,
        createdAt: Date.now(),
        lastActiveAt: Date.now(),
      });
    });

    // Simulate sending a photo
    await t.action(internal.telegram.handleTelegramMessage, {
      message: createTelegramPhotoMessage(chatId),
    });

    // Wait for OCR action and follow-up mutations
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    // Check voucher is created and processed
    const voucher = await t.run(async (ctx) => {
      return await ctx.db.query("vouchers").withIndex("by_uploader", (q) => q.eq("uploaderId", userId)).first();
    });

    expect(voucher).toBeDefined();
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
    vi.stubEnv("TELEGRAM_BOT_TOKEN", "test-bot-token");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  test("claim voucher deducts coins via Telegram webhook", async () => {
    const t = convexTest(schema, modules);
    const chatId = "123456";

    // Create user with coins
    const userId = await t.run(async (ctx) => {
      return await ctx.db.insert("users", {
        telegramChatId: chatId,
        coins: 20,
        isBanned: false,
        createdAt: Date.now(),
        lastActiveAt: Date.now(),
      });
    });

    // Create another user (the uploader)
    const uploaderId = await t.run(async (ctx) => {
      return await ctx.db.insert("users", {
        telegramChatId: "uploader123",
        coins: 0,
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
        uploaderId: uploaderId,
        expiryDate: Date.now() + 7 * 24 * 60 * 60 * 1000,
        createdAt: Date.now(),
      });
    });

    // Claim the voucher via Telegram command
    await t.action(internal.telegram.handleTelegramMessage, {
      message: createTelegramMessage("10", chatId),
    });

    // Verify user coins were deducted
    const user = await t.run(async (ctx) => {
      return await ctx.db.get(userId);
    });

    expect(user?.coins).toBe(10); // 20 - 10

    // Verify user received message with voucher
    const successMsg = sentMessages.find(m => m.chatId === chatId && m.text?.includes("Here is your €10 voucher"));
    expect(successMsg).toBeDefined();
  });

  test("claim with insufficient coins fails via Telegram webhook", async () => {
    const t = convexTest(schema, modules);
    const chatId = "123456";

    const userId = await t.run(async (ctx) => {
      return await ctx.db.insert("users", {
        telegramChatId: chatId,
        coins: 5,
        isBanned: false,
        createdAt: Date.now(),
        lastActiveAt: Date.now(),
      });
    });

    // Create another user (the uploader)
    const uploaderId = await t.run(async (ctx) => {
      return await ctx.db.insert("users", {
        telegramChatId: "uploader456",
        coins: 0,
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
        uploaderId: uploaderId,
        expiryDate: Date.now() + 7 * 24 * 60 * 60 * 1000,
        createdAt: Date.now(),
      });
    });

    // Try to claim via Telegram
    await t.action(internal.telegram.handleTelegramMessage, {
      message: createTelegramMessage("10", chatId),
    });

    // Verify failure message
    const errorMsg = sentMessages.find(m => m.chatId === chatId && m.text?.includes("Insufficient coins"));
    expect(errorMsg).toBeDefined();
  });

  test("claim fails when no voucher available via Telegram webhook", async () => {
    const t = convexTest(schema, modules);
    const chatId = "123456";

    await t.run(async (ctx) => {
      await ctx.db.insert("users", {
        telegramChatId: chatId,
        coins: 20,
        isBanned: false,
        createdAt: Date.now(),
        lastActiveAt: Date.now(),
      });
    });

    // Try to claim without any vouchers in system
    await t.action(internal.telegram.handleTelegramMessage, {
      message: createTelegramMessage("10", chatId),
    });

    // Verify failure message
    const errorMsg = sentMessages.find(m => m.chatId === chatId && m.text?.includes("No €10 vouchers currently available"));
    expect(errorMsg).toBeDefined();
  });
});

describe("OCR Flow with Mocked Gemini", () => {
  beforeEach(() => {
    setupFetchMock();
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

  test("duplicate barcode is rejected via Telegram webhook", async () => {
    // Use a barcode that the mock OCR will return
    const duplicateBarcode = "1234567890002";
    const chatId = "123456";
    setupFetchMock("valid_10");
    vi.stubEnv("GOOGLE_GENERATIVE_AI_API_KEY", "test-api-key");
    vi.stubEnv("TELEGRAM_BOT_TOKEN", "test-bot-token");
    vi.useFakeTimers({ now: Date.now() });
    const t = convexTest(schema, modules);

    // Create existing user (already signed up)
    const userId = await t.run(async (ctx) => {
      return await ctx.db.insert("users", {
        telegramChatId: chatId,
        coins: 0,
        isBanned: false,
        createdAt: Date.now(),
        lastActiveAt: Date.now(),
      });
    });

    // Create first voucher with the same barcode that OCR will return
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
        barcodeNumber: duplicateBarcode,
        createdAt: Date.now(),
      });
    });

    // Simulate Telegram webhook with a photo message (like a real user uploading)
    const telegramMessage = {
      message_id: 12345,
      chat: { id: Number(chatId) },
      from: { id: 12345, username: "testuser", first_name: "Test" },
      photo: [
        { file_id: "small_photo_id", width: 100, height: 100 },
      ],
      date: Math.floor(Date.now() / 1000),
    };

    // Call the Telegram message handler directly (simulates webhook)
    await t.action(internal.telegram.handleTelegramMessage, {
      message: telegramMessage,
    });

    await t.finishAllScheduledFunctions(vi.runAllTimers);

    // Find the second voucher (the duplicate one)
    const vouchers = await t.run(async (ctx) => {
      return await ctx.db.query("vouchers").collect();
    });
    const duplicateVoucher = vouchers.find(v => v.status === "expired");
    expect(duplicateVoucher).toBeDefined();

    const user = await t.run(async (ctx) => {
      return await ctx.db.get(userId);
    });
    expect(user?.coins).toBe(0);

    // Verify the user received a message about the duplicate
    const duplicateMessage = sentMessages.find(
      (msg) => msg.text?.includes("already been uploaded") || msg.text?.includes("duplicate")
    );
    expect(duplicateMessage).toBeDefined();
    expect(duplicateMessage?.chatId).toBe(chatId);

    vi.useRealTimers();
    vi.unstubAllEnvs();
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
      userId: claimerId,
      voucherId,
    });

    expect(result.status).toBe("refunded");

    // Check claimer got coins back
    const claimer = await t.run(async (ctx) => {
      return await ctx.db.get(claimerId);
    });
    expect(claimer?.coins).toBe(20);
  });
});

describe("Ban Flow", () => {
  beforeEach(() => {
    setupFetchMock();
    vi.stubEnv("TELEGRAM_BOT_TOKEN", "test-bot-token");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  test("uploader gets banned after 10 reports and receives ban message", async () => {
    vi.useFakeTimers();
    const t = convexTest(schema, modules);
    const uploaderChatId = "uploader_ban_test";
    const reporterChatId = "reporter_test";

    // Create uploader user (will be banned)
    const uploaderId = await t.run(async (ctx) => {
      return await ctx.db.insert("users", {
        telegramChatId: uploaderChatId,
        coins: 100,
        isBanned: false,
        createdAt: Date.now(),
        lastActiveAt: Date.now(),
      });
    });

    // Create reporter user
    const reporterId = await t.run(async (ctx) => {
      return await ctx.db.insert("users", {
        telegramChatId: reporterChatId,
        coins: 50,
        isBanned: false,
        createdAt: Date.now(),
        lastActiveAt: Date.now(),
      });
    });

    // Helper to create a reported voucher
    const createReportedVoucher = async (index: number) => {
      const imageStorageId = await t.run(async (ctx) => {
        return await ctx.storage.store(new Blob([`voucher_image_${index}`]));
      });

      const voucherId = await t.run(async (ctx) => {
        return await ctx.db.insert("vouchers", {
          type: "10",
          status: "reported",
          imageStorageId,
          uploaderId,
          claimerId: reporterId,
          claimedAt: Date.now() - (index * 1000), // Different times
          expiryDate: Date.now() + 7 * 24 * 60 * 60 * 1000,
          createdAt: Date.now() - (index * 1000),
        });
      });

      // Create the report entry
      await t.run(async (ctx) => {
        await ctx.db.insert("reports", {
          voucherId,
          reporterId,
          uploaderId,
          reason: "not_working",
          createdAt: Date.now() - (index * 1000),
        });
      });

      return voucherId;
    };

    // Create 9 existing reported vouchers (will trigger ban on 10th report)
    const reportedVoucherIds = [];
    for (let i = 0; i < 9; i++) {
      const voucherId = await createReportedVoucher(i);
      reportedVoucherIds.push(voucherId);
    }

    // Create 1 available voucher that will be reported via callback
    const availableImageStorageId = await t.run(async (ctx) => {
      return await ctx.storage.store(new Blob(["available_voucher_image"]));
    });

    const availableVoucherId = await t.run(async (ctx) => {
      return await ctx.db.insert("vouchers", {
        type: "10",
        status: "claimed",
        imageStorageId: availableImageStorageId,
        uploaderId,
        claimerId: reporterId,
        claimedAt: Date.now(),
        expiryDate: Date.now() + 7 * 24 * 60 * 60 * 1000,
        createdAt: Date.now(),
      });
    });

    // Create callback query to report the available voucher (10th report)
    const callbackQuery = createTelegramCallback(`report:${availableVoucherId}`, reporterChatId);

    // Execute the callback handler - this should trigger the ban
    await t.action(internal.telegram.handleTelegramCallback, {
      callbackQuery
    });

    // Wait for scheduled functions (ban notification) to complete
    vi.runAllTimers();
    await t.finishInProgressScheduledFunctions();

    // Verify the uploader is now banned
    const uploader = await t.run(async (ctx) => {
      return await ctx.db.get(uploaderId);
    });
    expect(uploader?.isBanned).toBe(true);

    // Verify ban notification was sent to uploader
    const banNotification = sentMessages.find(m =>
      m.chatId === uploaderChatId &&
      m.text?.includes("Account Banned")
    );
    expect(banNotification).toBeDefined();
    expect(banNotification?.text).toContain("banned because multiple vouchers you uploaded were reported");

    // Verify the available voucher was marked as reported
    const availableVoucher = await t.run(async (ctx) => {
      return await ctx.db.get(availableVoucherId);
    });
    expect(availableVoucher?.status).toBe("reported");

    // Verify reporter got appropriate response (replacement or refund)
    const reporterResponse = sentMessages.find(m =>
      m.chatId === reporterChatId
    );
    expect(reporterResponse).toBeDefined();

    // Now test that the banned user gets a ban message when trying to interact
    sentMessages.length = 0; // Clear sent messages

    // Simulate banned user trying to upload a voucher
    const newImageStorageId = await t.run(async (ctx) => {
      return await ctx.storage.store(new Blob(["new_voucher_image"]));
    });

    // This should fail with ban message
    await expect(
      t.mutation(internal.vouchers.uploadVoucher, {
        userId: uploaderId,
        imageStorageId: newImageStorageId,
      })
    ).rejects.toThrow("You have been banned from this service");

    // Simulate banned user sending a message to the bot
    const bannedUserMessage = createTelegramMessage("test message", uploaderChatId);

    // The message handler should not throw, but should send a ban response
    await t.action(internal.telegram.handleTelegramMessage, {
      message: bannedUserMessage,
    });

    // Verify banned user received ban message
    const banMessage = sentMessages.find(m =>
      m.chatId === uploaderChatId &&
      m.text?.includes("banned")
    );
    expect(banMessage).toBeDefined();

    vi.useRealTimers();
  });
});

describe("Reminder Flow", () => {
  beforeEach(() => {
    setupFetchMock();
    vi.stubEnv("TELEGRAM_BOT_TOKEN", "test-bot-token");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  test("sends reminders to users who claimed vouchers yesterday", async () => {
    vi.useFakeTimers();

    const now = Date.now();
    const oneDayMs = 24 * 60 * 60 * 1000;
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
    const yesterday = now - oneDayMs;
    const twoDaysAgo = now - (2 * oneDayMs);
    const futureExpiry = now + sevenDaysMs;

    const t = convexTest(schema, modules);

    const claimerId = await t.run(async (ctx) => {
      return await ctx.db.insert("users", {
        telegramChatId: "claimer123",
        coins: 100,
        isBanned: false,
        createdAt: now,
        lastActiveAt: now,
      });
    });

    const uploaderId = await t.run(async (ctx) => {
      return await ctx.db.insert("users", {
        telegramChatId: "uploader456",
        coins: 50,
        isBanned: false,
        createdAt: now,
        lastActiveAt: now,
      });
    });

    // Create voucher claimed yesterday (should trigger reminder)
    const yesterdayVoucherId = await t.run(async (ctx) => {
      const imageStorageId = await ctx.storage.store(new Blob(["test"]));
      return await ctx.db.insert("vouchers", {
        type: "10",
        status: "claimed",
        imageStorageId,
        uploaderId,
        claimerId,
        claimedAt: yesterday,
        expiryDate: futureExpiry,
        createdAt: yesterday,
      });
    });

    // Create voucher claimed today (should NOT trigger)
    const todayVoucherId = await t.run(async (ctx) => {
      const imageStorageId = await ctx.storage.store(new Blob(["test"]));
      return await ctx.db.insert("vouchers", {
        type: "5",
        status: "claimed",
        imageStorageId,
        uploaderId,
        claimerId,
        claimedAt: now,
        expiryDate: futureExpiry,
        createdAt: now,
      });
    });

    // Create voucher claimed 2 days ago (should NOT trigger)
    const oldVoucherId = await t.run(async (ctx) => {
      const imageStorageId = await ctx.storage.store(new Blob(["test"]));
      return await ctx.db.insert("vouchers", {
        type: "20",
        status: "claimed",
        imageStorageId,
        uploaderId,
        claimerId,
        claimedAt: twoDaysAgo,
        expiryDate: futureExpiry,
        createdAt: twoDaysAgo,
      });
    });

    // Query users who claimed yesterday
    const chatIds = await t.query(internal.reminders.getUsersWhoClaimedYesterday, {});

    // Verify only yesterday's claimer is returned
    expect(chatIds).toHaveLength(1);
    expect(chatIds[0]).toBe("claimer123");

    // Clear sent messages and run the reminder action
    sentMessages.length = 0;
    await t.action(internal.reminders.sendDailyUploadReminders, {});

    // Wait for scheduled messages
    vi.runAllTimers();
    await t.finishInProgressScheduledFunctions();

    // Verify reminder was sent to the right user
    const reminderMessage = sentMessages.find(m =>
      m.chatId === "claimer123" &&
      m.text?.includes("Upload your new vouchers")
    );
    expect(reminderMessage).toBeDefined();

    // Verify no message was sent to uploader
    const uploaderMessage = sentMessages.find(m => m.chatId === "uploader456");
    expect(uploaderMessage).toBeUndefined();

    vi.useRealTimers();
  });
});
