import { cn } from "@/lib/utils";
import { toast } from "sonner";

type SharePanelProps = {
	open: boolean;
	onClose: () => void;
	url: string;
	text: string;
};

export function SharePanel({ open, onClose, url, text }: SharePanelProps) {
	if (!open) return null;

	const encodedText = encodeURIComponent(text);
	const encodedUrl = encodeURIComponent(url);

	const shareWhatsApp = () => {
		window.open(`https://wa.me/?text=${encodedText}%20${encodedUrl}`, "_blank");
	};

	const shareFacebook = () => {
		window.open(
			`https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}&quote=${encodedText}`,
			"_blank",
		);
	};

	const copyText = async () => {
		try {
			await navigator.clipboard.writeText(`${text} ${url}`);
			toast.success("Copied!");
		} catch {
			toast.error("Failed to copy");
		}
		onClose();
	};

	return (
		<div className="fixed inset-0 z-50 flex items-end justify-center">
			{/* Backdrop */}
			<button
				type="button"
				onClick={onClose}
				className="absolute inset-0 bg-black/40"
				aria-label="Close"
			/>

			{/* Panel */}
			<div className="relative w-full max-w-md bg-white rounded-t-3xl p-6 pb-8 animate-[slideUp_200ms_ease-out]">
				{/* Handle */}
				<div className="mx-auto mb-4 w-10 h-1 rounded-full bg-slate-300" />

				<h3 className="text-lg font-bold text-slate-800 text-center mb-4">
					Share with friends
				</h3>

				<div className="flex gap-3">
					<ShareButton
						icon="💬"
						label="WhatsApp"
						bgClass="bg-emerald-50 text-emerald-700 active:bg-emerald-100"
						onClick={shareWhatsApp}
					/>
					<ShareButton
						icon="📘"
						label="Facebook"
						bgClass="bg-blue-50 text-blue-700 active:bg-blue-100"
						onClick={shareFacebook}
					/>
					<ShareButton
						icon="📋"
						label="Copy text"
						bgClass="bg-slate-50 text-slate-700 active:bg-slate-100"
						onClick={copyText}
					/>
				</div>
			</div>
		</div>
	);
}

function ShareButton({
	icon,
	label,
	bgClass,
	onClick,
}: {
	icon: string;
	label: string;
	bgClass: string;
	onClick: () => void;
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			className={cn(
				"flex-1 flex flex-col items-center gap-2 p-4 rounded-2xl transition-all active:scale-95 cursor-pointer",
				bgClass,
			)}
		>
			<span className="text-2xl">{icon}</span>
			<span className="text-xs font-semibold">{label}</span>
		</button>
	);
}
