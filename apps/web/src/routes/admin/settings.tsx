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
		convexQuery(api.admin.feedback.getSampleVoucherImageUrl, token ? { token } : "skip"),
	);

	return (
		<div className="grid gap-6">
			<section className="rounded-lg border p-4">
				<h2 className="mb-4 font-medium">Sample Voucher Image</h2>
				{imageUrl === undefined ? (
					<div className="text-muted-foreground text-sm">Loading...</div>
				) : imageUrl ? (
					<img
						src={imageUrl}
						alt="Sample Voucher"
						className="h-96 w-full rounded border object-contain bg-muted"
					/>
				) : (
					<div className="bg-muted flex h-96 w-full items-center justify-center rounded">
						<span className="text-muted-foreground text-sm">
							No sample voucher image set
						</span>
					</div>
				)}
			</section>
		</div>
	);
}
