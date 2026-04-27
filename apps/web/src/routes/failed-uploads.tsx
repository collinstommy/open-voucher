import { useAdminAuth } from "@/hooks/useAdminAuth";

import { convexQuery } from "@convex-dev/react-query";
import { api } from "@open-voucher/backend/convex/_generated/api";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { CheckIcon, ChevronDownIcon, ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { useCallback, useState } from "react";
import { Button } from "@/components/ui/button";
import { formatDateTime } from "@/lib/utils";
import {
	DropdownMenu,
	DropdownMenuCheckboxItem,
	DropdownMenuContent,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export const Route = createFileRoute("/failed-uploads")({
	component: FailedUploadsPage,
});

const DEFAULT_EXCLUDED = new Set(["TOO_LATE_TODAY", "DUPLICATE_BARCODE"]);

function FailedUploadsPage() {
	const { token } = useAdminAuth();

	const [excludedReasons, setExcludedReasons] = useState<Set<string>>(
		new Set(DEFAULT_EXCLUDED),
	);
	const [page, setPage] = useState(1);

	const { data, isLoading, error } = useQuery(
		convexQuery(
			api.admin.getFailedUploads,
			token
				? { token, excludeReasons: [...excludedReasons], page }
				: "skip",
		),
	);

	const failedUploads = data?.failedUploads ?? [];
	const allReasons = data?.allReasons ?? [];
	const total = data?.total ?? 0;
	const hasMore = data?.hasMore ?? false;

	const toggleReason = useCallback(
		(reason: string) => {
			setExcludedReasons((prev) => {
				const next = new Set(prev);
				if (next.has(reason)) {
					next.delete(reason);
				} else {
					next.add(reason);
				}
				return next;
			});
			setPage(1);
		},
		[],
	);

	const selectAll = () => {
		setExcludedReasons(new Set());
		setPage(1);
	};
	const deselectAll = () => {
		setExcludedReasons(new Set(allReasons));
		setPage(1);
	};

	if (isLoading) {
		return (
			<div className="text-muted-foreground">Loading failed uploads...</div>
		);
	}

	if (error) {
		return <div className="text-red-500">Error loading failed uploads</div>;
	}

	if (failedUploads.length === 0) {
		return (
			<div>
				<div className="mb-6 flex items-center justify-between">
					<h1 className="text-xl font-semibold">Failed Uploads (0)</h1>
				</div>
				<div className="text-muted-foreground py-12 text-center">
					No failed uploads
				</div>
			</div>
		);
	}

	const totalPages = Math.ceil(total / (data?.pageSize ?? 12));

	return (
		<div>
			<div className="mb-6 flex items-center justify-between">
				<h1 className="text-xl font-semibold">
					Failed Uploads ({total > failedUploads.length ? `${failedUploads.length} of ${total}` : total})
				</h1>
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Button variant="outline" size="sm">
							Filter
							{excludedReasons.size > 0 ? (
								<span className="bg-primary text-primary-foreground ml-1 rounded-full px-1.5 text-xs">
									{allReasons.length - excludedReasons.size}
								</span>
							) : null}
							<ChevronDownIcon className="size-4" />
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="end" className="w-64">
						{allReasons.map((reason) => (
							<DropdownMenuCheckboxItem
								key={reason}
								checked={!excludedReasons.has(reason)}
								onCheckedChange={() => toggleReason(reason)}
							>
								{reason}
							</DropdownMenuCheckboxItem>
						))}
						<DropdownMenuSeparator />
						<button
							className="focus:bg-accent focus:text-accent-foreground relative flex w-full cursor-default items-center gap-2 rounded-sm px-2 py-1.5 pl-8 text-sm outline-hidden select-none"
							onClick={selectAll}
						>
							<CheckIcon className="pointer-events-none absolute left-2 size-4 text-transparent" />
							Select All
						</button>
						<button
							className="focus:bg-accent focus:text-accent-foreground relative flex w-full cursor-default items-center gap-2 rounded-sm px-2 py-1.5 pl-8 text-sm outline-hidden select-none"
							onClick={deselectAll}
						>
							Deselect All
						</button>
					</DropdownMenuContent>
				</DropdownMenu>
			</div>
			<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
				{failedUploads.map((failedUpload) => (
					<div
						key={failedUpload._id}
						className="rounded-lg border border-red-200 p-4"
					>
						{failedUpload.imageUrl ? (
							<img
								src={failedUpload.imageUrl}
								alt="Failed voucher"
								className="mb-3 h-96 w-full rounded border object-contain bg-muted"
							/>
						) : (
							<div className="bg-muted mb-3 flex h-96 w-full items-center justify-center rounded">
								<span className="text-muted-foreground text-xs">No image</span>
							</div>
						)}
						<div className="mb-3">
							<div className="mb-2 font-medium text-white">
								{failedUpload.extractedType
									? `€${failedUpload.extractedType} Voucher (Failed)`
									: "Failed Upload"}
							</div>
							<div className="text-muted-foreground mb-1 text-xs font-mono">
								User ID: {failedUpload.userId}
							</div>
							<div className="mb-1 text-xs">
								Username:{" "}
								<Link
									to="/users/$userId"
									params={{ userId: failedUpload.userId }}
									className="text-blue-600 hover:text-blue-800 hover:underline"
								>
									{failedUpload.username || failedUpload.firstName || "Unknown"}
								</Link>
							</div>
							<div className="mb-2 rounded bg-orange-100 p-2">
								<div className="text-xs font-semibold text-orange-900 mb-1">
									Failure Reason:
								</div>
								<div className="text-sm text-orange-800">
									{failedUpload.failureReason}
								</div>
							</div>
							{failedUpload.errorMessage && (
								<div className="mb-2 rounded bg-red-100 p-2">
									<div className="text-xs font-semibold text-red-900 mb-1">
										System Error:
									</div>
									<div className="text-xs font-mono text-red-800 whitespace-pre-wrap break-all">
										{failedUpload.errorMessage}
									</div>
								</div>
							)}
							<div className="text-muted-foreground text-sm">
								Failed at{" "}
								{formatDateTime(failedUpload._creationTime)}
							</div>
						</div>
					</div>
				))}
			</div>
			{totalPages > 1 && (
				<div className="mt-6 flex items-center justify-center gap-3">
					<Button
						variant="outline"
						size="sm"
						disabled={page <= 1}
						onClick={() => setPage((p) => p - 1)}
					>
						<ChevronLeftIcon className="size-4" />
						Previous
					</Button>
					<span className="text-muted-foreground text-sm">
						Page {page} of {totalPages}
					</span>
					<Button
						variant="outline"
						size="sm"
						disabled={!hasMore}
						onClick={() => setPage((p) => p + 1)}
					>
						Next
						<ChevronRightIcon className="size-4" />
					</Button>
				</div>
			)}
		</div>
	);
}
