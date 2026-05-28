export type MenuItemId =
	| "availability"
	| "my-uploads"
	| "my-claims"
	| "transactions"
	| "faq"
	| "feedback"
	| "share"
	| "donate";

export type MenuItem = {
	id: MenuItemId;
	label: string;
	description: string;
	href?: string;
	external?: boolean;
	icon: string;
	iconClass: string;
};

export const MENU_ITEMS: MenuItem[] = [
	{
		id: "my-uploads",
		label: "My Uploads",
		description: "Mark vouchers you've used",
		href: "/app/my-uploads",
		icon: "🔄",
		iconClass: "bg-red-100 text-red-600",
	},
	{
		id: "my-claims",
		label: "My Claims",
		description: "Return vouchers to the pool",
		href: "/app/my-claims",
		icon: "↩️",
		iconClass: "bg-amber-100 text-amber-600",
	},
	{
		id: "transactions",
		label: "Transactions",
		description: "Earned and spent coins",
		href: "/app/transactions",
		icon: "📋",
		iconClass: "bg-green-100 text-green-600",
	},
	{
		id: "donate",
		label: "Donate",
		description: "buymeacoffee.com/openvouchers",
		external: true,
		icon: "☕",
		iconClass: "bg-yellow-100 text-yellow-600",
	},
	{
		id: "availability",
		label: "Voucher availability",
		description: "€5 · €10 · €20 stock levels",
		href: "/app/availability",
		icon: "📊",
		iconClass: "bg-pink-100 text-pink-600",
	},
	{
		id: "share",
		label: "Share with friends",
		description: "openvouchers.org/telegram",
		external: true,
		icon: "🔗",
		iconClass: "bg-blue-100 text-blue-600",
	},
	{
		id: "faq",
		label: "FAQ",
		description: "How the community works",
		href: "/app/faq",
		icon: "❓",
		iconClass: "bg-purple-100 text-purple-600",
	},
	{
		id: "feedback",
		label: "Give feedback",
		description: "Bugs, ideas, praise",
		href: "/app/feedback",
		icon: "💬",
		iconClass: "bg-orange-100 text-orange-600",
	},
];
