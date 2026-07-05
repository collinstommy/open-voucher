import { AdminApp } from "@/components/AdminApp";
import { NavigationLayout } from "@/components/NavigationLayout";
import { Outlet, createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/admin")({
	component: AdminLayout,
});

function AdminLayout() {
	return (
		<AdminApp>
			<div className="mx-auto max-w-7xl px-4 py-3 sm:px-6">
				<NavigationLayout />
				<Outlet />
			</div>
		</AdminApp>
	);
}
