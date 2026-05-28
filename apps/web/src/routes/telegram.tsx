import { createFileRoute } from "@tanstack/react-router";

const BOT_URL = "https://t.me/DunnesVoucherBot";

export const Route = createFileRoute("/telegram")({
	component: () => (
		<div className="flex items-center justify-center min-h-screen bg-gray-50 font-[Inter]">
			<div className="text-center">
				<p className="text-gray-600 text-lg">Opening Telegram…</p>
				<a
					href={BOT_URL}
					className="inline-block mt-4 text-blue-600 underline"
				>
					Click here if nothing happens
				</a>
			</div>
		</div>
	),
	head: () => ({
		meta: [
			{ title: "Open Vouchers Bot on Telegram" },
			{ "http-equiv": "refresh", content: `0;url=${BOT_URL}` },
			{
				name: "description",
				content:
					"Join the Dunnes voucher swap community on Telegram — upload vouchers to earn coins, claim vouchers when you need them.",
			},
			{ property: "og:type", content: "website" },
			{ property: "og:url", content: "https://openvouchers.org/telegram" },
			{
				property: "og:title",
				content: "Open Vouchers Bot on Telegram",
			},
			{
				property: "og:description",
				content:
					"Bank & swap Dunnes vouchers. Community-driven, free, and instant. Join on Telegram.",
			},
			{
				property: "twitter:card",
				content: "summary_large_image",
			},
			{
				property: "twitter:url",
				content: "https://openvouchers.org/telegram",
			},
			{
				property: "twitter:title",
				content: "Open Vouchers Bot on Telegram",
			},
			{
				property: "twitter:description",
				content:
					"Bank & swap Dunnes vouchers. Community-driven, free, and instant.",
			},
		],
	}),
});
