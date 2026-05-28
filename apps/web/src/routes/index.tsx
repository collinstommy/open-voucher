import LandingPage from "@/components/LandingPage";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
	head: () => ({
		meta: [
			{ charSet: "utf-8" },
			{
				name: "viewport",
				content: "width=device-width, initial-scale=1",
			},
			{
				title: "Open Vouchers - Dunnes Voucher Swap",
			},
			{
				name: "description",
				content:
					"The smart, community-run way to manage Dunnes Stores vouchers. Bank unused vouchers to earn coins, and swap them for the exact €5, €10 or €20 voucher you need.",
			},
			{ property: "og:type", content: "website" },
			{ property: "og:url", content: "https://openvouchers.org/" },
			{
				property: "og:title",
				content: "Open Vouchers - Dunnes Voucher Swap",
			},
			{
				property: "og:description",
				content:
					"The smart, community-run way to manage Dunnes Stores vouchers. Bank unused vouchers to earn coins, and swap them for the exact €5, €10 or €20 voucher you need.",
			},
			{
				property: "twitter:card",
				content: "summary_large_image",
			},
			{
				property: "twitter:url",
				content: "https://openvouchers.org/",
			},
			{
				property: "twitter:title",
				content: "Open Vouchers - Dunnes Voucher Swap",
			},
			{
				property: "twitter:description",
				content:
					"The smart, community-run way to manage Dunnes Stores vouchers. Bank unused vouchers to earn coins, and swap them for the exact €5, €10 or €20 voucher you need.",
			},
		],
	}),

	component: () => <LandingPage />,
});
