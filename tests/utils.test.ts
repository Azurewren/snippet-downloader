import { describe, expect, it } from "vitest";
import {
	basename,
	getLocalSnippetName,
	normalizeLocalSnippetName,
	normalizeSettings,
	searchExcluded,
	validateExcludedSnippets,
} from "../Snippet-downloader/utils";
import type { SnippetDownloaderSettings } from "../Snippet-downloader/settings";

const DEFAULT_SETTINGS: SnippetDownloaderSettings = {
	snippetList: [],
	excludedSnippet: "",
	errorSnippet: "",
	githubTokenSecretId: "",
};

describe("searchExcluded", () => {
	it("returns false for an empty list", () => {
		expect(searchExcluded("", "a.css")).toBe(false);
	});

	it("matches an exact name without extension", () => {
		expect(searchExcluded("bad", "bad.css")).toBe(true);
	});

	it("matches regular expressions against the GitHub path", () => {
		expect(searchExcluded("^legacy-.*$", "legacy-theme")).toBe(true);
		expect(searchExcluded("^legacy-.*$", "modern-theme")).toBe(false);
	});

	it("supports comma-separated entries", () => {
		expect(searchExcluded("one, two", "two.css")).toBe(true);
	});

	it("throws on an invalid regular expression", () => {
		expect(() => searchExcluded("(", "a.css")).toThrow();
	});
});

describe("validateExcludedSnippets", () => {
	it("accepts valid patterns and rejects invalid ones", () => {
		expect(() => validateExcludedSnippets("a, ^b.*$")).not.toThrow();
		expect(() => validateExcludedSnippets("a, (")).toThrow();
	});
});

describe("local snippet names", () => {
	it("defaults to the basename of the GitHub path", () => {
		expect(getLocalSnippetName({ name: "css/theme.css", lastUpdate: "" })).toBe("theme.css");
		expect(basename("a/b/c.css")).toBe("c.css");
	});

	it("prefers localName when set", () => {
		expect(getLocalSnippetName({ name: "css/theme.css", lastUpdate: "", localName: "mine.css" })).toBe("mine.css");
	});

	it("appends .css when missing", () => {
		expect(normalizeLocalSnippetName("mine")).toBe("mine.css");
		expect(normalizeLocalSnippetName(" mine.CSS ")).toBe("mine.css");
	});

	it.each(["", ".", "..", ".css", "a/b", "a\\b", "a:b", "con", "nul.css", "a?b"])(
		"rejects invalid name %j",
		(value) => {
			expect(() => normalizeLocalSnippetName(value)).toThrow();
		}
	);
});

describe("normalizeSettings", () => {
	it("returns defaults when there is no stored data", () => {
		expect(normalizeSettings(null, DEFAULT_SETTINGS)).toEqual(DEFAULT_SETTINGS);
	});

	it("migrates legacy settings that lack the new fields", () => {
		const legacy = {
			snippetList: [{ repo: "o/r", snippetsContents: [{ name: "a.css", lastUpdate: "2022-01-01T00:00:00Z" }] }],
			excludedSnippet: "x",
			errorSnippet: "",
		};
		const result = normalizeSettings(legacy, DEFAULT_SETTINGS);
		expect(result.githubTokenSecretId).toBe("");
		expect(result.excludedSnippet).toBe("x");
		expect(result.snippetList[0].snippetsContents[0]).toEqual({ name: "a.css", lastUpdate: "2022-01-01T00:00:00Z" });
	});

	it("keeps localName and drops malformed entries", () => {
		const result = normalizeSettings(
			{
				snippetList: [
					{ repo: "o/r", snippetsContents: [{ name: "a.css", lastUpdate: "d", localName: "b.css" }, { bad: true }] },
					"nonsense",
				],
			},
			DEFAULT_SETTINGS
		);
		expect(result.snippetList).toHaveLength(1);
		expect(result.snippetList[0].snippetsContents).toEqual([{ name: "a.css", lastUpdate: "d", localName: "b.css" }]);
	});
});
