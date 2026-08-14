# VACA Campaign 50 — Mechanical Repair Log

## Root cause

`import * from './x.ts'` is emitted by `buildImportStatement()` in
`backend/src/layers/fileGenerator.ts` when a dependency has no detected exports.
`import * from` is not valid TypeScript (TS1005). The generator is now fixed to
emit a side-effect import (`import './x.ts'`); this pass applies the same fix to
already-generated artifacts, and strips `.ts`/`.js` suffixes from relative import
specifiers so projects compile under the generated tsconfig.

**Total files repaired across 50 builds: 254**

### Countdown Timer
- `index.ts`
- `src/countdown-engine/countdown-engine.ts`
- `src/state-store/state-store.ts`
- `src/timer-ui/timer-ui.ts`
- `src/alarm-handler/alarm-handler.ts`

### Todo List
- `index.ts`
- `src/task-store/task-store.ts`
- `src/task-ui/task-ui.ts`
- `src/task-manager/task-manager.ts`
- `src/filter-engine/filter-engine.ts`

### Unit Converter
- `index.ts`
- `src/converter-ui/converter-ui.ts`
- `src/swap-handler/swap-handler.ts`
- `src/history-store/history-store.ts`
- `src/conversion-engine/conversion-engine.ts`

### Random Quote Generator
- `index.ts`
- `src/share-actions/share-actions.ts`
- `src/quote-ui/quote-ui.ts`
- `src/category-filter/category-filter.ts`
- `src/picker-engine/picker-engine.ts`

### Color Palette Generator
- `index.ts`
- `src/palette-store/palette-store.ts`
- `src/palette-engine/palette-engine.ts`
- `src/palette-ui/palette-ui.ts`
- `src/copy-handler/copy-handler.ts`

### Memory Card Game
- `index.ts`
- `src/score-tracker/score-tracker.ts`
- `src/match-engine/match-engine.ts`
- `src/game-state/game-state.ts`
- `src/game-ui/game-ui.ts`

### Stopwatch
- `index.ts`
- `src/lap-store/lap-store.ts`
- `src/stopwatch-ui/stopwatch-ui.ts`
- `src/lap-analyzer/lap-analyzer.ts`
- `src/time-engine/time-engine.ts`

### Calculator
- `index.ts`
- `src/format-handler/format-handler.ts`
- `src/calc-ui/calc-ui.ts`
- `src/display-state/display-state.ts`
- `src/calc-engine/calc-engine.ts`

### Word Counter
- `index.ts`
- `src/analysis-engine/analysis-engine.ts`
- `src/stats-store/stats-store.ts`
- `src/stats-ui/stats-ui.ts`
- `src/read-time-calc/read-time-calc.ts`

### Simple Quiz
- `index.ts`
- `src/result-calc/result-calc.ts`
- `src/quiz-ui/quiz-ui.ts`
- `src/quiz-engine/quiz-engine.ts`
- `src/question-store/question-store.ts`

### Expense Tracker
- `index.ts`
- `src/ledger-store/ledger-store.ts`
- `src/aggregate-engine/aggregate-engine.ts`
- `src/ledger-engine/ledger-engine.ts`
- `src/chart-renderer/chart-renderer.ts`
- `src/expense-ui/expense-ui.ts`

### Habit Tracker
- `index.ts`
- `src/habit-ui/habit-ui.ts`
- `src/heatmap-builder/heatmap-builder.ts`
- `src/streak-engine/streak-engine.ts`
- `src/habit-store/habit-store.ts`

### Pomodoro Timer
- `index.ts`
- `src/session-store/session-store.ts`
- `src/pomodoro-engine/pomodoro-engine.ts`
- `src/stats-engine/stats-engine.ts`
- `src/timer-ui/timer-ui.ts`

### Markdown Previewer
- `index.ts`
- `src/markdown-parser/markdown-parser.ts`
- `src/export-handler/export-handler.ts`
- `src/preview-ui/preview-ui.ts`
- `src/doc-store/doc-store.ts`

### Weather Widget
- `index.ts`
- `src/unit-converter/unit-converter.ts`
- `src/weather-engine/weather-engine.ts`
- `src/weather-ui/weather-ui.ts`
- `src/weather-store/weather-store.ts`

### Typing Speed Test
- `index.ts`
- `src/typing-ui/typing-ui.ts`
- `src/metric-engine/metric-engine.ts`
- `src/result-store/result-store.ts`
- `src/input-tracker/input-tracker.ts`

### Sketch Pad
- `index.ts`
- `src/canvas-ui/canvas-ui.ts`
- `src/export-handler/export-handler.ts`
- `src/stroke-engine/stroke-engine.ts`
- `src/history-store/history-store.ts`

### Password Generator
- `index.ts`
- `src/strength-analyzer/strength-analyzer.ts`
- `src/generator-engine/generator-engine.ts`
- `src/generator-ui/generator-ui.ts`
- `src/history-store/history-store.ts`

### Flashcard Study App
- `index.ts`
- `src/study-ui/study-ui.ts`
- `src/review-engine/review-engine.ts`
- `src/card-store/card-store.ts`
- `src/stats-engine/stats-engine.ts`

### BMI & Health Calculator
- `index.ts`
- `src/health-ui/health-ui.ts`
- `src/range-calc/range-calc.ts`
- `src/bmi-engine/bmi-engine.ts`
- `src/category-map/category-map.ts`

### Sudoku Solver
- `index.ts`
- `src/validator/validator.ts`
- `src/solver-ui/solver-ui.ts`
- `src/solver-engine/solver-engine.ts`
- `src/board-store/board-store.ts`

### Recipe Manager
- `index.ts`
- `src/recipe-ui/recipe-ui.ts`
- `src/search-engine/search-engine.ts`
- `src/recipe-store/recipe-store.ts`
- `src/scaling-engine/scaling-engine.ts`

### Connect Four
- `index.ts`
- `src/board-engine/board-engine.ts`
- `src/game-ui/game-ui.ts`
- `src/ai-opponent/ai-opponent.ts`
- `src/match-store/match-store.ts`

### URL Shortener (Local)
- `index.ts`
- `src/link-store/link-store.ts`
- `src/code-generator/code-generator.ts`
- `src/shortener-ui/shortener-ui.ts`
- `src/stats-engine/stats-engine.ts`

### Music Player
- `index.ts`
- `src/audio-engine/audio-engine.ts`
- `src/player-ui/player-ui.ts`
- `src/visualizer/visualizer.ts`
- `src/playlist-store/playlist-store.ts`

### Kanban Board
- `index.ts`
- `src/filter-engine/filter-engine.ts`
- `src/drag-engine/drag-engine.ts`
- `src/board-store/board-store.ts`
- `src/card-sorter/card-sorter.ts`
- `src/kanban-ui/kanban-ui.ts`

### Chat Simulator
- `index.ts`
- `src/chat-ui/chat-ui.ts`
- `src/bot-engine/bot-engine.ts`
- `src/chat-store/chat-store.ts`
- `src/command-parser/command-parser.ts`

### Finance Dashboard
- `index.ts`
- `src/budget-monitor/budget-monitor.ts`
- `src/aggregation-engine/aggregation-engine.ts`
- `src/chart-builder/chart-builder.ts`
- `src/ledger-store/ledger-store.ts`
- `src/dashboard-ui/dashboard-ui.ts`

### Text Adventure Engine
- `index.ts`
- `src/adventure-ui/adventure-ui.ts`
- `src/scene-engine/scene-engine.ts`
- `src/world-store/world-store.ts`
- `src/parser/parser.ts`

### Data Visualization Studio
- `index.ts`
- `src/studio-ui/studio-ui.ts`
- `src/style-mapper/style-mapper.ts`
- `src/export-handler/export-handler.ts`
- `src/dataset-store/dataset-store.ts`
- `src/chart-engine/chart-engine.ts`

### Task Automation Builder
- `index.ts`
- `src/rule-engine/rule-engine.ts`
- `src/rule-store/rule-store.ts`
- `src/automation-ui/automation-ui.ts`
- `src/simulator/simulator.ts`

### Interactive Map Explorer
- `index.ts`
- `src/region-engine/region-engine.ts`
- `src/map-ui/map-ui.ts`
- `src/region-store/region-store.ts`
- `src/quiz-engine/quiz-engine.ts`

### Music Synth Workstation
- `index.ts`
- `src/patch-store/patch-store.ts`
- `src/sequencer/sequencer.ts`
- `src/synth-engine/synth-engine.ts`
- `src/synth-ui/synth-ui.ts`

### Inventory Manager
- `index.ts`
- `src/stock-engine/stock-engine.ts`
- `src/inventory-ui/inventory-ui.ts`
- `src/inventory-store/inventory-store.ts`
- `src/report-builder/report-builder.ts`

### Workout Tracker
- `index.ts`
- `src/workout-store/workout-store.ts`
- `src/workout-ui/workout-ui.ts`
- `src/volume-engine/volume-engine.ts`
- `src/progress-builder/progress-builder.ts`

### PDF & Text Toolkit
- `index.ts`
- `src/text-engine/text-engine.ts`
- `src/diff-renderer/diff-renderer.ts`
- `src/tool-state/tool-state.ts`
- `src/toolkit-ui/toolkit-ui.ts`

### Pathfinding Visualizer
- `index.ts`
- `src/visualizer-ui/visualizer-ui.ts`
- `src/maze-generator/maze-generator.ts`
- `src/search-engine/search-engine.ts`
- `src/grid-store/grid-store.ts`

### Budget Planner
- `index.ts`
- `src/budget-ui/budget-ui.ts`
- `src/forecast-engine/forecast-engine.ts`
- `src/envelope-engine/envelope-engine.ts`
- `src/budget-store/budget-store.ts`

### Image Editor Lite
- `index.ts`
- `src/crop-tool/crop-tool.ts`
- `src/editor-ui/editor-ui.ts`
- `src/filter-engine/filter-engine.ts`
- `src/edit-state/edit-state.ts`

### Task Scheduler
- `index.ts`
- `src/schedule-store/schedule-store.ts`
- `src/conflict-analyzer/conflict-analyzer.ts`
- `src/scheduler-ui/scheduler-ui.ts`
- `src/schedule-engine/schedule-engine.ts`

### Escape Room Puzzle
- `index.ts`
- `src/puzzle-engine/puzzle-engine.ts`
- `src/hint-system/hint-system.ts`
- `src/game-state/game-state.ts`
- `src/game-ui/game-ui.ts`

### Network Speed Test (Local)
- `index.ts`
- `src/chart-builder/chart-builder.ts`
- `src/benchmark-engine/benchmark-engine.ts`
- `src/speed-test-ui/speed-test-ui.ts`
- `src/result-store/result-store.ts`

### Documentation Site Builder
- `index.ts`
- `src/render-engine/render-engine.ts`
- `src/search-engine/search-engine.ts`
- `src/site-ui/site-ui.ts`
- `src/doc-store/doc-store.ts`

### Language Learning App
- `index.ts`
- `src/tts-handler/tts-handler.ts`
- `src/learning-ui/learning-ui.ts`
- `src/lesson-engine/lesson-engine.ts`
- `src/vocab-store/vocab-store.ts`

### Smart Home Dashboard
- `index.ts`
- `src/home-ui/home-ui.ts`
- `src/home-store/home-store.ts`
- `src/device-engine/device-engine.ts`
- `src/energy-estimator/energy-estimator.ts`

### Code Snippet Manager
- `index.ts`
- `src/snippet-ui/snippet-ui.ts`
- `src/snippet-store/snippet-store.ts`
- `src/search-engine/search-engine.ts`
- `src/highlight-engine/highlight-engine.ts`

### Survey Builder & Analyzer
- `index.ts`
- `src/analytics-engine/analytics-engine.ts`
- `src/response-engine/response-engine.ts`
- `src/survey-store/survey-store.ts`
- `src/survey-ui/survey-ui.ts`

### AI Chat Client
- `index.ts`
- `src/chat-ui/chat-ui.ts`
- `src/markdown-renderer/markdown-renderer.ts`
- `src/conversation-store/conversation-store.ts`
- `src/chat-engine/chat-engine.ts`

### Traffic Simulation
- `index.ts`
- `src/agent-engine/agent-engine.ts`
- `src/sim-state/sim-state.ts`
- `src/sim-ui/sim-ui.ts`
- `src/metrics-engine/metrics-engine.ts`

### Project Planner
- `index.ts`
- `src/planner-ui/planner-ui.ts`
- `src/timeline-engine/timeline-engine.ts`
- `src/critical-path/critical-path.ts`
- `src/plan-store/plan-store.ts`

