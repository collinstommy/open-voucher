import { Link } from "@tanstack/react-router";
import { LogOut } from "lucide-react";
import {
	EnvironmentDropdown,
	isDeploymentLocked,
} from "@/components/EnvironmentDropdown";
import { Button } from "@/components/ui/button";
import { useAdminAuth } from "@/hooks/useAdminAuth";

export function NavigationLayout() {
	const { isValid, logout } = useAdminAuth();

	const handleLogout = async () => {
		await logout();
		window.location.reload();
	};

	if (!isValid) {
		return null; // Don't show navigation when not authenticated
	}

	return (
		<div className="mb-6 flex items-center justify-between">
			<nav className="flex gap-6 text-lg">
				<Link to="/admin" className="font-semibold">
					Home
				</Link>
				<Link
					to="/admin/health-check"
					className="text-muted-foreground hover:text-foreground"
				>
					Health Check
				</Link>
				<Link
					to="/admin/evals"
					className="text-muted-foreground hover:text-foreground"
				>
					Evals
				</Link>

				<Link
					to="/admin/vouchers"
					className="text-muted-foreground hover:text-foreground"
				>
					Vouchers
				</Link>
				<Link
					to="/admin/failed-uploads"
					className="text-muted-foreground hover:text-foreground"
				>
					Failed Uploads
				</Link>
				<Link
					to="/admin/users"
					className="text-muted-foreground hover:text-foreground"
				>
					Users
				</Link>
				<Link
					to="/admin/feedback"
					className="text-muted-foreground hover:text-foreground"
				>
					Feedback
				</Link>
				<Link
					to="/admin/messages"
					className="text-muted-foreground hover:text-foreground"
				>
					Messages
				</Link>
				<Link
					to="/admin/banned"
					className="text-muted-foreground hover:text-foreground"
				>
					Banned
				</Link>
				<Link
					to="/admin/settings"
					className="text-muted-foreground hover:text-foreground"
				>
					Settings
				</Link>
			</nav>
			<div className="flex gap-2">
				<Button variant="ghost" size="sm" onClick={handleLogout}>
					<LogOut className="mr-2 h-4 w-4" />
					Logout
				</Button>
				{!isDeploymentLocked() && <EnvironmentDropdown />}
			</div>
		</div>
	);
}
