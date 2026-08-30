#!/usr/bin/env bun
// Seeds the dev Convex deployment with 7 Dunnes-style test vouchers.
// Usage: bun scripts/seed-dev.ts [--chat-id <id>] [--deployment <name>] [--reset]
import { createCanvas, type SKRSContext2D } from "@napi-rs/canvas";

const DEFAULT_DEPLOYMENT = "fastidious-okapi-116";
const BACKEND_DIR = new URL("../packages/backend", import.meta.url).pathname;
const DAY_MS = 86_400_000;

type SeedVoucherSpec = {
	type: "5" | "10" | "20";
	status: "available" | "claimed" | "expired" | "invalidated";
	barcode: string;
	expiryDaysFromNow: number;
	createdDaysAgo: number;
};

const SEED_MIX: SeedVoucherSpec[] = [
	{
		type: "5",
		status: "available",
		barcode: "2707169469301",
		expiryDaysFromNow: 5,
		createdDaysAgo: 1,
	},
	{
		type: "10",
		status: "available",
		barcode: "2707169469302",
		expiryDaysFromNow: 12,
		createdDaysAgo: 0,
	},
	{
		type: "20",
		status: "available",
		barcode: "2707169469303",
		expiryDaysFromNow: 26,
		createdDaysAgo: 3,
	},
	{
		type: "5",
		status: "available",
		barcode: "2707169469304",
		expiryDaysFromNow: 2,
		createdDaysAgo: 2,
	},
	{
		type: "10",
		status: "claimed",
		barcode: "2707169469305",
		expiryDaysFromNow: 6,
		createdDaysAgo: 4,
	},
	{
		type: "10",
		status: "expired",
		barcode: "2707169469306",
		expiryDaysFromNow: -5,
		createdDaysAgo: 40,
	},
	{
		type: "5",
		status: "invalidated",
		barcode: "2707169469307",
		expiryDaysFromNow: 9,
		createdDaysAgo: 8,
	},
];

// Spend threshold printed on the image; any pairing the OCR prompt accepts is
// fine, this uses one per value.
const THRESHOLD_BY_TYPE: Record<SeedVoucherSpec["type"], string> = {
	"5": "20",
	"10": "50",
	"20": "100",
};

// devSeed.ts defaults validFrom to 9 days before expiry; mirror that here so
// the printed "Valid ..." range matches the stored row.
const VALID_FROM_DAYS_BEFORE_EXPIRY = 9;

const MONTHS = [
	"Jan",
	"Feb",
	"Mar",
	"Apr",
	"May",
	"Jun",
	"Jul",
	"Aug",
	"Sep",
	"Oct",
	"Nov",
	"Dec",
];
const WEEKDAYS = [
	"Sunday",
	"Monday",
	"Tuesday",
	"Wednesday",
	"Thursday",
	"Friday",
	"Saturday",
];

function dayUtc(daysFromNow: number): Date {
	return new Date(Date.now() + daysFromNow * DAY_MS);
}

// Same 22:59 UTC expiry convention as devSeed.ts dayAtUtc / storeVoucherFromOcr,
// so the printed "Expires ..." matches the stored row.
function expiryMs(spec: SeedVoucherSpec): number {
	const day = dayUtc(spec.expiryDaysFromNow);
	return Date.UTC(
		day.getUTCFullYear(),
		day.getUTCMonth(),
		day.getUTCDate(),
		22,
		59,
		0,
	);
}

function fmtDay(daysFromNow: number): string {
	const d = dayUtc(daysFromNow);
	return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

function groupBarcode(barcode: string): string {
	return /^\d{13}$/.test(barcode)
		? `${barcode.slice(0, 7)} ${barcode.slice(7, 11)} ${barcode.slice(11, 13)}`
		: barcode;
}

// Deliberately not a real EAN-13 encoding (won't scan): deterministic,
// visually plausible bars for the dev-only image.
function drawBarcode(
	ctx: SKRSContext2D,
	barcode: string,
	centerX: number,
	top: number,
	height: number,
): void {
	const unit = 3;
	let total = 0;
	const widths: number[][] = [];
	for (let i = 0; i < barcode.length; i++) {
		const d = barcode.charCodeAt(i) - 48;
		const barA = 1 + (d % 3);
		const gap = 1 + (d % 2);
		const barB = 1 + ((d >> 1) % 3);
		const tailGap = 2;
		widths.push([barA, gap, barB, tailGap]);
		total += (barA + gap + barB + tailGap) * unit;
	}

	let x = centerX - total / 2;
	ctx.fillStyle = "#000000";
	for (const [barA, gap, barB, tailGap] of widths) {
		ctx.fillRect(x, top, barA * unit, height);
		x += (barA + gap) * unit;
		ctx.fillRect(x, top, barB * unit, height);
		x += (barB + tailGap) * unit;
	}
}

function drawVoucher(spec: SeedVoucherSpec): Buffer {
	const canvas = createCanvas(600, 540);
	const ctx = canvas.getContext("2d") as SKRSContext2D;

	ctx.fillStyle = "#e5e5e5";
	ctx.fillRect(0, 0, 600, 540);
	ctx.fillStyle = "#ffffff";
	ctx.beginPath();
	ctx.roundRect(20, 20, 560, 500, 24);
	ctx.fill();

	ctx.fillStyle = "#000000";
	ctx.textAlign = "left";
	ctx.font = "bold 30px sans-serif";
	ctx.fillText("DUNNES", 48, 72);
	ctx.font = "14px sans-serif";
	ctx.fillText("STORES", 48, 92);

	const threshold = THRESHOLD_BY_TYPE[spec.type];
	const expiry = expiryMs(spec);

	ctx.textAlign = "center";
	ctx.font = "bold 46px sans-serif";
	ctx.fillText(`€${spec.type} OFF €${threshold}`, 300, 175);
	ctx.font = "bold 30px sans-serif";
	ctx.fillText(`Expires ${WEEKDAYS[new Date(expiry).getUTCDay()]}`, 300, 220);
	ctx.font = "24px sans-serif";
	ctx.fillText(
		`Valid ${fmtDay(spec.expiryDaysFromNow - VALID_FROM_DAYS_BEFORE_EXPIRY)} - ${fmtDay(spec.expiryDaysFromNow)}`,
		300,
		255,
	);
	ctx.fillStyle = "#888888";
	ctx.font = "20px sans-serif";
	ctx.fillText(`When you spend €${threshold} or more on Groceries.`, 300, 290);

	drawBarcode(ctx, spec.barcode, 300, 320, 90);

	ctx.fillStyle = "#000000";
	ctx.font = "28px sans-serif";
	ctx.fillText(groupBarcode(spec.barcode), 300, 448);

	ctx.fillStyle = "#888888";
	ctx.font = "18px sans-serif";
	const terms = "Terms and conditions apply";
	ctx.fillText(terms, 300, 498);
	const termsWidth = ctx.measureText(terms).width;
	ctx.fillRect(300 - termsWidth / 2, 504, termsWidth, 1);

	return canvas.toBuffer("image/png");
}

function runConvex(args: string[], cwd: string) {
	const proc = Bun.spawnSync({
		cmd: ["bunx", "convex", ...args],
		cwd,
		stdout: "pipe",
		stderr: "pipe",
	});
	const stdout = proc.stdout.toString();
	const stderr = proc.stderr.toString();
	if (proc.exitCode !== 0) {
		throw new Error(
			`convex ${args.join(" ")} failed (exit ${proc.exitCode}):\n${stderr || stdout}`,
		);
	}
	return { stdout, stderr };
}

type UploadResult = { storageId: string };
type ClearResult = { deleted: string[]; missing: string[] };
type SeedSummary = {
	userId: string;
	chatId: string;
	inserted: Array<{ barcode: string; status: string; type: string }>;
	skipped: string[];
};

// convex run prints log lines around the result; pull the JSON out of it.
function parseResult<T>(stdout: string): T {
	const trimmed = stdout.trim();
	try {
		return JSON.parse(trimmed) as T;
	} catch {
		const start = trimmed.indexOf("{");
		const end = trimmed.lastIndexOf("}");
		if (start !== -1 && end > start) {
			return JSON.parse(trimmed.slice(start, end + 1)) as T;
		}
		throw new Error(`Could not parse convex output:\n${stdout}`);
	}
}

function parseArgs(): { chatId?: string; deployment: string; reset: boolean } {
	let chatId: string | undefined;
	let deployment = DEFAULT_DEPLOYMENT;
	let reset = false;
	const argv = process.argv.slice(2);
	for (let i = 0; i < argv.length; i++) {
		if (argv[i] === "--chat-id") chatId = argv[++i];
		else if (argv[i] === "--deployment") deployment = argv[++i];
		else if (argv[i] === "--reset") reset = true;
	}
	return { chatId, deployment, reset };
}

function main() {
	const { chatId, deployment, reset } = parseArgs();

	console.log(`Pre-flight: checking env on deployment ${deployment}...`);
	const { stdout: envOut } = runConvex(
		["env", "list", "--deployment", deployment],
		BACKEND_DIR,
	);
	if (!/^ENVIRONMENT=development$/m.test(envOut)) {
		console.error(
			`Aborting: ENVIRONMENT=development not found on ${deployment}.\nRefusing to seed a deployment that is not a dev environment.`,
		);
		process.exit(1);
	}
	if (!/^DEV_TELEGRAM_CHAT_ID=/m.test(envOut) && !chatId) {
		console.warn(
			"Warning: DEV_TELEGRAM_CHAT_ID is not set on the deployment and no --chat-id was given; seeding will fail at the user step.",
		);
	}

	if (reset) {
		const result = parseResult<ClearResult>(
			runConvex(
				[
					"run",
					"devSeed:clearSeedVouchers",
					JSON.stringify({ barcodes: SEED_MIX.map((s) => s.barcode) }),
					"--deployment",
					deployment,
				],
				BACKEND_DIR,
			).stdout,
		);
		console.log(
			`Reset: deleted ${result.deleted.length}, missing ${result.missing.length}.`,
		);
	}

	// Existing seeded vouchers: barcode -> current imageStorageId. Reruns reuse
	// these ids in the payload (the mutation still skips the rows) so reruns
	// do not upload throwaway images.
	const barcodeList = JSON.stringify(SEED_MIX.map((s) => s.barcode));
	const inlineQuery = `const out = []; for (const b of ${barcodeList}) { const v = await ctx.db.query("vouchers").withIndex("by_barcode", q => q.eq("barcodeNumber", b)).first(); if (v) out.push({ barcodeNumber: v.barcodeNumber, imageStorageId: v.imageStorageId }); } return out;`;
	const existing = new Map<string, string>(
		parseResult<Array<{ barcodeNumber: string; imageStorageId: string }>>(
			runConvex(
				["run", "--deployment", deployment, "--inline-query", inlineQuery],
				BACKEND_DIR,
			).stdout,
		).map((v) => [v.barcodeNumber, v.imageStorageId]),
	);

	const pngs = SEED_MIX.filter((spec) => !existing.has(spec.barcode)).map(
		(spec) => ({
			spec,
			base64: drawVoucher(spec).toString("base64"),
		}),
	);

	const uploaded = new Map<string, string>();
	for (const [i, { spec, base64 }] of pngs.entries()) {
		const args = [
			"run",
			"devSeed:uploadSeedImage",
			JSON.stringify({ bytes: base64 }),
			"--deployment",
			deployment,
		];
		// Push the devSeed module to the dev deployment on the first upload;
		// later uploads reuse the already-pushed code.
		if (i === 0) args.push("--push");
		const parsed = parseResult<UploadResult>(
			runConvex(args, BACKEND_DIR).stdout,
		);
		uploaded.set(spec.barcode, parsed.storageId);
	}
	console.log(`Uploaded ${uploaded.size} new voucher image(s).`);

	const imageFor = (barcode: string): string => {
		const id = uploaded.get(barcode) ?? existing.get(barcode);
		if (!id) throw new Error(`No image found for ${barcode}`);
		return id;
	};

	const payload = {
		chatId,
		vouchers: SEED_MIX.map((spec) => ({
			...spec,
			imageStorageId: imageFor(spec.barcode),
		})),
	};
	const summary = parseResult<SeedSummary>(
		runConvex(
			[
				"run",
				"devSeed:seedDevVouchers",
				JSON.stringify(payload),
				"--deployment",
				deployment,
			],
			BACKEND_DIR,
		).stdout,
	);

	const rows = SEED_MIX.map((spec) => ({
		barcode: spec.barcode,
		type: spec.type,
		status: spec.status,
		storageId: imageFor(spec.barcode),
	}));
	console.log("\nbarcode         type  status       storageId");
	for (const row of rows) {
		console.log(
			row.barcode.padEnd(16) +
				row.type.padEnd(6) +
				row.status.padEnd(13) +
				row.storageId,
		);
	}
	console.log(`\nuserId:   ${summary.userId}`);
	console.log(`chatId:   ${summary.chatId}`);
	console.log(
		`inserted: ${summary.inserted.length} (${summary.inserted.map((v) => v.barcode).join(", ") || "none"})`,
	);
	console.log(
		`skipped:  ${summary.skipped.length} (${summary.skipped.join(", ") || "none"})`,
	);
}

main();
