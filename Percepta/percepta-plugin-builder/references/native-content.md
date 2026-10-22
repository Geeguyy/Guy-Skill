# Native content and ownership

A panel and a native edit are separate capabilities. `effect.apply` accepts `easyvfx.project` `1.0.0`, producing `percepta.vfx` with `percepta.easyvfx-recipe` `1.0.0` and capability `recipe.easyvfx.v1`. The host chooses its native runtime version: the final inspected host emits `1.1.0` and also accepts legacy `1.0.0` recipes. The starter pins the earlier `1.0.0` preview and deliberately limits its example to the shared image-free ring subset; do not claim support/parity for newer runtime features without upgrading and testing the preview. This works for another installed plugin ID with the permissions; data format and plugin identity differ.

The starter's image-free ring is a small integration example, not a mandated product. Its pinned runtime previews it without Studio imports or Nightcamp images.

```js
const result = await host.applyEffect({
  project:portableRecipe, normalizedAssets:[],
  ...(effectId ? {effectId,expectedEffectRevision:effectRevision} : {})
});
// Save result.effectId/effectRevision in the draft; changes increment editRevision.
```

The parent controller chooses the active Studio map. The child has no generic map/placement selection API. Create can add one placement; update uses the returned effect ID instead of creating a duplicate. A target conflict requires reloading/reconciling, not removing revision checks.

```js
{
 format:'easyvfx.project',version:'1.0.0',id:'unique-editor-document-id',
 name:'Creator-defined name',preset:'custom',seed:17,duration:1.2,loop:false,
 controls:{color:'#66bbff',size:1,intensity:1},assets:[],
 layers:[{id:'ring',name:'Pulse',kind:'ring',start:0,end:1.2,
  x:0,y:0,width:180,height:100,blend:'add',opacity:0.8,
  curves:{scale:[[0,0.3],[1,1.2]],opacity:[[0,1],[1,0]]}}]
}
```

The broader recipe supports sprite, flipbook, particles, ring, halo, ribbon and material. The starter's own validator accepts its known ring fields only. Use bundled `runtime/project.mjs` for the pinned baseline and inspect the target host for later fields/features. Native validation remains authoritative.

For referenced images, `asset.src` embeds original PNG/JPEG/WebP bytes as data URLs with `integrity:'sha256-<64 lowercase hex>'`, dimensions and normalized pivot. No machine paths, plugin origins, `blob:` or external URLs as committed sources. Preserve exact originals, frame order/durations/pivots.

Supply one `{id,pngBase64}` per referenced asset in `normalizedAssets`: raw base64 (no data URL prefix), RGBA8 PNG at original dimensions. Keep original bytes in `project.assets` separately. Verify alpha/scaling/repeated playback when relevant.

Native apply owns runtime PNGs, original bytes and logical recipe references in one Studio transaction. `loadEffect` reconstructs editable data from project-owned originals. Private drafts are not Scene saves; after Apply the user saves the Studio project.

Current native limits:32MiB retained sources across history,4-megapixel effect working area,4,096 recipe particles/effect. Individual image≤16MiB, dimensions≤4,096. The broader editor model's256 assets/128 layers do not override native limits. Reject unsupported data; do not silently flatten/omit.

For another native output type, define schema/version, validator, source ownership, atomic transaction, history, reopen conversion, host-owned runtime/compiler and bounded broker operations. This requires host work as well as plugin work. Do not create an alternate direct `/api` shortcut or claim a draft-only prototype is native editing.

Committed documents must not depend on plugin installation paths/origins, local machine paths, private drafts or third-party network availability. Preserve provenance. Do not ship captured Nightcamp assets to external developers without applicable rights. The starter contains no Nightcamp assets and does not grant new licenses to Percepta's source.
