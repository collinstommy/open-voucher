import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import { modules } from "../test.setup";

describe("getMessageAnalytics", () => {
	test("returns counts and unknown messages for admin", async () => {
		const t = convexTest(schema, modules);
		const token = "test-admin-token";
		const now = Date.now();

		await t.run(async (ctx) => {
			await ctx.db.insert("adminSessions", {
				token,
				createdAt: now,
				expiresAt: now + 24 * 60 * 60 * 1000,
			});
			await ctx.db.insert("messages", {
				telegramMessageId: 1,
				telegramChatId: "chat-1",
				direction: "inbound",
				messageType: "text",
				text: "help",
				intent: "help",
				isAdminMessage: false,
				createdAt: now,
			});
			await ctx.db.insert("messages", {
				telegramMessageId: 2,
				telegramChatId: "chat-1",
				direction: "inbound",
				messageType: "text",
				text: "what is this bot?",
				intent: "unknown",
				isAdminMessage: false,
				createdAt: now,
			});
		});

		const result = await t.query(api.admin.getMessageAnalytics, {
			token,
		});

		expect(result.totalInbound).toBe(2);
		expect(result.dashboardCounts.help).toBe(1);
		expect(result.unknownCount).toBe(1);
		expect(result.unknownMessages).toHaveLength(1);
		expect(result.unknownMessages[0]?.text).toBe("what is this bot?");
	});
});
