# Quality and acceptance

Required behavior:

- Independent browser tool, bundled resources, strict unique manifest ID/version. No backend/CDN/Node requirement after install. Responsive UI, labelled controls, local focus; host owns outer window and manager.
- Initialize after valid restoration. `draft.save` promptly returns a captured snapshot; pause expensive work while hidden. No duplicated loops/listeners after reopen.
- Every serialized edit increments `editRevision`, including undo/redo and changed target ID/revision. Clone all fields before async reads. Ack N cannot clear N+1; stale/rejected save is not persistence. Keep unsaved/recovery state on failure.
- Session generation guards New/Open/template even for reused document IDs. Old Apply/restore must not attach its target/view/history to a new session. Reconcile unknown first-create timeout before retrying.
- Drafts stay project-scoped; native writes check launch project/epoch, permissions and expected target revision. Never bypass errors with direct host API calls.
- Native content/owned sources survive disable/uninstall and clean-profile reopen. Update returned targets without duplicate documents/placements. Normal hide saves; explicit uninstall removes code and unsent drafts without waiting on a hung editor. Do not intercept manager removal.

## Test matrix

1. Copy skill to an empty directory outside the source checkout. Generate/build there. Validate ZIP root/allowlist/manifest/hash with the real host contract. Builder changes need negative cases for invalid manifests, missing/escaping/symlink files.
2. Use an isolated Percepta profile. Install actual ZIP, open ribbon icon and perform a meaningful operation. Inspect real native output and Studio Undo/Redo if promised; a fake Apply button is not acceptance.
3. Hide/show; shortcuts; resize/maximize/restore; draft and Studio Save/Reopen. Switch projects; drafts do not cross. Delayed responses do not change a newer editor session.
4. Disable/enable, install new version at same ID, select older retained version. Migrate incompatible draft schemas explicitly or offer recovery; no silent reset.
5. Uninstall/restart/reopen. Committed native work and sources survive, code/drafts gone. Reinstall starts without deleted drafts. Old instances/origins no longer work.
6. Import/render features use an additional input not used to implement them. Preserve originals, alpha, timing, pivots and editability. Verify real rendered pixels if parity is promised; measure relevant target budgets for heavy work.

SDK/state tests should exercise wrong source/origin/token/instance, matching replies, rejection/timeout/disposal and interleaved save/Apply/New. Check behavior, not helper names/source text.

## Deliver

ZIP+hash/version, source/build steps, host/SDK compatibility, permission rationale, supported output/limits, Save draft versus Apply versus Save project, uninstall/recovery/reopen behavior, provenance and representative native/output example. Record actual UI/desktop/browser/portability checks; unit/HTTP acceptance is not visual acceptance.

Do not bundle wrapper folders, symlinks, `node_modules`, `.git`, `.env`, secrets, profiles, QA captures or caches. Do not copy EasyVFX's ID/product/assets as a universal template requirement. Do not write Studio files, access parent DOM/IPC, eval messages, use `postMessage('*')`, loosen CSP/origin/version checks, persist launch secrets or invent APIs. A standalone runtime/player ZIP is not an installable editor ZIP. No claims of full workflow, uninstall preservation, pixels or cross-platform support based only on package/unit tests.
