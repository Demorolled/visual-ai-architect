/**
 * VACA narration map — the technical deep-dive spoken aloud when the mouse
 * rests on a headline control.
 *
 * Purpose: during a screen recording of the app, hovering a button explains
 * what that button actually does, end to end: the React handler, the API call,
 * the Express route, and the subsystem behind it. Nothing is drawn on screen —
 * the text is spoken by the app's own voice service.
 *
 * Every entry here was traced through the source, not inferred from the button
 * label. `source` records where the claim came from so it can be re-checked
 * after a refactor.
 *
 * Keys are matched against the live element in this priority order:
 *   data-narration → aria-label → title → visible text → className
 * Each candidate is normalised (lowercased, emoji and punctuation stripped)
 * before lookup, so `match` entries can be written the way a human reads them.
 */

export interface NarrationEntry {
  /** Stable identifier — appears in logs and in docs/narration/*. */
  id: string;
  /** Short title, spoken first so the viewer knows what they are on. */
  title: string;
  /** Where the behaviour is implemented. Spoken only when verbose. */
  source: string;
  /** The spoken deep-dive. */
  text: string;
  /** Alternative match keys (normalised at load). */
  match?: string[];
  /**
   * When set, this entry only matches an element whose className contains this
   * string. Needed because some labels repeat across panels while doing
   * genuinely different things — "Run Tests" in the sandbox tester runs
   * interaction tests inside the preview frame, while "Run Tests" in the live
   * preview panel runs a static validation battery. Matching on the label
   * alone would narrate the wrong one.
   */
  requireClass?: string;
}

export const NARRATION: NarrationEntry[] = [
  // ── Toolbar: the main build pipeline ────────────────────────────────────
  {
    id: 'toolbar.generate',
    title: 'Generate Code',
    source: 'App.tsx handleGenerate → POST /api/generate/:projectId/files',
    match: ['generate code', 'generating'],
    text:
      'Generate Code is the whole per-file generation pipeline. The handler is handleGenerate in App dot t s x. It records the design into the user profile store, fires an auto-learn event, and persists the canvas locally through saveProject. Then it registers the project server side with a POST to api slash projects, and pushes the node and edge graph back in a PUT, including the Tree Mode membership so the backend can build each tree as a separate app. It asks the reasoning model for a plan through POST api slash reason with a fifteen second budget, and that call is advisory only, so a timeout never blocks the build. The real work is POST api slash generate slash project id slash files, the pipeline that routes trivial files to the small fast coders and hard logic to the primary delegator model. Every returned file is written back onto its own node, then fed into the node database and the auto-learn collector, before a roadmap snapshot and a POST to api slash memory slash build. Progress is pushed rather than polled: the Socket dot I O channel mounted at slash w s emits architect progress and generation progress events. If the backend is unreachable it degrades to a three-phase simulated generation rather than failing.',
  },
  {
    id: 'toolbar.build',
    title: 'Build and Preview',
    source: 'App.tsx handleBuild → handleGenerate(true)',
    match: ['build preview', 'building'],
    text:
      'Build and Preview is Generate Code with one argument changed. handleBuild awaits handleGenerate with openFloatingPreview set to true. Every other step is identical: the same project registration, the same planning call, the same per-file generation. The single difference is what happens at the end. Instead of advancing the wizard to the sandbox step, it opens the Floating Preview Window, so you see the rendered application the moment the last file lands. It is the one-click path from a node graph to something you can look at.',
  },
  {
    id: 'toolbar.blueprint',
    title: 'Build from Description',
    source: 'Toolbar onBlueprint → App.tsx setBlueprintDialogOpen → BlueprintBuildDialog',
    match: ['build from description'],
    text:
      'Build from Description opens the Blueprint Build dialog and is the shortest path from an idea to a loaded project. The dialog posts your description to api slash blueprint slash build. On the server that matches your text against the blueprint bible, builds the project graph, and generates the files with the live language model. The response carries a project id and only minimal node data, so the dialog immediately follows up with a GET to api slash projects slash id to fetch the real node positions and data. Those backend nodes map one to one onto React Flow nodes, and importProject persists them and drops the whole architecture onto the canvas. That extra round trip is deliberate: the build response is kept small, and the canvas is hydrated from the canonical stored project rather than from a partial echo.',
  },
  {
    id: 'toolbar.plan',
    title: 'Big Plan Mode',
    source: 'App.tsx onPlan → projectStore.setPlanMode; routes/plans.ts',
    match: ['big plan mode', 'big plan mode on'],
    text:
      'Big Plan Mode flips the whole app from building to designing. It toggles planMode in the project store, and in this mode nothing is generated at all. The node palette offers a single seed node, dropping it opens the type and language window, and the co-pilot reads the resulting graph. The design autosaves as a folder under data slash plans, one folder per project name, containing plan dot m d for humans and graph dot j s o n so the canvas can reload it, through POST api slash plans slash graph. The planned files are then mapped onto real files and folders by POST api slash plans slash map, which is deterministic work with no model call and no training rows. Questions come from POST api slash plans slash cowork, which is purely advisory: it answers two hundred with an empty question list when the model is unavailable, so a failure there can never break the canvas.',
  },
  {
    id: 'toolbar.export',
    title: 'Export',
    source: 'App.tsx handleExport → ExportDialog',
    // Scoped to the toolbar: the project panel in the header has a button
    // labelled "Export" that writes JSON to disk instead of opening this dialog.
    match: ['export'],
    requireClass: 'toolbar-btn',
    text:
      'Export opens the Export dialog. It does not write anything itself. The dialog owns the two real steps: generating whatever code is still missing, and scaffolding the project onto disk at a path you choose. Keeping export behind a dialog means the destructive part, writing files to your machine, only happens after an explicit second confirmation.',
  },
  {
    id: 'toolbar.clear',
    title: 'Clear',
    source: 'App.tsx handleClear → clearProject',
    match: ['clear'],
    text:
      'Clear empties the canvas. It asks for confirmation first, because the action is destructive, and only on confirmation does it call clearProject and return the wizard to its opening step. The stored project in local storage is cleared with it. This is the one toolbar button with no undo.',
  },
  {
    id: 'toolbar.os',
    title: 'Target OS',
    source: 'Toolbar setTargetOS → projectStore.targetOS',
    match: ['windows', 'mac', 'ios', 'linux'],
    text:
      'These four buttons choose the target operating system. The choice is stored once in the project store and then travels with every request that cares about it: project creation, the blueprint build, and the exported scaffold all read the same field. Downstream, the generator and the scaffold generator use it to pick platform appropriate entry points, file names and packaging, instead of emitting generic code.',
  },

  // ── Header: navigation and workspace ────────────────────────────────────
  {
    id: 'header.new-design',
    title: 'New Design',
    source: 'App.tsx → setWizardStep(welcome)',
    match: ['new design'],
    text:
      'New Design returns you to the project wizard at its first step. It is navigation, not destruction: it moves the wizard back to welcome so you can describe a new application, and it deliberately does not touch the canvas. Clearing the canvas is the separate Clear button. The split matters, because those two actions used to be entangled, which made it easy to lose a design by trying to start a new one.',
  },
  {
    id: 'header.library',
    title: 'Library',
    source: 'App.tsx setLibraryOpen → ReferenceLibrary.tsx',
    match: ['library'],
    text:
      'Library toggles the Reference Library panel, a side panel of saved reference material you can draw on while designing. It is a pure view toggle: it holds no build state and does not talk to the generator. Its value in the workflow is that a design decision can be checked against prior art without leaving the canvas.',
  },
  {
    id: 'header.preview',
    title: 'Preview',
    source: 'App.tsx setFloatingPreviewOpen → FloatingPreviewWindow.tsx',
    match: ['preview'],
    text:
      'Preview toggles the Floating Preview Window, the same window that Build and Preview opens automatically. It exists as its own button so the running interface can be pulled up at any time without re-running generation. The window renders whatever code currently sits on the nodes, which means it reflects the last generation, not unsaved edits.',
  },
  {
    id: 'header.history',
    title: 'History',
    source: 'App.tsx setHistoryOpen → ProjectHistory.tsx',
    match: ['history'],
    text:
      'History opens the build history sidebar. Saving a design writes a record of the project with its goal, node list and roadmap, and this panel reads that record back out. It is the project equivalent of a commit log: it lets you see what you built, in what order, without opening each project.',
  },
  {
    id: 'header.help',
    title: 'Help',
    source: 'App.tsx setHelpOpen → HelpPanel.tsx',
    match: ['help'],
    text:
      'Help opens the user manual panel inside the app. It documents the workflow, the node types and the shortcuts, and it is shipped with the build rather than linking out, so the instructions are available offline and always match the version you are running.',
  },
  {
    id: 'header.logout',
    title: 'Logout',
    source: 'App.tsx handleLogout',
    match: ['logout'],
    text:
      'Logout clears the locally stored user name and reloads the window, which returns the app to the name prompt. The identity is deliberately local: the name is used to label your workspace and to scope the profile that personalises generation, and it is not an authenticated account, so nothing server side is revoked and no session token exists to expire.',
  },

  // ── Blueprint dialog ────────────────────────────────────────────────────
  {
    id: 'blueprint.preview-gui',
    title: 'Preview GUI First',
    source: 'BlueprintBuildDialog handlePreview → POST /api/blueprint/mockup',
    match: ['preview gui first'],
    text:
      'Preview GUI First renders what the interface should look like before a single line of code exists. It posts your description to api slash blueprint slash mockup with the target system, language, theme and layout. That endpoint is deterministic and makes no model call: it matches the description against the blueprint bible and returns the inferred app type, the module list, a match score, and the mockup as both an image and fallback HTML. Getting the shape of the interface settled first is what stops the generator from committing to an architecture that does not fit the screen you had in mind.',
  },
  {
    id: 'blueprint.build-load',
    title: 'Build and Load into Canvas',
    source: 'BlueprintBuildDialog handleBuild → POST /api/blueprint/build + GET /api/projects/:id',
    match: ['build load into canvas'],
    text:
      'Build and Load into Canvas is the full blueprint build. It posts the goal to api slash blueprint slash build along with the target system, language and optional app type, and with skip validation when fast mode is on. The server matches the blueprint bible, assembles the project graph, and generates the files with the live model. The response is intentionally thin, so the dialog then fetches the full project through GET api slash projects slash id, converts each stored node into a React Flow node, and hands the result to importProject, which saves it and loads it onto the canvas. Fast mode trades validation passes for speed, which is the right call while you are still exploring the design.',
  },
  {
    id: 'blueprint.looks-good',
    title: 'Looks Good, Generate the Code',
    source: 'BlueprintBuildDialog handleBuild (preview phase)',
    match: ['looks good generate the code'],
    text:
      'Looks Good, Generate the Code is the second half of the mockup-first flow. You have seen the rendered interface, and this accepts it and runs the same blueprint build that the form phase offers: match the bible, build the graph, generate the files, then fetch and load the full project onto the canvas. Accepting the mockup does not regenerate it, so what you approved is what gets built.',
  },
  {
    id: 'blueprint.regenerate-missing',
    title: 'Regenerate Missing Modules',
    source: 'BlueprintBuildDialog handleRegenerateMissing → POST /api/generate/:projectId/file/:nodeId',
    // The label embeds the missing-module count, so the count-free forms are
    // matched too — otherwise the entry only works when there is nothing to do.
    match: ['regenerate', 'regenerating', 're generating', 'regenerate missing modules'],
    text:
      'Regenerate Missing Modules repairs drift between what the build promised and what it delivered. The drift report lists the modules that were described but never produced a file. This maps each missing module back to its backend node through the project record, re-generates only that node using the single-file endpoint, and updates both the canvas node and the drift state. Nothing else is touched, which is the point: a partial failure is repaired without discarding the files that were already correct.',
  },
  // ── Export dialog ───────────────────────────────────────────────────────
  {
    id: 'export.generate-code',
    title: 'Generate Code First',
    source: 'ExportDialog handleGenerate → ensureServerProject + POST /api/generate/:projectId/files',
    match: ['generate code first'],
    text:
      'Generate Code First fills in whatever the canvas is missing before any files are written. It reads the current project id, and then calls ensureServerProject before doing anything else. That helper exists for a specific failure: the backend keeps projects in memory, so a server restart wipes its registry and leaves the stored id stale, and every later call would fail with a not found error. The helper pushes the current graph to the stored id, and if that returns four oh four it re-registers the project from the canvas state and stores the fresh id. Only then does it call the per-file generation endpoint, write each returned file back onto its node, and fill the per-node status chips that show which files validated.',
  },
  {
    id: 'export.build-app',
    title: 'Build App',
    source: 'ExportDialog handleBuild → POST /api/export/:projectId/per-file-scaffold',
    match: ['build app'],
    text:
      'Build App writes the project to disk. It re-registers the project through ensureServerProject for the same reason generation does, then calls api slash export slash project id slash per-file-scaffold with the app name, the target system and your chosen output directory. The server lays out the project files at that path and returns the file list. If the requested directory cannot be used, the response carries a warning and a fallback path rather than failing, and the dialog surfaces that path change instead of silently writing somewhere else. Before you get here, the path is validated up front by a separate writability check, so a permission problem is caught before a long build, not after it.',
  },
  {
    id: 'export.open-folder',
    title: 'Open Folder',
    source: 'ExportDialog handleOpenFolder → POST /api/export/open-folder',
    match: ['open folder', 'copy path'],
    text:
      'Open Folder hands the finished build to your file manager. It posts the output path to api slash export slash open folder and the backend invokes the desktop open command. The adjacent button copies the same path to the clipboard, which is usually what you want when the next step is a terminal rather than a file browser. The identical action appears on the blueprint result screen after a build from description.',
  },

  // ── Sandbox tester ──────────────────────────────────────────────────────
  {
    id: 'sandbox.refresh',
    title: 'Refresh',
    source: 'SandboxPreview handleRefresh → handleGeneratePreview',
    match: ['refresh'],
    text:
      'Refresh rebuilds the sandbox preview from the code currently on the nodes. It runs the preview generation path again and reloads the sandbox frame, so the preview you are testing matches the latest generation rather than the previous one. Use it after regenerating a file instead of reopening the app.',
  },
  {
    id: 'sandbox.run-tests',
    title: 'Run Tests',
    source: 'SandboxPreview handleRunTests → postMessage(run-sandbox-tests)',
    // Keyed on the title attribute, not the label: the live preview panel has a
    // button with the identical label that does something else entirely.
    match: ['run interaction tests'],
    text:
      'Run Tests drives the interaction test harness inside the sandbox. It posts a run sandbox tests message into the preview iframe, and the harness that ships with the generated preview exercises the interface from inside and reports back through the same channel. Testing in the frame rather than from the host is what lets it click real controls and read real state, and the timestamp of the last run is recorded so a stale result is never mistaken for a fresh one.',
  },
  {
    id: 'sandbox.start-container',
    title: 'Start Container',
    source: 'SandboxPreview handleStartDockerService → POST /api/sandbox/run',
    match: ['start container', 'restart'],
    text:
      'Start Container runs the generated app in Docker. It saves the project first, then posts the project id to api slash sandbox slash run along with the generated code for every non-master node. That inline code is a deliberate fallback: if the backend has lost the project registry, for example after a restart, the sandbox can still build from the code in the request instead of failing. The endpoint returns a container id and a status of starting or building, and the panel then polls the run endpoint for status, logs and finally the URL to open.',
  },
  {
    id: 'sandbox.start-all',
    title: 'Start All Services',
    source: 'SandboxPreview handleStartCompose → POST /api/sandbox/compose',
    match: ['start all services', 'restart stack'],
    text:
      'Start All Services brings up a multi-service stack rather than a single container. It posts the project id to api slash sandbox slash compose, and the endpoint generates the compose topology with one service per component that needs to run separately, then starts them together. The response lists the services and their URLs, and the panel polls the compose endpoint for per-service logs. This is the path for an app with a database and a queue, where a single container would not be a faithful test.',
  },
  {
    id: 'sandbox.approve',
    title: 'Approve and Save',
    source: 'SandboxPreview handleApprove → App.tsx handleApproveAndSave',
    match: ['approve save', 'saving'],
    text:
      'Approve and Save is where a design becomes a reusable artifact and a training sample. It posts the whole design, its goal, node list, edges, positions and generated code, to api slash designs, which is the design library the history panel reads back. It then posts the same design to api slash training slash generate datasheet from design, turning the design into a training datasheet for the model. Along the way it records a positive rating and the node types used into the user profile profile, and records the project as completed in the auto-learn collector. So approving does three things at once: it archives the design, it teaches the system your preferences, and it produces a training row.',
  },

  // ── Live preview panel ──────────────────────────────────────────────────
  {
    id: 'live-preview.generate-all',
    title: 'Generate All',
    source: 'LivePreviewPanel handleGenerate',
    match: ['generate all', 'generating'],
    requireClass: 'lpp-btn',
    text:
      'Generate All produces the per-file output for every node in the graph and holds it in this panel, independently of the wizard. Where the toolbar button advances the whole build flow, this one is scoped to the preview panel: it returns the generated files, their language, their validation state and their errors, and it is the input that the test and fix buttons operate on. It is the fastest loop for iterating on code without leaving the canvas.',
  },
  {
    id: 'live-preview.fix-all',
    title: 'Fix All',
    source: 'LivePreviewPanel handleFixAll → POST /api/generate/validate-and-fix',
    match: ['fix all', 'fixing'],
    text:
      'Fix All runs error correction across every file that failed validation. It filters the generated files down to the ones with errors and no validation, then calls api slash generate slash validate and fix for each, one at a time, with a maximum of three attempts. The endpoint re-runs validation after each attempt and stops when the file passes, so a single stubborn file does not consume the whole budget. Each result is written back onto the file, including the corrected code and the remaining errors, and a per-file report is kept so you can see which attempts succeeded. When the batch finishes the panel switches to the suggestions tab rather than leaving you to hunt for the outcome.',
  },
  {
    id: 'live-preview.run-tests',
    title: 'Run Tests',
    source: 'LivePreviewPanel handleRunTests',
    match: ['run tests', 'testing'],
    requireClass: 'lpp-btn',
    text:
      'Run Tests in this panel is a validation battery over the generated files, not an interaction test. It checks that files exist, that every file passes syntax validation, and that no file carries a critical error, accumulating a named result per check. It runs entirely from the panel state, with no model call, which is why it is instant and why it can be run as often as you like while editing.',
  },
  {
    id: 'live-preview.new-tab',
    title: 'New Tab',
    source: 'LivePreviewPanel → window.open(sitePreviewUrl)',
    match: ['new tab'],
    text:
      'New Tab opens the running site preview in a full browser tab. The panel can only render the app inside an embedded frame, which constrains it to the frame and hides the real browser chrome. Opening the same URL outside gives you a full viewport, working developer tools, and correct behaviour for anything the frame blocks, such as popups or permissions. The Back to Generated button returns the panel to the file view.',
  },

  // ── Reasoning panel: the conversational front door ──────────────────────
  {
    id: 'reasoning.send',
    title: 'Send',
    source: 'ReasoningPanel handleSend → processUserRequest',
    match: ['send'],
    text:
      'Send runs the conversational front door. First it analyses the emotional tone of what you typed and broadcasts the result, which is what drives the emotion indicators in the header. Then it hands the text to processUserRequest, which is the router at the centre of the app: it checks for answers to questions it previously asked, then for requests about session history, the wiki and the todo list, then for a combined build-and-export request, then whether a GUI preview should be sensed automatically, then it estimates the build scale from the words you used, then it tries an interactive code write, and finally it tries to build an application through the architect route. Only if none of those match does it fall through to a plain language model reply with the personality, model facts, system context and vision context injected into the prompt. Every turn, prompt and reply together, is recorded to the auto-learn collector, and a non-action reply is spoken aloud through the same voice service used for this narration.',
  },
  {
    id: 'reasoning.assistant',
    title: 'Voice Assistant',
    source: 'ReasoningPanel toggleAssistant',
    match: ['disable voice assistant', 'enable voice assistant'],
    text:
      'The voice assistant toggle arms continuous hands-free operation. With it on, replies are spoken automatically and the microphone path stays available, so you can hold a conversation with the app rather than reading and typing. It sits next to push-to-talk deliberately: push-to-talk is the one-shot alternative, held open only while you press it, and is itself still available while the assistant is active.',
  },
  {
    id: 'reasoning.push-to-talk',
    title: 'Push to Talk',
    source: 'ReasoningPanel toggleListening',
    // Keyed on the whole title attribute: the button is icon-only, and the
    // title is the only thing identifying it in the DOM.
    match: [
      'push to talk',
      'stop listening',
      'push to talk also available while voice assistant is active',
    ],
    text:
      'Push to Talk captures speech and routes it through the same path a typed message takes, so a spoken request and a typed one are indistinguishable downstream. It is built as an alternative to the always-on assistant because a recording session, or a room with other people in it, is exactly the situation where continuous listening is the wrong default.',
  },
  {
    id: 'reasoning.session-history',
    title: 'Session History',
    source: 'ReasoningPanel → projectStore.requestSessionHistory → /api/session',
    match: ['session history'],
    text:
      'Session History opens the real session window rather than having the assistant claim one exists. It flags the request on the project store, which the session panel watches, and that panel reads conversations, builds and saved sessions from the session endpoints. Typing a request for history into the chat triggers this same path: the router detects the intent and opens the window, which is why the reply can honestly point at something you can see.',
  },
  {
    id: 'reasoning.wiki',
    title: 'Wiki',
    source: 'ReasoningPanel → projectStore.requestWiki → /api/knowledge',
    match: ['wiki'],
    text:
      'Wiki opens the model knowledge document, the file the app ships as its own reference text. It raises a wiki request on the project store and the wiki panel loads and renders that document, with the panel offering the context to the model. It is the app explaining itself from its own bundled material rather than from whatever the model happens to remember.',
  },
  {
    id: 'reasoning.todo',
    title: 'Todo List',
    source: 'ReasoningPanel → projectStore.requestTodo → /api/todo',
    match: ['todo list'],
    text:
      'Todo List opens the task panel backed by the todo endpoints, which is where the assistant records the work it intends to do and where you can see and change that list. Because the list is stored rather than only shown in chat, it survives a refresh, and the router can read it back when a request refers to outstanding work.',
  },

  // ── Settings and project management ─────────────────────────────────────
  {
    id: 'settings.tts',
    title: 'TTS Settings',
    source: 'ProjectManager → TtsSettings; localStorage tts-* keys',
    match: ['tts settings'],
    text:
      'TTS Settings controls the voice that speaks in this app, including which of the available neural voices is used, the speed, the pitch, the volume, and the bass, mid, high and echo shaping applied to the audio graph. Every one of those values is written to local storage and read back by the speech utility, so the settings apply to every spoken reply and to this narration alike. The voice list is served by the backend from its own catalogue, and the audio itself is generated on request by the speech endpoint, which means changing the voice needs no reinstall and no model download on the client.',
  },
  {
    id: 'settings.manifesto',
    title: 'Design Manifesto',
    source: 'ProjectManager → ManifestoEditor; routes/manifesto.ts',
    match: ['design manifesto'],
    text:
      'Design Manifesto opens the editor for the standing instruction that shapes generated designs. It is persisted server side through the manifesto endpoints and injected into the generation prompts, so it applies to every build without being repeated. That is the difference between a preference you type once and one the system remembers: the manifesto is the persistent version, and it is the lever to reach for when the output is structurally right but stylistically wrong.',
  },
  {
    id: 'settings.soul',
    title: 'Soul Personality',
    source: 'ProjectManager → SoulSettings; routes/soul.ts; data/soul.json',
    match: ['soul personality'],
    text:
      'Soul Personality edits the assistant character traits stored in the soul document. The chat path reads that file back before every reply and folds the traits into the system prompt, so an adjustment here changes how the model talks to you immediately, without a restart. It is kept separate from the design manifesto on purpose: the manifesto shapes what gets built, the soul shapes how the assistant behaves while doing it.',
  },
  {
    id: 'settings.llm-connect',
    title: 'LLM Connect',
    source: 'ProjectManager → LLMSelector; routes/llm.ts; backend/llm-config.json',
    match: ['llm connect'],
    text:
      'LLM Connect picks the endpoint and model the backend actually talks to. It writes llm config, and the server reads that file to decide where requests go, which is also the file the health probe consults, so the indicator in the header reflects the provider in use rather than a hardcoded address. Changing it here is how you point the whole app at a different server, local or remote, without rebuilding anything.',
  },
  {
    id: 'project.save',
    title: 'Save',
    source: 'ProjectManager handleSave → projectStorage',
    // Scoped by class: the TTS panel has its own Save whose handler is a
    // different function (persist + close) writing the same label.
    match: ['save'],
    requireClass: 'save-btn',
    text:
      'Save writes the current project into browser local storage under its name, including the node graph, the positions and the generated code. It is the fast, local save: it needs no server and works offline, and it is what auto-save and the session snapshot are built on. The separate Export button in this same row is the one that turns a saved project into a file you can move between machines.',
  },
  {
    id: 'project.load',
    title: 'Load',
    source: 'ProjectManager handleLoad',
    match: ['load'],
    text:
      'Load reads a saved project back out of local storage and restores the canvas, edges and all. Because the backend keeps its own in-memory copy of a project, loading changes which project the later generate and scaffold calls target, which is why the stored current project id is updated as part of loading.',
  },
  {
    id: 'project.settings',
    title: 'Settings',
    source: 'ProjectManager settings-wrapper → settings dropdown',
    match: ['settings'],
    requireClass: 'settings-btn',
    text:
      'Settings opens the configuration dropdown. Every entry inside it is a different subsystem rather than a different screen of one form: TTS Settings controls the voice, so the settings apply to every spoken reply; Design Manifesto edits the standing instruction injected into generation prompts; Soul Personality edits the character traits read back before every chat reply; and LLM Connect repoints the backend at a different model endpoint by rewriting the config file the server actually reads. Keeping them behind one menu is what makes the header fit, at the cost of needing to open it before you can see what is configurable.',
  },
  {
    id: 'settings.tts-test',
    title: 'Test Voice',
    source: 'ProjectManager/TtsSettings handleTest → speak()',
    match: ['test'],
    requireClass: 'settings-test-btn',
    text:
      'Test Voice plays a spoken sample through the settings you have just changed, before you commit them. It persists the current sliders, warms up the audio context, and speaks a fixed sentence. The warm-up matters: browsers refuse to start audio until a user gesture has happened, so priming the context here is what lets later automatic speech work at all. Because the sample goes through the same speech utility as every reply, what you hear here is exactly what you will hear in conversation.',
  },
  {
    id: 'settings.tts-save',
    title: 'Save Voice Settings',
    source: 'ProjectManager/TtsSettings handleSave → persist + close',
    match: ['save'],
    requireClass: 'settings-save-btn',
    text:
      'Save Voice Settings writes the voice, speed, pitch, volume and the bass, mid, high and echo shaping to local storage and closes the panel. These are the values the speech utility reads on every utterance, which is why the change takes effect immediately rather than on the next launch. This is a different handler from the project Save button in the header, which stores the node graph: the two share a label and nothing else.',
  },
  {
    id: 'project.merge',
    title: 'Merge',
    source: 'ProjectManager → MergeProjectsDialog; POST /api/merge',
    match: ['merge'],
    text:
      'Merge combines two project graphs into one, resolving collisions automatically and optionally offsetting the second layout so the two halves do not land on top of each other. It posts both graphs to api slash merge and gets back a single combined graph. The companion endpoint, api slash merge slash connect, is the more interesting one: given a plain language description of how a node from the dropped in app should attach to an existing node, it returns a semantic edge carrying the relation and a code hint that code generation then implements. That is what makes merging two apps a design decision rather than a copy and paste.',
  },
  {
    id: 'project.new',
    title: 'New Build',
    source: 'ProjectManager new-btn → localStorage.clear + POST /api/memory/clear',
    match: ['start a new build'],
    text:
      'New Build is the most destructive control in the app and asks for confirmation before it acts. On confirmation it clears local storage, but deliberately preserves the user name first so the app does not forget who you are, then posts to api slash memory slash clear to reset the server side build memory, and finally reloads the window. That server call is what separates this from the toolbar Clear button: Clear empties the canvas, while New Build also wipes the memory the system has accumulated, which is what you want when starting genuinely fresh work rather than starting a variation of the current project.',
  },
  {
    id: 'project.export-json',
    title: 'Export as JSON',
    source: 'ProjectManager handleExport',
    match: ['export as json', 'export'],
    requireClass: 'project-control-btn',
    text:
      'Export as JSON writes the whole project to a file you can move between machines. Unlike the toolbar Export button, which opens a dialog that scaffolds an actual runnable application onto disk, this serialises the node graph, the node positions, the edges and the generated code into a single portable document. It needs no server and no build step. The matching Import button reads that file back, so this pair is how a design travels without an account or a sync service.',
  },
  {
    id: 'project.import',
    title: 'Import',
    source: 'ProjectManager handleImport',
    match: ['import', 'import project file'],
    text:
      'Import reads a project file from disk and loads it as the current project, which is how a design moves between machines. It is the counterpart to Export as JSON in the same row: Export writes the node graph, positions and generated code out as a portable file, and Import reads that file back in. Neither needs the server, so a project can be carried across a machine boundary without an account or a sync service.',
  },
  {
    id: 'live-preview.clear-console',
    title: 'Clear Console',
    source: 'LivePreviewPanel → setConsoleOutput([])',
    match: ['clear'],
    requireClass: 'lpp-btn-danger',
    text:
      'Clear Console empties the console output panel in the live preview. It only discards the displayed log lines: no generated file, no validation result and no node state is touched. The toolbar Clear button with the same word is the destructive one, which is why the two are separated here rather than sharing a narration.',
  },
];

export default NARRATION;
