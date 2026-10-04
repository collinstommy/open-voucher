import { convexQuery } from "@convex-dev/react-query";
import { api } from "@open-voucher/backend/convex/_generated/api";
import type { Id } from "@open-voucher/backend/convex/_generated/dataModel";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useConvex } from "convex/react";
import { useAdminAuth } from "@/hooks/useAdminAuth";
import { formatDateTime } from "@/lib/utils";

export const Route = createFileRoute("/admin/banned")({
	component: BannedUsers,
});

const UPLOAD_WARNING_MESSAGE =
	"Warning: Vouchers you uploaded have been reported as not working by several other community members. Please only upload unused, valid vouchers. Continued reports may result in a coin deduction or a permanent ban.";

function requireToken(token: string | null): string {
	if (!token) {
		throw new Error("Not signed in");
	}
	return token;
}

function BannedUsers() {
	const { token } = useAdminAuth();
	const convex = useConvex();
	const queryClient = useQueryClient();

	const { data: bannedUsers, isLoading: bannedLoading } = useQuery(
		convexQuery(api.adminUsers.getBannedUsers, token ? { token } : "skip"),
	);

	const { data: flaggedUsers, isLoading: flaggedLoading } = useQuery(
		convexQuery(api.adminUsers.getFlaggedUsers, token ? { token } : "skip"),
	);

	const banMutation = useMutation({
		mutationFn: (userId: Id<"users">) =>
			convex.mutation(api.adminUsers.banUser, {
				token: requireToken(token),
				userId,
			}),
		onSuccess: () => queryClient.invalidateQueries(),
	});

	const dismissMutation = useMutation({
		mutationFn: (userId: Id<"users">) =>
			convex.mutation(api.adminUsers.dismissFlag, {
				token: requireToken(token),
				userId,
			}),
		onSuccess: () => queryClient.invalidateQueries(),
	});

	const unbanMutation = useMutation({
		mutationFn: (userId: Id<"users">) =>
			convex.mutation(api.adminUsers.unbanUser, {
				token: requireToken(token),
				userId,
			}),
		onSuccess: () => queryClient.invalidateQueries(),
	});

	const flagForReviewMutation = useMutation({
		mutationFn: (userId: Id<"users">) =>
			convex.mutation(api.adminUsers.flagForReview, {
				token: requireToken(token),
				userId,
			}),
		onSuccess: () => queryClient.invalidateQueries(),
	});

	const sendWarningMutation = useMutation({
		mutationFn: (userId: Id<"users">) =>
			convex.mutation(api.messages.sendMessageToUser, {
				token: requireToken(token),
				userId,
				messageText: UPLOAD_WARNING_MESSAGE,
			}),
		onSuccess: () => queryClient.invalidateQueries(),
	});

	const handleSendWarning = (user: {
		_id: Id<"users">;
		username?: string;
		firstName?: string;
		telegramChatId: string;
	}) => {
		const name = user.username || user.firstName || user.telegramChatId;
		if (
			window.confirm(
				`Send this warning to ${name}?\n\n${UPLOAD_WARNING_MESSAGE}`,
			)
		) {
			sendWarningMutation.mutate(user._id);
		}
	};

	return (
		<div className="stack">
			<div className="masthead">
				<div>
					<h1 className="display">Banned</h1>
					<p className="lede">
						Accounts flagged for review, and accounts already banned.
					</p>
				</div>
				{!bannedLoading && !flaggedLoading && (
					<div className="stamp">
						<b className="num">{flaggedUsers?.length ?? 0}</b> flagged
						<br />
						<b className="num">{bannedUsers?.length ?? 0}</b> banned
					</div>
				)}
			</div>

			{bannedLoading || flaggedLoading ? (
				<p className="muted">Loading...</p>
			) : (
				<div className="stack">
					<section className="stack">
						<div className="panel-head" style={{ padding: 0, border: 0 }}>
							<h2>Flagged for review</h2>
							<span className="note">
								Review each account, then ban or dismiss.
							</span>
						</div>
						{!flaggedUsers || flaggedUsers.length === 0 ? (
							<div className="empty">No users flagged for review</div>
						) : (
							flaggedUsers.map((user) => (
								<article key={user._id} className="panel">
									<div className="panel-body">
										<div className="msg-head">
											<Link
												className="msg-user"
												to="/admin/users/$userId"
												params={{ userId: user._id }}
											>
												{user.firstName || user.username || "Unknown user"}
												{user.username ? ` @${user.username}` : ""}
											</Link>
											<span className="status s-flagged">
												<i />
												flagged
											</span>
										</div>
										<div className="u-id">{user.telegramChatId}</div>
										<div className="meta-line">
											<span>Uploads {user.uploadCount}</span>
											<span>Claims {user.claimCount}</span>
											<span>Upload reports {user.uploadReportCount}</span>
											<span>Claim reports {user.claimReportCount}</span>
											{user.adminMessageCount > 0 && (
												<span>Admin messages {user.adminMessageCount}</span>
											)}
											<span>
												Flagged{" "}
												{user.flaggedForReviewAt
													? formatDateTime(user.flaggedForReviewAt)
													: ""}
											</span>
										</div>
										<div className="actions">
											<button
												type="button"
												className="btn"
												onClick={() => handleSendWarning(user)}
												disabled={sendWarningMutation.isPending}
											>
												Send warning
											</button>
											<button
												type="button"
												className="btn btn-danger"
												onClick={() => banMutation.mutate(user._id)}
												disabled={banMutation.isPending}
											>
												Ban
											</button>
											<button
												type="button"
												className="btn btn-quiet"
												onClick={() => dismissMutation.mutate(user._id)}
												disabled={dismissMutation.isPending}
											>
												Dismiss
											</button>
										</div>
									</div>
								</article>
							))
						)}
					</section>

					<section className="stack">
						<div className="panel-head" style={{ padding: 0, border: 0 }}>
							<h2>Banned users</h2>
							<span className="note">Accounts blocked from the service.</span>
						</div>
						{!bannedUsers || bannedUsers.length === 0 ? (
							<div className="empty">No banned users</div>
						) : (
							bannedUsers.map((user) => (
								<article key={user._id} className="panel">
									<div className="panel-body">
										<div className="msg-head">
											<Link
												className="msg-user"
												to="/admin/users/$userId"
												params={{ userId: user._id }}
											>
												{user.firstName || user.username || "Unknown user"}
												{user.username ? ` @${user.username}` : ""}
											</Link>
											<span className="status s-reported">
												<i />
												banned
											</span>
										</div>
										<div className="u-id">{user.telegramChatId}</div>
										<div className="meta-line">
											{user.adminMessageCount > 0 && (
												<span>Admin messages {user.adminMessageCount}</span>
											)}
											{user.bannedAt && (
												<span>Banned {formatDateTime(user.bannedAt)}</span>
											)}
										</div>
										<div className="actions">
											{!user.flaggedForReviewAt && (
												<button
													type="button"
													className="btn"
													onClick={() => flagForReviewMutation.mutate(user._id)}
													disabled={flagForReviewMutation.isPending}
												>
													{flagForReviewMutation.isPending
														? "Flagging..."
														: "Flag for review"}
												</button>
											)}
											<button
												type="button"
												className="btn"
												onClick={() => handleSendWarning(user)}
												disabled={sendWarningMutation.isPending}
											>
												Send warning
											</button>
											<button
												type="button"
												className="btn btn-quiet"
												onClick={() => unbanMutation.mutate(user._id)}
												disabled={unbanMutation.isPending}
											>
												Unban
											</button>
										</div>
									</div>
								</article>
							))
						)}
					</section>
				</div>
			)}
		</div>
	);
}
