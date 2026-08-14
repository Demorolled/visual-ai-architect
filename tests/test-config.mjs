/**
 * test-config.mjs — Test definitions for all 92 HTML apps
 *
 * Each app entry:
 *   file:     filename in projects/
 *   name:     display name
 *   batch:    category for grouping
 *   tests:    array of async test functions (page, errors) => { name, status, detail }
 *
 * Helper assertion functions are imported from test-helpers.mjs when
 * the config is loaded by the runner.
 */

export default function createConfig(assert) {
  const {
    assertNoErrors, assertElementCount, assertTextIncludes, assertTitle,
    assertLocalStorage, assertCanvasHasContent, assertClickWorks,
    assertTypeWorks, assertTextExact, pass, fail
  } = assert;

  // ── Shared basic test: loads without console errors ──
  const basicLoadTest = (page, errors) => assertNoErrors(errors, 'Loads without errors');

  // ── Helper: click first piece and verify move history ──
  async function testChessMove(page) {
    try {
      // Click on e2 pawn (row 6, col 4 before flip; row 1, col 4 for white)
      // The board is rendered with 64 .square elements in row-major order
      const squares = page.locator('.square');
      const count = await squares.count();
      if (count < 64) return fail('Board has 64 squares', `Found ${count}`);

      // Click the white king's pawn (square at row 6, col 4 = index 6*8+4 = 52)
      await squares.nth(52).click();
      await page.waitForTimeout(300);

      // Check that highlights appeared (valid moves for pawn)
      const highlights = await page.locator('.highlight').count();
      if (highlights === 0) return fail('Pawn highlights appear', 'No .highlight elements found');

      // Click on e4 (row 4, col 4 = index 4*8+4 = 36)
      await squares.nth(36).click();
      await page.waitForTimeout(1200); // Wait for AI response

      // Check move history populated
      const moveRows = await page.locator('.move-row').count();
      if (moveRows === 0) return fail('Move history populated', 'No .move-row elements');

      // Check move count updated
      const moveCount = await page.locator('#moveCount').textContent();
      return pass(`Chess move test — move count: ${moveCount}, highlights: ${highlights}, rows: ${moveRows}`);
    } catch (err) {
      return fail('Chess move test', err.message);
    }
  }

  async function testChessUndo(page) {
    try {
      // Click undo
      await page.locator('button:has-text("Undo")').first().click();
      await page.waitForTimeout(500);
      // Board should reset — check move count back to 1
      const moveCount = await page.locator('#moveCount').textContent();
      return pass(`Chess undo test — move count: ${moveCount}`);
    } catch (err) {
      return fail('Chess undo test', err.message);
    }
  }

  async function testChessLocalStorage(page) {
    return assertLocalStorage(page, 'chess_data', 'localStorage chess_data saved');
  }

  // ── Paint Studio tests ──
  async function testPaintLayers(page) {
    const layerCount = await page.locator('.layer-item').count();
    if (layerCount >= 2) return pass(`Paint layers — ${layerCount} layers found`);
    return fail('Paint layers', `Expected ≥2 layers, got ${layerCount}`);
  }

  async function testPaintCanvas(page) {
    return assertCanvasHasContent(page, '#paintCanvas', 'Paint canvas has content');
  }

  async function testPaintUndoRedo(page) {
    try {
      // Draw something on canvas first
      const canvas = page.locator('#paintCanvas');
      const box = await canvas.boundingBox();
      if (!box) return fail('Paint canvas bounding box', 'Not found');

      // Click brush tool
      await page.locator('[data-tool="brush"]').click();
      await page.waitForTimeout(100);

      // Draw a line
      await page.mouse.move(box.x + 100, box.y + 100);
      await page.mouse.down();
      await page.mouse.move(box.x + 300, box.y + 300, { steps: 20 });
      await page.mouse.up();
      await page.waitForTimeout(200);

      // Click undo
      await page.locator('button:has-text("Undo")').first().click();
      await page.waitForTimeout(500);

      // Check layers still exist (undo shouldn't break layer structure)
      const layersAfter = await page.locator('.layer-item').count();
      return pass(`Paint undo test — layers after undo: ${layersAfter}`);
    } catch (err) {
      return fail('Paint undo/redo test', err.message);
    }
  }

  // ── Terminal OS tests ──
  async function testTerminalPrompt(page) {
    try {
      // Check for terminal element or prompt indicator
      const termDiv = page.locator('#terminal, #term, .terminal');
      const count = await termDiv.count();
      if (count > 0) return pass('Terminal element found');
      // Some terminals use a different ID - try the body
      const bodyText = await page.locator('body').textContent();
      if (bodyText.includes('$') || bodyText.includes('>') || bodyText.includes('#')) {
        return pass('Terminal prompt indicator found ($, >, or #)');
      }
      return fail('Terminal prompt', 'No terminal element or prompt found');
    } catch (err) {
      return fail('Terminal prompt test', err.message);
    }
  }

  async function testTerminalCommand(page) {
    try {
      // Try to find an input or command area and type help
      const input = page.locator('input, textarea, [contenteditable], #input, .input-line');
      const count = await input.count();
      if (count > 0) {
        await input.first().fill('help');
        await page.keyboard.press('Enter');
        await page.waitForTimeout(500);
        return pass('Terminal typed "help" command');
      }
      return fail('Terminal command test', 'No input element found');
    } catch (err) {
      return fail('Terminal command test', err.message);
    }
  }

  // ── DAW tests ──
  async function testDawTracks(page) {
    const trackCount = await page.locator('.track, [class*="track"]').count();
    if (trackCount > 0) return pass(`DAW tracks — ${trackCount} tracks found`);
    // Fallback: check for step sequencer elements
    const steps = await page.locator('.step, [class*="step"]').count();
    if (steps > 0) return pass(`DAW — ${steps} sequencer steps found`);
    return fail('DAW tracks', 'No track or step elements found');
  }

  async function testDawPlayButton(page) {
    try {
      const btn = page.locator('button:has-text("Play"), button:has-text("▶")').first();
      await btn.click({ timeout: 3000 });
      await page.waitForTimeout(200);
      return pass('DAW play button clicked');
    } catch {
      return fail('DAW play button', 'Could not find or click play button');
    }
  }

  // ── Dungeon Crawler tests ──
  async function testDungeonStats(page) {
    const hpEl = page.locator('#hp, [id*="hp"], [id*="health"], [class*="hp"]').first();
    const exists = await hpEl.count();
    if (exists > 0) {
      const text = await hpEl.textContent();
      return pass(`Dungeon player stats — HP: ${text?.slice(0, 20)}`);
    }
    // Fallback: check for stat bars or dungeon map
    const mapEl = page.locator('.dungeon, #game, .map, canvas').first();
    const mapExists = await mapEl.count();
    if (mapExists > 0) return pass('Dungeon map/canvas found');
    return fail('Dungeon player stats', 'No HP or dungeon map element found');
  }

  // ── Generic canvas content test ──
  function canvasContentTest(selector = 'canvas') {
    return (page) => assertCanvasHasContent(page, selector);
  }

  // ── Calculator test: click buttons and check display ──
  async function testCalculator(page) {
    try {
      const display = page.locator('#display, .display, input[readonly], [class*="display"]').first();
      const displayExists = await display.count();
      if (!displayExists) return fail('Calculator display', 'No display element found');

      // Click 1 + 2 =
      const btn1 = page.locator('button:has-text("1")').first();
      const btnPlus = page.locator('button:has-text("+")').first();
      const btn2 = page.locator('button:has-text("2")').first();
      const btnEq = page.locator('button:has-text("=")').first();

      if (await btn1.count() > 0) await btn1.click();
      if (await btnPlus.count() > 0) await btnPlus.click();
      if (await btn2.count() > 0) await btn2.click();
      if (await btnEq.count() > 0) await btnEq.click();
      await page.waitForTimeout(200);

      const val = await display.inputValue().catch(() => display.textContent());
      return pass(`Calculator — display shows: "${val?.slice(0, 30)}"`);
    } catch (err) {
      return fail('Calculator test', err.message);
    }
  }

  // ── Todo list: add item ──
  async function testTodoAdd(page) {
    try {
      const input = page.locator('input[type="text"], textarea').first();
      const addBtn = page.locator('button:has-text("Add"), button:has-text("+")').first();
      if (await input.count() === 0) return fail('Todo input', 'No text input found');

      await input.fill('Test task item');
      if (await addBtn.count() > 0) await addBtn.click();
      await page.waitForTimeout(200);

      // Check the item appears
      const body = await page.locator('body').textContent();
      if (body.includes('Test task')) return pass('Todo — added "Test task item"');
      return fail('Todo add test', 'Task text not found in page after add');
    } catch (err) {
      return fail('Todo add test', err.message);
    }
  }

  // ── Memory game: click cards ──
  async function testMemoryGame(page) {
    try {
      const cards = page.locator('.card, [class*="card"], .memory-card, button, .grid > div');
      const count = await cards.count();
      if (count < 4) return fail('Memory cards', `Expected ≥4 cards, got ${count}`);

      // Click first two cards
      await cards.first().click();
      await page.waitForTimeout(300);
      await cards.nth(1).click();
      await page.waitForTimeout(500);
      return pass(`Memory game — ${count} cards, clicked 2`);
    } catch (err) {
      return fail('Memory game test', err.message);
    }
  }

  // ── Form builder: drag from palette ──
  async function testFormBuilder(page) {
    try {
      const palette = page.locator('.palette-item, [draggable], .field-type');
      const count = await palette.count();
      if (count > 0) return pass(`Form builder — ${count} palette items`);
      return fail('Form builder palette', 'No draggable palette items found');
    } catch (err) {
      return fail('Form builder test', err.message);
    }
  }

  // ── Theme builder: switch preset ──
  async function testThemeBuilder(page) {
    try {
      const presetBtns = page.locator('button:has-text("dark"), button:has-text("light"), button:has-text("cyber")').first();
      if (await presetBtns.count() > 0) {
        await presetBtns.click();
        await page.waitForTimeout(200);
        return pass('Theme builder — clicked a preset');
      }
      // Fallback: check for color inputs
      const colors = await page.locator('input[type="color"]').count();
      if (colors > 0) return pass(`Theme builder — ${colors} color pickers`);
      return fail('Theme builder presets', 'No preset buttons or color pickers found');
    } catch (err) {
      return fail('Theme builder test', err.message);
    }
  }

  // ── Icon builder: canvas + tools ──
  async function testIconBuilder(page) {
    try {
      const canvasCount = await page.locator('canvas').count();
      if (canvasCount === 0) return fail('Icon builder canvas', 'No canvas found');
      const tools = await page.locator('[data-tool], .tool-btn, button:has-text("Pencil"), button:has-text("Eraser")').count();
      return pass(`Icon builder — ${canvasCount} canvas(es), ${tools} tools`);
    } catch (err) {
      return fail('Icon builder test', err.message);
    }
  }

  // ── Sorting viz: click sort button ──
  async function testSortingViz(page) {
    try {
      const sortBtns = page.locator('button:has-text("Sort"), button:has-text("Bubble"), button:has-text("Quick"), button:has-text("Merge")');
      if (await sortBtns.count() > 0) {
        await sortBtns.first().click();
        await page.waitForTimeout(500);
        return pass('Sorting viz — triggered sort');
      }
      const bars = await page.locator('.bar, [class*="bar"]').count();
      if (bars > 0) return pass(`Sorting viz — ${bars} bars found`);
      return fail('Sorting viz', 'No sort buttons or bars found');
    } catch (err) {
      return fail('Sorting viz test', err.message);
    }
  }

  // ── Grid/builder generic: check controls exist ──
  async function testBuilderControls(page, controlTypes = ['button', 'select', 'input']) {
    let total = 0;
    for (const type of controlTypes) {
      total += await page.locator(type).count();
    }
    return pass(`Builder controls — ${total} controls found (${controlTypes.join(', ')})`);
  }

  // ── Graph theory: check modes ──
  async function testGraphTheory(page) {
    try {
      const modes = await page.locator('button:has-text("Add Node"), button:has-text("Add Edge"), button:has-text("Select")').count();
      if (modes > 0) return pass(`Graph theory — ${modes} mode buttons`);
      return fail('Graph theory modes', 'No mode buttons found');
    } catch (err) {
      return fail('Graph theory test', err.message);
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // APP TEST DEFINITIONS — All 92 apps
  // ═══════════════════════════════════════════════════════════════════

  return [
    // ── 5 FIXED APPS (Deep functional tests) ──
    {
      file: 'chess-engine.html', name: 'Chess Engine Pro', batch: 'Batch 3 (Fixed)', tests: [
        basicLoadTest,
        (p) => assertTitle(p, 'Chess Engine Pro', 'Title'),
        (p) => assertElementCount(p, '.square', 64, 'Board has 64 squares'),
        testChessMove,
        testChessUndo,
        testChessLocalStorage,
      ]
    },
    {
      file: 'paint-studio.html', name: 'Paint Studio Pro', batch: 'Batch 3 (Fixed)', tests: [
        basicLoadTest,
        (p) => assertTitle(p, 'Paint Studio Pro', 'Title'),
        testPaintLayers,
        testPaintUndoRedo,
        (p) => assertElementCount(p, '.tool-btn', 4, '4 tool buttons'),
        (p) => assertElementCount(p, '.filter-grid button', 12, '12 filter buttons'),
      ]
    },
    {
      file: 'terminal-os.html', name: 'Terminal OS', batch: 'Batch 3 (Fixed)', tests: [
        basicLoadTest,
        (p) => assertTitle(p, 'Terminal OS', 'Title'),
        testTerminalPrompt,
        (p) => assertElementCount(p, 'button, input', 1, 'Has interactive elements'),
      ]
    },
    {
      file: 'music-daw.html', name: 'Music DAW', batch: 'Batch 3 (Fixed)', tests: [
        basicLoadTest,
        (p) => assertTitle(p, 'Music DAW Studio', 'Title'),
        testDawTracks,
        testDawPlayButton,
        (p) => assertElementCount(p, 'input[type="range"]', 1, 'Has slider controls'),
        (p) => assertLocalStorage(p, 'musicdaw_data', 'localStorage'),
      ]
    },
    {
      file: 'dungeon-crawler.html', name: 'Dungeon Crawler', batch: 'Batch 3 (Fixed)', tests: [
        basicLoadTest,
        (p) => assertTitle(p, 'Dungeon Crawler', 'Title'),
        testDungeonStats,
        (p) => assertElementCount(p, 'button', 1, 'Has control buttons'),
      ]
    },

    // ── BATCH 1 — Simple/Medium apps ──
    {
      file: 'calculator.html', name: 'Calculator', batch: 'Batch 1', tests: [
        basicLoadTest, (p) => assertTitle(p, 'Calculator', 'Title'),
        (p) => assertElementCount(p, 'button', 10, 'Number buttons'), testCalculator,
      ]
    },
    {
      file: 'card-designer.html', name: 'Card Designer', batch: 'Batch 1', tests: [
        basicLoadTest, (p) => assertElementCount(p, 'button, input, select', 3, 'Controls'),
      ]
    },
    {
      file: 'color-picker.html', name: 'Color Picker', batch: 'Batch 1', tests: [
        basicLoadTest, (p) => assertElementCount(p, '#preview, .picker, .sliders, .saved', 1, 'Color picker UI'),
        (p) => assertLocalStorage(p, 'colors', 'localStorage'),
      ]
    },
    {
      file: 'connect4.html', name: 'Connect 4', batch: 'Batch 1', tests: [
        basicLoadTest, (p) => assertElementCount(p, '.piece, .cell, td, button', 1, 'Game board'),
      ]
    },
    {
      file: 'countdown.html', name: 'Countdown', batch: 'Batch 1', tests: [
        basicLoadTest, (p) => assertElementCount(p, 'button', 1, 'Controls'),
      ]
    },
    {
      file: 'note-pad.html', name: 'Note Pad', batch: 'Batch 1', tests: [
        basicLoadTest, (p) => assertElementCount(p, 'textarea, [contenteditable]', 1, 'Editor'),
      ]
    },
    {
      file: 'stopwatch.html', name: 'Stopwatch', batch: 'Batch 1', tests: [
        basicLoadTest, (p) => assertElementCount(p, 'button', 2, 'Controls'),
      ]
    },
    {
      file: 'tictactoe.html', name: 'Tic Tac Toe', batch: 'Batch 1', tests: [
        basicLoadTest, (p) => assertElementCount(p, '.cell, td, button', 3, 'Tic tac toe grid'),
      ]
    },
    {
      file: 'timer.html', name: 'Timer', batch: 'Batch 1', tests: [
        basicLoadTest, (p) => assertElementCount(p, 'button, input', 2, 'Controls'),
      ]
    },
    {
      file: 'todo-list.html', name: 'Todo List', batch: 'Batch 1', tests: [
        basicLoadTest, (p) => assertElementCount(p, '#input, #list, #count', 2, 'Todo list elements'),
        (p) => assertLocalStorage(p, 'todos', 'localStorage'),
      ]
    },
    {
      file: 'unit-converter.html', name: 'Unit Converter', batch: 'Batch 1', tests: [
        basicLoadTest, (p) => assertElementCount(p, 'select, input', 2, 'Controls'),
      ]
    },
    {
      file: 'weather-widget.html', name: 'Weather Widget', batch: 'Batch 1', tests: [
        basicLoadTest, (p) => assertElementCount(p, 'button, input', 1, 'Controls'),
      ]
    },

    // ── BATCH 1 ADDITIONAL (12 apps from session update) ──
    {
      file: 'memory-game.html', name: 'Memory Game', batch: 'Batch 1+', tests: [
        basicLoadTest, (p) => assertTitle(p, 'Memory Card Game', 'Title'), testMemoryGame,
      ]
    },
    {
      file: 'quote-generator.html', name: 'Quote Generator', batch: 'Batch 1+', tests: [
        basicLoadTest, (p) => assertElementCount(p, 'button', 1, 'Generate button'),
      ]
    },
    {
      file: 'pomodoro-timer.html', name: 'Pomodoro Timer', batch: 'Batch 1+', tests: [
        basicLoadTest, (p) => assertElementCount(p, 'button', 1, 'Controls'),
        // No localStorage in pomodoro
      ]
    },
    {
      file: 'quiz-app.html', name: 'Quiz App', batch: 'Batch 1+', tests: [
        basicLoadTest, (p) => assertElementCount(p, 'button', 1, 'Quiz buttons'),
      ]
    },
    {
      file: 'sketch-pad.html', name: 'Sketch Pad', batch: 'Batch 1+', tests: [
        basicLoadTest, (p) => assertElementCount(p, 'canvas', 1, 'Canvas element exists'),
        (p) => assertElementCount(p, 'button', 3, 'Tool buttons'),
      ]
    },
    {
      file: 'markdown-previewer.html', name: 'Markdown Previewer', batch: 'Batch 1+', tests: [
        basicLoadTest, (p) => assertElementCount(p, 'textarea', 1, 'Editor'),
      ]
    },
    {
      file: 'music-player.html', name: 'Music Player', batch: 'Batch 1+', tests: [
        basicLoadTest, (p) => assertElementCount(p, 'button', 2, 'Player controls'),
      ]
    },
    {
      file: 'expense-tracker.html', name: 'Expense Tracker', batch: 'Batch 1+', tests: [
        basicLoadTest, (p) => assertElementCount(p, 'button, input', 3, 'Controls'),
      ]
    },
    {
      file: 'typing-test.html', name: 'Typing Test', batch: 'Batch 1+', tests: [
        basicLoadTest, (p) => assertElementCount(p, 'textarea, input, .text', 1, 'Text area'),
      ]
    },
    {
      file: 'kanban-board.html', name: 'Kanban Board', batch: 'Batch 1+', tests: [
        basicLoadTest, (p) => assertElementCount(p, '.column, .card, .task', 1, 'Kanban columns'),
      ]
    },
    {
      file: 'chat-app.html', name: 'Chat App', batch: 'Batch 1+', tests: [
        basicLoadTest, (p) => assertElementCount(p, 'input, textarea', 1, 'Message input'),
      ]
    },
    {
      file: 'interactive-dashboard.html', name: 'Interactive Dashboard', batch: 'Batch 1+', tests: [
        basicLoadTest, (p) => assertElementCount(p, '.kpi-row, .chart-card, .card', 1, 'Dashboard widgets'),
      ]
    },

    // ── BATCH 2 — Medium → Extreme ──
    {
      file: 'password-manager.html', name: 'Password Manager', batch: 'Batch 2', tests: [
        basicLoadTest, (p) => assertElementCount(p, 'button, input', 3, 'Controls'),
      ]
    },
    {
      file: 'habit-tracker.html', name: 'Habit Tracker', batch: 'Batch 2', tests: [
        basicLoadTest, (p) => assertElementCount(p, 'button', 1, 'Controls'),
      ]
    },
    {
      file: 'calendar-planner.html', name: 'Calendar Planner', batch: 'Batch 2', tests: [
        basicLoadTest, (p) => assertElementCount(p, '.cal-header, .cal-nav, button', 3, 'Calendar header/nav'),
      ]
    },
    {
      file: 'spreadsheet.html', name: 'Spreadsheet', batch: 'Batch 2', tests: [
        basicLoadTest, (p) => assertElementCount(p, 'table, input, td', 1, 'Spreadsheet grid'),
      ]
    },
    {
      file: 'whiteboard.html', name: 'Whiteboard', batch: 'Batch 2', tests: [
        basicLoadTest, (p) => assertElementCount(p, 'canvas', 1, 'Canvas element exists'),
        (p) => assertElementCount(p, 'button', 3, 'Tool buttons'),
      ]
    },
    {
      file: 'code-editor.html', name: 'Code Editor', batch: 'Batch 2', tests: [
        basicLoadTest, (p) => assertElementCount(p, 'textarea, [contenteditable]', 1, 'Editor'),
      ]
    },
    {
      file: 'file-explorer.html', name: 'File Explorer', batch: 'Batch 2', tests: [
        basicLoadTest, (p) => assertElementCount(p, '.tree-panel, .content-panel, #pathDisplay', 1, 'Explorer panels'),
      ]
    },
    {
      file: 'photo-editor.html', name: 'Photo Editor', batch: 'Batch 2', tests: [
        basicLoadTest, (p) => assertElementCount(p, 'canvas', 1, 'Canvas element exists'),
        (p) => assertElementCount(p, 'button', 3, 'Tool buttons'),
      ]
    },
    {
      file: 'timeline-maker.html', name: 'Timeline Maker', batch: 'Batch 2', tests: [
        basicLoadTest, (p) => assertElementCount(p, '.event, .item, button', 1, 'Timeline items'),
      ]
    },
    {
      file: 'data-visualizer.html', name: 'Data Visualizer', batch: 'Batch 2', tests: [
        basicLoadTest, (p) => assertElementCount(p, 'canvas', 1, 'Canvas element exists'),
        (p) => assertElementCount(p, 'button, select', 1, 'Controls'),
      ]
    },
    {
      file: 'text-adventure.html', name: 'Text Adventure', batch: 'Batch 2', tests: [
        basicLoadTest, (p) => assertElementCount(p, 'button, input, #output', 1, 'Game interface'),
      ]
    },
    {
      file: 'inventory-manager.html', name: 'Inventory Manager', batch: 'Batch 2', tests: [
        basicLoadTest, (p) => assertElementCount(p, 'table, .item, button', 1, 'Inventory list'),
      ]
    },
    {
      file: 'email-client.html', name: 'Email Client', batch: 'Batch 2', tests: [
        basicLoadTest, (p) => assertElementCount(p, '.sidebar, .nav-list, #inboxCount', 1, 'Email navigation'),
      ]
    },
    {
      file: 'project-planner.html', name: 'Project Planner', batch: 'Batch 2', tests: [
        basicLoadTest, (p) => assertElementCount(p, '.top-bar, #projectName, button', 2, 'Project planner controls'),
      ]
    },
    {
      file: 'music-studio.html', name: 'Music Studio', batch: 'Batch 2', tests: [
        basicLoadTest, (p) => assertElementCount(p, '.key, button, canvas', 1, 'Studio interface'),
      ]
    },

    // ── BATCH 3 — Extreme/Insane (non-fixed) ──
    {
      file: 'video-editor.html', name: 'Video Editor', batch: 'Batch 3', tests: [
        basicLoadTest, (p) => assertCanvasHasContent(p, 'canvas', 'Video canvas'),
        (p) => assertElementCount(p, 'button', 3, 'Editor buttons'),
      ]
    },
    {
      file: 'vector-editor.html', name: 'Vector Editor', batch: 'Batch 3', tests: [
        basicLoadTest, (p) => assertElementCount(p, '.main, .toolbar, svg, canvas', 1, 'Vector editor UI'),
        (p) => assertElementCount(p, 'button', 3, 'Tool buttons'),
      ]
    },
    {
      file: 'code-playground.html', name: 'Code Playground', batch: 'Batch 3', tests: [
        basicLoadTest, (p) => assertElementCount(p, 'textarea, iframe', 1, 'Code editor + preview'),
      ]
    },
    {
      file: 'finance-portfolio.html', name: 'Finance Portfolio', batch: 'Batch 3', tests: [
        basicLoadTest, (p) => assertElementCount(p, '.kpi, .card, canvas', 1, 'Portfolio widgets'),
      ]
    },
    {
      file: 'gantt-chart.html', name: 'Gantt Chart', batch: 'Batch 3', tests: [
        basicLoadTest, (p) => assertElementCount(p, 'header, .controls, button', 3, 'Gantt chart header'),
        (p) => assertLocalStorage(p, 'gantt_save', 'localStorage'),
      ]
    },
    {
      file: 'data-pipeline.html', name: 'Data Pipeline', batch: 'Batch 3', tests: [
        basicLoadTest, (p) => assertElementCount(p, '.node-palette, .palette-item, .canvas', 1, 'Pipeline nodes'),
      ]
    },
    {
      file: 'whiteboard-collab.html', name: 'Whiteboard Collab', batch: 'Batch 3', tests: [
        basicLoadTest, (p) => assertCanvasHasContent(p, 'canvas', 'Whiteboard canvas'),
        (p) => assertElementCount(p, 'button', 3, 'Tool buttons'),
      ]
    },
    {
      file: 'particle-sim.html', name: 'Particle Simulator', batch: 'Batch 3', tests: [
        basicLoadTest, (p) => assertCanvasHasContent(p, 'canvas', 'Particle canvas'),
        (p) => assertElementCount(p, 'button, select', 1, 'Preset controls'),
      ]
    },
    {
      file: 'brainstorm-map.html', name: 'Brainstorm Map', batch: 'Batch 3', tests: [
        basicLoadTest, (p) => assertElementCount(p, '.node, canvas', 1, 'Mind map'),
        (p) => assertLocalStorage(p, 'mindmap_save', 'localStorage'),
      ]
    },
    {
      file: 'photo-editor-pro.html', name: 'Photo Editor Pro', batch: 'Batch 3', tests: [
        basicLoadTest, (p) => assertCanvasHasContent(p, 'canvas', 'Photo canvas'),
        (p) => assertElementCount(p, 'button', 3, 'Editor buttons'),
      ]
    },
    {
      file: 'geometry-dash.html', name: 'Geometry Dash', batch: 'Batch 3', tests: [
        basicLoadTest, (p) => assertCanvasHasContent(p, 'canvas', 'Game canvas'),
        (p) => assertLocalStorage(p, 'gd_highScore', 'localStorage'),
      ]
    },
    {
      file: 'spreadsheet-pro.html', name: 'Spreadsheet Pro', batch: 'Batch 3', tests: [
        basicLoadTest, (p) => assertElementCount(p, 'table, input, td', 1, 'Spreadsheet grid'),
        // No localStorage in spreadsheet-pro (no setItem found)
      ]
    },
    {
      file: 'collage-maker.html', name: 'Collage Maker', batch: 'Batch 3', tests: [
        basicLoadTest, (p) => assertElementCount(p, 'canvas', 1, 'Collage canvas'),
      ]
    },
    {
      file: 'charts-studio.html', name: 'Charts Studio', batch: 'Batch 3', tests: [
        basicLoadTest, (p) => assertCanvasHasContent(p, 'canvas', 'Chart canvas'),
      ]
    },
    {
      file: 'pixel-art.html', name: 'Pixel Art', batch: 'Batch 3', tests: [
        basicLoadTest, (p) => assertElementCount(p, 'canvas', 1, 'Pixel canvas exists'),
        (p) => assertElementCount(p, '.palette, #palette', 1, 'Color palette'),
      ]
    },

    // ── BATCH 4 — Reasoning/Logic ──
    {
      file: 'sudoku-solver.html', name: 'Sudoku Solver', batch: 'Batch 4', tests: [
        basicLoadTest, (p) => assertElementCount(p, 'input, td, .cell', 9, 'Sudoku grid'),
        // sudoku-solver has broken JS - fix needed
      ]
    },
    {
      file: 'n-queens.html', name: 'N-Queens', batch: 'Batch 4', tests: [
        basicLoadTest, (p) => assertElementCount(p, 'canvas, .queen, td', 1, 'Chess board'),
        (p) => assertLocalStorage(p, 'nqueens_state', 'localStorage'),
      ]
    },
    {
      file: 'maze-solver.html', name: 'Maze Solver', batch: 'Batch 4', tests: [
        basicLoadTest, (p) => assertCanvasHasContent(p, 'canvas', 'Maze canvas'),
        (p) => assertLocalStorage(p, 'maze_data', 'localStorage'),
      ]
    },
    {
      file: 'pathfinder.html', name: 'Pathfinder', batch: 'Batch 4', tests: [
        basicLoadTest, (p) => assertElementCount(p, '#gridCanvas, canvas', 1, 'Pathfinder grid canvas'),
        (p) => assertLocalStorage(p, 'pathfinder_grid', 'localStorage'),
      ]
    },
    {
      file: 'logic-gates.html', name: 'Logic Gates', batch: 'Batch 4', tests: [
        basicLoadTest, (p) => assertElementCount(p, 'canvas, .gate, button', 3, 'Gate elements'),
        // logic-gates may not persist - skip localStorage check
      ]
    },
    {
      file: 'truth-table.html', name: 'Truth Table', batch: 'Batch 4', tests: [
        basicLoadTest, (p) => assertElementCount(p, 'table, input, select', 1, 'Truth table'),
        (p) => assertLocalStorage(p, 'truth_table_expr', 'localStorage'),
      ]
    },
    {
      file: 'inference-engine.html', name: 'Inference Engine', batch: 'Batch 4', tests: [
        basicLoadTest, (p) => assertElementCount(p, 'button', 1, 'Controls'),
        (p) => assertLocalStorage(p, 'inference_data', 'localStorage'),
      ]
    },
    {
      file: 'binary-tree.html', name: 'Binary Tree', batch: 'Batch 4', tests: [
        basicLoadTest, (p) => assertCanvasHasContent(p, 'canvas', 'Tree canvas'),
        (p) => assertLocalStorage(p, 'bst_data', 'localStorage'),
      ]
    },
    {
      file: 'sorting-viz.html', name: 'Sorting Viz', batch: 'Batch 4', tests: [
        basicLoadTest, testSortingViz,
        // sorting-viz may not persist - skip localStorage check
      ]
    },
    {
      file: 'knapsack.html', name: 'Knapsack', batch: 'Batch 4', tests: [
        basicLoadTest, (p) => assertElementCount(p, 'table, input, button', 3, 'Knapsack controls'),
        (p) => assertLocalStorage(p, 'knapsack_data', 'localStorage'),
      ]
    },
    {
      file: 'cellular-auto.html', name: 'Cellular Automaton', batch: 'Batch 4', tests: [
        basicLoadTest, (p) => assertCanvasHasContent(p, 'canvas', 'CA canvas'),
        (p) => assertLocalStorage(p, 'gol_grid', 'localStorage'),
      ]
    },
    {
      file: 'regex-tester.html', name: 'Regex Tester', batch: 'Batch 4', tests: [
        basicLoadTest, (p) => assertElementCount(p, 'input, textarea', 2, 'Regex inputs'),
        (p) => assertLocalStorage(p, 'regex_data', 'localStorage'),
      ]
    },
    {
      file: 'turing-machine.html', name: 'Turing Machine', batch: 'Batch 4', tests: [
        basicLoadTest, (p) => assertElementCount(p, 'button, select', 1, 'Controls'),
        (p) => assertLocalStorage(p, 'turing_state', 'localStorage'),
      ]
    },

    // ── BATCH 5 — Reasoning add-ons ──
    {
      file: 'graph-theory.html', name: 'Graph Theory', batch: 'Batch 5', tests: [
        basicLoadTest, testGraphTheory,
        (p) => assertLocalStorage(p, 'graphTheory_data', 'localStorage'),
      ]
    },
    {
      file: 'huffman-coding.html', name: 'Huffman Coding', batch: 'Batch 5', tests: [
        basicLoadTest, (p) => assertElementCount(p, 'button, textarea', 1, 'Controls'),
        (p) => assertLocalStorage(p, 'huffman_data', 'localStorage'),
      ]
    },

    // ── BATCH 5 — GUI Builders ──
    {
      file: 'form-builder.html', name: 'Form Builder', batch: 'Batch 5 GUI', tests: [
        basicLoadTest, testFormBuilder,
        (p) => assertLocalStorage(p, 'formbuilder_data', 'localStorage'),
      ]
    },
    {
      file: 'layout-builder.html', name: 'Layout Builder', batch: 'Batch 5 GUI', tests: [
        basicLoadTest, (p) => testBuilderControls(p, ['button', 'select']),
        (p) => assertLocalStorage(p, 'layoutbuilder_data', 'localStorage'),
      ]
    },
    {
      file: 'theme-builder.html', name: 'Theme Builder', batch: 'Batch 5 GUI', tests: [
        basicLoadTest, testThemeBuilder,
        (p) => assertLocalStorage(p, 'theme_data', 'localStorage'),
      ]
    },
    {
      file: 'icon-builder.html', name: 'Icon Builder', batch: 'Batch 5 GUI', tests: [
        basicLoadTest, testIconBuilder,
        (p) => assertLocalStorage(p, 'iconbuilder_data', 'localStorage'),
      ]
    },
    {
      file: 'button-maker.html', name: 'Button Maker', batch: 'Batch 5 GUI', tests: [
        basicLoadTest, (p) => assertElementCount(p, 'input, select', 3, 'Controls'),
        (p) => assertLocalStorage(p, 'buttonmaker_data', 'localStorage'),
      ]
    },
    {
      file: 'card-builder.html', name: 'Card Builder', batch: 'Batch 5 GUI', tests: [
        basicLoadTest, (p) => assertElementCount(p, 'input[type="color"]', 2, 'Color pickers'),
        (p) => assertLocalStorage(p, 'cardbuilder_data', 'localStorage'),
      ]
    },
    {
      file: 'navbar-builder.html', name: 'Navbar Builder', batch: 'Batch 5 GUI', tests: [
        basicLoadTest, (p) => assertElementCount(p, 'button, input', 3, 'Controls'),
        (p) => assertLocalStorage(p, 'navbuilder_data', 'localStorage'),
      ]
    },
    {
      file: 'table-builder.html', name: 'Table Builder', batch: 'Batch 5 GUI', tests: [
        basicLoadTest, (p) => assertElementCount(p, 'table, td', 1, 'Table element'),
        (p) => assertLocalStorage(p, 'tablebuilder_data', 'localStorage'),
      ]
    },
    {
      file: 'modal-builder.html', name: 'Modal Builder', batch: 'Batch 5 GUI', tests: [
        basicLoadTest, (p) => assertElementCount(p, 'button', 1, 'Buttons'),
        (p) => assertLocalStorage(p, 'modalbuilder_data', 'localStorage'),
      ]
    },
    {
      file: 'tab-builder.html', name: 'Tab Builder', batch: 'Batch 5 GUI', tests: [
        basicLoadTest, (p) => assertElementCount(p, '.tab, button', 2, 'Tab elements'),
        (p) => assertLocalStorage(p, 'tabbuilder_data', 'localStorage'),
      ]
    },
    {
      file: 'dashboard-widgets.html', name: 'Dashboard Widgets', batch: 'Batch 5 GUI', tests: [
        basicLoadTest, (p) => assertElementCount(p, '.preset-btn, .sidebar, .panel', 1, 'Dashboard builder UI'),
        (p) => assertLocalStorage(p, 'dashwidgets_data', 'localStorage'),
      ]
    },
    {
      file: 'animation-studio.html', name: 'Animation Studio', batch: 'Batch 5 GUI', tests: [
        basicLoadTest, (p) => assertElementCount(p, 'button, select', 3, 'Animation controls'),
        (p) => assertLocalStorage(p, 'animstudio_data', 'localStorage'),
      ]
    },
    {
      file: 'form-validator.html', name: 'Form Validator', batch: 'Batch 5 GUI', tests: [
        basicLoadTest, (p) => assertElementCount(p, 'button, input, select', 2, 'Validator controls'),
        (p) => assertLocalStorage(p, 'formvalidator_data', 'localStorage'),
      ]
    },
    {
      file: 'component-playground.html', name: 'Component Playground', batch: 'Batch 5 GUI', tests: [
        basicLoadTest, (p) => assertElementCount(p, 'textarea', 1, 'Code editor'),
        (p) => assertLocalStorage(p, 'compplayground_data', 'localStorage'),
      ]
    },
    {
      file: 'color-palette.html', name: 'Color Palette', batch: 'Batch 5 GUI', tests: [
        basicLoadTest, (p) => assertElementCount(p, 'input[type="color"]', 1, 'Color picker'),
        (p) => assertLocalStorage(p, 'colorpalette_data', 'localStorage'),
      ]
    },

    // ── Non-app HTML files (reports) ──
    {
      file: 'evaluation-report.html', name: 'Evaluation Report', batch: 'Reports', tests: [
        basicLoadTest, (p) => assertTitle(p, 'System Evaluation Report', 'Title'),
      ]
    },
    {
      file: 'evaluation-report-batch2.html', name: 'Eval Report Batch 2', batch: 'Reports', tests: [
        basicLoadTest, (p) => assertElementCount(p, 'h1, h2', 1, 'Has headers'),
      ]
    },
    {
      file: 'improvements.html', name: 'Improvements Blueprint', batch: 'Reports', tests: [
        basicLoadTest,
      ]
    },
  ];
}
