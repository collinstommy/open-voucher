import { useState } from "react";
import type { FaqItem } from "@/lib/faqContent";

function FaqAccordionItem({ q, a }: FaqItem) {
	const [open, setOpen] = useState(false);
	return (
		<div
			className={`rounded-xl border border-slate-200 transition-all ${
				open ? "bg-white shadow-md" : "bg-slate-50"
			}`}
		>
			<button
				type="button"
				onClick={() => setOpen(!open)}
				className="flex justify-between items-center w-full p-4 text-left gap-2 cursor-pointer text-slate-900"
			>
				<h3 className="text-sm font-semibold text-slate-900">{q}</h3>
				<span
					className={`text-slate-400 text-xs shrink-0 transition-transform ${
						open ? "rotate-180" : ""
					}`}
				>
					▼
				</span>
			</button>
			{open && (
				<div className="px-4 pb-4 text-sm text-slate-600 leading-relaxed border-t border-slate-100 pt-3 [&_p]:text-slate-600 [&_strong]:text-slate-800">
					{typeof a === "string" ? <p className="text-slate-600">{a}</p> : a}
				</div>
			)}
		</div>
	);
}

export function FaqAccordion({ items }: { items: FaqItem[] }) {
	return (
		<div className="space-y-3">
			{items.map((item) => (
				<FaqAccordionItem key={item.q} {...item} />
			))}
		</div>
	);
}
