import { Link, createFileRoute } from "@tanstack/react-router";
import LandingNav from "@/components/LandingNav";
import { Footer } from "@/components/LandingPage";
import UpdatesSection from "@/components/UpdatesSection";

export const Route = createFileRoute("/updates")({
	head: () => ({
		meta: [
			{ charSet: "utf-8" },
			{
				name: "viewport",
				content: "width=device-width, initial-scale=1",
			},
			{ title: "What's New - Open Vouchers" },
			{
				name: "description",
				content:
					"Latest updates and features from Open Vouchers, the community-run way to swap Dunnes Stores vouchers.",
			},
		],
	}),

	component: () => (
		<div className="bg-gray-50 text-gray-800 flex flex-col min-h-screen font-sans">
			<LandingNav />
			<div className="container mx-auto px-6 py-3 bg-white border-t border-gray-200">
				<nav className="text-sm text-gray-500" aria-label="Breadcrumb">
					<Link
						to="/"
						className="hover:text-gray-700 transition-colors"
					>
						Home
					</Link>
					<span className="mx-2 text-gray-400">/</span>
					<span className="text-gray-700 font-medium">
						What&apos;s New
					</span>
				</nav>
			</div>
			<UpdatesSection compact />
			<div className="py-6 text-center">
				<Link
					to="/"
					className="text-sm text-gray-500 hover:text-gray-700 transition-colors"
				>
					← Back to openvouchers.org
				</Link>
			</div>
			<Footer />
		</div>
	),
});
