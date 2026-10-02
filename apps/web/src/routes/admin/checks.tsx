import { Button } from "@/components/ui/button";
import { useAdminAuth } from "@/hooks/useAdminAuth";
import { formatDateTime } from "@/lib/utils";

import { api } from "@open-voucher/backend/convex/_generated/api";
import { createFileRoute, Link } from "@tanstack/react-router";
import { usePaginatedQuery } from "convex/react";

export const Route = createFileRoute("/admin/checks")({
	component: ChecksPage,
});

function prettyJson(raw: string): string {
	try {
		return JSON.stringify(JSON.parse(raw), null, 2);
	} catch {
		return raw;
	}
}

function ChecksPage() {
	const { token } = useAdminAuth();
	const { results, status, loadMore } = usePaginatedQuery(
		api.dunnesVoucherDetails.listVoucherChecks,
		token ? { token } : "skip",
		{ initialNumItems: 20 },
	);

	if (status === "LoadingFirstPage") {
		return <div className="text-muted-foreground">Loading checks...</div>;
	}

	if (results.length === 0) {
		return (
			<div className="text-muted-foreground py-12 text-center">
				No checks yet
			</div>
		);
	}

	return (
		<div>
			<h1 className="mb-6 text-xl font-semibold">
				Checks
				<span className="text-muted-foreground ml-2 text-base font-normal">
					(Showing {results.length})
				</span>
			</h1>
			<div className="grid gap-4">
				{results.map((check) => (
					<article key={check._id} className="rounded-lg border p-4">
						<div className="grid gap-4 sm:grid-cols-[8rem_1fr]">
							{check.imageUrl ? (
								<img
									src={check.imageUrl}
									alt="Voucher"
									className="bg-muted h-32 w-full rounded border object-contain"
								/>
							) : (
								<div className="bg-muted flex h-32 items-center justify-center rounded">
									<span className="text-muted-foreground text-xs">
										No voucher image
									</span>
								</div>
							)}
							<div className="grid gap-1 text-sm">
								<div className="font-medium">
									{check.voucherType === null
										? "Voucher missing"
										: `€${check.voucherType} voucher`}
								</div>
								<div className="text-muted-foreground font-mono text-xs">
									{check.voucherId}
								</div>
								{check.barcodeNumber && (
									<div className="text-muted-foreground font-mono text-xs">
										{check.barcodeNumber}
									</div>
								)}
								{check.voucherStatus && (
									<div className="text-muted-foreground">
										Voucher status: {check.voucherStatus}
									</div>
								)}
								<div>
									<Link
										to="/admin/users/$userId"
										params={{ userId: check.userId }}
										className="text-primary hover:underline"
									>
										{check.userFirstName || check.userId}
									</Link>
								</div>
								<div className="font-medium">{check.result}</div>
								<div className="text-muted-foreground">
									{formatDateTime(check.createdAt)}
								</div>
							</div>
						</div>
						<pre className="bg-muted mt-4 max-h-64 overflow-auto rounded p-3 text-xs">
							{prettyJson(check.rawJson)}
						</pre>
					</article>
				))}
			</div>
			{status === "CanLoadMore" && (
				<div className="mt-6 flex justify-center">
					<Button
						type="button"
						variant="outline"
						size="lg"
						onClick={() => loadMore(20)}
					>
						Load More
					</Button>
				</div>
			)}
			{status === "LoadingMore" && (
				<div className="text-muted-foreground mt-6 text-center text-sm">
					Loading...
				</div>
			)}
		</div>
	);
}
