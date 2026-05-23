import { Link } from "@tanstack/react-router";
import { openDonateLink } from "@/lib/openDonateLink";

type Props =
	| { variant: "home" }
	| { variant: "back"; title: string; backTo?: string };

export function AppHeader(props: Props) {
	if (props.variant === "back") {
		return (
			<header className="shrink-0 px-4 py-2.5 flex items-center gap-3 border-b border-slate-100 bg-white">
				<Link
					to={props.backTo ?? "/app"}
					className="text-sm font-semibold text-blue-600 bg-blue-50 px-3 py-1.5 rounded-full active:bg-blue-100 transition-colors cursor-pointer shrink-0"
				>
					← Back
				</Link>
				<h1 className="text-base font-bold flex-1 truncate text-slate-800">
					{props.title}
				</h1>
			</header>
		);
	}

	return (
		<header className="shrink-0 px-3 py-1.5 flex justify-between items-center bg-white border-b border-slate-100">
			<span className="font-bold text-sm tracking-tight text-slate-800">
				Open Vouchers
			</span>
			<button
				type="button"
				onClick={openDonateLink}
				className="text-[9px] font-bold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full active:scale-95 transition-transform cursor-pointer uppercase tracking-wider"
			>
				Support ☕
			</button>
		</header>
	);
}
