export default function LandingNav() {
	return (
		<nav className="bg-gray-900 py-4">
			<div className="container mx-auto px-6 flex justify-between items-center">
				<div className="flex items-center gap-2">
					<span className="text-2xl">🛒</span>
					<span className="font-bold text-xl tracking-tight text-white">
						Open Vouchers
					</span>
				</div>
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
		</nav>
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
