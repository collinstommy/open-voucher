import { convexQuery } from "@convex-dev/react-query";
import { api } from "@open-voucher/backend/convex/_generated/api";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useAdminAuth } from "@/hooks/useAdminAuth";

export const Route = createFileRoute("/admin/settings")({
	component: SettingsComponent,
});

function SettingsComponent() {
	const { token } = useAdminAuth();
	const { data: imageUrl } = useQuery(
		convexQuery(
			api.adminFeedback.getSampleVoucherImageUrl,
			token ? { token } : "skip",
		),
	);

	return (
		<div className="stack">
			<div className="masthead">
				<div>
					<h1 className="display">Settings</h1>
					<p className="lede">The sample voucher image used by the bot.</p>
				</div>
			</div>
			<section className="panel">
				<div className="panel-head">
					<h2>Sample voucher image</h2>
				</div>
				<div className="panel-body">
					{imageUrl === undefined ? (
						<p className="muted">Loading...</p>
					) : imageUrl ? (
						<div className="sample">
							<img src={imageUrl} alt="Sample voucher" />
						</div>
					) : (
						<div className="empty">No sample voucher image set</div>
					)}
				</div>
			</section>
		</div>
	);
}
