import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/app/")({
	component: AppIndex,
});

function AppIndex() {
	return (
		<div className="px-4 py-8 text-center text-muted-foreground">
			<p>You haven't claimed any vouchers yet.</p>
			<p className="mt-2 text-sm">
				Open the Telegram bot to upload and claim vouchers.
			</p>
		</div>
	);
}
