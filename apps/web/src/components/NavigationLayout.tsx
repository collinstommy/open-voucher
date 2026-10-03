import { Link, useRouterState } from "@tanstack/react-router";
import { ChevronDown, LogOut, Menu } from "lucide-react";
import { useEffect, useState } from "react";
import {
	getDeployment,
	isDeploymentLocked,
	type Deployment,
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
			className="min-h-11 flex-1 rounded-[9px] border border-[#263042] bg-[#111826] px-2.5 py-2 text-[13.5px] text-[#e6edf3] disabled:opacity-80"
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
	const [closedSections, setClosedSections] = useState<Set<string>>(new Set());
	const [isDesktop, setIsDesktop] = useState(true);
	const pathname = useRouterState({ select: (s) => s.location.pathname });
	const crumb = crumbFor(pathname);
	const deployment = getDeployment();

	const handleLogout = async () => {
		await logout();
		window.location.reload();
	};

	useEffect(() => {
		setMobileOpen(false);
	}, [pathname]);

	useEffect(() => {
		const media = window.matchMedia("(min-width: 860px)");
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

	const toggleSection = (section: string) => {
		setClosedSections((current) => {
			const next = new Set(current);
			if (next.has(section)) {
				next.delete(section);
			} else {
				next.add(section);
			}
			return next;
		});
	};

	return (
		<div className="min-h-screen bg-[#0d1117] text-[#e6edf3] min-[860px]:grid min-[860px]:grid-cols-[272px_minmax(0,1fr)]">
			{mobileOpen && !isDesktop && (
				<button
					type="button"
					className="fixed inset-0 z-20 bg-black/55"
					onClick={closeMobile}
					aria-label="Close navigation"
				/>
			)}

			<aside
				aria-label="Admin navigation"
				aria-hidden={sidebarHidden}
				inert={sidebarHidden}
				className={cn(
					"fixed inset-y-0 left-0 z-30 flex w-[min(320px,88vw)] flex-col border-r border-[#1e2736] bg-[#0b0f16] transition-transform duration-[250ms] ease-out motion-reduce:transition-none min-[860px]:sticky min-[860px]:top-0 min-[860px]:h-screen min-[860px]:w-[272px] min-[860px]:translate-x-0",
					mobileOpen ? "translate-x-0" : "-translate-x-[102%]",
				)}
			>
				<div className="flex items-center gap-3 px-[18px] pt-5 pb-3.5">
					<div
						aria-hidden="true"
						className="grid size-9 shrink-0 place-items-center rounded-[10px] bg-gradient-to-br from-[#2f6feb] to-[#6e3ffb] text-lg font-extrabold"
					>
						V
					</div>
					<div>
						<span className="block text-[15px] leading-tight font-bold">
							Voucher Admin
						</span>
						<span className="block text-xs text-[#9aa7b4]">
							{deploymentLabel(deployment)}
						</span>
					</div>
				</div>

				<nav
					aria-label="Primary"
					className="flex-1 overflow-y-auto px-2.5 pt-1 pb-3 [scrollbar-width:thin]"
				>
					{NAV_SECTIONS.map((group) => {
						const closed = closedSections.has(group.section);
						return (
							<div key={group.section} className="mt-3.5">
								<button
									type="button"
									className="flex min-h-8 w-full items-center gap-2 px-2 py-2 text-[11.5px] font-bold tracking-[0.09em] text-[#6b7885] uppercase"
									aria-expanded={!closed}
									onClick={() => toggleSection(group.section)}
								>
									<span>{group.section}</span>
									<ChevronDown
										className={cn(
											"ml-auto size-3 transition-transform duration-150 ease-out motion-reduce:transition-none",
											closed && "-rotate-90",
										)}
									/>
								</button>
								{!closed && (
									<div className="flex flex-col gap-0.5">
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
													className={cn(
														"flex min-h-11 items-center rounded-[9px] border border-transparent px-3 text-[14.5px] text-[#c3cdd8] hover:bg-[#141b28] hover:text-white",
														active &&
															"border-[rgba(47,111,235,0.35)] bg-[rgba(47,111,235,0.14)] text-white",
													)}
												>
													<span className="min-w-0 flex-1 truncate">
														{item.label}
													</span>
												</Link>
											);
										})}
									</div>
								)}
							</div>
						);
					})}
				</nav>

				<div className="flex flex-col gap-2.5 border-t border-[#1e2736] px-3.5 py-3">
					<div className="flex gap-2">
						<SidebarEnvSelect />
						<button
							type="button"
							onClick={handleLogout}
							className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-[9px] border border-[#263042] px-2.5 py-2 text-[#c3cdd8] hover:text-white"
						>
							<LogOut className="size-4" />
							Logout
						</button>
					</div>
				</div>
			</aside>

			<div className="flex min-w-0 flex-col">
				<header className="sticky top-0 z-20 flex items-center gap-3.5 border-b border-[#1e2736] bg-[rgba(13,17,23,0.92)] px-4 py-3.5 backdrop-blur-[10px] min-[860px]:px-7">
					<button
						type="button"
						className="inline-flex size-11 items-center justify-center rounded-[9px] border border-[#263042] bg-[#141b28] text-lg min-[860px]:hidden"
						onClick={() => setMobileOpen(true)}
						aria-label="Open navigation"
					>
						<Menu className="size-5" />
					</button>
					<div className="text-[13px] text-[#9aa7b4]">
						{crumb.section}
						<strong className="block text-[15px] leading-snug font-semibold text-[#e6edf3]">
							{crumb.page}
						</strong>
					</div>
					<div className="ml-auto flex items-center gap-2.5">
						<span className="rounded-full border border-[#263042] bg-[#121826] px-3 py-1.5 text-[12.5px] text-[#9aa7b4]">
							{deploymentLabel(deployment)}
						</span>
					</div>
				</header>
				<div className="mx-auto w-full max-w-[1440px] px-4 py-7 pb-16 min-[860px]:px-9 min-[860px]:py-8">
					{children}
				</div>
			</div>
		</div>
	);
}
