import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs));
}

export function formatDate(timestamp: number | string | Date): string {
	return new Date(timestamp).toLocaleDateString("en-IE");
}

export function formatDateTime(timestamp: number | string | Date): string {
	return new Date(timestamp).toLocaleString("en-IE");
}
