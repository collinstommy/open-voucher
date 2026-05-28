import type { ReactNode } from "react";

export type FaqItem = {
	q: string;
	a: ReactNode;
};

const UPLOAD_CLAIM_FAQ: FaqItem[] = [
	{
		q: "How do I upload a voucher?",
		a: "Send a screenshot of your voucher to the bot in Telegram. Make sure the barcode is clearly visible. Paper vouchers, app screenshots, and email vouchers all work.",
	},
	{
		q: "How do I claim a voucher?",
		a: "In the bot chat, send 5, 10, or 20 depending on the voucher value you want (€5, €10, or €20 off). The bot will send you a voucher from the pool if you have enough coins.",
	},
];

export const LANDING_FAQ_ITEMS: FaqItem[] = [
	{
		q: "Why are smaller vouchers worth more?",
		a: (
			<>
				<p className="mb-4">
					You might notice that a <strong>€10 off €50</strong> voucher is worth
					more coins than a <strong>€20 off €100</strong> voucher, and a{" "}
					<strong>€5 off €25</strong> voucher is worth even more. This is
					intentional!
				</p>
				<ul className="list-disc list-inside space-y-2">
					<li>
						<strong>More Flexible:</strong> It&apos;s easier to spend €50 than
						€100. Two €10 vouchers (split over two shops) are often more useful
						than one single €20 voucher.
					</li>
					<li>
						<strong>Higher Demand:</strong> Smaller vouchers are requested more
						often, so we reward you more for supplying them.
					</li>
				</ul>
			</>
		),
	},
	{
		q: "Is this really free?",
		a: "Yes. The project is open-source and community-run. We have no intention of charging fees.",
	},
	{
		q: "Can I use online or app vouchers?",
		a: "Yes! You can upload screenshots of vouchers from the Dunnes Stores app or from your email. They work exactly the same as paper vouchers.",
	},
	{
		q: "What if the voucher I receive has already been used?",
		a: 'You can mark it as "already used" in the bot. Users who upload multiple used vouchers will be banned from the system. When you report a voucher as used, you will get a replacement voucher when available.',
	},
	{
		q: "How do I know if there are enough vouchers in the pool?",
		a: "Check voucher availability in the Mini App before claiming. The pool typically has plenty of €5 and €10 vouchers available.",
	},
	{
		q: "Can I upload vouchers that expire today?",
		a: "Yes, but uploads after 9pm for same-day expiring vouchers won't earn coins. This ensures vouchers have enough time to be used before shops close.",
	},
	{
		q: "Is there a limit on how many vouchers I can swap?",
		a: "No limits! You can swap as many vouchers as you need, completely free.",
	},
	{
		q: "What happens if I upload a voucher and accidentally use it?",
		a: 'The claimer can mark the voucher as "already used" in the bot. You will get a message to confirm it\'s already been used.',
	},
	{
		q: "Is this a cryptocurrency? Can I buy coins?",
		a: 'No. "Coins" are simply community points used to ensure the system is fair. They have no monetary value and cannot be bought or sold. The only way to earn coins is by helping others (uploading vouchers).',
	},
];

export const APP_FAQ_ITEMS: FaqItem[] = [
	...UPLOAD_CLAIM_FAQ,
	...LANDING_FAQ_ITEMS,
];
