import type { BlockResponse } from "@emdash-cms/blocks";
import type {
	ContentPolicyDecision,
	ContentPolicyEvent,
	PluginContext,
	SandboxedPlugin,
} from "emdash/plugin";

import {
	checkEntry,
	type EntrySnapshot,
	formatReason,
	type Issue,
	loadConfig,
	type SeoGuardConfig,
} from "./rules.js";

const WIDGET_PAGE = "widget:seo-health";
const REPORT_PAGE = "/report";
/** Bound the admin scan so a page load stays well inside sandbox CPU limits. */
const MAX_SCAN_PER_COLLECTION = 500;
const WIDGET_ROWS = 5;

/**
 * Human actions and scheduled publication are checked. Plugin- and
 * system-initiated actions (imports, seeds, migrations) are logged, not blocked.
 */
const ENFORCED_ORIGINS = new Set(["api", "mcp", "visual-editor", "scheduler"]);

async function enforce(event: ContentPolicyEvent, ctx: PluginContext): Promise<ContentPolicyDecision> {
	const config = await loadConfig((key) => ctx.settings.get(key));
	if (config.mode === "off" || !config.collections.includes(event.collection)) return;

	const issues = checkEntry(snapshotFromEvent(event.content), config);
	if (issues.length === 0) return;

	const enforced = config.mode === "block" && ENFORCED_ORIGINS.has(event.origin.source);
	ctx.log.info(enforced ? "Blocked publication" : "SEO issues found", {
		collection: event.collection,
		origin: event.origin.source,
		issues: issues.map((i) => i.rule),
	});
	if (enforced) return { cancel: true, reason: formatReason(issues) };
}

/** Publish and schedule events carry the draft in `content.data` and the staged slug in `content.slug`. */
function snapshotFromEvent(content: Record<string, unknown>): EntrySnapshot {
	const data = isRecord(content.data) ? content.data : content;
	return {
		data,
		slug: typeof content.slug === "string" ? content.slug : null,
		seo: isRecord(content.seo) ? (content.seo as EntrySnapshot["seo"]) : null,
	};
}

interface Finding {
	collection: string;
	id: string;
	locale: string | null;
	title: string;
	issues: Issue[];
}

interface ScanResult {
	checked: number;
	findings: Finding[];
	truncated: boolean;
	/** Configured collections that could not be read, e.g. a typo in settings. */
	unreadable: string[];
}

async function scanPublished(ctx: PluginContext, config: SeoGuardConfig): Promise<ScanResult> {
	const result: ScanResult = { checked: 0, findings: [], truncated: false, unreadable: [] };
	// Present whenever the manifest declares content:read.
	const content = ctx.content;
	if (!content) return result;
	for (const collection of config.collections) {
		try {
			result.checked += await scanCollection(content, collection, config, result);
		} catch (error) {
			ctx.log.warn("Could not scan collection", { collection, error: String(error) });
			result.unreadable.push(collection);
		}
	}
	return result;
}

/** Scan one collection, appending findings to `result`. Returns how many entries were checked. */
async function scanCollection(
	content: NonNullable<PluginContext["content"]>,
	collection: string,
	config: SeoGuardConfig,
	result: ScanResult,
): Promise<number> {
	let cursor: string | undefined;
	let seen = 0;
	do {
		const page = await content.list(collection, {
			where: { status: "published" },
			limit: 100,
			cursor,
		});
		for (const item of page.items) {
			seen++;
			const issues = checkEntry({ data: item.data, slug: item.slug, seo: item.seo }, config);
			if (issues.length > 0) {
				result.findings.push({
					collection,
					id: item.id,
					locale: item.locale,
					title: titleOf(item.data, config) || item.slug || item.id,
					issues,
				});
			}
		}
		cursor = page.hasMore ? page.cursor : undefined;
		if (cursor && seen >= MAX_SCAN_PER_COLLECTION) {
			result.truncated = true;
			cursor = undefined;
		}
	} while (cursor);
	return seen;
}

function unreadableBanner(scan: ScanResult): BlockResponse["blocks"] {
	if (scan.unreadable.length === 0) return [];
	return [
		{
			type: "banner",
			title: "Some collections could not be checked",
			description: `Check the collection slugs in settings: ${scan.unreadable.join(", ")}.`,
			variant: "error",
		},
	];
}

function findingsTable(findings: Finding[], actionId: string): BlockResponse["blocks"][number] {
	return {
		type: "table",
		page_action_id: actionId,
		columns: [
			{ key: "entry", label: "Entry", format: "element" },
			{ key: "collection", label: "Collection", format: "badge" },
			{ key: "issues", label: "Issues" },
		],
		rows: findings.map((f) => ({
			entry: {
				type: "link",
				label: f.title,
				target: {
					kind: "content",
					collection: f.collection,
					id: f.id,
					...(f.locale ? { locale: f.locale } : {}),
				},
			},
			collection: f.collection,
			issues: f.issues.map((i) => i.message).join(" "),
		})),
		empty_text: "Every published entry passes.",
	};
}

function stats(scan: ScanResult): BlockResponse["blocks"][number] {
	return {
		type: "stats",
		items: [
			{ label: "Published checked", value: scan.checked },
			{
				label: "Need attention",
				value: scan.findings.length,
				trend: scan.findings.length > 0 ? "down" : "neutral",
			},
		],
	};
}

function modeBanner(config: SeoGuardConfig): BlockResponse["blocks"][number] {
	const description = {
		block: "Publishing and scheduling are blocked until entries pass these checks.",
		warn: "Warn-only: issues are logged and reported here, but publishing is allowed.",
		off: "Checks are off. Enable them in settings.",
	}[config.mode];
	return {
		type: "banner",
		title: `Mode: ${config.mode}`,
		description: `${description} Watching: ${config.collections.join(", ")}.`,
		variant: config.mode === "block" ? "default" : "alert",
	};
}

async function renderWidget(ctx: PluginContext): Promise<BlockResponse> {
	const config = await loadConfig((key) => ctx.settings.get(key));
	const scan = await scanPublished(ctx, config);
	return {
		blocks: [
			...unreadableBanner(scan),
			stats(scan),
			findingsTable(scan.findings.slice(0, WIDGET_ROWS), "widget_findings"),
			{
				type: "actions",
				elements: [
					{ type: "link", label: "Full report", target: { kind: "plugin-page", path: REPORT_PAGE } },
					{ type: "link", label: "Settings", target: { kind: "plugin-settings" } },
				],
			},
		],
	};
}

async function renderReport(ctx: PluginContext): Promise<BlockResponse> {
	const config = await loadConfig((key) => ctx.settings.get(key));
	const scan = await scanPublished(ctx, config);
	return {
		blocks: [
			{ type: "header", text: "SEO report" },
			modeBanner(config),
			...unreadableBanner(scan),
			stats(scan),
			...(scan.truncated
				? [
						{
							type: "context" as const,
							text: `Only the first ${MAX_SCAN_PER_COLLECTION} published entries per collection were checked.`,
						},
					]
				: []),
			findingsTable(scan.findings, "report_findings"),
			{
				type: "actions",
				elements: [
					{ type: "button", label: "Re-scan", action_id: "rescan" },
					{ type: "link", label: "Settings", target: { kind: "plugin-settings" } },
				],
			},
		],
	};
}

const plugin: SandboxedPlugin = {
	hooks: {
		"content:beforePublish": enforce,
		"content:beforeSchedule": enforce,
	},
	routes: {
		admin: {
			permission: "plugins:manage",
			handler: async (routeCtx, ctx) => {
				const input = isRecord(routeCtx.input) ? routeCtx.input : {};
				if (input.type === "page_load" && input.page === WIDGET_PAGE) return renderWidget(ctx);
				// Page loads, the re-scan button, and table sort/paging all re-render the report.
				return renderReport(ctx);
			},
		},
	},
};

export default plugin;

function titleOf(data: Record<string, unknown>, config: SeoGuardConfig): string {
	const value = data[config.titleField];
	return typeof value === "string" ? value.trim() : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
