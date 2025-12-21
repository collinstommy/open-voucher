import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/admin/")({
	component: AdminIndex,
});

function AdminIndex() {
	return (
		<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
			<Link
				to="/admin/vouchers"
				className="rounded-lg border p-6 transition-colors hover:bg-muted"
			>
				<h2 className="mb-2 text-lg font-medium">Vouchers</h2>
				<p className="text-muted-foreground text-sm">
					View today's uploaded vouchers
				</p>
			</Link>
			<Link
				to="/admin/users"
				className="rounded-lg border p-6 transition-colors hover:bg-muted"
			>
				<h2 className="mb-2 text-lg font-medium">Users</h2>
				<p className="text-muted-foreground text-sm">
					Manage users and view statistics
				</p>
			</Link>
			<Link
				to="/admin/feedback"
				className="rounded-lg border p-6 transition-colors hover:bg-muted"
			>
				<h2 className="mb-2 text-lg font-medium">Feedback</h2>
				<p className="text-muted-foreground text-sm">
					View user feedback submissions
				</p>
			</Link>
			<Link
				to="/admin/banned"
				className="rounded-lg border p-6 transition-colors hover:bg-muted"
			>
				<h2 className="mb-2 text-lg font-medium">Banned Users</h2>
				<p className="text-muted-foreground text-sm">
					View recently banned users and ban reasons
				</p>
			</Link>
		</div>
	);
}
