import { Link } from "@tanstack/react-router";
import type { MenuItem } from "./menuConfig";

type Props = {
	item: MenuItem;
	onExternalClick: () => void;
};

export function MenuRow({ item, onExternalClick }: Props) {
	const content = (
		<>
			<div
				className={`w-12 h-12 rounded-xl ${item.iconClass} flex items-center justify-center text-xl shrink-0`}
			>
				{item.icon}
			</div>
			<div className="flex-1 min-w-0">
				<span className="block font-bold text-base text-slate-800">
					{item.label}
				</span>
				<span className="block text-xs text-slate-500 mt-0.5 truncate">
					{item.description}
				</span>
			</div>
			<span className="text-slate-300 font-bold text-xl pr-2 shrink-0">
				{item.external ? "↗" : "→"}
			</span>
		</>
	);

	const className =
		"w-full flex items-center gap-4 p-3 rounded-2xl border border-slate-100 bg-white shadow-sm active:scale-[0.98] active:bg-slate-50 transition-all text-left cursor-pointer";

	if (item.external) {
		return (
			<button type="button" onClick={onExternalClick} className={className}>
				{content}
			</button>
		);
	}

	return (
		<Link to={item.href!} className={className}>
			{content}
		</Link>
	);
}
