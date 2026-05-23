import { AppShell } from "@/components/mini-app/AppShell";
import { useUserAuth } from "@/hooks/useUserAuth";
import { Outlet, createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/app")({
	component: AppLayout,
});

function AppLayout() {
	const { user, isLoading, error } = useUserAuth();

	if (isLoading) {
		return (
			<AppShell>
				<div className="flex flex-1 items-center justify-center text-slate-500">
					Loading...
				</div>
			</AppShell>
		);
	}

	if (error) {
		return (
			<AppShell>
				<div className="flex flex-1 items-center justify-center px-4">
					<div className="max-w-sm text-center space-y-4">
						<div className="text-3xl">⚠️</div>
						<p className="text-slate-600">{error.message}</p>
					</div>
				</div>
			</AppShell>
		);
	}

	if (!user) {
		return (
			<AppShell>
				<div className="flex flex-1 items-center justify-center px-4">
					<div className="max-w-sm text-center space-y-4">
						<div className="text-5xl">📱</div>
						<h2 className="text-xl font-semibold text-slate-900">
							Open this page in Telegram
						</h2>
						<p className="text-slate-600 text-sm">
							This page is a Telegram Mini App. Open the bot and tap My
							Account to view your balance and vouchers.
						</p>
						<a
							href="https://t.me/DunnesVoucherBot"
							target="_blank"
							rel="noopener noreferrer"
							className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-full font-medium active:bg-blue-800 transition-colors cursor-pointer"
						>
							Open Bot in Telegram
						</a>
					</div>
				</div>
			</AppShell>
		);
	}

	return (
		<AppShell>
			<Outlet />
		</AppShell>
	);
}
