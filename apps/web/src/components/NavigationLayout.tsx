import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAdminAuth } from "@/hooks/useAdminAuth";
import { Link } from "@tanstack/react-router";
import { ChevronDownIcon, LogOut } from "lucide-react";
import { useState } from "react";

export function NavigationLayout() {
	const { isValid, logout } = useAdminAuth();
	const [deployment, setDeployment] = useState<"dev" | "prod">(() => {
		if (typeof window === "undefined") return "prod";
		return (
			(localStorage.getItem("convex-deployment") as "dev" | "prod") || "prod"
		);
	});

	const handleDeploymentChange = (value: string) => {
		localStorage.setItem("convex-deployment", value);
		window.location.reload();
	};

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
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Button variant="outline" size="sm">
							{deployment === "dev" ? "Development" : "Production"}
							<ChevronDownIcon />
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="end">
						<DropdownMenuRadioGroup
							value={deployment}
							onValueChange={handleDeploymentChange}
						>
							<DropdownMenuRadioItem value="dev">
								Development
							</DropdownMenuRadioItem>
							<DropdownMenuRadioItem value="prod">
								Production
							</DropdownMenuRadioItem>
						</DropdownMenuRadioGroup>
					</DropdownMenuContent>
				</DropdownMenu>
			</div>
		</div>
	);
}
