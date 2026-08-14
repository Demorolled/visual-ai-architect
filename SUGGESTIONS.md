# Visual AI Architect — Improvement Suggestions

Generated: 2026-06-19
Session: 600+ Design Batch Generation with Davinci GUI Pipeline Testing

---

## Architecture Improvements

### 1. [HIGH] Add Design Deduplication at Load Time
Currently, designs are deduplicated by name during generation, but the JSON file
can still grow stale. Add a startup check to the Architect backend that warns if
duplicate names exist in designs.json.

### 2. [HIGH] Implement WebSocket Health Check in Davinci Bridge
The pushFullDesign() function silently fails when the WebSocket to Davinci Studio
is disconnected. The export route calls it via setImmediate and catches errors,
but the user gets no feedback. Add:
- A WebSocket health endpoint: GET /api/bridge/health
- A status indicator in the Architect UI showing if Davinci is connected
- Retry logic with 3 attempts before silent failure

### 3. [MEDIUM] Decouple Widget Generation from Design Storage
Currently, widget generation (gen_widgets) uses static templates that don't
reflect the actual node content. To make each design unique:
- Store a `suggestedWidgets` array directly in each design's nodes (in designs.json)
- The Davinci bridge should read widgets from the design contract rather than
  generating them anew on each push
- This would produce design-specific widgets (e.g., "Sorting Visualizer" gets
  "Run Sort", "Compare Results" instead of generic "Run", "Display")

### 4. [MEDIUM] Add Scoped Auto-Learn Events
The auto-learn system records all interactions globally. Add category scoping
so the ML model can learn category-specific patterns. E.g., game designs follow
different node patterns than database designs.

### 5. [MEDIUM] Batch Processing Queue
The current pipeline processes designs sequentially (test 1 → cleanup → test 2).
Add a small batch queue that:
- Pushes up to 3 builds to Davinci at once
- Waits for all to be applied
- Verifies all simultaneously
- Cleans up once
This would speed up batch testing by 2-3x.

## Design Quality Improvements

### 6. [MEDIUM] Dynamic Node Generation Per Design
Currently, all designs in a category share the same node template
(5 nodes: input, logic, database, logic, ui). This limits design diversity.
Generate nodes dynamically based on the goal:
- A "game" with AI → add an additional "AI" node
- A "database" design → add "index" and "query optimizer" nodes
- A "networking" design → add "protocol handler" node

### 7. [LOW] Add Design Rating Metadata
Add a `rating` field to each design (1-5 stars) based on:
- Node count (more nodes = more complex = higher rating)
- Edge count
- Tag relevance to category
This helps users discover the most comprehensive designs.

### 8. [LOW] Generated Node Descriptions Could Be More Specific
The node descriptions use generic text like "algorithm configuration and input
parameters" for all fundamentals designs. Generate descriptions from the design
goal: "Sorting algorithm configuration with speed and data type selection".

## Davinci Integration Improvements

### 9. [HIGH] Add GUI Widget Verification Endpoint
Add a GET /api/bridge/widget-verification endpoint that returns detailed
widget info: types, labels, positions, arch bindings. The test suite currently
only checks widget COUNT not QUALITY. This endpoint would allow verifying:
- Correct widget types per design category
- Widget labels match expected patterns
- No overlapping widgets

### 10. [MEDIUM] Canvas State Persistence
The canvas_cleanup() function clears all widgets. After a batch test completes,
the last design's widgets are lost. Add a --persist flag to the pipeline that
skips cleanup so users can visually inspect the final design's GUI.

### 11. [LOW] Davinci Frontend Auto-Refresh
When a new build is pushed during batch testing, the Davinci frontend polls
every 5 seconds. Add immediate push notifications via SSE so the UI updates
instantly when builds arrive.

## Testing Infrastructure

### 12. [MEDIUM] Add --dry-run Flag to Pipeline
Add a --dry-run flag that generates designs and writes them to designs.json
but skips the Davinci test. Useful for rapid generation without the test overhead.

### 13. [LOW] Add Test Coverage Report
Generate an HTML report after each batch run showing:
- Pass/fail per design
- Widget count vs expected
- Category summary
- Links to bible reference files

### 14. [LOW] Progress Bar for Large Batches
Add a progress bar (tqdm or similar) when testing batches of 100+ designs.
Currently prints one line per design which can be overwhelming.

## Bible Reference Improvements

### 15. [MEDIUM] Auto-Generate Category Index Files
The 00-index.md files in each bible-designs directory should be auto-generated
with a table of contents linking to each design file. Currently they must be
manually maintained.

### 16. [LOW] Add Design Preview Images
Generate PNG screenshots of the architect node layout for each design.
This would make the bible-reference catalog visually browsable.

---

## Summary

Priority order for next sprint:
1. WebSocket health check (#2)
2. Decouple widget generation (#3)
3. Scoped auto-learn events (#4)
4. GUI widget verification endpoint (#9)
5. Dynamic node generation (#6)

Total suggestions: 16
