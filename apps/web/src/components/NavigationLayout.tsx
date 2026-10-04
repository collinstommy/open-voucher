import { Link, useRouterState } from "@tanstack/react-router";
import { Menu } from "lucide-react";
import { useEffect, useState } from "react";
import {
	type Deployment,
	getDeployment,
	isDeploymentLocked,
} from "@/components/EnvironmentDropdown";
import { useAdminAuth } from "@/hooks/useAdminAuth";
import { cn } from "@/lib/utils";

const NAV_SECTIONS = [
	{
		section: "Overview",
		items: [
			{ to: "/admin", label: "Home", exact: true },
			{ to: "/admin/analytics", label: "Analytics" },
		],
	},
	{
		section: "Operations",
		items: [
			{ to: "/admin/vouchers", label: "Vouchers" },
			{ to: "/admin/failed-uploads", label: "Failed Uploads" },
		],
	},
	{
		section: "Users & Safety",
		items: [
			{ to: "/admin/users", label: "Users" },
			{ to: "/admin/banned", label: "Banned" },
			{ to: "/admin/feedback", label: "Feedback" },
		],
	},
	{
		section: "System",
		items: [
			{ to: "/admin/health-check", label: "Health Check" },
			{ to: "/admin/evals", label: "Evals" },
			{ to: "/admin/checks", label: "Checks" },
			{ to: "/admin/settings", label: "Settings" },
		],
	},
] as const;

type NavItem = (typeof NAV_SECTIONS)[number]["items"][number];

function isItemActive(pathname: string, item: NavItem) {
	if ("exact" in item && item.exact) {
		return pathname === item.to;
	}
	return pathname === item.to || pathname.startsWith(`${item.to}/`);
}

function crumbFor(pathname: string) {
	if (pathname.startsWith("/admin/users/") && pathname !== "/admin/users") {
		return { section: "Users & Safety", page: "User detail" };
	}
	for (const group of NAV_SECTIONS) {
		const item = group.items.find((entry) => isItemActive(pathname, entry));
		if (item) {
			return { section: group.section, page: item.label };
		}
	}
	return { section: "Overview", page: "Home" };
}

function deploymentLabel(deployment: Deployment) {
	return deployment === "dev" ? "Development" : "Production";
}

function SidebarEnvSelect() {
	const deployment = getDeployment();
	const locked = isDeploymentLocked();

	return (
		<select
			aria-label="Environment"
			className="select"
			value={deployment}
			disabled={locked}
			onChange={(event) => {
				localStorage.setItem("convex-deployment", event.target.value);
				window.location.reload();
			}}
		>
			<option value="dev">Development</option>
			<option value="prod">Production</option>
		</select>
	);
}

export function NavigationLayout({ children }: { children: React.ReactNode }) {
	const { isValid, logout } = useAdminAuth();
	const [mobileOpen, setMobileOpen] = useState(false);
	const [isDesktop, setIsDesktop] = useState(true);
	const pathname = useRouterState({ select: (s) => s.location.pathname });
	const crumb = crumbFor(pathname);
	const deployment = getDeployment();

	const handleLogout = async () => {
		await logout();
		window.location.reload();
	};

	useEffect(() => {
		if (pathname) setMobileOpen(false);
	}, [pathname]);

	useEffect(() => {
		const media = window.matchMedia("(min-width: 981px)");
		const update = () => setIsDesktop(media.matches);
		update();
		media.addEventListener("change", update);
		return () => media.removeEventListener("change", update);
	}, []);

	useEffect(() => {
		document.body.style.overflow = mobileOpen && !isDesktop ? "hidden" : "";
		return () => {
			document.body.style.overflow = "";
		};
	}, [mobileOpen, isDesktop]);

	if (!isValid) {
		return null;
	}

	const closeMobile = () => setMobileOpen(false);
	const sidebarHidden = !isDesktop && !mobileOpen;

	return (
		<div className="admin-shell">
			<div className="shell">
				{mobileOpen && !isDesktop && (
					<button
						type="button"
						className="scrim"
						onClick={closeMobile}
						aria-label="Close navigation"
					/>
				)}

				<aside
					aria-label="Admin navigation"
					aria-hidden={sidebarHidden}
					inert={sidebarHidden}
					className={cn("rail", mobileOpen && "open")}
				>
					<div className="brand">
						<div className="brand-mark" aria-hidden="true">
							V
						</div>
						<div>
							<div className="brand-name">Voucher Admin</div>
							<div className="brand-env">{deploymentLabel(deployment)}</div>
						</div>
					</div>

					<nav aria-label="Primary" className="rail-nav">
						{NAV_SECTIONS.map((group) => (
							<div key={group.section} className="nav-group">
								<div className="nav-label">{group.section}</div>
								{group.items.map((item) => {
									const active = isItemActive(pathname, item);
									return (
										<Link
											key={item.to}
											to={item.to}
											onClick={closeMobile}
											activeOptions={
												"exact" in item && item.exact
													? { exact: true }
													: undefined
											}
											aria-current={active ? "page" : undefined}
											className="nav-item"
										>
											{item.label}
										</Link>
									);
								})}
							</div>
						))}
					</nav>

					<div className="rail-foot">
						<SidebarEnvSelect />
						<button
							type="button"
							className="btn btn-quiet"
							onClick={handleLogout}
						>
							Log out
						</button>
					</div>
				</aside>

				<div className="main">
					<header className="topbar">
						<button
							type="button"
							className="btn menu-btn"
							onClick={() => setMobileOpen(true)}
							aria-label="Open navigation"
						>
							<Menu className="size-4" />
							Menu
						</button>
						<div className="crumb">
							<span className="crumb-section">{crumb.section}</span>
							<span className="crumb-page">{crumb.page}</span>
						</div>
						<div className="topbar-right">
							<span className="pill">
								<span
									className={cn("dot", deployment === "dev" && "dot-dev")}
								/>
								{deploymentLabel(deployment)}
							</span>
							<button type="button" className="link-btn" onClick={handleLogout}>
								Log out
							</button>
						</div>
					</header>
					<div className="page">{children}</div>
				</div>
			</div>
		</div>
	);
}
