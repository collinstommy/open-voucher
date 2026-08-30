export const DISCORD_URL = "https://discord.gg/RVseBazhA";

export function openDiscordLink() {
	const tg = (
		window as Window & {
			Telegram?: { WebApp?: { openLink?: (url: string) => void } };
		}
	).Telegram?.WebApp;
	if (tg?.openLink) {
		tg.openLink(DISCORD_URL);
	} else {
		window.open(DISCORD_URL, "_blank", "noopener,noreferrer");
	}
}
