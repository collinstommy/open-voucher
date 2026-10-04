import { convexQuery } from "@convex-dev/react-query";
import { api } from "@open-voucher/backend/convex/_generated/api";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { CheckIcon, ChevronDownIcon } from "lucide-react";
import { useCallback, useState } from "react";
import {
	DropdownMenu,
	DropdownMenuCheckboxItem,
	DropdownMenuContent,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAdminAuth } from "@/hooks/useAdminAuth";
import { formatDateTime } from "@/lib/utils";

export const Route = createFileRoute("/admin/failed-uploads")({
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
			api.adminFeedback.getFailedUploads,
			token ? { token, excludeReasons: [...excludedReasons], page } : "skip",
		),
	);

	const failedUploads = data?.failedUploads ?? [];
	const allReasons = data?.allReasons ?? [];
	const total = data?.total ?? 0;
	const hasMore = data?.hasMore ?? false;

	const toggleReason = useCallback((reason: string) => {
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
	}, []);

	const selectAll = () => {
		setExcludedReasons(new Set());
		setPage(1);
	};
	const deselectAll = () => {
		setExcludedReasons(new Set(allReasons));
		setPage(1);
	};

	const totalPages = Math.max(1, Math.ceil(total / (data?.pageSize ?? 12)));
	const shownLabel =
		total > failedUploads.length
			? `${failedUploads.length} of ${total}`
			: String(total);

	return (
		<div>
			<div className="masthead">
				<div>
					<h1 className="display">Failed Uploads</h1>
					<p className="lede">Uploads the bot could not read, newest first.</p>
				</div>
				{!isLoading && !error && (
					<div className="stamp">
						<b className="num">{shownLabel}</b>
						<br />
						page {page} of {totalPages}
					</div>
				)}
			</div>

			<div className="toolbar">
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<button type="button" className="btn">
							Filter
							{excludedReasons.size > 0 ? (
								<span className="num">
									{Math.max(allReasons.length - excludedReasons.size, 0)}
								</span>
							) : null}
							<ChevronDownIcon className="size-4" />
						</button>
					</DropdownMenuTrigger>
					<DropdownMenuContent
						align="end"
						className="w-64 border-[rgba(196,214,236,0.16)] bg-[#171C25] text-[#E9EDF3]"
					>
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
							type="button"
							className="relative flex w-full cursor-default items-center gap-2 rounded-sm px-2 py-1.5 pl-8 text-left text-sm"
							onClick={selectAll}
						>
							<CheckIcon className="pointer-events-none absolute left-2 size-4 text-transparent" />
							Select all
						</button>
						<button
							type="button"
							className="relative flex w-full cursor-default items-center gap-2 rounded-sm px-2 py-1.5 pl-8 text-left text-sm"
							onClick={deselectAll}
						>
							Deselect all
						</button>
					</DropdownMenuContent>
				</DropdownMenu>
			</div>

			{isLoading ? (
				<p className="muted">Loading failed uploads...</p>
			) : error ? (
				<p className="warn">Error loading failed uploads</p>
			) : failedUploads.length === 0 ? (
				<div className="empty">No failed uploads</div>
			) : (
				<div className="grid">
					{failedUploads.map((failedUpload) => (
						<article key={failedUpload._id} className="vcard">
							<div className="vmedia">
								{failedUpload.imageUrl ? (
									<img src={failedUpload.imageUrl} alt="Failed voucher" />
								) : (
									<span className="muted">No image</span>
								)}
							</div>
							<div className="vbody">
								<div className="vhead">
									<h2 className="display vvalue num">
										{failedUpload.extractedType
											? `€${failedUpload.extractedType}`
											: "—"}
										<span>Voucher</span>
									</h2>
									<span className="status s-failed">
										<i />
										failed
									</span>
								</div>
								<p className="vuploader">
									Uploaded by{" "}
									<Link
										to="/admin/users/$userId"
										params={{ userId: failedUpload.userId }}
									>
										<b>
											{failedUpload.username ||
												failedUpload.firstName ||
												"Unknown"}
										</b>
									</Link>
								</p>
								<div className="reason">
									<div className="k">Failure reason</div>
									<div className="v">{failedUpload.failureReason}</div>
								</div>
								{failedUpload.errorMessage && (
									<div className="reason plain">
										<div className="k">System error</div>
										<div className="v">{failedUpload.errorMessage}</div>
									</div>
								)}
								<dl className="ledger">
									<div>
										<dt>User ID</dt>
										<dd className="mono">{failedUpload.userId}</dd>
									</div>
									<div>
										<dt>Failed at</dt>
										<dd>{formatDateTime(failedUpload._creationTime)}</dd>
									</div>
								</dl>
							</div>
						</article>
					))}
				</div>
			)}

			{totalPages > 1 && (
				<div className="pager">
					<button
						type="button"
						className="btn btn-quiet"
						disabled={page <= 1}
						onClick={() => setPage((p) => p - 1)}
					>
						Previous
					</button>
					<span className="now">
						Page {page} of {totalPages}
					</span>
					<button
						type="button"
						className="btn"
						disabled={!hasMore}
						onClick={() => setPage((p) => p + 1)}
					>
						Next
					</button>
				</div>
			)}
		</div>
	);
}
