import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/app/")({
	component: AppIndex,
});

function AppIndex() {
	return (
		<div className="px-4 py-8 text-center text-muted-foreground" />
	);
}
