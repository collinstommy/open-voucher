import { useUserAuth } from "@/hooks/useUserAuth";
import { Outlet, createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/app")({
	component: AppLayout,
});

function AppLayout() {
	const { user, isLoading, error, logout } = useUserAuth();

	return (
		<div className="min-h-screen bg-background text-foreground">
			{/* Loading */}
			{isLoading && (
				<div className="flex min-h-[60vh] items-center justify-center">
					<div className="text-muted-foreground">Loading...</div>
				</div>
			)}

			{/* Error */}
			{!isLoading && error && (
				<div className="flex min-h-[60vh] items-center justify-center px-4">
					<div className="max-w-sm text-center space-y-4">
						<div className="text-3xl">⚠️</div>
						<p className="text-muted-foreground">{error}</p>
					</div>
				</div>
			)}

			{/* Not authenticated */}
			{!isLoading && !error && !user && (
				<div className="flex min-h-[60vh] items-center justify-center px-4">
					<div className="max-w-sm text-center space-y-4">
						<div className="text-5xl">📱</div>
						<h2 className="text-xl font-semibold">
							Open this page in Telegram
						</h2>
						<p className="text-muted-foreground text-sm">
							This page is a Telegram Mini App. Open the bot and tap
							the button to access your vouchers.
						</p>
						<a
							href="https://t.me/DunnesVoucherBot"
							target="_blank"
							rel="noopener noreferrer"
							className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-full font-medium hover:bg-blue-700 transition-colors"
						>
							<svg
								className="w-5 h-5"
								fill="currentColor"
								viewBox="0 0 24 24"
							>
								<path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.562 8.161c-.18 1.897-.962 6.502-1.361 8.627-.168.9-.5 1.201-.82 1.23-.697.064-1.226-.461-1.901-.903-1.056-.692-1.653-1.123-2.678-1.799-1.185-.781-.417-1.21.258-1.911.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.139-5.062 3.345-.479.329-.913.489-1.302.481-.428-.008-1.252-.241-1.865-.44-.751-.244-1.349-.374-1.297-.789.027-.216.324-.437.893-.663 3.498-1.524 5.831-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.477-1.635.099-.002.321.023.465.141.119.098.152.228.166.33.016.116.021.312.016.353z" />
							</svg>
							Open Bot in Telegram
						</a>
					</div>
				</div>
			)}

			{/* Authenticated */}
			{!isLoading && !error && user && (
				<>
					{/* Header */}
					<div className="border-b">
						<div className="px-4 py-3 flex items-center justify-between">
							<div>
								<h1 className="text-lg font-semibold">
									My Vouchers
								</h1>
								<p className="text-sm text-muted-foreground">
									Hi, {user.firstName ?? user.username ?? "User"} · 🪙{" "}
									{user.coins} coins
								</p>
							</div>
							<button
								type="button"
								onClick={logout}
								className="text-sm text-muted-foreground hover:text-foreground"
							>
								Logout
							</button>
						</div>
					</div>

					{/* User info display */}
					<div className="px-4 py-4">
						<div className="rounded-lg border bg-card p-4 space-y-3">
							<h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">
								Account Info
							</h2>
							<div className="grid gap-2 text-sm">
								<div className="flex justify-between">
									<span className="text-muted-foreground">User ID</span>
									<span className="font-mono">{user._id}</span>
								</div>
								<div className="flex justify-between">
									<span className="text-muted-foreground">
										Telegram ID
									</span>
									<span className="font-mono">{user.telegramChatId}</span>
								</div>
								<div className="flex justify-between">
									<span className="text-muted-foreground">Username</span>
									<span>{user.username ?? "—"}</span>
								</div>
							</div>
						</div>
					</div>

					<Outlet />
				</>
			)}
		</div>
	);
}
