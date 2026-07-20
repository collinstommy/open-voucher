import { useEffect, useRef, useState } from "react";
import type { FaqItem } from "@/lib/faqContent";

function FaqAccordionItem({
	item,
	isOpen,
	isHighlighted,
	onToggle,
}: {
	item: FaqItem;
	isOpen: boolean;
	isHighlighted: boolean;
	onToggle: () => void;
}) {
	const ref = useRef<HTMLDivElement>(null);

	useEffect(() => {
		if (isHighlighted && ref.current) {
			ref.current.scrollIntoView({ behavior: "smooth", block: "center" });
		}
	}, [isHighlighted]);

	return (
		<div
			id={item.id}
			ref={ref}
			className={`rounded-xl border transition-all ${
				isOpen ? "bg-white shadow-md" : "bg-slate-50 border-slate-200"
			} ${isHighlighted ? "ring-2 ring-blue-400" : ""}`}
		>
			<button
				type="button"
				onClick={onToggle}
				className="flex justify-between items-center w-full p-4 text-left gap-2 cursor-pointer text-slate-900"
			>
				<h3 className="text-sm font-semibold text-slate-900">{item.q}</h3>
				<span
					className={`text-slate-400 text-xs shrink-0 transition-transform ${
						isOpen ? "rotate-180" : ""
					}`}
				>
					▼
				</span>
			</button>
			{isOpen && (
				<div className="px-4 pb-4 text-sm text-slate-600 leading-relaxed border-t border-slate-100 pt-3 [&_p]:text-slate-600 [&_strong]:text-slate-800">
					{typeof item.a === "string" ? (
						<p className="text-slate-600">{item.a}</p>
					) : (
						item.a
					)}
				</div>
			)}
		</div>
	);
}

export function FaqAccordion({
	items,
	openId,
}: {
	items: FaqItem[];
	openId?: string;
}) {
	const [activeId, setActiveId] = useState<string | null>(openId ?? null);

	useEffect(() => {
		if (openId) {
			setActiveId(openId);
		}
	}, [openId]);

	return (
		<div className="space-y-3">
			{items.map((item) => (
				<FaqAccordionItem
					key={item.id}
					item={item}
					isOpen={activeId === item.id}
					isHighlighted={openId === item.id}
					onToggle={() =>
						setActiveId((current) => (current === item.id ? null : item.id))
					}
				/>
			))}
		</div>
	);
}
