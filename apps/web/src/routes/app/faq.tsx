import { AppHeader } from "@/components/mini-app/AppHeader";
import { FaqAccordion } from "@/components/mini-app/FaqAccordion";
import { APP_FAQ_ITEMS } from "@/lib/faqContent";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/app/faq")({
	component: FaqPage,
});

function FaqPage() {
	return (
		<div className="flex flex-col flex-1 min-h-0">
			<AppHeader title="FAQ" />
			<div className="flex-1 overflow-auto bg-slate-50 p-4">
				<FaqAccordion items={APP_FAQ_ITEMS} />
			</div>
		</div>
	);
}
