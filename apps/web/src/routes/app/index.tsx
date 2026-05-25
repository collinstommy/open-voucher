import { BalanceHero } from "@/components/mini-app/BalanceHero";
import { MenuRow } from "@/components/mini-app/MenuRow";
import { MENU_ITEMS } from "@/components/mini-app/menuConfig";
import { useUserAuth } from "@/hooks/useUserAuth";
import { openDonateLink } from "@/lib/openDonateLink";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";

export const Route = createFileRoute("/app/")({
	component: AppHome,
});

function AppHome() {
	const handleShare = () => {
		navigator.clipboard.writeText("https://openvouchers.org/telegram");
		toast.success("Link copied!");
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
					onExternalClick={
						item.id === "share" ? handleShare : openDonateLink
					}
				/>
			))}
			</div>
		</div>
	);
}
