import { describe, expect, it } from "vitest";

import {
	checkEntry,
	DEFAULT_CONFIG,
	type EntrySnapshot,
	formatReason,
	loadConfig,
} from "../src/rules.js";

const GOOD: EntrySnapshot = {
	data: {
		title: "Notes on building for the long term",
		excerpt: "Why boring technology, clear ownership, and small releases keep a site healthy for years.",
		featured_image: { id: "01MEDIA", alt: "Desk" },
	},
	slug: "notes-on-building-for-the-long-term",
};

function withData(patch: Record<string, unknown>): EntrySnapshot {
	return { ...GOOD, data: { ...GOOD.data, ...patch } };
}

function rules(entry: EntrySnapshot, config = DEFAULT_CONFIG) {
	return checkEntry(entry, config).map((i) => i.rule);
}

describe("checkEntry", () => {
	it("passes a complete entry", () => {
		expect(checkEntry(GOOD, DEFAULT_CONFIG)).toEqual([]);
	});

	it("flags missing, short, and long titles", () => {
		expect(rules(withData({ title: "  " }))).toEqual(["title"]);
		expect(checkEntry(withData({ title: "Short" }), DEFAULT_CONFIG)[0]?.message).toContain(
			"at least 15",
		);
		expect(checkEntry(withData({ title: "x".repeat(61) }), DEFAULT_CONFIG)[0]?.message).toContain(
			"truncate past 60",
		);
	});

	it("flags missing, short, and long descriptions", () => {
		expect(rules(withData({ excerpt: undefined }))).toEqual(["description"]);
		expect(rules(withData({ excerpt: "Too short." }))).toEqual(["description"]);
		expect(rules(withData({ excerpt: "y".repeat(161) }))).toEqual(["description"]);
	});

	it("allows a missing description when not required, but still checks length when present", () => {
		const config = { ...DEFAULT_CONFIG, requireDescription: false };
		expect(rules(withData({ excerpt: "" }), config)).toEqual([]);
		expect(rules(withData({ excerpt: "Too short." }), config)).toEqual(["description"]);
	});

	it("flags a missing featured image in any empty shape", () => {
		for (const value of [undefined, null, "", {}, { alt: "no id" }]) {
			expect(rules(withData({ featured_image: value }))).toEqual(["image"]);
		}
		expect(rules(withData({ featured_image: "https://cdn.example.com/a.jpg" }))).toEqual([]);
		expect(rules(withData({ featured_image: null }), { ...DEFAULT_CONFIG, requireImage: false })).toEqual(
			[],
		);
	});

	it("flags long slugs", () => {
		expect(rules({ ...GOOD, slug: "s".repeat(76) })).toEqual(["slug"]);
	});

	it("prefers core SEO panel values over raw fields", () => {
		const entry: EntrySnapshot = {
			data: { title: "Short", excerpt: "", featured_image: null },
			slug: "ok",
			seo: {
				title: "A search title of sensible length",
				description: GOOD.data.excerpt as string,
				image: "01OGIMAGE",
			},
		};
		expect(checkEntry(entry, DEFAULT_CONFIG)).toEqual([]);
	});

	it("reads custom field slugs", () => {
		const config = { ...DEFAULT_CONFIG, titleField: "headline", descriptionField: "summary", imageField: "hero" };
		const entry: EntrySnapshot = {
			data: { headline: GOOD.data.title, summary: GOOD.data.excerpt, hero: { id: "1" } },
			slug: "x",
		};
		expect(checkEntry(entry, config)).toEqual([]);
		expect(checkEntry(GOOD, config).map((i) => i.rule)).toEqual(["title", "description", "image"]);
	});

	it("treats zero limits as disabled", () => {
		const config = { ...DEFAULT_CONFIG, titleMin: 0, titleMax: 0, slugMax: 0 };
		expect(rules({ ...withData({ title: "Hi" }), slug: "s".repeat(200) }, config)).toEqual([]);
	});
});

describe("formatReason", () => {
	it("joins messages and caps at 500 characters", () => {
		const issues = checkEntry(withData({ title: "", excerpt: "" }), DEFAULT_CONFIG);
		expect(formatReason(issues)).toMatch(/^SEO Guard: Add a title\. Add a meta description/);
		const long = formatReason(Array.from({ length: 50 }, () => ({ rule: "title" as const, message: "x".repeat(40) })));
		expect(long).toHaveLength(500);
		expect(long.endsWith("...")).toBe(true);
	});
});

describe("loadConfig", () => {
	it("returns defaults when nothing is stored", async () => {
		expect(await loadConfig(async () => null)).toEqual(DEFAULT_CONFIG);
	});

	it("parses stored values and ignores invalid ones", async () => {
		const stored: Record<string, unknown> = {
			mode: "warn",
			collections: " posts, recipes ,,",
			titleMax: "70",
			titleMin: -3,
			descriptionMax: 1.5,
			requireImage: false,
			imageField: "  ",
		};
		const config = await loadConfig(async (key) => stored[key] ?? null);
		expect(config).toMatchObject({
			mode: "warn",
			collections: ["posts", "recipes"],
			titleMax: 70,
			titleMin: DEFAULT_CONFIG.titleMin,
			descriptionMax: DEFAULT_CONFIG.descriptionMax,
			requireImage: false,
			imageField: DEFAULT_CONFIG.imageField,
		});
	});

	it("rejects unknown modes", async () => {
		expect((await loadConfig(async (key) => (key === "mode" ? "strict" : null))).mode).toBe("block");
	});
});
