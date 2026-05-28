export const DONATE_URL = "https://buymeacoffee.com/openvouchers";

export function openDonateLink() {
	const tg = (
		window as Window & {
			Telegram?: { WebApp?: { openLink?: (url: string) => void } };
		}
	).Telegram?.WebApp;
	if (tg?.openLink) {
		tg.openLink(DONATE_URL);
	} else {
		window.open(DONATE_URL, "_blank", "noopener,noreferrer");
	}
}
