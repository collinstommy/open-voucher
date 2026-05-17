import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
	component: LandingPage,
});

function LandingPage() {
	return (
		<div className="flex min-h-screen items-center justify-center">
			<div className="text-center">
				<h1 className="text-4xl font-bold">Open Vouchers</h1>
				<p className="mt-4 text-muted-foreground">Landing page coming soon.</p>
			</div>
		</div>
	);
}
