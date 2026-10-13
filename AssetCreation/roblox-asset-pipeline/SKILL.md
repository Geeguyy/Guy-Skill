---
name: roblox-asset-pipeline
description: Create or revise optimized low-poly Blender assets from blueprints, rig one skeleton, build one or many animations, export FBX, and optionally import/test in Roblox Studio and Moon Animator. Use for Roblox props, damage dummies, NPCs, monsters, and bosses.
---

# Roblox Asset Pipeline

## Inputs / scope
Blueprint, asset name, output directory, optional tris budget, and animations (name, motion description, duration, loop). Optional requests: Roblox Studio import, markers, gameplay components, publishing.
Ask only for blocking details. State assumptions; do not invent measurements or claim tests not run. **Do not import into Studio, publish IDs, add Humanoid/HP/hitbox/combat, or add markers unless asked.**

## Execute
1. **Inspect:** Find reference, existing rig/scripts, Blender version and available Studio tooling. Preserve prior working files. For revisions, rebuild only affected stages.
2. **Model (bpy):** Match reference silhouette and colors; construct simple faceted geometry directly. Eliminate invisible/unnecessary faces, dense curves, subdivisions and excess materials. Respect the supplied tris budget; if absent, propose an asset-appropriate target (not a claimed Roblox limit). Keep editable logical parts but minimize exported mesh objects.
3. **Rig:** One reusable Armature per asset. Name bones consistently; place pivots at functional joints. Assign normalized weights (max four influences/vertex); prefer rigid weighting for rigid parts and blend only where necessary. Keep fixed supports stationary; verify neutral pose and deformation.
4. **Animate:** One named Blender Action per requested animation on the SAME rig. Match motion, timing, loop setting and secondary motion. Avoid unintended root/base motion and action/NLA contamination. Export/test every clip independently; do not invent extra animations.
5. **Build + verify:** Save editable `.blend`, reproducible `bpy` script, optimized rigged `.fbx`, and `animations/<name>.fbx` for each requested clip. Produce at least a model preview and a compact QA report. Reimport FBX into Blender and compare hierarchy, names, weights, transforms and animation motion/timing.

## Studio / Moon Animator — only on explicit request
- Verify access and the target place/Dev Zone. Never report Studio success based on Blender reimport alone.
- Import rig + clips; validate actual **full Pose paths** in each Roblox KeyframeSequence against the imported rig (not just bone counts). Repair mismatched root names with a backup while preserving Pose transforms, time and descendants. Example observed: Blender `DamageDummy_Rig` vs Studio `RootPart`; **do not hardcode either name** across assets.
- Check KeyframeSequence duration, populated keyframes, loop/priority, Animator playback and bone movement for **every clip**. Save editable clips in Studio. Test opening, editing and playback with the installed Moon Animator version where accessible; otherwise mark `NOT TESTED`. A valid Roblox Animation Editor clip is not proof of Moon compatibility.
- Publish Animation IDs only if explicitly requested and with the correct creator/permissions. Never change unrelated Studio systems.

## Optional — only when requested
- Humanoid, health bar, HP, collision/hitbox, combat and runtime scripts are separate opt-in modules.
- For animation events, specify **marker name, string value, timestamp** and intended action independently. Place markers at the visually correct frame (e.g. `Hit` value `"0"` at impact; `0` is not automatically time zero). Verify actual KeyframeMarkers and callback when Studio is available; a marker alone never deals damage.

## QA gates
- **G1 Geometry:** Visual match, evaluated tris within budget, material/topology checks.
- **G2 Rig:** Correct hierarchy/pivots, every deforming vertex weighted, base stability, deformation test.
- **G3 Animation:** Each requested Action independently verified for duration, loop and motion.
- **G4 FBX:** All required files exist; rig and every clip reimport correctly.
- **G5 Studio (if requested):** Matching full Pose paths, populated keyframes, real playback.
- **G6 Moon (if requested/available):** Real import/open, keyframe edit and playback.

Fix failures and rerun affected gates. Report unavailable external tests as `NOT TESTED` and never label a required-but-untested gate `PASS` or call the asset production-verified.

## Efficient handoff
Reuse scripts and rig; adding an animation must not rebuild the model. Emit only artifact paths, actual tris/mesh/bone counts, clips, gate statuses, blockers and next action. Avoid verbose logs, unnecessary research and unrelated features.
