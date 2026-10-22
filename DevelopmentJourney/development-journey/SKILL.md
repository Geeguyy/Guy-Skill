---
name: development-journey
description: "Recover and organize a project's historical screenshots, QA images, and recordings into a chronological development journey with curated highlights, captions, provenance, and an offline gallery. Use for a visual project retrospective or the story of how an app evolved, rather than collecting its source artwork."
---

# Development Journey

Turn surviving development evidence into a visual story: early references, first prototypes, experiments, bugs, iterations, and the latest observed state. Preserve unsuccessful attempts when they explain the journey. Reuse this workflow across projects; do not carry over a previous project's dates, names, image counts, or milestone claims.

## Find the story before copying files

Infer the project, date range, earlier names, and requested destination from the conversation and existing handoffs. Resolve ambiguous names against evidence; report an unresolved alias rather than silently equating two projects.

Start with screenshot-rich locations: QA runs, browser proofs, deliveries, reports, project archives, and user attachments. Inventory counts and sizes before copying. Exclude sprite libraries, texture atlases, generated asset caches, fixtures, dependencies, and copies of entire client builds by default. A source asset shown inside a development screenshot is relevant; the standalone artwork library usually is not.

Look beyond final polished images. Early UI, intermediate layouts, error screenshots, comparisons, and review feedback often explain the product's evolution better. Use known project-related temporary paths and relevant thread history to recover missing images. Do not sweep unrelated conversations or personal folders into the archive.

Read [references/evidence-sources.md](references/evidence-sources.md) when recovering images from conversation logs, Git history, GitHub, or recordings. GitHub is optional: discover the available connector capabilities and use it when a repository is supplied or established by project context. A tagged connector alone does not select a publication destination.

## Establish provenance and chronology

Copy originals without changing bytes. Hash with SHA-256; merge exact duplicates while retaining every origin and recorded event. Keep different resolutions, crops, and rendered poses. Detect the real image format: a file named `.png` may contain JPEG bytes. Correct the copied extension, not the original.

Prefer recorded capture/event time, then a reliable filename timestamp, then file modification time. Record the basis and timezone. A commit date shows when an image entered history, not necessarily when it was captured. Label unknown or inferred times rather than inventing a precise sequence.

Distinguish screenshots, tool previews, video frames, and third-party references. A Blender screenshot is a reference or interoperability test, not the project's own UI. Label video stills with the original recording and offset when known. Never generate substitute historical images or infer a completed feature from a screenshot alone.

## Curate, build, and inspect

Review contact sheets and representative full images. Select a manageable set of highlights that explains actual changes; let the evidence determine the count. Write short captions describing what is visible and why it matters. Keep generic filenames out of the main narrative when a supported title is available.

Prepare a manifest following [references/manifest.md](references/manifest.md). Then run:

```bash
python3 scripts/build_journey.py --manifest /absolute/path/journey-input.json --output /absolute/path/Project-Development-Journey --timezone Asia/Bangkok
```

Resolve the script path relative to this skill. Python 3.9+ and Pillow are needed; check the available runtime before execution. The builder copies only explicitly listed files, refuses an existing output folder, preserves originals, deduplicates by content, and creates:

- `00-START-HERE.html`: offline chronological gallery with filters, search, and full images.
- `00-JOURNEY-OVERVIEW.jpg`: visual overview of selected milestones.
- `01-Story-Highlights/`: numbered exact copies for editing a story or video.
- `02-Journey-Images/`, `03-Videos/`: the complete selected evidence.
- `04-Manifest/`: catalog, captions CSV, origins, and verification report.
- `05-Contact-Sheets/`: contact sheets and preview thumbnails.

Use the bundled gallery as a starting point; adapt titles, captions, and chapters to the project. For an update, create a new archive version using the prior archive plus new evidence rather than replacing historical output.

Verify copied hashes, image readability, highlight ordering, local links, and the absence of excluded asset libraries. Inspect the overview and contact sheets. Inspect the gallery in a permitted browser when available. If local-file navigation is blocked, leave a direct file link and accurately report the checks completed; do not route around browser restrictions or claim a browser render passed.

Deliver the archive folder, gallery link, and an inline overview. Report unique evidence counts separately from thumbnails and highlight copies, where history began, and material recovery gaps. Preserve source files. Uploading the skill or publishing the project's private archive is a separate action whose destination and scope must be established.
