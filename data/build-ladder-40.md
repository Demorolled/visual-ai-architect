# Build Ladder — 40 App Builds, Escalating Scale & Complexity

> Purpose: drive 40 real builds through `/api/blueprint/build` (the builder app),
> monitor each, verify the pipeline verdict + runtime, log improvement signals
> (speed / knowledge / complexity), and feed verified outputs into a fine-tune
> training datasheet. Every goal below was verified to route to a real blueprint
> via `/api/blueprint/mockup` (appType + matchScore shown).
>
> Run by: `python3 scripts/run-build-ladder.py --ladder data/build-ladder-40.md`
> Results: `data/build-ladder-results.jsonl` (one JSON object per build).

## Ladder legend

- **Tier** = complexity band (1 = simplest … 5 = most complex)
- **Nodes** ≈ blueprint `architecture_checklist` length (module count)
- Each entry: goal, expected blueprint, match score, tier, expected node count

---

## Tier 1 — Simple CLI / single-purpose utilities (★☆☆☆☆, 2–4 nodes)

| # | Goal | Blueprint (verified) | Score | Nodes |
|---|------|----------------------|:-----:|:-----:|
| 1 | a temperature converter app | unit_converter_3 | 0.57 | ~3 |
| 2 | a password generator app | password_generator | 1.00 | ~4 |
| 3 | a simple calculator app | a_simple_calculator_app | 1.00 | ~3 |
| 4 | a file line counter cli tool | file_encryption_tool | 0.95 | ~3 |
| 5 | a json validator tool | form_validator | 0.60 | ~3 |
| 6 | a task scheduler cli app | task_management_app | 0.80 | ~4 |

## Tier 2 — Small interactive apps (★★☆☆☆, 3–4 nodes)

| # | Goal | Blueprint (verified) | Score | Nodes |
|---|------|----------------------|:-----:|:-----:|
| 7 | a todo list app | todo_list | 1.00 | ~5 |
| 8 | a pomodoro timer app | pomodoro_timer_3 | 1.00 | ~5 |
| 9 | a habit tracker app | habit_tracker_3 | 1.00 | ~5 |
| 10 | a flashcard study app | flashcard_study_tool_2 | 1.00 | ~5 |
| 11 | a quiz app with scoring | quiz_app | 0.98 | ~5 |
| 12 | a notes app with categories | todo_app | 0.59 | ~4 |

## Tier 3 — Medium apps, multiple domains (★★★☆☆, 4–5 nodes)

| # | Goal | Blueprint (verified) | Score | Nodes |
|---|------|----------------------|:-----:|:-----:|
| 13 | a markdown editor app | markdown_editor | 1.00 | ~5 |
| 14 | a budget tracker app | expense_tracker_2 | 0.92 | ~5 |
| 15 | a music player app | music_player | 1.00 | ~5 |
| 16 | a url shortener app | url_shortener | 0.64 | ~6 |
| 17 | a chat app | chat_app | 0.67 | ~5 |
| 18 | a blog cms app | blog_cms | 0.61 | ~5 |
| 19 | an analytics dashboard app | analytics_dashboard | 1.00 | ~5 |
| 20 | a kanban board app | kanban_board | 1.00 | ~5 |

## Tier 4 — Games & visualizers (★★★★☆, 5–6 nodes)

| # | Goal | Blueprint (verified) | Score | Nodes |
|---|------|----------------------|:-----:|:-----:|
| 21 | a 2048 puzzle game | 2048_2 | 0.96 | ~5 |
| 22 | a snake game | snake_game | 0.88 | ~5 |
| 23 | an asteroids arcade game | asteroids_2 | 1.00 | ~5 |
| 24 | a breakout brick breaker game | breakout_2 | 1.00 | ~5 |
| 25 | a tic tac toe game | tic_tac_toe_ultimate | 0.69 | ~5 |
| 26 | a maze generation game | maze_generator_solver | 1.00 | ~5 |
| 27 | a hangman word game | hangman | 1.00 | ~5 |
| 28 | a pong game | pong_game | 0.96 | ~5 |
| 29 | a memory card matching game | memory_card_game | 1.00 | ~5 |
| 30 | a space invaders game | space_invaders_2 | 1.00 | ~5 |

## Tier 5 — Complex systems & full games (★★★★★, 5–7+ nodes)

| # | Goal | Blueprint (verified) | Score | Nodes |
|---|------|----------------------|:-----:|:-----:|
| 31 | a chess game | chess_game_2 | 1.00 | ~6 |
| 32 | classic arcade game void raider | void_raider | 1.00 | ~5 |
| 33 | a sudoku solver app | sudoku_solver_3 | 1.00 | ~5 |
| 34 | a stock portfolio tracker | finance_portfolio | 1.00 | ~6 |
| 35 | a music streaming app | stream-ts | 0.93 | ~6 |
| 36 | an avl tree visualizer | avl_tree_visualizer | 1.00 | ~5 |
| 37 | an ecommerce cart app | ecommerce-go | 0.89 | ~6 |
| 38 | a password manager app | password_manager_2 | 1.00 | ~6 |
| 39 | a realtime chat with rooms app | chat_app | 1.00 | ~5 |
| 40 | a flight booking system | (generic fallback) | — | ~6 |

---

## Escalation rationale

- **Tier 1 → 2**: single-file logic → stateful interactive apps (CRUD, timers).
- **Tier 2 → 3**: CRUD → multi-domain apps (editors, media, dashboards).
- **Tier 3 → 4**: utility apps → real-time games with game loops, input, collision.
- **Tier 4 → 5**: simple games → full games (chess, void raider) + data-heavy
  systems (portfolio, streaming, e-commerce) + algorithmic visualizers (AVL,
  sudoku).

## Measurement per build (harness logs to data/build-ladder-results.jsonl)

- goal, tier, expectedBlueprint, matchedBlueprint, matchScore, matchedBy
- researchInjected (bool), internalKnowledgeInjected (bool)
- durationMs (pipeline total), totalChars, totalFiles
- tsCompileClean, totalErrors, validatedCount, failedCount
- verifiedCapture: { captured, skipped, reasons }
- drift: { modules, files, mismatches }
- dspark tokens consumed (cumulative health delta), requests
- post-build runtime-smoke verdict (when an HTML entry exists)
- repairRounds (from generation, when reported)
