import { useState } from "react";
import LandingNav from "@/components/LandingNav";
import { LANDING_FAQ_ITEMS } from "@/lib/faqContent";

export default function LandingPage() {
	return (
		<div className="bg-gray-50 text-gray-800 flex flex-col min-h-screen font-[Inter]">
			<LandingNav />
			<Hero />
			<HowItWorks />
			<CoinEconomy />
			<Updates />
			<Support />
			<FAQ />
			<Footer />
		</div>
	);
}

function Hero() {
	return (
		<header className="bg-white pb-16 pt-12 lg:pt-24">
			<div className="container mx-auto px-6 text-center">
				<div className="max-w-3xl mx-auto">
					<span className="inline-block py-1 px-3 rounded-full bg-green-100 text-green-700 text-xs font-semibold uppercase tracking-wider mb-4">
						Community Driven
					</span>
					<h1 className="text-4xl lg:text-6xl font-extrabold text-gray-900 leading-tight mb-6">
						Bank & Swap Your{" "}
						<span className="text-blue-600">Dunnes Vouchers</span>
					</h1>
					<p className="text-lg lg:text-xl text-gray-600 mb-10 leading-relaxed">
						The smart, community-run way to manage vouchers. Bank the
						ones you won&apos;t use, and grab the exact €10 or €20 voucher
						you need for your next big shop.
					</p>

					<a
						href="https://t.me/DunnesVoucherBot"
						target="_blank"
						rel="noopener noreferrer"
						className="inline-flex items-center justify-center px-8 py-4 text-lg font-bold text-white transition-all duration-200 bg-blue-600 rounded-full hover:bg-blue-700 focus:outline-none focus:ring-4 focus:ring-blue-500 focus:ring-offset-2 shadow-xl hover:shadow-2xl hover:-translate-y-1"
					>
						<TelegramIcon />
						Open Bot in Telegram
					</a>
					<p className="mt-4 text-sm text-gray-400">
						Includes 10-Coin Welcome Bonus
					</p>
				</div>
			</div>
		</header>
	);
}

function TelegramIcon() {
	return (
		<svg
			className="w-6 h-6 mr-2"
			fill="currentColor"
			viewBox="0 0 24 24"
			aria-hidden="true"
		>
			<path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.562 8.161c-.18 1.897-.962 6.502-1.361 8.627-.168.9-.5 1.201-.82 1.23-.697.064-1.226-.461-1.901-.903-1.056-.692-1.653-1.123-2.678-1.799-1.185-.781-.417-1.21.258-1.911.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.139-5.062 3.345-.479.329-.913.489-1.302.481-.428-.008-1.252-.241-1.865-.44-.751-.244-1.349-.374-1.297-.789.027-.216.324-.437.893-.663 3.498-1.524 5.831-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.477-1.635.099-.002.321.023.465.141.119.098.152.228.166.33.016.116.021.312.016.353z" />
		</svg>
	);
}

function HowItWorks() {
	const steps = [
		{
			icon: "📸",
			color: "bg-blue-100 text-blue-600",
			title: "1. Upload",
			body: "Got a voucher you won't use this week? Simply snap a photo or screenshot of it and send it to the bot.",
		},
		{
			icon: "🪙",
			color: "bg-yellow-100 text-yellow-600",
			title: "2. Earn Coins",
			body: "The bot verifies your voucher instantly and credits your account with community coins.",
		},
		{
			icon: "🎟️",
			color: "bg-green-100 text-green-600",
			title: "3. Swap",
			body: "Use your coins to grab the exact €10 or €20 voucher you need, exactly when you need it.",
		},
	];

	return (
		<section className="py-16 bg-white">
			<div className="container mx-auto px-6">
				<div className="text-center mb-16">
					<h2 className="text-3xl font-bold text-gray-900">
						How It Works
					</h2>
					<p className="text-gray-500 mt-2">
						Join the community economy in three simple steps.
					</p>
				</div>

				<div className="grid md:grid-cols-3 gap-10 max-w-5xl mx-auto">
					{steps.map((step) => (
						<div
							key={step.title}
							className="bg-gray-50 p-8 rounded-2xl border border-gray-100 text-center hover:shadow-lg transition-shadow"
						>
							<div
								className={`w-16 h-16 ${step.color} rounded-full flex items-center justify-center text-2xl mx-auto mb-6`}
							>
								{step.icon}
							</div>
							<h3 className="text-xl font-bold text-gray-900 mb-3">
								{step.title}
							</h3>
							<p className="text-gray-600 leading-relaxed">
								{step.body}
							</p>
						</div>
					))}
				</div>
			</div>
		</section>
	);
}

function CoinEconomy()  {
	const earnRows = [
		{ label: "Join Bonus", amount: "+10 Coins" },
		{ label: "Upload €5 Voucher", amount: "+15 Coins" },
		{ label: "Upload €10 Voucher", amount: "+10 Coins" },
		{ label: "Upload €20 Voucher", amount: "+5 Coins" },
	];

	const spendRows = [
		{ label: "Claim €5 Voucher", amount: "-15 Coins" },
		{ label: "Claim €10 Voucher", amount: "-10 Coins" },
		{ label: "Claim €20 Voucher", amount: "-5 Coins" },
	];

	return (
		<section className="py-16 bg-gray-50 border-t border-gray-200">
			<div className="container mx-auto px-6">
				<div className="max-w-4xl mx-auto">
					<div className="text-center mb-12">
						<h2 className="text-3xl font-bold text-gray-900">
							The Coin Economy
						</h2>
						<p className="text-gray-500 mt-2">
							Fair, transparent, and designed for flexibility.
						</p>
					</div>

					<div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden mb-10">
						<div className="grid md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-gray-100">
							<div className="p-8">
								<h3 className="text-lg font-bold text-green-600 flex items-center mb-6">
									<span className="bg-green-100 p-2 rounded-lg mr-3">
										⬆️
									</span>{" "}
									Earning Coins
								</h3>
								<ul className="space-y-4">
									{earnRows.map((row, i) => (
										<li
											key={row.label}
											className={`flex justify-between items-center pb-4 ${
												i < earnRows.length - 1
													? "border-b border-gray-50"
													: ""
											}`}
										>
											<span className="text-gray-600">
												{row.label}
											</span>
											<span className="font-bold text-gray-900">
												{row.amount}
											</span>
										</li>
									))}
								</ul>
							</div>

							<div className="p-8">
								<h3 className="text-lg font-bold text-red-500 flex items-center mb-6">
									<span className="bg-red-50 p-2 rounded-lg mr-3">
										⬇️
									</span>{" "}
									Spending Coins
								</h3>
								<ul className="space-y-4">
									{spendRows.map((row, i) => (
										<li
											key={row.label}
											className={`flex justify-between items-center pb-4 ${
												i < spendRows.length - 1
													? "border-b border-gray-50"
													: ""
											}`}
										>
											<span className="text-gray-600">
												{row.label}
											</span>
											<span className="font-bold text-gray-900">
												{row.amount}
											</span>
										</li>
									))}
								</ul>
							</div>
						</div>
					</div>
				</div>
			</div>
		</section>
	);
}

function Updates() {
	return (
		<section className="py-16 bg-white border-t border-gray-200">
			<div className="container mx-auto px-6">
				<div className="max-w-3xl mx-auto">
					<div className="text-center mb-12">
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

					<div className="space-y-4">
						<div className="bg-gray-50 rounded-xl border border-gray-200 p-6 hover:shadow-md transition-all">
							<div className="text-sm text-gray-400 mb-2">
								April 25, 2025
							</div>
							<h3 className="text-lg font-semibold text-gray-900 mb-2">
								Added support for Three+ vouchers
							</h3>
							<p className="text-gray-600 leading-relaxed">
								The bot now accepts <strong>Three+</strong> vouchers
								(€5 off €25) from Three. You can upload and claim them
								just like Dunnes vouchers.
							</p>
						</div>
					</div>
				</div>
			</div>
		</section>
	);
}

function Support() {
	return (
		<section className="py-16 bg-gradient-to-br from-amber-500 to-orange-500">
			<div className="container mx-auto px-6">
				<div className="max-w-2xl mx-auto text-center">
					<div className="text-5xl mb-4">☕</div>
					<h2 className="text-3xl font-bold text-white mb-4">
						Enjoying Open Vouchers?
					</h2>
					<p className="text-amber-100 text-lg leading-relaxed mb-8">
						The service is free, but servers and AI-powered OCR
						aren&apos;t. Your support helps keep the lights on!
					</p>
					<a
						href="https://buymeacoffee.com/openvouchers"
						target="_blank"
						rel="noopener noreferrer"
						className="inline-flex items-center gap-2 bg-white hover:bg-gray-100 text-amber-600 px-8 py-4 rounded-full font-bold text-lg transition-colors shadow-lg"
					>
						<svg
							className="w-6 h-6"
							fill="currentColor"
							viewBox="0 0 24 24"
							aria-hidden="true"
						>
							<path d="M20.216 6.415c-.04-.162-.134-.308-.272-.404-.138-.096-.308-.14-.478-.126h-.004c-.17.014-.336.07-.468.162l-.002.002c-.016.01-.03.022-.044.034l-.002.002-4.834 3.506-4.834-3.506-.002-.002c-.014-.012-.028-.024-.044-.034l-.002-.002c-.132-.092-.298-.148-.468-.162h-.004c-.17-.014-.34.03-.478.126-.138.096-.232.242-.272.404-.04.162-.03.334.028.488l.002.004c.006.016.014.03.022.044l.002.004 5.584 8.094c.092.134.234.23.394.27h.034c.16-.002.314-.06.436-.162l5.068-5.588.002-.002c.014-.016.026-.032.036-.048l.002-.004c.056-.154.066-.326.026-.488zM3.96 5h16.08c.53 0 .96.43.96.96v.08c0 .53-.43.96-.96.96H3.96c-.53 0-.96-.43-.96-.96v-.08c0-.53.43-.96.96-.96z" />
						</svg>
						Buy me a coffee
					</a>
				</div>
			</div>
		</section>
	);
}

function FAQ() {
	return (
		<section className="py-16 bg-gray-50 border-t border-gray-200">
			<div className="container mx-auto px-6">
				<div className="max-w-3xl mx-auto">
					<div className="text-center mb-12">
						<h2 className="text-3xl font-bold text-gray-900">
							Frequently Asked Questions
						</h2>
						<p className="text-gray-500 mt-2">
							Everything you need to know about Open Vouchers.
						</p>
					</div>

					<div className="space-y-4">
						{LANDING_FAQ_ITEMS.map((faq) => (
							<FAQItem key={faq.q} question={faq.q} answer={faq.a} />
						))}
					</div>
				</div>
			</div>
		</section>
	);
}

function FAQItem({
	question,
	answer,
}: { question: string; answer: React.ReactNode }) {
	const [open, setOpen] = useState(false);

	return (
		<div
			className={`rounded-xl border border-gray-200 transition-all ${
				open ? "bg-white shadow-md" : "bg-gray-50"
			}`}
		>
			<button
				type="button"
				onClick={() => setOpen(!open)}
				className="flex justify-between items-center w-full cursor-pointer p-6 text-left"
			>
				<h3 className="text-lg font-semibold text-gray-900">
					{question}
				</h3>
				<span
					className={`ml-4 text-gray-400 transition-transform ${
						open ? "rotate-180" : ""
					}`}
				>
					▼
				</span>
			</button>
			{open && (
				<div className="px-6 pb-6 text-gray-600 leading-relaxed">
					{typeof answer === "string" ? <p>{answer}</p> : answer}
				</div>
			)}
		</div>
	);
}

function Footer() {
	return (
		<footer className="mt-auto bg-gray-900 text-gray-400 py-12">
			<div className="container mx-auto px-6 text-center">
				<div className="text-sm opacity-60">
					<p>Not affiliated with Dunnes Stores.</p>
				</div>
			</div>
		</footer>
	);
}
