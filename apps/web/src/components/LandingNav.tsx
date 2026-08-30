import { Link } from "@tanstack/react-router";
import { DISCORD_URL } from "@/lib/openDiscordLink";

export default function LandingNav() {
	return (
		<nav className="bg-gray-900 py-4">
			<div className="container mx-auto px-6 flex justify-between items-center">
				<Link to="/" className="flex items-center gap-2">
					<span className="text-2xl">🛒</span>
					<span className="font-bold text-xl tracking-tight text-white">
						Open Vouchers
					</span>
				</Link>
				<div className="flex items-center gap-5">
					<a
						href={DISCORD_URL}
						target="_blank"
						rel="noopener noreferrer"
						aria-label="Join our Discord"
						className="text-gray-300 hover:text-white transition-colors"
					>
						<DiscordIcon />
					</a>
					<a
						href="https://buymeacoffee.com/openvouchers"
						target="_blank"
						rel="noopener noreferrer"
						className="inline-flex items-center gap-2 text-yellow-400 hover:text-yellow-300 transition-colors text-sm font-medium"
					>
						<CoffeeIcon />
						Buy me a coffee
					</a>
				</div>
			</div>
		</nav>
	);
}

export function DiscordIcon() {
	return (
		<svg
			className="w-5 h-5"
			fill="currentColor"
			viewBox="0 0 24 24"
			aria-hidden="true"
		>
			<path d="M20.317 4.37a19.79 19.79 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.865-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.058a.082.082 0 0 0 .031.056 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.291.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.331c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
		</svg>
	);
}

function CoffeeIcon() {
	return (
		<svg
			className="w-4 h-4"
			fill="currentColor"
			viewBox="0 0 24 24"
			aria-hidden="true"
		>
			<path d="M20.216 6.415c-.04-.162-.134-.308-.272-.404-.138-.096-.308-.14-.478-.126h-.004c-.17.014-.336.07-.468.162l-.002.002c-.016.01-.03.022-.044.034l-.002.002-4.834 3.506-4.834-3.506-.002-.002c-.014-.012-.028-.024-.044-.034l-.002-.002c-.132-.092-.298-.148-.468-.162h-.004c-.17-.014-.34.03-.478.126-.138.096-.232.242-.272.404-.04.162-.03.334.028.488l.002.004c.006.016.014.03.022.044l.002.004 5.584 8.094c.092.134.234.23.394.27h.034c.16-.002.314-.06.436-.162l5.068-5.588.002-.002c.014-.016.026-.032.036-.048l.002-.004c.056-.154.066-.326.026-.488zM3.96 5h16.08c.53 0 .96.43.96.96v.08c0 .53-.43.96-.96.96H3.96c-.53 0-.96-.43-.96-.96v-.08c0-.53.43-.96.96-.96z" />
		</svg>
	);
}
