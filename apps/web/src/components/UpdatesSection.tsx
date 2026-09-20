import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

type UpdateEntry = {
	date: string;
	title: string;
	body: ReactNode;
};

const UPDATES: UpdateEntry[] = [
	{
		date: "Jul 20, 2026",
		title: "The bot understands plain messages",
		body: 'No need to memorise commands. Type "balance" or "I want to return a voucher" and the bot replies with the answer, plus a button that takes you to the right screen in the Mini App.',
	},
	{
		date: "Jun 17, 2026",
		title: "Feedback is now a chat thread",
		body: "Send feedback from the Mini App and read replies in a chat-style thread. Uploaders now get notified when one of their vouchers is reported as not working, with the screenshot and the last 4 barcode digits so you know exactly which voucher was flagged.",
	},
	{
		date: "Jun 4, 2026",
		title: "Refunds either way when you report a voucher",
		body: "If you report a voucher as already used, your coins are safe. You get a replacement when one is available, or a full refund when it isn't. Declining a replacement now gets you a refund too.",
	},
	{
		date: "May 28, 2026",
		title: "More vouchers accepted",
		body: "Vouchers without a valid-from date, like Dunnes spend-based vouchers, no longer get rejected at upload.",
	},
	{
		date: "May 25, 2026",
		title: "My Uploads screen",
		body: "See every voucher you've uploaded and mark the ones you've used yourself, so nobody wastes coins claiming them.",
	},
	{
		date: "May 23, 2026",
		title: "The Mini App is here",
		body: (
			<>
				Tap <strong>Menu</strong> in the bot to open the new account hub.
				Check your coin balance, browse available vouchers, review claims
				and transactions, read the FAQ or send feedback, all without
				leaving Telegram.
			</>
		),
	},
	{
		date: "May 16, 2026",
		title: "Fairer claims",
		body: "If the voucher you claimed turns out to be already used, we can reverse the claim. Your coins come back and the voucher goes back in the pool.",
	},
	{
		date: "Apr 25, 2026",
		title: "Added support for Three+ vouchers",
		body: (
			<>
				The bot now accepts <strong>Three+</strong> vouchers (€5 off €25)
				from Three. You can upload and claim them just like Dunnes
				vouchers.
			</>
		),
	},
];

export default function UpdatesSection({
	limit,
	compact,
}: {
	limit?: number;
	compact?: boolean;
}) {
	const entries = limit ? UPDATES.slice(0, limit) : UPDATES;
	const truncated = limit !== undefined && limit < UPDATES.length;

	return (
		<section
			className={
				compact
					? "pt-6 pb-12 bg-white border-t border-gray-200"
					: "py-12 bg-white border-t border-gray-200"
			}
		>
			<div className="container mx-auto px-6">
				<div className="max-w-3xl mx-auto">
					<div className="text-center mb-8">
						<h2
							id="updates"
							className="text-3xl font-bold text-gray-900"
						>
							What&apos;s New
						</h2>
						<p className="text-gray-500 mt-2">
							Latest updates and features.
						</p>
					</div>

					<div className="space-y-3">
						{entries.map((entry) => (
							<div
								key={entry.date}
								className="bg-gray-50 rounded-xl border border-gray-200 px-4 py-3 sm:px-5"
							>
								<div className="sm:flex sm:items-baseline sm:gap-3">
									<span className="block text-xs text-gray-400 sm:w-20 sm:shrink-0">
										{entry.date}
									</span>
									<h3 className="text-base font-semibold text-gray-900 mt-0.5 sm:mt-0">
										{entry.title}
									</h3>
								</div>
								<p className="text-sm text-gray-600 leading-relaxed mt-1">
									{entry.body}
								</p>
							</div>
						))}
					</div>

					{truncated && (
						<div className="text-center mt-6">
							<Link
								to="/updates"
								className="inline-flex items-center justify-center px-6 py-2.5 text-sm font-semibold text-gray-700 bg-white border border-gray-300 rounded-full hover:bg-gray-100 transition-colors"
							>
								Show all {UPDATES.length} updates
							</Link>
						</div>
					)}
				</div>
			</div>
		</section>
	);
}
