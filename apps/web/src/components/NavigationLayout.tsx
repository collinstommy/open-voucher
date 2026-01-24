import { Link } from "@tanstack/react-router";
import { LogOut } from "lucide-react";
import { EnvironmentDropdown } from "@/components/EnvironmentDropdown";
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
				<Link to="/" className="font-semibold">
					Home
				</Link>

				<Link
					to="/vouchers"
					className="text-muted-foreground hover:text-foreground"
				>
					Vouchers
				</Link>
				<Link
					to="/failed-uploads"
					className="text-muted-foreground hover:text-foreground"
				>
					Failed Uploads
				</Link>
				<Link
					to="/users"
					className="text-muted-foreground hover:text-foreground"
				>
					Users
				</Link>
				<Link
					to="/feedback"
					className="text-muted-foreground hover:text-foreground"
				>
					Feedback
				</Link>
				<Link
					to="/banned"
					className="text-muted-foreground hover:text-foreground"
				>
					Banned
				</Link>
				<Link
					to="/heartbeat"
					className="text-muted-foreground hover:text-foreground"
				>
					Heartbeat
				</Link>
				<Link
					to="/settings"
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
				<EnvironmentDropdown />
			</div>
		</div>
	);
}
