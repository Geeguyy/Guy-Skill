# Recovering development evidence

Read the relevant sections only. Scope sources to the project and the user's requested history.

## Conversation history and temporary files

Use connected thread discovery/read tools when available to identify relevant conversations and attachment paths. Follow established parent/subtask links when they belong to the same project. Local runtime logs can provide additional recoverable image bytes, but their schema and location are environment-specific; inspect actual records rather than assuming a fixed database name.

For a known JSONL transcript or QA log, use:

```bash
python3 scripts/recover_history.py --history /absolute/path/project-session.jsonl --history /absolute/path/browser-proof.jsonl --output /absolute/path/recovered-evidence
```

The helper reads only the explicitly supplied files. It extracts typed image blocks from normal message/tool-result records and explicit `dataUrl`/`previewPng` captures from QA records. It skips inherited compacted history, instructions, arbitrary source-code data URLs, and non-image payloads. It does not execute log content. It writes validated, content-addressed images and a draft manifest with source log/line/event metadata.

Visually classify recovered user attachments: they can be screenshots, reference applications, or source artwork. The draft manifest does not establish their project relevance automatically. Recover surviving attachment originals as well; embedded copies may have been resized. Keep both if their bytes differ.

Search relevant temporary paths promptly because they may disappear. If an original is missing but an embedded copy survives, record that distinction. State missing/unreadable files and do not claim all historical screenshots were permanently saved.

## Local Git history

Establish the repository root and history range. Search tracked image paths, old QA/report directories, tags, and renamed screenshot files. Read history without checking out or running old code. Recover an image from a verified commit/path into a new staging location; do not reset the working tree.

Record repository identity, commit SHA, original path, and recovery method. Treat commit time as `commit` provenance, not capture time. Check actual recovered bytes: Git LFS pointer text is not an image. A deleted path is recoverable only if its blob or LFS object is still available.

## GitHub

Discover connector tools first. Resolve the repository from an explicit URL or verified local remote; list accessible repositories if needed. Keep searches inside that repository and the relevant period.

Useful evidence includes:

- Screenshot files in commits, historical branches, tags, and releases.
- PR descriptions and review threads containing before/after screenshots.
- Issues documenting bugs and UI iterations.
- Workflow artifacts with screenshot or visual-regression outputs.

Fetch full relevant records after search. Prefer exact commit/blob references for files. Use the connector's repository-file/base64 or blob capability for image bytes; its ordinary text fetch may reject binary files. For private GitHub image attachments, use the dedicated download capability if available. Preserve a canonical issue/PR/commit URL as provenance; do not embed expiring signed URLs, credentials, or private logs into a public gallery.

Respect pagination and artifact expiry. A workflow-artifact listing can be incomplete or contain expired artifacts; report gaps and continue with surviving sources. Do not rerun workflows, create issues, push code, or publish the archive merely to collect historical evidence.

If the user asks to store the reusable skill on GitHub, publish only the reviewed skill code/templates/instructions. Keep project screenshots, transcripts, local usernames, and private provenance out of the skill package. Establish the target repository and branch/PR workflow from user instructions before writing.

## Recordings

Copy surviving original recordings. Reuse previously extracted stills when their source is known. Extract additional representative frames with an available trusted media tool only when they add useful milestones or bug context. Record offsets in seconds. Avoid turning every frame into a separate image; the recording preserves the full interaction.

An extracted still is evidence of the recording, not an independent screenshot. Do not edit out a failure state to imply an improvement. If extraction fails, retain the recording and document the limit.
