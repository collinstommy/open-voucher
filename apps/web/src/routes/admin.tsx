import { createFileRoute, Outlet } from "@tanstack/react-router";
import { AdminApp } from "@/components/AdminApp";
import { NavigationLayout } from "@/components/NavigationLayout";
import "@/admin.css";

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
