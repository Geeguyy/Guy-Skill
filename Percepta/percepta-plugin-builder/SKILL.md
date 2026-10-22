---
name: percepta-plugin-builder
description: Build or update independent Percepta Studio plugins, package installable ZIPs, and verify native project handoffs, drafts, updates and uninstall. Use for Percepta plugin development from a creator's idea; not for installing Codex plugins or inventing a plugin concept.
---

# Percepta Plugin Builder

Turn the creator's idea into an independent tool that installs from a ZIP and works inside Percepta. The idea, visual direction and domain workflow belong to the creator. This skill supplies the integration contract and release discipline, not a mandatory product concept.

## Establish the supported output

Read [protocol.md](references/protocol.md) before implementing the bridge. It describes the inspected manifest/SDK `1.0.0`, not a promised future API. When host source is available, compare its validator, broker and adapter with this snapshot. Do not invent SDK operations or silently weaken host checks when they differ.

- Utilities can keep project-scoped private drafts with `storage` and produce file downloads.
- Scene authoring requires a supported native adapter. The inspected host exposes `effect.apply` / `effect.load` for **EasyVFX-compatible effect recipes**, for any installed plugin ID with appropriate permissions. Read [native-content.md](references/native-content.md).
- New character/mesh/map/audio/document APIs are **not** provided by this SDK. If the idea needs one, define the necessary host adapter and agree its scope before claiming the plugin can perform it. A ZIP that opens a panel is not acceptance of a native editing feature. Do not disguise another document type as an effect or reuse `easyvfx` as the plugin ID.

The supplied effect example is an integration test vehicle. Replace its UI/model with the creator's product. It is not a requirement that every plugin must be a VFX tool.

## Scaffold independently

Use `<skill>` for this skill's actual directory, not a developer-specific path:

```sh
python3 <skill>/scripts/new_plugin.py --id acme.my-tool --name "My Tool" --out /path/to/my-tool
cd /path/to/my-tool
npm test
npm run package
```

Python3 creates the folder. The standalone project's build/tests use Node.js20+ without downloaded dependencies; installed browser code uses no Node APIs. The example supplies a generic message client, revision/session state, an editable effect and pinned preview runtime. `plugin.files.json` is the release allowlist; add required static resources there. Keep build tools/private files outside the plugin ZIP.

## Implement the editor

1. Define owned data, validation and useful failure states. Keep UI, draft history, clock and assets independent from Studio UI/controller imports. Standalone mode is optional; show a clear disconnected state if unsupported.
2. Connect with `sdk.mjs`, restore `ready.draft`, then emit `{initialized:true,dirty,editRevision}`. Supply snapshots through `getState`; even non-effect tools need an object `draft.project` with their own versioned schema.
3. Clone project, history, view, target and `editRevision` together **before** asynchronous reads. Every serialized change increments the revision, including undo/redo, New, loaded targets and changed target revisions. Acknowledge only the captured revision after a successful save; later edits stay dirty.
4. Advance a session generation on New/Open/template replacement. Check it after async preparation and commit. An old commit may finish in Studio but must not relink the new editor document. A preset's reused ID is not session identity.
5. Implement visibility/shortcut callbacks. Pause expensive loops/audio while hidden; resume without duplicate loops. Local undo affects drafts; native Apply uses Studio history. Return unhandled Escape through the client.
6. Commit only through a supported adapter. Preserve drafts on rejection. A timeout can mean a commit succeeded but its reply was lost: reconcile before retrying a create. Do not automatically duplicate Apply requests.

Read [quality.md](references/quality.md) for lifecycle/acceptance checks; apply the details relevant to the tool.

## Package and prove

Run generated-project tests and `npm run package`. The builder validates the inspected real ZIP/manifest contract and allowlist, then writes `dist/<id>-<version>.zip` and a hash receipt. Verify another archive with:

```sh
node <skill>/scripts/verify_zip.mjs /path/to/plugin.zip
```

A valid ZIP is only package acceptance. In an isolated Percepta profile, install through **Plugins → Install ZIP**, open the new ribbon icon and perform the real workflow. Verify native output in Studio where promised. Exercise hide/show, resize/maximize, Save/Reopen, project-scoped drafts, disable/enable, update, rollback and uninstall. Authored content and owned sources must work after editor removal. Use another input for import tools.

Retain proportional evidence: package hash/compatibility, meaningful domain checks, actual UI results and a portable native example where applicable. Do not claim pixels, performance, clean-profile portability or end-to-end acceptance from unit/HTTP checks alone. Report untested surfaces.

Ship ZIP, source/build instructions, supported SDK/host snapshot, permission rationale, draft versus committed-content behavior, recovery instructions, limits and asset provenance. Bump version when archive bytes change; keep ID stable. The host owns Install/Disable/Update/Rollback/Uninstall and the outer resizable window. Cooperate with those services instead of making another manager or outer window chrome.
