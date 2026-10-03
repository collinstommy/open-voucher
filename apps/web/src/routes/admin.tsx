import { AdminApp } from "@/components/AdminApp";
import { NavigationLayout } from "@/components/NavigationLayout";
import { Outlet, createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/admin")({
	component: AdminLayout,
});

function AdminLayout() {
	return (
		<AdminApp>
			<NavigationLayout>
				<Outlet />
			</NavigationLayout>
		</AdminApp>
	);
}
