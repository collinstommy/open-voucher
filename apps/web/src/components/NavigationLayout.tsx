import { Link, useRouterState } from "@tanstack/react-router";
import { LogOut, Menu, X } from "lucide-react";
import { useEffect, useState } from "react";
import {
	EnvironmentDropdown,
	isDeploymentLocked,
} from "@/components/EnvironmentDropdown";
import { Button } from "@/components/ui/button";
import { useAdminAuth } from "@/hooks/useAdminAuth";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
	{ to: "/admin", label: "Home", exact: true },
	{ to: "/admin/health-check", label: "Health Check" },
	{ to: "/admin/evals", label: "Evals" },
	{ to: "/admin/vouchers", label: "Vouchers" },
	{ to: "/admin/failed-uploads", label: "Failed Uploads" },
	{ to: "/admin/users", label: "Users" },
	{ to: "/admin/feedback", label: "Feedback" },
	{ to: "/admin/broadcast", label: "Broadcast" },
	{ to: "/admin/analytics", label: "Analytics" },
	{ to: "/admin/banned", label: "Banned" },
	{ to: "/admin/settings", label: "Settings" },
] as const;

function NavLink({
	to,
	label,
	exact,
	onClick,
	className,
}: {
	to: string;
	label: string;
	exact?: boolean;
	onClick?: () => void;
	className?: string;
}) {
	return (
		<Link
			to={to}
			onClick={onClick}
			activeOptions={exact ? { exact: true } : undefined}
			activeProps={{
				className: cn("font-semibold text-foreground", className),
			}}
			inactiveProps={{
				className: cn(
					"text-muted-foreground hover:text-foreground",
					className,
				),
			}}
		>
			{label}
		</Link>
	);
}

export function NavigationLayout() {
	const { isValid, logout } = useAdminAuth();
	const [mobileOpen, setMobileOpen] = useState(false);
	const pathname = useRouterState({ select: (s) => s.location.pathname });

	const handleLogout = async () => {
		await logout();
		window.location.reload();
	};

	useEffect(() => {
		setMobileOpen(false);
	}, [pathname]);

	useEffect(() => {
		document.body.style.overflow = mobileOpen ? "hidden" : "";
		return () => {
			document.body.style.overflow = "";
		};
	}, [mobileOpen]);

	if (!isValid) {
		return null;
	}

	const closeMobile = () => setMobileOpen(false);

	return (
		<header className="mb-6">
			{/* Mobile header */}
			<div className="flex items-center justify-between md:hidden">
				<Link to="/admin" className="text-lg font-semibold">
					Admin
				</Link>
				<div className="flex items-center gap-1">
					{!isDeploymentLocked() && <EnvironmentDropdown />}
					<Button
						variant="ghost"
						size="icon"
						onClick={() => setMobileOpen((open) => !open)}
						aria-expanded={mobileOpen}
						aria-label={mobileOpen ? "Close menu" : "Open menu"}
					>
						{mobileOpen ? (
							<X className="h-5 w-5" />
						) : (
							<Menu className="h-5 w-5" />
						)}
					</Button>
				</div>
			</div>

			{/* Mobile drawer */}
			{mobileOpen && (
				<div className="fixed inset-0 z-50 md:hidden">
					<button
						type="button"
						className="absolute inset-0 bg-black/50"
						onClick={closeMobile}
						aria-label="Close menu"
					/>
					<nav className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col border-r bg-background shadow-lg">
						<div className="flex items-center justify-between border-b px-4 py-3">
							<span className="text-lg font-semibold">Admin</span>
							<Button
								variant="ghost"
								size="icon"
								onClick={closeMobile}
								aria-label="Close menu"
							>
								<X className="h-5 w-5" />
							</Button>
						</div>
						<div className="flex-1 overflow-y-auto px-4 py-3">
							<ul className="space-y-1">
								{NAV_ITEMS.map((item) => (
									<li key={item.to}>
										<NavLink
											to={item.to}
											label={item.label}
											exact={"exact" in item ? item.exact : undefined}
											onClick={closeMobile}
											className="block rounded-md px-3 py-2.5 text-base"
										/>
									</li>
								))}
							</ul>
						</div>
						<div className="border-t p-4">
							<Button
								variant="outline"
								className="w-full"
								onClick={handleLogout}
							>
								<LogOut className="mr-2 h-4 w-4" />
								Logout
							</Button>
						</div>
					</nav>
				</div>
			)}

			{/* Desktop header */}
			<div className="hidden items-center justify-between md:flex">
				<nav className="flex flex-wrap gap-x-6 gap-y-2 text-lg">
					{NAV_ITEMS.map((item) => (
						<NavLink
							key={item.to}
							to={item.to}
							label={item.label}
							exact={"exact" in item ? item.exact : undefined}
						/>
					))}
				</nav>
				<div className="flex shrink-0 gap-2">
					<Button variant="ghost" size="sm" onClick={handleLogout}>
						<LogOut className="mr-2 h-4 w-4" />
						Logout
					</Button>
					{!isDeploymentLocked() && <EnvironmentDropdown />}
				</div>
			</div>
		</header>
	);
}
