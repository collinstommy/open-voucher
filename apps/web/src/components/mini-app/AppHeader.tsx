import { Link } from "@tanstack/react-router";

type Props = { title: string; backTo?: string };

export function AppHeader({ title, backTo = "/app" }: Props) {
	return (
		<header className="shrink-0 px-4 py-3 flex items-center gap-3 border-b border-slate-100 bg-white">
			<Link
				to={backTo}
				className="text-base font-semibold text-blue-600 bg-blue-50 px-4 py-2.5 min-h-11 min-w-11 inline-flex items-center justify-center rounded-full active:bg-blue-100 transition-colors cursor-pointer shrink-0"
			>
				← Back
			</Link>
			<h1 className="text-base font-bold flex-1 truncate text-slate-800">
				{title}
			</h1>
		</header>
	);
}
