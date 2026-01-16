import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ChevronDownIcon } from "lucide-react";

export type Deployment = "dev" | "prod";

export function getDeployment(): Deployment {
	if (typeof window === "undefined") return "prod";
	return (localStorage.getItem("convex-deployment") as Deployment) || "prod";
}

export function EnvironmentDropdown() {
	const deployment = getDeployment();

	const handleDeploymentChange = (value: string) => {
		localStorage.setItem("convex-deployment", value);
		window.location.reload();
	};

	return (
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
					<DropdownMenuRadioItem value="dev">Development</DropdownMenuRadioItem>
					<DropdownMenuRadioItem value="prod">Production</DropdownMenuRadioItem>
				</DropdownMenuRadioGroup>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
