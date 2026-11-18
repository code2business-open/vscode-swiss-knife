# Swiss Knife

**71 text utilities for Visual Studio Code, by Code2Business.**

Format JSON, XML, CSS, and SQL; convert data formats and colors; encode and decode text; generate hashes; and clean up text without leaving your editor. Find every utility in the Command Palette under `SK:`.

[GitHub](https://github.com/code2business-open/vscode-swiss-knife) · [Report an issue](https://github.com/code2business-open/vscode-swiss-knife/issues) · [Contributing](#contributing)

## Features

- **71 commands in nine groups:** Hash, Convert, Format, Minify, Encode, Decode, Text, Generate, and Calculate.
- **Selection-aware editing:** transform selected text or the entire document when nothing is selected.
- **Multiple selections:** process each selection independently in one operation.
- **Single-step undo:** restore all changes from a command with one undo.
- **All-or-nothing edits:** if one selection fails, no replacements are applied.
- **No setup or accounts:** no API keys, telemetry, or runtime network calls.

## Installation

Requires **Visual Studio Code 1.95 or newer** on Windows, macOS, or Linux. Browser-based VS Code is not supported.

### Visual Studio Marketplace

1. Open the **Extensions** view with **Cmd+Shift+X** on macOS or **Ctrl+Shift+X** on Windows/Linux.
2. Search for **Swiss Knife** from **Code2Business** (`code2business.swiss-knife`).
3. Click **Install**.

Alternatively, install it from the terminal:

```sh
code --install-extension code2business.swiss-knife
```

### Install a VSIX package

Open the Command Palette, run **Extensions: Install from VSIX...**, and select the Swiss Knife `.vsix` file. Reload VS Code if prompted.

To install a package built from this repository:

```sh
code --install-extension ./artifacts/swiss-knife-0.1.0.vsix
```

## Quick start

1. Open a text file or create an untitled document.
2. Select the text you want to transform. Leave nothing selected to process the whole document.
3. Open the Command Palette with **Cmd+Shift+P** on macOS or **Ctrl+Shift+P** on Windows/Linux.
4. Type `SK:` and choose a command.

For example, run **SK: Format: Format JSON** on compact JSON:

```json
{"name":"Swiss Knife","utilities":71}
```

The result is:

```json
{
  "name": "Swiss Knife",
  "utilities": 71
}
```

Multiple nonempty selections are transformed independently. Empty cursors are ignored when another selection contains text. When every cursor is empty, the command processes the entire document once.

Counting commands show a message without changing the document. Commands preserve the document's line ending setting and do not save files automatically.

### RGB to Hex

**SK: Convert: RGB to Hex** accepts `rgb(255, 0, 128)`, `255,0,128`, or `255 0 128`. Each produces `#FF0080`. Channels must be integers from 0 to 255; alpha channels are not supported.

## All commands

Use the following exact names in the Command Palette.

### Hash

- `SK: Hash: MD5`
- `SK: Hash: SHA1`
- `SK: Hash: SHA256`
- `SK: Hash: SHA512`

### Convert

- `SK: Convert: ASCII To Hex`
- `SK: Convert: Hex To ASCII`
- `SK: Convert: Binary to Decimal`
- `SK: Convert: Decimal to Binary`
- `SK: Convert: Decimal to Hex`
- `SK: Convert: Hex to Dec`
- `SK: Convert: Hex to RGB`
- `SK: Convert: RGB to Hex`
- `SK: Convert: Android Strings to iOS Localizables`
- `SK: Convert: iOS Localizables to Android Strings`
- `SK: Convert: CSV to JSON`
- `SK: Convert: JSON to CSV`
- `SK: Convert: JSON to YAML`
- `SK: Convert: YAML to JSON`
- `SK: Convert: JSON to Query String`
- `SK: Convert: Query String to JSON`
- `SK: Convert: Date to Timestamp`
- `SK: Convert: Date to UTC`
- `SK: Convert: Fish PATH Hex Converter`

### Format

- `SK: Format: Format CSS`
- `SK: Format: Format JSON`
- `SK: Format: Format SQL`
- `SK: Format: Format XML`

### Minify

- `SK: Minify: Minify CSS`
- `SK: Minify: Minify JSON`
- `SK: Minify: Minify SQL`
- `SK: Minify: Minify XML`

### Encode

- `SK: Encode: Base64 Encode`
- `SK: Encode: HTML Encode`
- `SK: Encode: HTML Encode all characters`
- `SK: Encode: URL Encode`
- `SK: Encode: URL Entity Encode`
- `SK: Encode: Add Slashes`
- `SK: Encode: Defang`
- `SK: Encode: Rot13`

### Decode

- `SK: Decode: Base64 Decode`
- `SK: Decode: HTML Decode`
- `SK: Decode: URL Decode`
- `SK: Decode: URL Entities Decode`
- `SK: Decode: Remove Slashes`
- `SK: Decode: Refang`
- `SK: Decode: JWT Decode`
- `SK: Decode: PHP Unserialize`

### Text

- `SK: Text: Camel Case`
- `SK: Text: Collapse lines`
- `SK: Text: Count Characters`
- `SK: Text: Count Lines`
- `SK: Text: Count Words`
- `SK: Text: Deburr`
- `SK: Text: Lower Case`
- `SK: Text: Kebab Case`
- `SK: Text: Markdown Quote`
- `SK: Text: Natural Sort Lines`
- `SK: Text: Remove Duplicate Lines`
- `SK: Text: Replace Smart Quotes`
- `SK: Text: Reverse Lines`
- `SK: Text: Reverse String`
- `SK: Text: Shuffle Lines`
- `SK: Text: Snake Case`
- `SK: Text: Sort lines`
- `SK: Text: Sort JSON`
- `SK: Text: Sponge Case`
- `SK: Text: Start Case`
- `SK: Text: Trim`
- `SK: Text: Upper Case`

### Generate

- `SK: Generate: Lorem Ipsum`

### Calculate

- `SK: Calculate: Sum All`

## Contributing

Bug reports, suggestions, and pull requests are welcome. Use [GitHub Issues](https://github.com/code2business-open/vscode-swiss-knife/issues) to describe a problem or propose a utility. For bug reports, include your VS Code version, command name, a non-sensitive sample input, and the expected result.

### Development setup

Use **Node.js 22 or newer** and npm:

```sh
git clone https://github.com/code2business-open/vscode-swiss-knife.git
cd vscode-swiss-knife
npm ci
npm test
```

Press **F5** in VS Code to launch an Extension Development Host and try the commands. Run `npm run test:integration` for editor integration checks and `npm run package` to build an installable VSIX in `artifacts/`.

Integration tests normally download a test copy of VS Code. Set `VSCODE_EXECUTABLE_PATH` to a local executable to use an existing installation.

## Adding more scripts

New scripts must be added to the extension's source and included in a rebuilt package. The installed extension does not load scripts from a user folder.

### 1. Create a script

Add a JavaScript file to `scripts/`, for example `AppendPeriod.js`. Include a metadata comment and a synchronous, top-level `main(state)` function:

```javascript
/**
{
  "api": 1,
  "name": "Append Period",
  "description": "Adds a period to the end of the selected text or document.",
  "author": "Code2Business",
  "tags": "text,punctuation,period"
}
**/
function main(state) {
  if (state.text && !state.text.endsWith('.')) {
    state.text += '.';
  }
}
```

Use `state.text` to read and replace the current selection or document. `state.isSelection` indicates whether the current input is a selection. Use `state.postInfo('message')` for information and `state.postError('message')` to cancel the command with an error. Return values from `main` are ignored; assign the result to `state.text`.

Scripts run synchronously with a one-second execution limit. Their contexts persist between invocations, so avoid retaining input or relying on accidental global variables. Filesystem, network, Node.js, and VS Code APIs are not provided. Shared helpers must live in `scripts/lib/` and are loaded through `require('@sk/helper-name')`; helper files do not become commands.

### 2. Register the command

In `tools/generate.cjs`, add the script's filename without `.js` to the appropriate entry in `groups`. For the example above, append `AppendPeriod` to the `Text` group. Use a unique filename; the command title comes from the metadata's `name` unless an explicit title override is provided.

Command IDs follow `swissKnife.<lowercase category>.<lowercase filename without extension>`. The example becomes `swissKnife.text.appendperiod`, displayed as **SK: Text: Append Period**. Keep existing filenames and categories stable to preserve user keybindings.

The current catalog intentionally validates a total of 71 commands. When adding one, update the expected total in `tools/generate.cjs` and the catalog assertions in `test/unit.cjs`. Update advertised counts in `package.json`, this README, and test/build messages to match. Add a representative input to the command smoke test when the new script needs a specific input format, and add assertions for its expected output and invalid inputs.

### 3. Test and package

After making your changes, run these commands from the repository root:

```sh
npm test
npm run test:integration
npm run package
```

`npm run compile` regenerates `src/catalog.json` and `package.json` command contributions before compiling TypeScript. Edit the scripts and generator instead of modifying those generated command lists by hand.

Try the new command in the Extension Development Host and include its tests and documentation in your pull request. `npm run package` writes the installable VSIX to `artifacts/`.

## Privacy

Swiss Knife processes text in the extension host and does not send it to an external service. It has no telemetry or runtime network calls. No external accounts or API keys are required.

## License

Copyright (c) 2026 Code2Business. Released under the [MIT license](https://github.com/code2business-open/vscode-swiss-knife/blob/HEAD/LICENSE).

Original third-party copyright and license notices are preserved in the bundled sources and [third-party license](https://github.com/code2business-open/vscode-swiss-knife/blob/HEAD/vendor/THIRD-PARTY-LICENSE).

## Attribution

Swiss Knife's initial 70 utility scripts and seven supporting libraries are adapted from [Boop by Ivan Mathy](https://github.com/IvanMathy/Boop), under the MIT license, using source commit `5cf6914381f6ed6ef004c3a7d470f241a248fcb6`. Original script authors and library copyright and license notices are retained.

The compatibility adaptations make ASCIIToHex, HexToASCII, AndroidIOSStrings, IOSAndroidStrings, and Collapse use selection-aware text. Bundled imports use `@sk/` in place of `@boop/`, and `lodash.boop.js` is bundled as `lodash.js`. Test Script and Eval Javascript are excluded. The vkBeautify helper retains its original copyright and modification notes; its original adaptation note credits Boop and [kayhadrin/vkBeautify](https://github.com/kayhadrin/vkBeautify/).
