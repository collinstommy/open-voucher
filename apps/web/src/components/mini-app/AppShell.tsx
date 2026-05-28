import type { ReactNode } from "react";

/** Light-mode shell for Telegram Mini App (root html is dark) */
export function AppShell({ children }: { children: ReactNode }) {
	return (
		<div className="min-h-dvh bg-slate-50 text-slate-900 [color-scheme:light] font-sans flex flex-col">
			{children}
		</div>
	);
}
