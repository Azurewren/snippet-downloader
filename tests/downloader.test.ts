import { describe, expect, it } from "vitest";
import { checkLastUpdate, getRepoCoordinates } from "../Snippet-downloader/downloader";
import { renameSnippetFile } from "../Snippet-downloader/addSnippets";
import type { SnippetDownloaderSettings } from "../Snippet-downloader/settings";

describe("getRepoCoordinates", () => {
	it.each([
		["owner/repo", "owner", "repo"],
		["https://github.com/owner/repo", "owner", "repo"],
		["https://github.com/owner/repo/", "owner", "repo"],
		["https://github.com/owner/repo.git", "owner", "repo"],
	])("parses %s", (input, owner, repo) => {
		expect(getRepoCoordinates(input)).toEqual({ owner, repo });
	});

	it.each(["", "owner", "a/b/c", "http://github.com/o/r", "https://example.com/o/r", "https://github.com/o"])(
		"rejects %j",
		(input) => {
			expect(() => getRepoCoordinates(input)).toThrow();
		}
	);
});

describe("checkLastUpdate", () => {
	const snippet = { name: "a.css", lastUpdate: "2024-01-01T00:00:00Z" };

	it("detects newer commits", () => {
		expect(checkLastUpdate(snippet, "2024-06-01T00:00:00Z")).toBe(true);
		expect(checkLastUpdate(snippet, "2024-01-01T00:00:00Z")).toBe(false);
	});

	it("throws on invalid dates", () => {
		expect(() => checkLastUpdate(snippet, "nope")).toThrow();
		expect(() => checkLastUpdate({ ...snippet, lastUpdate: "nope" }, "2024-01-01T00:00:00Z")).toThrow();
	});
});

function fakeVault(files: Record<string, string>) {
	return {
		configDir: ".obsidian",
		// Mirrors the real behaviour: the Vault index does not see dot-folders, only the adapter does.
		getAbstractFileByPath: (): null => null,
		adapter: {
			exists: async (path: string) => path in files,
			stat: async (path: string) => (path in files ? { type: "file" } : null),
			rename: async (from: string, to: string) => {
				files[to] = files[from];
				delete files[from];
			},
		},
	};
}

describe("renameSnippetFile", () => {
	function setup() {
		const snippet = { name: "css/theme.css", lastUpdate: "2024-01-01T00:00:00Z" };
		const settings: SnippetDownloaderSettings = {
			snippetList: [{ repo: "o/r", snippetsContents: [snippet] }],
			excludedSnippet: "",
			errorSnippet: "",
			githubTokenSecretId: "",
		};
		return { snippet, settings };
	}

	it("renames the file on disk and records localName", async () => {
		const { snippet, settings } = setup();
		const files = { ".obsidian/snippets/theme.css": "body{}" };
		await renameSnippetFile("o/r", snippet, "mine", settings, fakeVault(files) as never);
		expect(files).toEqual({ ".obsidian/snippets/mine.css": "body{}" });
		expect(snippet).toMatchObject({ name: "css/theme.css", localName: "mine.css" });
	});

	it("clears localName when renamed back to the default", async () => {
		const { snippet, settings } = setup();
		Object.assign(snippet, { localName: "mine.css" });
		const files = { ".obsidian/snippets/mine.css": "body{}" };
		await renameSnippetFile("o/r", snippet, "theme.css", settings, fakeVault(files) as never);
		expect(files).toEqual({ ".obsidian/snippets/theme.css": "body{}" });
		expect(snippet).not.toHaveProperty("localName");
	});

	it("refuses to overwrite an existing file", async () => {
		const { snippet, settings } = setup();
		const files = { ".obsidian/snippets/theme.css": "a", ".obsidian/snippets/mine.css": "b" };
		await expect(renameSnippetFile("o/r", snippet, "mine", settings, fakeVault(files) as never)).rejects.toThrow();
		expect(snippet).not.toHaveProperty("localName");
	});
});
