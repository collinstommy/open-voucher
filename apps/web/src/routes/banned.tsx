import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { convexQuery } from "@convex-dev/react-query";
import { api } from "@open-router/backend/convex/_generated/api";
import { useAdminAuth } from "@/hooks/useAdminAuth";
import { ChevronDownIcon } from "lucide-react";
import { useState } from "react";

export const Route = createFileRoute("/banned")({
	component: BannedUsers,
});

function BannedUsers() {
	const { token } = useAdminAuth();
	const [deployment, setDeployment] = useState<"dev" | "prod">(() => {
		if (typeof window === "undefined") return "prod";
		return (
			(localStorage.getItem("convex-deployment") as "dev" | "prod") || "prod"
		)
	})

	const handleDeploymentChange = (value: string) => {
		localStorage.setItem("convex-deployment", value);
		window.location.reload();
	}

	const { data: bannedUsers, isLoading } = useQuery(
		convexQuery(api.admin.getBannedUsers, token ? { token } : "skip"),
	)

	if (isLoading) {
		return <div>Loading...</div>;
	}

	if (!bannedUsers) {
		return <div>No data available</div>;
	}

	return (
		<div className="space-y-6">
			<div className="flex items-center justify-between">
				<div>
					<h1 className="text-2xl font-bold">Banned Users</h1>
					<p className="text-muted-foreground">
						Recently banned users and ban reasons
					</p>
				</div>
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

			<div className="space-y-4">
				{bannedUsers.length === 0 ? (
					<div className="rounded-lg border p-8 text-center text-muted-foreground">
						No banned users
					</div>
				) : (
					bannedUsers.map((user) => (
						<div key={user._id} className="rounded-lg border p-6 space-y-3">
							<div className="flex items-start justify-between">
								<div>
									<h3 className="font-medium">
										{user.firstName || user.username || "Unknown User"}
										{user.username && (
											<span className="text-muted-foreground ml-2">
												@{user.username}
											</span>
										)}
									</h3>
									<p className="text-sm text-muted-foreground">
										Chat ID: {user.telegramChatId}
									</p>
								</div>
								{user.bannedAt && (
									<div className="text-sm text-muted-foreground">
										Banned: {new Date(user.bannedAt).toLocaleString()}
									</div>
								)}
							</div>
						</div>
					))
				)}
			</div>
		</div>
	)
}
