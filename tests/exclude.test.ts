import { describe, expect, it } from "vitest";
import { addExcludedSnippet } from "../Snippet-downloader/modals/excludeSnippet";
import type { SnippetDownloaderSettings } from "../Snippet-downloader/settings";

function makeSettings(): SnippetDownloaderSettings {
	return {
		snippetList: [
			{
				repo: "o/r",
				snippetsContents: [
					{ name: "css/theme.css", lastUpdate: "d" },
					{ name: "css/theme-2.css", lastUpdate: "d" },
				],
			},
		],
		excludedSnippet: "",
		errorSnippet: "keep-me",
		githubTokenSecretId: "",
	};
}

describe("addExcludedSnippet", () => {
	it("stores the exclusion in excludedSnippet and leaves errorSnippet untouched", async () => {
		const settings = makeSettings();
		const [list, errorSnippet] = await addExcludedSnippet({ repo: "o/r", snippetPath: "css/theme.css" }, settings);
		expect(settings.excludedSnippet).toBe("^css/theme\\.css$");
		expect(errorSnippet).toBe("keep-me");
		expect(list[0].snippetsContents.map(s => s.name)).toEqual(["css/theme-2.css"]);
	});

	it("appends to existing exclusions", async () => {
		const settings = makeSettings();
		settings.excludedSnippet = "foo";
		await addExcludedSnippet({ repo: "o/r", snippetPath: "css/theme.css" }, settings);
		expect(settings.excludedSnippet).toBe("foo, ^css/theme\\.css$");
	});
});
