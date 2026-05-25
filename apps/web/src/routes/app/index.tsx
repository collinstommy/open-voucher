import { BalanceHero } from "@/components/mini-app/BalanceHero";
import { MenuRow } from "@/components/mini-app/MenuRow";
import { SharePanel } from "@/components/mini-app/SharePanel";
import { MENU_ITEMS } from "@/components/mini-app/menuConfig";
import { useUserAuth } from "@/hooks/useUserAuth";
import { openDonateLink } from "@/lib/openDonateLink";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

export const Route = createFileRoute("/app/")({
	component: AppHome,
});

const SHARE_URL = "https://openvouchers.org/telegram";
const SHARE_TEXT = "Swap and share Dunnes Vouchers using this Telegram bot";

function AppHome() {
	const [showShare, setShowShare] = useState(false);

	const handleMenuClick = (id: string) => {
		if (id === "share") {
			setShowShare(true);
		} else {
			openDonateLink();
		}
	};

	const { user } = useUserAuth();
	if (!user) return null;

	return (
		<div className="flex flex-col flex-1 min-h-0">
			<BalanceHero coins={user.coins} />
			<div className="flex-1 p-4 space-y-3 bg-white overflow-auto">
			{MENU_ITEMS.map((item) => (
				<MenuRow
					key={item.id}
					item={item}
					onExternalClick={() => handleMenuClick(item.id)}
				/>
			))}
			</div>

			<SharePanel
				open={showShare}
				onClose={() => setShowShare(false)}
				url={SHARE_URL}
				text={SHARE_TEXT}
			/>
		</div>
	);
}
