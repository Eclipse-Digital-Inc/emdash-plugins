/**
 * Pure SEO rule engine. No host APIs here, so the rules can be unit-tested
 * directly and reused by the publish hooks and the admin report alike.
 */

export type Mode = "block" | "warn" | "off";

export interface SeoGuardConfig {
	mode: Mode;
	collections: string[];
	titleField: string;
	descriptionField: string;
	imageField: string;
	requireDescription: boolean;
	requireImage: boolean;
	titleMin: number;
	titleMax: number;
	descriptionMin: number;
	descriptionMax: number;
	slugMax: number;
}

export const DEFAULT_CONFIG: SeoGuardConfig = {
	mode: "block",
	collections: ["posts"],
	titleField: "title",
	descriptionField: "excerpt",
	imageField: "featured_image",
	requireDescription: true,
	requireImage: true,
	titleMin: 15,
	titleMax: 60,
	descriptionMin: 50,
	descriptionMax: 160,
	slugMax: 75,
};

export interface Issue {
	rule: "title" | "description" | "image" | "slug";
	message: string;
}

/** The subset of an entry the rules look at. `seo` is EmDash's core SEO panel, when enabled. */
export interface EntrySnapshot {
	data: Record<string, unknown>;
	slug?: string | null;
	seo?: { title?: string | null; description?: string | null; image?: string | null } | null;
}

type SettingGetter = (key: string) => Promise<unknown>;

/** Build a config from stored settings, falling back to defaults for unset or invalid values. */
export async function loadConfig(get: SettingGetter): Promise<SeoGuardConfig> {
	const [
		mode,
		collections,
		titleField,
		descriptionField,
		imageField,
		requireDescription,
		requireImage,
		titleMin,
		titleMax,
		descriptionMin,
		descriptionMax,
		slugMax,
	] = await Promise.all(
		[
			"mode",
			"collections",
			"titleField",
			"descriptionField",
			"imageField",
			"requireDescription",
			"requireImage",
			"titleMin",
			"titleMax",
			"descriptionMin",
			"descriptionMax",
			"slugMax",
		].map((key) => get(key)),
	);
	const d = DEFAULT_CONFIG;
	return {
		mode: mode === "block" || mode === "warn" || mode === "off" ? mode : d.mode,
		collections: parseList(collections) ?? d.collections,
		titleField: nonEmptyString(titleField) ?? d.titleField,
		descriptionField: nonEmptyString(descriptionField) ?? d.descriptionField,
		imageField: nonEmptyString(imageField) ?? d.imageField,
		requireDescription: typeof requireDescription === "boolean" ? requireDescription : d.requireDescription,
		requireImage: typeof requireImage === "boolean" ? requireImage : d.requireImage,
		titleMin: nonNegativeInt(titleMin) ?? d.titleMin,
		titleMax: nonNegativeInt(titleMax) ?? d.titleMax,
		descriptionMin: nonNegativeInt(descriptionMin) ?? d.descriptionMin,
		descriptionMax: nonNegativeInt(descriptionMax) ?? d.descriptionMax,
		slugMax: nonNegativeInt(slugMax) ?? d.slugMax,
	};
}

/** Run every rule against one entry. An empty array means the entry passes. */
export function checkEntry(entry: EntrySnapshot, config: SeoGuardConfig): Issue[] {
	const issues: Issue[] = [];

	// Core SEO panel values override the raw fields, matching what the page renders.
	const title = textOf(entry.seo?.title) || textOf(entry.data[config.titleField]);
	const description =
		textOf(entry.seo?.description) || textOf(entry.data[config.descriptionField]);
	const hasImage = Boolean(entry.seo?.image) || hasImageValue(entry.data[config.imageField]);

	if (!title) {
		issues.push({ rule: "title", message: "Add a title." });
	} else if (config.titleMin > 0 && title.length < config.titleMin) {
		issues.push({
			rule: "title",
			message: `Title is ${title.length} characters; aim for at least ${config.titleMin}.`,
		});
	} else if (config.titleMax > 0 && title.length > config.titleMax) {
		issues.push({
			rule: "title",
			message: `Title is ${title.length} characters; search results truncate past ${config.titleMax}.`,
		});
	}

	if (!description) {
		if (config.requireDescription) {
			issues.push({
				rule: "description",
				message: `Add a meta description (the "${config.descriptionField}" field).`,
			});
		}
	} else if (config.descriptionMin > 0 && description.length < config.descriptionMin) {
		issues.push({
			rule: "description",
			message: `Description is ${description.length} characters; aim for at least ${config.descriptionMin}.`,
		});
	} else if (config.descriptionMax > 0 && description.length > config.descriptionMax) {
		issues.push({
			rule: "description",
			message: `Description is ${description.length} characters; search results truncate past ${config.descriptionMax}.`,
		});
	}

	if (config.requireImage && !hasImage) {
		issues.push({
			rule: "image",
			message: `Add a featured image (the "${config.imageField}" field) for social previews.`,
		});
	}

	const slug = entry.slug ?? "";
	if (config.slugMax > 0 && slug.length > config.slugMax) {
		issues.push({
			rule: "slug",
			message: `Slug is ${slug.length} characters; keep it under ${config.slugMax}.`,
		});
	}

	return issues;
}

/** Policy reasons are capped at 500 plain-text characters by the host. */
export function formatReason(issues: Issue[]): string {
	const reason = `SEO Guard: ${issues.map((i) => i.message).join(" ")}`;
	return reason.length <= 500 ? reason : `${reason.slice(0, 497)}...`;
}

function textOf(value: unknown): string {
	return typeof value === "string" ? value.trim() : "";
}

function hasImageValue(value: unknown): boolean {
	if (typeof value === "string") return value.trim().length > 0;
	if (value && typeof value === "object") {
		const v = value as Record<string, unknown>;
		return Boolean(v.id || v.src || v.url);
	}
	return false;
}

function nonEmptyString(value: unknown): string | undefined {
	return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function nonNegativeInt(value: unknown): number | undefined {
	const n = typeof value === "string" ? Number(value) : value;
	return typeof n === "number" && Number.isInteger(n) && n >= 0 ? n : undefined;
}

function parseList(value: unknown): string[] | undefined {
	if (typeof value !== "string") return undefined;
	const items = value
		.split(",")
		.map((s) => s.trim())
		.filter(Boolean);
	return items.length > 0 ? items : undefined;
}
