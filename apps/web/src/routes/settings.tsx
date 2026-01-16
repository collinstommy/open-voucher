import { api } from "@open-router/backend/convex/_generated/api";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "convex/react";

export const Route = createFileRoute("/settings")({
	component: SettingsComponent,
});

function SettingsComponent() {
	const imageUrl = useQuery(api.settings.getSampleVoucherImageUrl);

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
						<span className="text-muted-foreground text-sm">No sample voucher image set</span>
					</div>
				)}
			</section>
		</div>
	);
}
