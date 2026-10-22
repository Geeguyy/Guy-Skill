# Journey input manifest

`build_journey.py` accepts a JSON object with `title`, optional `description`, and `items`. File paths may be absolute or relative to the manifest. Only listed media is copied. The output must be a new folder, outside source evidence directories.

```json
{
  "title": "Project Atlas — Development Journey",
  "description": "From the first prototype to the current workspace.",
  "items": [
    {
      "file": "screens/first-workspace.png",
      "kind": "screenshot",
      "title": "First working workspace",
      "caption": "The initial editor with a single preview and basic controls.",
      "chapter": "01 · First prototype",
      "timestamp": "2026-10-21T13:00:00Z",
      "time_basis": "event",
      "highlight": true,
      "recovered": false,
      "origins": [
        {"source": "QA run 01 / first-workspace.png", "method": "project-file"}
      ]
    },
    {
      "file": "recordings/timeline-bug.mov",
      "kind": "video",
      "title": "Timeline drag bug",
      "chapter": "02 · Animation iterations",
      "timestamp": "2026-10-22T21:35:58+07:00",
      "time_basis": "filename"
    }
  ]
}
```

`file` is required. `kind` is one of `screenshot`, `render`, `reference`, `video-frame`, or `video`. Do not put standalone source artwork in this list unless the user specifically requests it.

`timestamp` is optional, preferably ISO 8601 with offset or `Z`. Naive dates use `--timezone` and are marked as interpreted in the report. If omitted, the builder uses file modification time and marks `time_basis` as `file-mtime`. Supported supplied bases: `event`, `capture`, `filename`, `commit`, `unknown`. Use the most accurate available source; do not label an inferred date as a recorded capture.

`highlight` marks selected story images; video files are kept separately. Highlight titles and captions should describe visible progress, failures, or comparisons. The builder sorts highlights chronologically, using input order to break equal-time ties. Image count and narrative order are not hardcoded.

`origins` is an optional list of evidence records. Add a source path, canonical GitHub URL, transcript line, event timestamp, or recording/offset where available. `recording` and `offset_seconds` may also be placed on a `video-frame` item. Missing `origins` defaults to the supplied source file. Exact duplicate files retain all origin records and become one archived item. A highlighted duplicate supplies narrative metadata; event/capture chronology takes precedence over file-mtime.

Local archive provenance may include absolute source paths. Review provenance before any external publication; permission to build a local Journey does not authorize uploading private screenshots or transcripts.
