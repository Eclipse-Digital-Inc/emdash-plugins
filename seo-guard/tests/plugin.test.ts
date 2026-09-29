import { afterEach, describe, expect, it } from "vitest";

import { createPluginTestHost, type PluginTestHost } from "@emdash-cms/plugin-test";

let host: PluginTestHost | undefined;

afterEach(async () => {
	await host?.dispose();
	host = undefined;
});

const GOOD_DATA = {
	title: "Notes on building for the long term",
	excerpt: "Why boring technology, clear ownership, and small releases keep a site healthy for years.",
	featured_image: { id: "01MEDIA" },
};

function publishEvent(data: Record<string, unknown>, overrides: Record<string, unknown> = {}) {
	return {
		content: { id: "01ENTRY", slug: "notes", data },
		collection: "posts",
		origin: { source: "api" },
		...overrides,
	};
}

describe("manifest", () => {
	it("declares only the authority it uses", async () => {
		host = await createPluginTestHost();
		expect([...host.manifest.capabilities].sort()).toEqual([
			"content:read",
			"hooks.content-policy:register",
		]);
		expect(host.manifest.allowedHosts).toEqual([]);
	});
});

describe("publication policy", () => {
	it("allows a complete post", async () => {
		host = await createPluginTestHost();
		expect(await host.invokeHook("content:beforePublish", publishEvent(GOOD_DATA))).toBeUndefined();
	});

	it("blocks a post missing its excerpt and image with a readable reason", async () => {
		host = await createPluginTestHost();
		const decision = (await host.invokeHook(
			"content:beforePublish",
			publishEvent({ title: GOOD_DATA.title }),
		)) as { cancel: boolean; reason: string };
		expect(decision.cancel).toBe(true);
		expect(decision.reason).toContain("meta description");
		expect(decision.reason).toContain("featured image");
	});

	it("also checks scheduling and scheduler-driven publication", async () => {
		host = await createPluginTestHost();
		const bad = { title: "Hi" };
		const scheduled = await host.invokeHook(
			"content:beforeSchedule",
			publishEvent(bad, { scheduledAt: "2030-01-01T00:00:00.000Z" }),
		);
		expect(scheduled).toMatchObject({ cancel: true });
		const due = await host.invokeHook(
			"content:beforePublish",
			publishEvent(bad, { origin: { source: "scheduler" } }),
		);
		expect(due).toMatchObject({ cancel: true });
	});

	it("does not block system or plugin origins", async () => {
		host = await createPluginTestHost();
		for (const origin of [{ source: "system" }, { source: "plugin", pluginId: "importer" }]) {
			expect(
				await host.invokeHook("content:beforePublish", publishEvent({ title: "Hi" }, { origin })),
			).toBeUndefined();
		}
	});

	it("ignores collections it is not watching", async () => {
		host = await createPluginTestHost();
		expect(
			await host.invokeHook(
				"content:beforePublish",
				publishEvent({ title: "Hi" }, { collection: "pages" }),
			),
		).toBeUndefined();
	});
});

describe("admin", () => {
	type Blocks = {
		blocks: Array<{ type: string; description?: string; items?: Array<{ value: unknown }> }>;
	};

	async function hostWithPosts() {
		const h = await createPluginTestHost();
		await h.createCollection({
			slug: "posts",
			label: "Posts",
			fields: [
				{ slug: "title", label: "Title", type: "string" },
				{ slug: "excerpt", label: "Excerpt", type: "text" },
				{ slug: "featured_image", label: "Featured image", type: "image" },
			],
		});
		// Seeded entries are drafts, so they must not appear in the published scan.
		await h.seedContent("posts", [{ title: "Hi" }]);
		return h;
	}

	it("renders the dashboard widget", async () => {
		host = await hostWithPosts();
		const res = (await host.invokeRoute("admin", {
			type: "page_load",
			page: "widget:seo-health",
		})) as Blocks;
		expect(res.blocks.map((b) => b.type)).toEqual(["stats", "table", "actions"]);
	});

	it("renders the report page without counting drafts", async () => {
		host = await hostWithPosts();
		const res = (await host.invokeRoute("admin", { type: "page_load", page: "/report" })) as Blocks;
		expect(res.blocks.map((b) => b.type)).toEqual(["header", "banner", "stats", "table", "actions"]);
		expect(res.blocks[2]?.items?.map((i) => i.value)).toEqual([0, 0]);
	});

	it("reports a configured collection that does not exist instead of failing", async () => {
		host = await createPluginTestHost();
		const res = (await host.invokeRoute("admin", {
			type: "page_load",
			page: "widget:seo-health",
		})) as Blocks;
		expect(res.blocks[0]).toMatchObject({ type: "banner" });
		expect(res.blocks[0]?.description).toContain("posts");
	});
});
