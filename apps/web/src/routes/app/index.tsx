import { AppHeader } from "@/components/mini-app/AppHeader";
import { BalanceHero } from "@/components/mini-app/BalanceHero";
import { MenuRow } from "@/components/mini-app/MenuRow";
import { MENU_ITEMS } from "@/components/mini-app/menuConfig";
import { useUserAuth } from "@/hooks/useUserAuth";
import { openDonateLink } from "@/lib/openDonateLink";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/app/")({
	component: AppHome,
});

function AppHome() {
	const { user } = useUserAuth();
	if (!user) return null;

	return (
		<div className="flex flex-col flex-1 min-h-0">
			<AppHeader variant="home" />
			<BalanceHero coins={user.coins} />
			<div className="flex-1 p-4 space-y-3 bg-white overflow-auto">
			{MENU_ITEMS.map((item) => (
				<MenuRow
					key={item.id}
					item={item}
					onExternalClick={openDonateLink}
				/>
			))}
			</div>
		</div>
	);
}
