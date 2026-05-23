export function BalanceHero({ coins }: { coins: number }) {
	return (
		<section className="shrink-0 px-6 py-10 text-center bg-sky-50 border-b border-slate-100 relative overflow-hidden">
			<div className="absolute -top-10 -left-10 w-32 h-32 bg-white/60 rounded-full blur-xl pointer-events-none" />
			<div className="absolute -bottom-10 -right-10 w-40 h-40 bg-sky-200/40 rounded-full blur-xl pointer-events-none" />
			<div className="relative z-10">
				<div className="inline-block bg-white border border-slate-200 rounded-[2rem] px-8 py-5 shadow-sm">
					<p className="text-6xl font-black text-blue-600 tabular-nums leading-none">
						{coins}
					</p>
				</div>
				<p className="text-sm font-bold text-slate-500 mt-6 uppercase tracking-widest">
					Your coin balance
				</p>
			</div>
		</section>
	);
}
