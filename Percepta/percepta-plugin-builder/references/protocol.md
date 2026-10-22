# Inspected Percepta contract

Snapshot:2026-10-23. Manifest/SDK `1.0.0`, reference editor EasyVFX `0.2.4`. Recheck compatibility for future hosts.

Source seams in a host checkout: `packages/plugins/{manifest,zip-node,registry-node,host-node}.mjs`; `apps/studio/{plugin-host.js,plugin-draft-state.mjs}`; `tools/serve-studio.mjs`; `packages/authoring/easyvfx-node.mjs`. The starter pins copied validator/preview modules in `UPSTREAM.json`. Do not change a host just to make a third-party ZIP pass.

## Manifest and archive

`plugin.json` must be at the ZIP root beside its HTML entry, not inside a wrapper folder:

```json
{
  "format":"percepta.plugin", "manifestVersion":"1.0.0",
  "id":"acme.my-tool", "name":"My Tool", "version":"0.1.0",
  "entry":"index.html", "sdkVersion":"1.0.0",
  "permissions":["storage"],
  "contribution":{"icon":"◆","label":"My Tool"}
}
```

All shown keys are required. Only `description` is an optional extra top-level key. Unknown fields reject. ID: lowercase letters/digits separated by `.` or `-`, starts with a letter,≤80 characters. Versions:exact numeric major.minor.patch, no leading-zero components/ranges/prerelease/latest. Name≤100, label≤80. Icon:short glyph≤16 UTF-16 units or packaged PNG/WebP/SVG path; no URL.

Unique permissions: `storage` (drafts), `project.read` (load native EasyVFX), `project.write` (apply native EasyVFX). They do not grant arbitrary commands/files/networking. **Keep `storage` for this host:** its `ready` handler reads the project draft unconditionally, so a manifest without storage can validate but its handshake fails. Add project.read/write only when used. Recheck this requirement if the host handshake changes.

Portable POSIX paths≤240 chars; components use ASCII letters/digits/space/`._-`. No empty/`.`/`..`, absolute/backslash/colon/control paths, trailing dots/spaces or Windows device names. No case collisions, file/directory collisions, symlinks or special files. Ordinary stored/deflated ZIP accepted; no ZIP64/encryption. Limits:64MiB archive,128MiB expanded,16MiB/file,2,048 entries,64KiB manifest. Entry/icon files must exist. Same ID+version with changed bytes rejects; increment version. Hashes are identity, not publisher signatures.

## Execution boundary

Each plugin ID runs static verified browser files on a separate loopback origin. It has no Node/IPC/host filesystem access. CSP allows bundled modules, packaged/data/blob images and same-origin fetches; blocks remote CDN/API connections, inline JavaScript, workers and nested frames. Bundle browser dependencies. Never fetch Studio `/api` from the child, import Studio source, inspect parent DOM or use Electron IPC. Build-time Node is separate.

Launch query parameters: `pluginHostOrigin`, `pluginToken`, `pluginInstanceId`, `pluginSdkVersion`. Do not persist/log them. Validate exact parent source, origin, token, instance and SDK in both directions; explicit target origin, never `'*'`.

```js
{type:'percepta.plugin',sdkVersion:'1.0.0',token,instanceId,op,requestId,value}
// response: {...identity,op:'result',requestId,ok:true,value}
// rejection: {...identity,op:'result',requestId,ok:false,error:'...'}
```

## Child → host via bundled sdk.mjs

| Client | Wire op | Contract |
| --- | --- | --- |
| `ready` promise | `ready` | `{context:{projectId,epoch,generation,revision},draft:null|snapshot}` |
| `notifyState(value)` | `state.changed` | No reply; `{initialized?,dirty?,editRevision?,focused?,requestHide?}` |
| `saveDraft(snapshot)` | `draft.put` | Snapshot has object `project` and nonnegative safe-integer `editRevision`. Success `{saved:true,projectId,editRevision}`; old submission may return `{saved:false,stale:true}`. |
| `applyEffect(payload)` | `effect.apply` | Native EasyVFX payload; returns effect/placement IDs, effect revision, cursor, receipt. |
| `loadEffect(effectId)` | `effect.load` | `{project,effectId,effectRevision}` reconstructed from owned originals. |

No `scene.add`, generic `document.write`, selection enumeration, arbitrary commands, install or networking operation exists here. The current adapter receipt labels `pluginId:'easyvfx'` even for a different caller ID; that is not installed-plugin identity.

## Host → child

| Op | Callback/response |
| --- | --- |
| `draft.save` | Return captured JSON through `getState()`. Returning it is not a storage acknowledgement. |
| `project.load` | Validate/restore `{project,effectId,effectRevision,...}` with `setState()`, return `{loaded:true}`. |
| `history.undo` / `history.redo` | Local draft action; accepted only when handled. |
| `playback.toggle` | Local preview action. |
| `interaction.cancel` | `{handled:boolean}`; false lets host hide after saving. |
| `view.pause` / `view.resume` | Notification, no request ID; pause/resume work. |

Disable/update/rollback/uninstall revoke old instances/origins. Project/epoch changes reject old native writes; late drafts may save to the original captured project, never the new project. Dispose listeners/timers/GPU resources/pending promises on unload.

The inspector's **Edit with EasyVFX** routes to the `easyvfx` ID specifically. Another plugin needs its own reopening flow, e.g. retain the returned target and `loadEffect` in its own panel. Do not promise custom-inspector routing that does not exist.
