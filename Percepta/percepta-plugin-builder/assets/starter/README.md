# Independent Percepta plugin starter

This project needs only Node.js20+ for build/tests. No npm install or original Percepta/EasyVFX checkout is required. Installed browser code has no Node dependencies. The example pulse is a proof of integration; replace its workflow with your own idea.

```sh
npm test
npm run package
```

Install `dist/<plugin-id>-<version>.zip` using **Percepta → Plugins → Install ZIP**. Click the new ribbon icon. Change the name/color/size, Apply, then save the Studio project. Hide/show the tool, Reload its saved native target, and test native output after uninstall. The example's supported output is an image-free EasyVFX-compatible native effect; other native document types need a host adapter.

`plugin.files.json` is the release allowlist. Add necessary local browser resources explicitly. `tools/`, `compat/`, `package.json`, this README and development files stay outside the plugin ZIP. Build output uses stable metadata and refuses to overwrite different bytes at the same version. Bump `plugin.json` version for changes (keep package.json aligned); retain the plugin ID.

`sdk.mjs` is the generic browser bridge; callbacks own validation, snapshots, local actions and visibility. `state.mjs` demonstrates captured revisions/session generations. `effect.mjs` is replaceable domain logic. `runtime/` is the pinned preview implementation for the example, not an arbitrary native SDK. `UPSTREAM.json` pins source copies; no captured Nightcamp assets are included.

SDK/manifest snapshot:1.0.0, inspected2026-10-23. Preview pins are the EasyVFX0.2.4 runtime1.0.0 baseline; the final host also accepts that format and now writes native runtime1.1.0. The sample deliberately validates only their shared image-free ring subset. Upgrade/retest before using later features; do not claim full1.1.0 preview parity. Verify future-host compatibility. The inspector's Edit button still opens EasyVFX; this tool reloads its own returned target via the panel. Existing projects continue playing on the host-owned runtime, not the installed editor's runtime folder.

Private draft Save does not change the Scene. Apply commits a native effect; **Studio Save** retains the project. Disable keeps code/drafts; uninstall discards code/private drafts and preserves committed native work. Export recovery before uninstall if unsent work matters. An unknown Apply timeout must be reconciled in the Scene before creating another effect; the starter blocks repeated Apply until Reload or explicit New.

Test actual install/open, successful Apply/update, Studio history, Save/Reopen, project changes, hide/show/resize, disable/enable, a new version, rollback, uninstall, restart/reinstall and native portability in an isolated profile. Unit tests and a valid ZIP do not prove UI, performance, broad GPU parity or all future hosts. See the skill's references for the full contract and release matrix. Public source/asset distribution also requires the applicable license; NOTICE.txt grants none by implication.
