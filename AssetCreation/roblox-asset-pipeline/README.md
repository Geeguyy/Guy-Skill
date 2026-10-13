# Roblox Asset Pipeline

Reusable **Codex Skill** for turning a ChatGPT blueprint into a low-poly Blender model, reusable skeleton, multiple animations and Roblox-ready FBX. Roblox Studio integration is **opt-in**.

**Skill:** [SKILL.md](./SKILL.md) · **Status:** production workflow specification; end-to-end Studio/Moon Animator compatibility must be tested per asset.

## Production flow

```text
ChatGPT blueprint + short animation brief
             ↓
Codex: inspect existing files and reference
             ↓
Blender bpy: low-poly modeling → tris/material optimization
             ↓
One Armature → skin weights → N animation Actions
             ↓
QA: geometry → rig → per-animation → FBX reimport
             ↓
Deliver: .blend + rigged .fbx + each animation .fbx + previews + QA
             ↓  ONLY when explicitly requested
Roblox Studio Dev Zone: import → inspect Bone/Pose paths
             ↓
KeyframeSequence(s) → playback → Moon Animator open/edit test
             ↓  ONLY when explicitly requested
Markers / publish Animation IDs / Humanoid / HP / hitbox / combat
```

## What to send Codex

Attach the blueprint, invoke `$roblox-asset-pipeline`, and supply any number of animation specifications. If unspecified, Studio import and gameplay features are **not** included.

```text
Use $roblox-asset-pipeline
Asset: Damage Dummy
Blueprint: [attached]
Tris: <=1200

Animations:
1. HitReaction — lean backward, rebound, hat/cloth lag; fixed base.
   Duration: 0.65s; Loop: No
2. Idle — subtle sway; fixed base.
   Duration: 2s; Loop: Yes

Deliver: Blender + FBX + QA
```

For optional Studio import, append:

```text
Import into Roblox Studio Dev Zone.
Create and verify editable KeyframeSequences.
Check actual Moon Animator import/edit/playback.
Do not add Humanoid, HP, hitbox or combat.
```

For optional events, append e.g. `Attack: marker Name=Hit, Value="0", Time=at blade impact`. **Value `"0"` is not timestamp zero.** A marker signals timing; damage logic remains separate.

## Output structure

```text
<Asset>/
  source/<Asset>.blend
  source/build_asset.py
  export/<Asset>_Rigged.fbx
  export/animations/<ActionName>.fbx
  preview/...
  reports/QA_Report.md
```

Keep editable source meshes/collections, but optimize the exported asset. Reuse the **same Armature** across all animations; add new Actions without re-modeling.

## Mandatory release gates

| Gate | Acceptance |
| --- | --- |
| G1 Model | Reference match; real evaluated tris within budget |
| G2 Rig | Valid bones, pivots, normalized weights and deformation |
| G3 Animations | Every requested clip verified independently |
| G4 FBX | Rig and each exported animation survive Blender reimport |
| G5 Studio (if requested) | Full Pose paths match imported bones; editable KeyframeSequences and real playback |
| G6 Moon (if requested) | Open/import, edit keyframes and play in the installed Moon Animator |

**PASS / FAIL / NOT TESTED** must reflect actual evidence. A Blender-only pass does not establish Roblox or Moon Animator compatibility. If a required gate is untested or fails, report that limitation rather than claiming production readiness.

### Critical compatibility regression

Previously, an exported animation used the root Pose `DamageDummy_Rig`, while the Studio rig root was `RootPart`. Changing that root Pose name restored full matching for that specific asset. The skill now requires comparing **the full name-and-parent path of every Pose** to the target rig and repairing mismatches without modifying motion. Neither root name nor the old asset's bone/keyframe count is a universal default.

## Efficient iteration

- **New blueprint:** run full model → rig → animation → QA pipeline.
- **More animations:** reuse mesh + rig; create/export only new Actions.
- **Animation correction:** rebuild the affected Action/FBX only.
- **Studio root mismatch:** back up and repair KeyframeSequence; do not remodel.
- **Marker request:** add timing events; do not create combat components.
- **HP/hitbox request:** add only the explicitly requested runtime pieces.

## Codex installation / discovery

GitHub storage **does not automatically install** this Skill into Codex. After cloning the repository, make the folder discoverable as a Codex skill, for example by copying `AssetCreation/roblox-asset-pipeline` into your project's `.agents/skills/` or your personal `~/.agents/skills/`. Restart/reload Codex if necessary, then reference `$roblox-asset-pipeline`.

The skill provides instructions, **not** direct Blender/Roblox control. Codex still needs Blender available locally and an actual integration path into Roblox Studio for automatic import and Moon Animator testing.
