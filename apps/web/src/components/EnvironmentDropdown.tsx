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

const DEV_HOSTNAME = "dev.openvouchers.org";

/** Dev Cloudflare Worker build — always uses dev Convex; no env switcher. */
export function isDeploymentLocked(): boolean {
	if (import.meta.env.VITE_DEPLOYMENT === "dev") {
		return true;
	}
	if (
		typeof window !== "undefined" &&
		window.location.hostname === DEV_HOSTNAME
	) {
		return true;
	}
	return false;
}

export function getDeployment(): Deployment {
	if (import.meta.env.VITE_DEPLOYMENT === "dev") {
		return "dev";
	}
	if (typeof window === "undefined") {
		return "prod";
	}
	if (window.location.hostname === DEV_HOSTNAME) {
		return "dev";
	}
	return (
		(localStorage.getItem("convex-deployment") as Deployment) ||
		(window.location.hostname === "localhost" ? "dev" : "prod")
	);
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
