import { Outlet, createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/app")({
	component: AppLayout,
});

function AppLayout() {
	return (
		<div className="min-h-screen bg-background text-foreground">
			<div className="px-4 py-2">
				<h1 className="text-lg font-semibold">My Vouchers</h1>
			</div>
			<Outlet />
		</div>
	);
}
