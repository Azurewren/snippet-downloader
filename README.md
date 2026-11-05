# Obsidian Snippet Downloader

This plugin is here to help you to download and update css snippet that are on a GitHub repository.

The plugin will download all css snippet on a repository, unless :
- There are two big (< 1MB)
- There are named `obsidian.css` (use BRAT for themes)
- There are excluded (see settings & excluded)

In setting, you can :
- Delete a repository. Warning! It will not delete the snippet file from your `.obsidian/snippets` folder.
- Exclude a snippet from downloads and updates by name or regular expression (use the **Save exclusions** button after editing). Separate multiple patterns with commas.
- Rename a downloaded snippet's local CSS filename. The GitHub source path remains unchanged, so update and exclude commands continue to reference the original file.
- Optionally select a GitHub token from Obsidian SecretStorage to access private repositories and increase API rate limits. The plugin stores the secret reference, not the token value in its settings.


So, the commands added by the plugins are :
- **Adding new Snippet** : Use `https://github.com/username/repo` or `username/repo` to add a new repository and download the present css snippet.
- **Update all snippet** : Update all repository and their snippet (unless you exclude them).
- **Update Specific snippet** : You can just update one snippet using its name.
- **Update Specific Repository** : You can just update one repository using its name.

💡Note : The file will be updated only if there is a new commit ! It's not based on the file contents.
The plugin detects each repository's default branch automatically.

Also, alternatively, you can use the settings tab to add a repository, delete a repository, exclude a snippets, etc.

<table>
<tbody>
	<tr>
		<td>⚠️</td>
		<td><ul><li>The plugin creates the <code>snippets</code> folder in your Obsidian configuration folder if it does not exist.</li><li>Each update replaces the downloaded file and overwrites local edits.</li><li>When adding a repository, existing files and snippets with conflicting local filenames are not overwritten; rename one of the snippets first.</li></ul></td>
	</tr>
</tbody>
</table>

## Installation
- Use [BRAT-42](https://github.com/TfTHacker/obsidian42-brat) to install the plugin.
- Use the community plugin market.

## Developpements
- `git clone git@github.com:Mara-Li/obsidian-snippet-downloader.git`
- `npm install`
- `npm run dev`

Before releasing, run `npm run typecheck`, `npm run lint`, `npm test` and `npm run build`.
*Credit to BRAT-42, where I take some idea and code !*

💡If one day BRAT-42 or Obsidian add a similary function, this plugin will be deleted !

🗒️Unauthenticated GitHub API requests are rate-limited. Using a token can increase the available API quota, but GitHub's rate limits still apply.

The optional token setting uses Obsidian SecretStorage and requires Obsidian 1.11.4 or newer. For private repositories, use a token with read-only repository contents access.
