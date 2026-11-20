# Extension release versioning

For every update to this extension, increment its version before completing the work. This applies to changes shipped in the VSIX, including code, bundled scripts, settings, assets, packaging, and Marketplace README content.

- Default to a SemVer patch bump unless the user requests a specific version or a different increment.
- Bump once per coherent update or release batch, rather than once per file, build, test run, or message. Read-only work does not require a bump.
- Keep `package.json` version, the top-level and root-package versions in `package-lock.json`, the packaging script's VSIX filename, and README installation examples synchronized.
- Rebuild the versioned VSIX with `npm run package` and verify its manifest reports the new version.
- Run tests appropriate to the changes before committing. Never publish to the Marketplace or push changes unless the user explicitly requests it.
