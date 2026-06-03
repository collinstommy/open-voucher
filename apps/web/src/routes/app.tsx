import { AppShell } from "@/components/mini-app/AppShell";
import { useUserAuth } from "@/hooks/useUserAuth";
import { Outlet, createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/app")({
	head: () => ({
		scripts: [
			{
				src: "https://telegram.org/js/telegram-web-app.js",
			},
		],
	}),
	component: AppLayout,
});

function AppLayout() {
	const { user, isLoading, error } = useUserAuth();

	if (isLoading) {
		return (
			<AppShell>
				<div className="flex flex-1 items-center justify-center text-slate-500">

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
		return null;
	}

	return (
		<AppShell>
			<Outlet />
		</AppShell>
	);
}
