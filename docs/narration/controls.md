# VACA frontend control inventory (generated)

Total controls: **391** across **51** files.

Regenerate: `python3 docs/narration/extract-controls.py`

| # | file:line | tag | label | onClick | title |
|---|---|---|---|---|---|
| 1 | `frontend/src/App.tsx:743` | button | ✨ New Design | () => setWizardStep('welcome') | Start new project wizard |
| 2 | `frontend/src/App.tsx:744` | button | 📚 Library | () => setLibraryOpen(!libraryOpen) | Reference Library |
| 3 | `frontend/src/App.tsx:745` | button | 🖥 Preview | () => setFloatingPreviewOpen(prev => !prev) | Floating Preview Window |
| 4 | `frontend/src/App.tsx:757` | button | 📋 History | () => setHistoryOpen(!historyOpen) | Build History |
| 5 | `frontend/src/App.tsx:758` | button | ❓ Help | () => setHelpOpen(!helpOpen) | User Manual & Help |
| 6 | `frontend/src/App.tsx:764` | button | 👤 | () => setUserMenuOpen(!userMenuOpen) |  |
| 7 | `frontend/src/App.tsx:776` | button | 🚪 Logout | handleLogout |  |
| 8 | `frontend/src/App.tsx:852` | button | 🚀 Start New Project | handleStartNew |  |
| 9 | `frontend/src/App.tsx:855` | button | ↩ Back to Start | () => setWizardStep('welcome') |  |
| 10 | `frontend/src/App.tsx:867` | button | 🖥 Live Preview (Per-File) | () => setPreviewTab('live') |  |
| 11 | `frontend/src/App.tsx:877` | button | 🐳 Sandbox Preview | () => setPreviewTab('sandbox') |  |
| 12 | `frontend/src/App.tsx:896` | button | 🖥 Open Floating Preview | () => setFloatingPreviewOpen(true) |  |
| 13 | `frontend/src/App.tsx:909` | button | ✅ Approve & Review | () => setWizardStep('review') |  |
| 14 | `frontend/src/App.tsx:955` | button | 📦 Nodes | () => setMobilePanel(mobilePanel === 'palette' ? 'none' : '… |  |
| 15 | `frontend/src/App.tsx:956` | button | 🗺 Roadmap | () => setMobilePanel(mobilePanel === 'roadmap' ? 'none' : '… |  |
| 16 | `frontend/src/App.tsx:957` | button | 💻 Terminal | () => setMobilePanel(mobilePanel === 'terminals' ? 'none' :… |  |
| 17 | `frontend/src/App.tsx:958` | button | ⚡ Generate | () => setWizardStep('code-gen') |  |
| 18 | `frontend/src/App.tsx:960` | button | ✕ | () => setMobilePanel('none') |  |
| 19 | `frontend/src/App.tsx:961` | button | ✕ | () => setMobilePanel('none') |  |
| 20 | `frontend/src/App.tsx:962` | button | ✕ | () => setMobilePanel('none') |  |
| 21 | `frontend/src/App.tsx:978` | button | ▶ | () => toggleSidebar('right') | Collapse Sidebar |
| 22 | `frontend/src/App.tsx:1003` | button | ↩ Reattach | () => setRoadmapDetached(false) |  |
| 23 | `frontend/src/App.tsx:1088` | button | ✕ | () => setHistoryOpen(false) |  |
| 24 | `frontend/src/App.tsx:1172` | button | ⚙ Auto Preview setting | () => { // Open the Settings dropdown at the Auto GUI Previ… | Open Settings — the Auto GUI Preview toggle controls this p… |
| 25 | `frontend/src/App.tsx:1184` | button | ✕ | dismissPreviewToast | Dismiss |
| 26 | `frontend/src/components/AutoSavePanel.tsx:67` | button | ⏱ | () => setOpen((v) => !v) | Auto-save history |
| 27 | `frontend/src/components/AutoSavePanel.tsx:81` | button | Clear | handleClear |  |
| 28 | `frontend/src/components/AutoSavePanel.tsx:95` | button | Restore | () => handleRestore(entry) | Restore this auto-save |
| 29 | `frontend/src/components/AutoSavePanel.tsx:102` | button | Download | () => downloadEntry(entry) | Download as JSON |
| 30 | `frontend/src/components/BlueprintBuildDialog.tsx:536` | button | ✕ | handleClose | Close |
| 31 | `frontend/src/components/BlueprintBuildDialog.tsx:563` | select | 🐧 Linux 🪟 Windows 🍎 Mac 📱 iOS |  |  |
| 32 | `frontend/src/components/BlueprintBuildDialog.tsx:573` | select | {LANGUAGE_OPTIONS.map((l) => ( ))} |  |  |
| 33 | `frontend/src/components/BlueprintBuildDialog.tsx:583` | input |  |  |  |
| 34 | `frontend/src/components/BlueprintBuildDialog.tsx:594` | select | {MOCKUP_THEME_OPTIONS.map((t) => ( ))} |  |  |
| 35 | `frontend/src/components/BlueprintBuildDialog.tsx:602` | select | {MOCKUP_LAYOUT_OPTIONS.map((l) => ( ))} |  |  |
| 36 | `frontend/src/components/BlueprintBuildDialog.tsx:611` | input |  |  |  |
| 37 | `frontend/src/components/BlueprintBuildDialog.tsx:624` | button | Cancel | handleClose |  |
| 38 | `frontend/src/components/BlueprintBuildDialog.tsx:626` | button | 🎨 Preview GUI First | handlePreview |  |
| 39 | `frontend/src/components/BlueprintBuildDialog.tsx:629` | button | 🏗️ Build &amp; Load into Canvas | handleBuild |  |
| 40 | `frontend/src/components/BlueprintBuildDialog.tsx:696` | button | ↩ Back | () => { setPhase('form'); setMockup(null); } |  |
| 41 | `frontend/src/components/BlueprintBuildDialog.tsx:697` | button | 🔄 Redesign | handlePreview |  |
| 42 | `frontend/src/components/BlueprintBuildDialog.tsx:700` | button | ✅ Looks Good — Generate the Code | handleBuild |  |
| 43 | `frontend/src/components/BlueprintBuildDialog.tsx:730` | button | ↩ Back | () => { setPhase('form'); setErrorMsg(''); } |  |
| 44 | `frontend/src/components/BlueprintBuildDialog.tsx:731` | button | Close | handleClose |  |
| 45 | `frontend/src/components/BlueprintBuildDialog.tsx:830` | button | {regenerating ? '⏳ Re-generating...' : `♻️ Regenerate $ Missing Modul… | handleRegenerateMissing |  |
| 46 | `frontend/src/components/BlueprintBuildDialog.tsx:876` | button | 📂 Open Folder | () => { void openExportedFolder(exportPath); } |  |
| 47 | `frontend/src/components/BlueprintBuildDialog.tsx:888` | button | Done — View in Canvas | handleClose |  |
| 48 | `frontend/src/components/Canvas.tsx:439` | button |  | () => setActiveTree(t.id) | `${t.name}${t.goal ? ` — ${t.goal}` : ''}\n` + 'Click to ma… |
| 49 | `frontend/src/components/Canvas.tsx:451` | button | ＋ New app tree | () => addTree() | Add another app tree — build a second app beside this one, … |
| 50 | `frontend/src/components/Canvas.tsx:459` | button | ✕ | () => { const tree = trees.find((t) => t.id === activeTreeI… | Delete the active app tree |
| 51 | `frontend/src/components/Canvas.tsx:484` | button | ↩ Undo | undo | Undo (Ctrl+Z) |
| 52 | `frontend/src/components/Canvas.tsx:492` | button | ↪ Redo | redo | Redo (Ctrl+Shift+Z) |
| 53 | `frontend/src/components/Canvas.tsx:504` | button | ▲ Up | () => nudgeOrPan(0, -30) | Pan forward (or nudge selected node) |
| 54 | `frontend/src/components/Canvas.tsx:508` | button | ◀ Left | () => nudgeOrPan(-30, 0) | Pan left (or nudge selected node) |
| 55 | `frontend/src/components/Canvas.tsx:512` | button | ■ Stop | resetCameraView | Reset camera view |
| 56 | `frontend/src/components/Canvas.tsx:516` | button | ▶ Right | () => nudgeOrPan(30, 0) | Pan right (or nudge selected node) |
| 57 | `frontend/src/components/Canvas.tsx:520` | button | ▼ Down | () => nudgeOrPan(0, 30) | Pan backward (or nudge selected node) |
| 58 | `frontend/src/components/Canvas.tsx:545` | button | 🔄 Rework Connections | handleRework |  |
| 59 | `frontend/src/components/Canvas.tsx:590` | button | 🔗 Wire two nodes | () => setWiringOpen(true) | planCodeNodes.length < 2 ? 'Add a second node first — a lin… |
| 60 | `frontend/src/components/Canvas.tsx:602` | button |  | handleMapDesign | planCodeNodes.length === 0 ? 'Place the master node first —… |
| 61 | `frontend/src/components/Canvas.tsx:614` | button | 📂 Open plan | () => setLibraryOpen(true) | Reopen a design autosaved to data/plans and keep working on… |
| 62 | `frontend/src/components/Canvas.tsx:645` | button | 🔗 Connect these two… | () => setPairConnectOpen(true) | Describe what flows between these two nodes |
| 63 | `frontend/src/components/Canvas.tsx:652` | button | ✕ Clear | () => handleSelectNode(null) | Clear the selection |
| 64 | `frontend/src/components/CodeOutputPanel.tsx:291` | button | ↩ | () => setCodeOutputDetached(false) | Reattach code output panel |
| 65 | `frontend/src/components/CodeOutputPanel.tsx:316` | button | 🗑 | handleClear | Clear all code entries |
| 66 | `frontend/src/components/CodeOutputPanel.tsx:324` | button | ↗ | () => setCodeOutputDetached(true) | Detach code output to separate window |
| 67 | `frontend/src/components/CodeOutputPanel.tsx:370` | input |  |  |  |
| 68 | `frontend/src/components/CodeOutputPanel.tsx:380` | input |  |  |  |
| 69 | `frontend/src/components/CodeOutputPanel.tsx:388` | input |  |  |  |
| 70 | `frontend/src/components/CodeOutputPanel.tsx:457` | button | 📋 Copy | handleCopyCode | Copy code |
| 71 | `frontend/src/components/CodeOutputPopout.tsx:245` | button | ⏸ | handlePause | Pause this file's LLM response so you can fix your message |
| 72 | `frontend/src/components/CodeOutputPopout.tsx:251` | button | ▶ | handleContinue | Continue — send your (possibly edited) message again |
| 73 | `frontend/src/components/CodeOutputPopout.tsx:257` | button | ✕ | onClose | Close (Esc) |
| 74 | `frontend/src/components/CodeOutputPopout.tsx:269` | button |  | copyNotes | Copy notes |
| 75 | `frontend/src/components/CodeOutputPopout.tsx:287` | button | ✕ Clear | clearChat | Clear chat history |
| 76 | `frontend/src/components/CodeOutputPopout.tsx:308` | button |  | toggleMic | listening ? 'Stop voice input' : 'Talk to the LLM with your… |
| 77 | `frontend/src/components/CodeOutputPopout.tsx:325` | button | ➤ | () => send(input) | Send (Enter) |
| 78 | `frontend/src/components/ConnectNodesDialog.tsx:206` | button | ✕ | handleClose | Close |
| 79 | `frontend/src/components/ConnectNodesDialog.tsx:222` | select | — pick a node — {sourceNodes.map(n => ( ( ) ))} |  |  |
| 80 | `frontend/src/components/ConnectNodesDialog.tsx:242` | select | — pick a node — {targetNodes.map(n => ( ( ) ))} |  |  |
| 81 | `frontend/src/components/ConnectNodesDialog.tsx:270` | button | 💡 | () => { setDescription(EXAMPLES[exampleIdx]); setExampleIdx… | Click to load an example description |
| 82 | `frontend/src/components/ConnectNodesDialog.tsx:348` | button | ＋ Connect another | reset |  |
| 83 | `frontend/src/components/ConnectNodesDialog.tsx:349` | button | Done | handleClose |  |
| 84 | `frontend/src/components/ConnectNodesDialog.tsx:353` | button | ↩ Start over | reset |  |
| 85 | `frontend/src/components/ConnectNodesDialog.tsx:354` | button | 🔗 Apply connection | handleApply |  |
| 86 | `frontend/src/components/ConnectNodesDialog.tsx:358` | button | Close | handleClose |  |
| 87 | `frontend/src/components/ConnectNodesDialog.tsx:359` | button |  | handleInterpret | description.trim() ? 'Interpret this description into a con… |
| 88 | `frontend/src/components/CustomNode.tsx:423` | select | {LANGUAGE_OPTIONS.map((lang) => ( ))} | (e) => e.stopPropagation() | Set programming language for this node |
| 89 | `frontend/src/components/CustomNode.tsx:443` | button |  | (e) => { e.stopPropagation(); toggleNodeExpanded(id); } | expanded ? 'Collapse' : 'Expand' |
| 90 | `frontend/src/components/CustomNode.tsx:459` | button | 🔊 Speak | handleSpeakSuggestion | Read aloud |
| 91 | `frontend/src/components/CustomNode.tsx:506` | button | 🤝 answered | (e) => { e.stopPropagation(); setQaOpen((o) => !o); } | qaOpen ? 'Hide the questions and answers on this node' : `$… |
| 92 | `frontend/src/components/CustomNode.tsx:570` | input |  | (e) => e.stopPropagation() | Optional widget ID tag for cross-referencing this node |
| 93 | `frontend/src/components/CustomNode.tsx:587` | select | {LANGUAGE_OPTIONS.map((lang) => ( ))} | (e) => e.stopPropagation() | Set programming language for this node |
| 94 | `frontend/src/components/CustomNode.tsx:651` | button |  | (e) => { e.stopPropagation(); handleScaffold(); } | Generate skeleton placeholder files for this node |
| 95 | `frontend/src/components/CustomNode.tsx:671` | button | ⛭ | (e) => { e.stopPropagation(); handleGuiCodeGen(); } | Generate production code from this finalized GUI layout — w… |
| 96 | `frontend/src/components/CustomNode.tsx:729` | button |  | (e) => { e.stopPropagation(); handleSuggest(); } | Get AI-powered implementation suggestions for this node |
| 97 | `frontend/src/components/CustomNode.tsx:742` | button | 🔊 | handleSpeakSuggestion | Read aloud |
| 98 | `frontend/src/components/CustomNode.tsx:755` | button | ✏️ Edit | (e) => { e.stopPropagation(); setCodeEditorNodeId(id); } | Open code editor |
| 99 | `frontend/src/components/CustomNode.tsx:763` | button | Debug | (e) => { e.stopPropagation(); handleDebug(); } | Debug this node and its connections |
| 100 | `frontend/src/components/CustomNode.tsx:772` | button | AI | (e) => { e.stopPropagation(); handleAI(); } | AI code review |
| 101 | `frontend/src/components/DesignBrowser.tsx:157` | button | 🔄 Refresh | searchAll |  |
| 102 | `frontend/src/components/DesignBrowser.tsx:231` | a | 🔗 View | e => e.stopPropagation() |  |
| 103 | `frontend/src/components/DesignBrowser.tsx:234` | button |  | (e) => { e.stopPropagation(); handleOpenSourceImport(repo);… |  |
| 104 | `frontend/src/components/DesignBrowser.tsx:267` | a | 🔗 Read More | e => e.stopPropagation() |  |
| 105 | `frontend/src/components/DesignBrowser.tsx:312` | a | 🔗 View Project | e => e.stopPropagation() |  |
| 106 | `frontend/src/components/EmotionDropdown.tsx:67` | button |  | () => setOpen(!open) | open ? 'Close' : 'Emotion & personality' |
| 107 | `frontend/src/components/EmotionDropdown.tsx:137` | input |  |  |  |
| 108 | `frontend/src/components/ErrorBoundary.tsx:36` | button | Try Again | this.handleReset |  |
| 109 | `frontend/src/components/ErrorBoundary.tsx:39` | button | Reload App | () => window.location.reload() |  |
| 110 | `frontend/src/components/ExportDialog.tsx:346` | button | ✕ | handleClose | Close |
| 111 | `frontend/src/components/ExportDialog.tsx:356` | input |  |  |  |
| 112 | `frontend/src/components/ExportDialog.tsx:372` | input |  |  |  |
| 113 | `frontend/src/components/ExportDialog.tsx:495` | button |  | handleClose |  |
| 114 | `frontend/src/components/ExportDialog.tsx:500` | button | 🏗️ Build App | handleBuild |  |
| 115 | `frontend/src/components/ExportDialog.tsx:510` | button | ⚡ Generate Code First | handleGenerate |  |
| 116 | `frontend/src/components/ExportDialog.tsx:519` | button | 🔄 Retry | () => { setPhase('ready'); setErrorMsg(''); handleGenerate(… |  |
| 117 | `frontend/src/components/ExportDialog.tsx:533` | button | 📂 Open Folder | handleOpenFolder |  |
| 118 | `frontend/src/components/ExportDialog.tsx:539` | button | 📋 Copy Path | () => { // Copy path to clipboard navigator.clipboard.write… |  |
| 119 | `frontend/src/components/FileDropHandler.tsx:767` | button | ▶ Play Web App | handlePlayWebApp |  |
| 120 | `frontend/src/components/FileDropHandler.tsx:795` | input |  |  |  |
| 121 | `frontend/src/components/FileDropHandler.tsx:799` | select | {FILE_NODE_TYPES.map((t) => ( ))} |  |  |
| 122 | `frontend/src/components/FileDropHandler.tsx:815` | button | Cancel | () => setDialogOpen(false) |  |
| 123 | `frontend/src/components/FileDropHandler.tsx:821` | button |  | handleAnalyze |  |
| 124 | `frontend/src/components/FileDropHandler.tsx:842` | button | 🔍 Deep Scan Project | handleDeepScan |  |
| 125 | `frontend/src/components/FileDropHandler.tsx:872` | button | 🤖 Send to Veronica | handleSendToVeronica |  |
| 126 | `frontend/src/components/FileDropHandler.tsx:878` | button | 📂 Describe Folder Contents | handleDescribeFolder |  |
| 127 | `frontend/src/components/FileDropHandler.tsx:912` | button | Done | () => { setDialogOpen(false); setDescribeState('idle'); set… |  |
| 128 | `frontend/src/components/FileDropHandler.tsx:928` | button | Back | () => { setDescribeState('idle'); setDescribeResult(''); } |  |
| 129 | `frontend/src/components/FileDropHandler.tsx:931` | button | 🔄 Retry | handleDescribeFolder |  |
| 130 | `frontend/src/components/FileDropHandler.tsx:1002` | button | Done | () => { setDialogOpen(false); setVeronicaState('idle'); set… |  |
| 131 | `frontend/src/components/FileDropHandler.tsx:1014` | button | Back | () => { setVeronicaState('idle'); setVeronicaResult(null); } |  |
| 132 | `frontend/src/components/FileDropHandler.tsx:1017` | button | 🔄 Retry | handleSendToVeronica |  |
| 133 | `frontend/src/components/FileDropHandler.tsx:1038` | button | Play it now | () => { setDialogOpen(false); setPlayState('idle'); } |  |
| 134 | `frontend/src/components/FileDropHandler.tsx:1188` | button | 🗑️ Clear & Replace | handleApplyReplace |  |
| 135 | `frontend/src/components/FileDropHandler.tsx:1194` | button | ➕ Append to Canvas | handleApplyAppend |  |
| 136 | `frontend/src/components/FileDropHandler.tsx:1201` | button | Cancel | () => setShowClearConfirm(false) |  |
| 137 | `frontend/src/components/FileDropHandler.tsx:1213` | button | Back | () => { setScanState('idle'); setScanResult(null); setShowC… |  |
| 138 | `frontend/src/components/FileDropHandler.tsx:1219` | button | ✅ Create Node Build on Canvas | handleApplyScan |  |
| 139 | `frontend/src/components/FileDropHandler.tsx:1237` | button | Back | () => { setScanState('idle'); setScanResult(null); } |  |
| 140 | `frontend/src/components/FileDropHandler.tsx:1240` | button | 🔄 Retry Deep Scan | handleDeepScan |  |
| 141 | `frontend/src/components/FloatingPreviewWindow.tsx:236` | button | ─ | handleMinimize | Minimize |
| 142 | `frontend/src/components/FloatingPreviewWindow.tsx:243` | button | ✕ | onClose | Close |
| 143 | `frontend/src/components/HelpPanel.tsx:287` | button | ✕ | onClose |  |
| 144 | `frontend/src/components/HelpPanel.tsx:291` | input |  |  |  |
| 145 | `frontend/src/components/HelpPanel.tsx:300` | button | ✕ | () => setSearch('') |  |
| 146 | `frontend/src/components/HelpPanel.tsx:321` | button | Clear search | () => setSearch('') |  |
| 147 | `frontend/src/components/HelpPanel.tsx:329` | button |  | () => toggleSection(section.id) |  |
| 148 | `frontend/src/components/HelpPanel.tsx:371` | button | 🔄 Show Overview | () => { setSearch(''); setExpandedSection(null); const allI… |  |
| 149 | `frontend/src/components/LLMConfig.tsx:65` | button |  | handleTestConnection |  |
| 150 | `frontend/src/components/LLMSelector.tsx:147` | input |  |  |  |
| 151 | `frontend/src/components/LLMSelector.tsx:156` | button | Save | handleUrlSave |  |
| 152 | `frontend/src/components/LLMSelector.tsx:157` | button | Cancel | () => { setUrlInput(llmUrl); setEditingUrl(false); } |  |
| 153 | `frontend/src/components/LLMSelector.tsx:187` | button |  | testConnection |  |
| 154 | `frontend/src/components/LLMSelector.tsx:195` | button | 🔄 Reconnect | testConnection |  |
| 155 | `frontend/src/components/LLMSelector.tsx:202` | button |  | handleRefresh |  |
| 156 | `frontend/src/components/LLMSelector.tsx:231` | button | 🔄 | () => { fetchDsparkStatus(); fetchDsparkBenchmark(); } | Refresh DSpark status + benchmark |
| 157 | `frontend/src/components/LLMSelector.tsx:431` | select | — Default (unassigned) — {backendProviders .filter((p) => p.baseUrl) … |  |  |
| 158 | `frontend/src/components/LLMSelector.tsx:465` | input |  |  |  |
| 159 | `frontend/src/components/LLMSelector.tsx:492` | input |  |  |  |
| 160 | `frontend/src/components/LLMSelector.tsx:510` | button |  | () => { setRevealedKeys((prev) => { const next = new Set(pr… | keyRevealed ? 'Hide API key' : 'Show API key' |
| 161 | `frontend/src/components/LLMSelector.tsx:538` | button |  | async () => { const ok = await saveRoles(roleDraft); if (ok… |  |
| 162 | `frontend/src/components/LLMSelector.tsx:560` | button | {connectionStatus === 'connected' ? `✅ Connected ($ ms)` : connection… | testConnection |  |
| 163 | `frontend/src/components/LLMSelector.tsx:571` | button |  | handleScanOllama | Run 'ollama list' via backend to scan all installed models |
| 164 | `frontend/src/components/LLMSelector.tsx:579` | button |  | scanAllProviders | Ping all known LLM providers to see which are running |
| 165 | `frontend/src/components/LearningDashboard.tsx:208` | button | Retry | fetchData |  |
| 166 | `frontend/src/components/LearningDashboard.tsx:256` | button | ✕ | onClose |  |
| 167 | `frontend/src/components/LearningDashboard.tsx:266` | button |  | () => setSelectedSection(section) |  |
| 168 | `frontend/src/components/LearningDashboard.tsx:368` | a | View All Patterns |  |  |
| 169 | `frontend/src/components/LearningDashboard.tsx:372` | a | Neural Model Status |  |  |
| 170 | `frontend/src/components/LivePreviewPanel.tsx:632` | button | Button |  |  |
| 171 | `frontend/src/components/LivePreviewPanel.tsx:715` | button |  | handleGenerate | Generate all files |
| 172 | `frontend/src/components/LivePreviewPanel.tsx:724` | button |  | handleRunTests |  |
| 173 | `frontend/src/components/LivePreviewPanel.tsx:733` | button | {isFixing ? '⏳ Fixing...' : `🔧 Fix All ($ )`} | handleFixAll | Run error correction on all failing files |
| 174 | `frontend/src/components/LivePreviewPanel.tsx:801` | button |  | () => { setShowFullApp(!showFullApp); // Auto-select first … | showFullApp ? 'Switch to per-file preview' : 'Show full app… |
| 175 | `frontend/src/components/LivePreviewPanel.tsx:817` | button |  | () => setSelectedFile(file.fileName) | `${file.fileName} — ${file.validated ? 'Validated ✅' : file… |
| 176 | `frontend/src/components/LivePreviewPanel.tsx:843` | button | {tab === 'suggestions' && `💡 Suggestions${suggestions.length > 0 ? ` … | () => setActiveTab(tab as any) |  |
| 177 | `frontend/src/components/LivePreviewPanel.tsx:866` | button | ↗ New Tab | () => window.open(sitePreviewUrl, '_blank') | Open the site in a full browser tab |
| 178 | `frontend/src/components/LivePreviewPanel.tsx:873` | button | ✕ Back to Generated | () => setSitePreviewUrl(null) | Return to the generated-file preview |
| 179 | `frontend/src/components/LivePreviewPanel.tsx:915` | button |  | () => handleFixFile(selectedFileData) |  |
| 180 | `frontend/src/components/LivePreviewPanel.tsx:923` | button | ♻️ Regenerate | () => handleRegenerateFile(selectedFileData) |  |
| 181 | `frontend/src/components/LivePreviewPanel.tsx:951` | button | ✕ Clear | () => setConsoleOutput([]) |  |
| 182 | `frontend/src/components/LivePreviewPanel.tsx:1013` | button | 💡 Show Fix Suggestions | () => { setActiveTab('suggestions'); } |  |
| 183 | `frontend/src/components/LivePreviewPanel.tsx:1167` | button | 🔄 Retry Connection | async () => { setBackendStatus('checking'); const ok = awai… |  |
| 184 | `frontend/src/components/ManifestoEditor.tsx:287` | button | {!isExpanded && ( )} {checkboxItems.length > 0 && ( / )} | () => toggleSection(section.id) |  |
| 185 | `frontend/src/components/ManifestoEditor.tsx:345` | button | {description && ( )} | () => toggleCheckbox(sectionIdx, itemIdx) | item.checked ? `Enabled: ${label} — click to disable` : `Di… |
| 186 | `frontend/src/components/ManifestoEditor.tsx:391` | input |  |  |  |
| 187 | `frontend/src/components/ManifestoEditor.tsx:397` | input |  |  |  |
| 188 | `frontend/src/components/ManifestoEditor.tsx:455` | button |  | () => setMode(mode === 'interactive' ? 'raw' : 'interactive… | mode === 'interactive' ? 'Switch to raw markdown editor' : … |
| 189 | `frontend/src/components/ManifestoEditor.tsx:463` | button | ✕ | onClose |  |
| 190 | `frontend/src/components/ManifestoEditor.tsx:509` | button | ✕ | () => {} |  |
| 191 | `frontend/src/components/ManifestoEditor.tsx:576` | button | ✕ | () => {} |  |
| 192 | `frontend/src/components/ManifestoEditor.tsx:587` | button | ↺ Reset | handleReset |  |
| 193 | `frontend/src/components/ManifestoEditor.tsx:595` | button | ↻ Reload | handleReload |  |
| 194 | `frontend/src/components/MasterNode.tsx:510` | select | {OS_OPTIONS.map(opt => ( ( ) ))} |  |  |
| 195 | `frontend/src/components/MasterNode.tsx:529` | select | {LINUX_DISTRO_OPTIONS.map(opt => ( {opt.value ? `🐧 $ ($ )` : `🐧 $ `} … |  |  |
| 196 | `frontend/src/components/MasterNode.tsx:564` | button |  | () => { setScaleTouched(true); updateNode(id, { scale: opt.… | `${opt.label} — ${opt.nodes} nodes. ${opt.hint}` |
| 197 | `frontend/src/components/MasterNode.tsx:588` | select | 🌊 Ocean 🔮 Violet 🌿 Emerald 🌸 Rose 🌞 Amber 🪨 Slate 💠 Cyan |  |  |
| 198 | `frontend/src/components/MasterNode.tsx:605` | select | 🖥 Sidebar 📊 Dashboard 🧭 Top Nav |  |  |
| 199 | `frontend/src/components/MasterNode.tsx:618` | button |  | handlePreviewGUI |  |
| 200 | `frontend/src/components/MasterNode.tsx:627` | button | 🔍 Find Designs | handleGoalSubmit |  |
| 201 | `frontend/src/components/MasterNode.tsx:671` | button | ↩ Back | () => { setGuiMockup(null); } |  |
| 202 | `frontend/src/components/MasterNode.tsx:679` | button |  | handlePreviewGUI |  |
| 203 | `frontend/src/components/MasterNode.tsx:688` | button | ✅ Looks Good — Find Designs | handleGoalSubmit |  |
| 204 | `frontend/src/components/MasterNode.tsx:726` | button | 🎛 Let the LLM analyze your architecture and auto-create GUI buttons/s… | handleAutoCreateUI |  |
| 205 | `frontend/src/components/MasterNode.tsx:813` | button |  | () => { setBuilding(true); setWizardStep('building-nodes');… |  |
| 206 | `frontend/src/components/MasterNode.tsx:826` | button | ↩ Back | () => setWizardStep('welcome') |  |
| 207 | `frontend/src/components/MasterNode.tsx:895` | button | 🎛 Let the LLM analyze your architecture and auto-create GUI buttons/s… | handleAutoCreateUI |  |
| 208 | `frontend/src/components/MasterNode.tsx:992` | button | {filling && !autoCompleteAll ? `⏳ Auto-filling ($ /$ )...` : '🤖 Fill … | handleAutoFillNodes |  |
| 209 | `frontend/src/components/MasterNode.tsx:1001` | button | {filling && autoCompleteAll ? `⏳ Auto-completing ($ /$ )...` : '⚡ Aut… | handleAutoCompleteAll |  |
| 210 | `frontend/src/components/MasterNode.tsx:1014` | button | ✅ Ready — Generate Code | handleProceedToCodeGen |  |
| 211 | `frontend/src/components/MasterNode.tsx:1068` | button | 🖥 Include GUI | () => setIncludeGUI(true) |  |
| 212 | `frontend/src/components/MasterNode.tsx:1084` | button | 💻 CLI / API Only (No GUI) | () => setIncludeGUI(false) |  |
| 213 | `frontend/src/components/MasterNode.tsx:1122` | button | ↩ Back | () => setWizardStep('filling-nodes') |  |
| 214 | `frontend/src/components/MasterNode.tsx:1177` | button |  | handleAutoCreateUI |  |
| 215 | `frontend/src/components/MergeProjectsDialog.tsx:106` | button | ✕ | handleClose | Close |
| 216 | `frontend/src/components/MergeProjectsDialog.tsx:127` | select | — choose a project — {available.map(p => ( ( nodes) ))} |  |  |
| 217 | `frontend/src/components/MergeProjectsDialog.tsx:220` | button | 🔗 Connect &amp; Describe | () => setConnectOpen(true) | Pick a node from the dropped app, point it into a node of t… |
| 218 | `frontend/src/components/MergeProjectsDialog.tsx:246` | button | Close | handleClose |  |
| 219 | `frontend/src/components/MergeProjectsDialog.tsx:247` | button |  | handleMerge | applied ? 'Merged — pick a different project B to merge aga… |
| 220 | `frontend/src/components/MessageReactions.tsx:152` | button | {count > 0 && ( )} | () => handleReact(emoji) | `React with ${emoji}` |
| 221 | `frontend/src/components/MockupPreviewPanel.tsx:115` | button |  | handleBuildNow |  |
| 222 | `frontend/src/components/NodeCodeEditor.tsx:78` | button | 💾 Save | handleSave | Save (Ctrl+S) |
| 223 | `frontend/src/components/NodeCodeEditor.tsx:86` | button | ✕ | onClose | Close (Esc) |
| 224 | `frontend/src/components/NodeDetailOverlay.tsx:248` | button | ✕ | onClose |  |
| 225 | `frontend/src/components/NodeDetailOverlay.tsx:280` | select | {LANGUAGE_OPTIONS.map(lang => ( ))} |  |  |
| 226 | `frontend/src/components/NodeDetailOverlay.tsx:344` | button | ✏️ Edit Code | () => { setCodeEditorNodeId(node.id); onClose(); } |  |
| 227 | `frontend/src/components/NodeDetailOverlay.tsx:354` | button | Suggest | handleSuggest |  |
| 228 | `frontend/src/components/NodeDetailOverlay.tsx:366` | button | Debug | handleDebug |  |
| 229 | `frontend/src/components/NodeDetailOverlay.tsx:378` | button | AI | handleAI |  |
| 230 | `frontend/src/components/NodeDetailOverlay.tsx:448` | button | 🔗 Connect this node to another… | () => setConnectOpen(true) | myTreeNodeIds.length < 2 ? 'Add a second node to this app f… |
| 231 | `frontend/src/components/NodeDetailOverlay.tsx:499` | select | — pick a node in another app tree — {trees.filter((t) => t.id !== myT… |  |  |
| 232 | `frontend/src/components/NodeDetailOverlay.tsx:532` | select | {CROSS_TREE_PAYLOAD_OPTIONS.map((o) => ( — ))} |  |  |
| 233 | `frontend/src/components/NodeDetailOverlay.tsx:563` | button | 🔗 Connect these app trees | handleConnectTrees | xtTarget ? 'Create the cross-app connection' : 'Pick a node… |
| 234 | `frontend/src/components/NodeDetailOverlay.tsx:615` | button | ✕ | () => removeEdge(e.id) | Remove this cross-app connection |
| 235 | `frontend/src/components/NodeLogicEditor.tsx:135` | button | ✕ | () => setLogicEditorOpen(false) |  |
| 236 | `frontend/src/components/NodeLogicEditor.tsx:191` | button | ✕ | () => handleDeleteSubNode(sn.id) |  |
| 237 | `frontend/src/components/NodePalette.tsx:103` | button | ✕ | (e) => { e.stopPropagation(); deleteNode(n.id); if (selecte… | Delete this node |
| 238 | `frontend/src/components/NodePalette.tsx:119` | button | Delete Selected | handleDeleteSelected |  |
| 239 | `frontend/src/components/NodePalette.tsx:126` | button | Clear All | handleClearAll |  |
| 240 | `frontend/src/components/NodeSetupDialog.tsx:100` | select | {NODE_TYPE_OPTIONS.map((opt) => ( — ))} |  |  |
| 241 | `frontend/src/components/NodeSetupDialog.tsx:115` | select | {LANGUAGE_OPTIONS.map((lang) => ( ))} |  |  |
| 242 | `frontend/src/components/NodeSetupDialog.tsx:131` | input |  |  |  |
| 243 | `frontend/src/components/NodeSetupDialog.tsx:158` | button | Cancel | onCancel |  |
| 244 | `frontend/src/components/NodeSetupDialog.tsx:161` | button |  | handleConfirm |  |
| 245 | `frontend/src/components/PlanCoworkerPanel.tsx:67` | button |  | () => setCollapsed((c) => !c) | collapsed ? 'Show the questions' : 'Hide the questions' |
| 246 | `frontend/src/components/PlanCoworkerPanel.tsx:102` | button | Attach | () => submit(q) | Attach this answer to the node and close the question |
| 247 | `frontend/src/components/PlanCoworkerPanel.tsx:110` | button | Skip | () => dismissPlanQuestion(q.id) | Close without answering |
| 248 | `frontend/src/components/PlanLibraryDialog.tsx:106` | button | ✕ | onClose | Close |
| 249 | `frontend/src/components/PlanLibraryDialog.tsx:140` | button |  | () => handleOpen(p) | Load this design back onto the canvas |
| 250 | `frontend/src/components/PlanLibraryDialog.tsx:162` | button | ↻ Refresh | refresh |  |
| 251 | `frontend/src/components/PlanLibraryDialog.tsx:165` | button | Close | onClose |  |
| 252 | `frontend/src/components/PlanPanel.tsx:170` | button | ✕ | handleClose | Close |
| 253 | `frontend/src/components/PlanPanel.tsx:184` | input |  |  |  |
| 254 | `frontend/src/components/PlanPanel.tsx:213` | button |  | handleAssist |  |
| 255 | `frontend/src/components/PlanPanel.tsx:256` | button | Close | handleClose |  |
| 256 | `frontend/src/components/PlanPanel.tsx:257` | button |  | handleSave |  |
| 257 | `frontend/src/components/PlanResumeBanner.tsx:113` | button |  | reopen |  |
| 258 | `frontend/src/components/PlanResumeBanner.tsx:116` | button | ✕ | () => setDismissed(true) | Start from an empty canvas instead |
| 259 | `frontend/src/components/ProjectHistory.tsx:146` | button | 🔄 | fetchBuilds | Refresh |
| 260 | `frontend/src/components/ProjectHistory.tsx:150` | button | 🗑️ | handleClear | Clear history |
| 261 | `frontend/src/components/ProjectHistory.tsx:167` | button | Retry | fetchBuilds |  |
| 262 | `frontend/src/components/ProjectHistory.tsx:215` | button | 📂 | () => handleOpenExportPath(build.exportPath!) | Show path |
| 263 | `frontend/src/components/ProjectManager.tsx:55` | input |  |  |  |
| 264 | `frontend/src/components/ProjectManager.tsx:108` | button | Load | handleLoad |  |
| 265 | `frontend/src/components/ProjectManager.tsx:111` | button | Rename | () => setEditing(true) |  |
| 266 | `frontend/src/components/ProjectManager.tsx:117` | button | Yes | handleDelete |  |
| 267 | `frontend/src/components/ProjectManager.tsx:118` | button | No | () => setShowConfirm(false) |  |
| 268 | `frontend/src/components/ProjectManager.tsx:121` | button | Delete | () => setShowConfirm(true) |  |
| 269 | `frontend/src/components/ProjectManager.tsx:176` | input |  |  |  |
| 270 | `frontend/src/components/ProjectManager.tsx:185` | button | ✕ | onClose |  |
| 271 | `frontend/src/components/ProjectManager.tsx:190` | select | {EDGE_VOICES.map((v) => ( ( ) ))} |  |  |
| 272 | `frontend/src/components/ProjectManager.tsx:205` | button | 🔊 Test | handleTest |  |
| 273 | `frontend/src/components/ProjectManager.tsx:206` | button | Save | handleSave |  |
| 274 | `frontend/src/components/ProjectManager.tsx:320` | button | New | () => { if (confirm('Start a new build? All current data wi… | Start a new build |
| 275 | `frontend/src/components/ProjectManager.tsx:323` | button | Save | handleSave | Save project |
| 276 | `frontend/src/components/ProjectManager.tsx:326` | button | Load | handleOpen | Load project |
| 277 | `frontend/src/components/ProjectManager.tsx:329` | button | Export | handleExport | Export as JSON |
| 278 | `frontend/src/components/ProjectManager.tsx:332` | button | Import | handleImport | Import project file |
| 279 | `frontend/src/components/ProjectManager.tsx:335` | button | 🔀 Merge | () => setMergeOpen(true) | Merge two projects into one — resolves collisions automatic… |
| 280 | `frontend/src/components/ProjectManager.tsx:343` | button | Settings | () => setSettingsOpen((v) => !v) | Settings |
| 281 | `frontend/src/components/ProjectManager.tsx:354` | button | 🔊 TTS Settings | () => { setSettingsOpen(false); setTtsOpen(true); } |  |
| 282 | `frontend/src/components/ProjectManager.tsx:358` | button | 🎨 Design Manifesto | () => { setSettingsOpen(false); setManifestoOpen(true); } |  |
| 283 | `frontend/src/components/ProjectManager.tsx:362` | button | 🧠 Soul Personality | () => { setSettingsOpen(false); setSoulOpen(true); } |  |
| 284 | `frontend/src/components/ProjectManager.tsx:366` | button | 🔌 LLM Connect | () => { setSettingsOpen(false); setLlmConnectOpen(true); } |  |
| 285 | `frontend/src/components/ProjectManager.tsx:412` | button | ✕ | () => setLlmConnectOpen(false) |  |
| 286 | `frontend/src/components/ProjectManager.tsx:424` | input |  |  |  |
| 287 | `frontend/src/components/ProjectManager.tsx:440` | button | ✕ | () => setOpen(false) |  |
| 288 | `frontend/src/components/ReasoningPanel.tsx:1569` | button | ↩ Reattach | () => setReasoningDetached(false) |  |
| 289 | `frontend/src/components/ReasoningPanel.tsx:1612` | button | 🎙 | toggleAssistant | assistantEnabled ? 'Disable voice assistant' : 'Enable voic… |
| 290 | `frontend/src/components/ReasoningPanel.tsx:1619` | button | 🗑 | () => { localStorage.removeItem(REASONING_STORAGE_KEY); set… | Clear conversation |
| 291 | `frontend/src/components/ReasoningPanel.tsx:1634` | button | 🔄 | () => { localStorage.removeItem(REASONING_STORAGE_KEY); set… | Restart from beginning |
| 292 | `frontend/src/components/ReasoningPanel.tsx:1649` | button | ↗ | () => setReasoningDetached(true) | Detach to separate window |
| 293 | `frontend/src/components/ReasoningPanel.tsx:1738` | button | ✕ | () => setVeronicaAction(null) |  |
| 294 | `frontend/src/components/ReasoningPanel.tsx:1749` | button |  | () => handleSpeak(msg.text, i) | speakingId === i ? 'Stop' : 'Read aloud' |
| 295 | `frontend/src/components/ReasoningPanel.tsx:1776` | button | 📜 Session History | () => { useProjectStore.getState().requestSessionHistory();… | Show session history |
| 296 | `frontend/src/components/ReasoningPanel.tsx:1787` | button | 📗 Wiki | () => { useProjectStore.getState().requestWiki(); } | Show the wiki (modelVeronice.txt) |
| 297 | `frontend/src/components/ReasoningPanel.tsx:1798` | button | 📋 Todo List | () => { useProjectStore.getState().requestTodo(); } | Open the todo list (TODO fixes.txt) |
| 298 | `frontend/src/components/ReasoningPanel.tsx:1830` | button | ↺ reset | () => setIntentDraft(pendingIntent ? { ...pendingIntent, co… | Restore the auto-extracted intent |
| 299 | `frontend/src/components/ReasoningPanel.tsx:1839` | input |  |  |  |
| 300 | `frontend/src/components/ReasoningPanel.tsx:1848` | input |  |  |  |
| 301 | `frontend/src/components/ReasoningPanel.tsx:1857` | input |  |  |  |
| 302 | `frontend/src/components/ReasoningPanel.tsx:1866` | input |  |  |  |
| 303 | `frontend/src/components/ReasoningPanel.tsx:1875` | input |  |  |  |
| 304 | `frontend/src/components/ReasoningPanel.tsx:1909` | input |  |  |  |
| 305 | `frontend/src/components/ReasoningPanel.tsx:1925` | input |  |  |  |
| 306 | `frontend/src/components/ReasoningPanel.tsx:1938` | input |  |  |  |
| 307 | `frontend/src/components/ReasoningPanel.tsx:1948` | input |  |  |  |
| 308 | `frontend/src/components/ReasoningPanel.tsx:1960` | button |  | submitStructuredAnswers |  |
| 309 | `frontend/src/components/ReasoningPanel.tsx:1968` | button | ✕ Dismiss | () => { pendingPlanRef.current = null; setPendingQuestions(… |  |
| 310 | `frontend/src/components/ReasoningPanel.tsx:1982` | button |  | () => { scaleTouchedRef.current = true; setBuildScale(opt.v… | `${opt.label}: ${opt.nodes} nodes. ${opt.hint}` |
| 311 | `frontend/src/components/ReasoningPanel.tsx:2017` | button |  | toggleListening | isListening ? 'Stop listening' : 'Push to talk — also avail… |
| 312 | `frontend/src/components/ReasoningPanel.tsx:2024` | button | 🔇 | () => { stopSpeaking(); setSpeakingId(null); assistantSpeak… | Stop speaking |
| 313 | `frontend/src/components/ReasoningPanel.tsx:2034` | button |  | handleSend |  |
| 314 | `frontend/src/components/ReferenceLibrary.tsx:259` | button | ✕ | onClose |  |
| 315 | `frontend/src/components/ReferenceLibrary.tsx:264` | button | 📖 Library | () => { setTab('library'); setSelectedFile(null); setSelect… |  |
| 316 | `frontend/src/components/ReferenceLibrary.tsx:270` | button | 📜 Bible | () => { setTab('bible'); setSelectedLevel(null); setBibleFi… |  |
| 317 | `frontend/src/components/ReferenceLibrary.tsx:281` | input |  |  |  |
| 318 | `frontend/src/components/ReferenceLibrary.tsx:328` | button | ← Back | backToFiles |  |
| 319 | `frontend/src/components/ReferenceLibrary.tsx:375` | button | ← All Levels | backToLevels |  |
| 320 | `frontend/src/components/ReferenceLibrary.tsx:424` | button | ← | backToLevelDetail |  |
| 321 | `frontend/src/components/ReviewPanel.tsx:176` | button | 🔄 Back to Editing | onCancel |  |
| 322 | `frontend/src/components/ReviewPanel.tsx:179` | button | ⚡ Regenerate Code | onRegenerate |  |
| 323 | `frontend/src/components/ReviewPanel.tsx:182` | button |  | handleApprove |  |
| 324 | `frontend/src/components/RoadmapDocked.tsx:64` | button |  | (e) => { e.stopPropagation(); setExpanded(!expanded); } |  |
| 325 | `frontend/src/components/RoadmapDocked.tsx:87` | button | ⚙ | handleOpenLogic | Open node logic editor |
| 326 | `frontend/src/components/RoadmapDocked.tsx:139` | button | ↗ | handleDetach | Open roadmap in new window |
| 327 | `frontend/src/components/RoadmapWindow.tsx:54` | button |  | (e) => { e.stopPropagation(); setExpanded(!expanded); } |  |
| 328 | `frontend/src/components/SandboxPreview.tsx:517` | button | 🔄 Refresh | handleRefresh | Regenerate preview |
| 329 | `frontend/src/components/SandboxPreview.tsx:525` | button | 🧪 Run Tests | handleRunTests | Run interaction tests |
| 330 | `frontend/src/components/SandboxPreview.tsx:591` | button | 🔄 Retry | handleRefresh |  |
| 331 | `frontend/src/components/SandboxPreview.tsx:675` | button | 🔄 | () => { setDockerStatusLoading(true); fetchDockerStatus(); } | Refresh health status |
| 332 | `frontend/src/components/SandboxPreview.tsx:686` | button | 🐳 Single Container | () => setDeployMode('single') |  |
| 333 | `frontend/src/components/SandboxPreview.tsx:692` | button | 🏗️ Multi-Service (Compose) | () => setDeployMode('compose') |  |
| 334 | `frontend/src/components/SandboxPreview.tsx:719` | button | 🐳 Start Container | handleStartDockerService |  |
| 335 | `frontend/src/components/SandboxPreview.tsx:735` | a | 🔗 |  |  |
| 336 | `frontend/src/components/SandboxPreview.tsx:736` | button | ⏹ Stop | handleStopDockerService |  |
| 337 | `frontend/src/components/SandboxPreview.tsx:743` | button | 🌐 Open in New Tab | () => dockerService.url && window.open(dockerService.url, '… |  |
| 338 | `frontend/src/components/SandboxPreview.tsx:750` | button | 🔄 Restart | handleStartDockerService |  |
| 339 | `frontend/src/components/SandboxPreview.tsx:756` | button | 🔄 Retry | handleStartDockerService |  |
| 340 | `frontend/src/components/SandboxPreview.tsx:791` | button | 🏗️ Start All Services | handleStartCompose |  |
| 341 | `frontend/src/components/SandboxPreview.tsx:812` | a | 🔗 |  |  |
| 342 | `frontend/src/components/SandboxPreview.tsx:818` | button | 🌐 Open | () => window.open(url, '_blank') |  |
| 343 | `frontend/src/components/SandboxPreview.tsx:822` | button | ⏹ Stop All | handleStopCompose |  |
| 344 | `frontend/src/components/SandboxPreview.tsx:829` | button | 🔄 Restart Stack | handleStartCompose |  |
| 345 | `frontend/src/components/SandboxPreview.tsx:835` | button | 🔄 Retry | handleStartCompose |  |
| 346 | `frontend/src/components/SandboxPreview.tsx:854` | button | 🔄 Return to Modify | onReturn |  |
| 347 | `frontend/src/components/SandboxPreview.tsx:858` | button | ⚡ Regenerate Code | onRegenerate |  |
| 348 | `frontend/src/components/SandboxPreview.tsx:862` | button |  | handleApprove |  |
| 349 | `frontend/src/components/SecondaryLlmChat.tsx:123` | button |  | send |  |
| 350 | `frontend/src/components/SessionHistoryPanel.tsx:168` | button | 💬 Conversation | () => setTab('chat') |  |
| 351 | `frontend/src/components/SessionHistoryPanel.tsx:169` | button | 🏗 Builds | () => setTab('builds') |  |
| 352 | `frontend/src/components/SessionHistoryPanel.tsx:170` | button | 💾 Sessions | () => setTab('sessions') |  |
| 353 | `frontend/src/components/SessionHistoryPanel.tsx:197` | button | Retry | fetchBuilds |  |
| 354 | `frontend/src/components/SessionHistoryPanel.tsx:231` | button | Retry | fetchSessions |  |
| 355 | `frontend/src/components/SessionHistoryPanel.tsx:246` | button | Load | () => handleLoadSession(s) |  |
| 356 | `frontend/src/components/SoulSettings.tsx:105` | button | ✕ | onClose |  |
| 357 | `frontend/src/components/SoulSettings.tsx:152` | input |  |  |  |
| 358 | `frontend/src/components/SoulSettings.tsx:186` | button | ↺ Reset | handleReset |  |
| 359 | `frontend/src/components/SoulSettings.tsx:194` | button |  | handleSave |  |
| 360 | `frontend/src/components/ToastHost.tsx:15` | button | ✕ | dismiss | Dismiss |
| 361 | `frontend/src/components/TodoPanel.tsx:97` | button | 🔄 | fetchTodo | Refresh the todo list |
| 362 | `frontend/src/components/TodoPanel.tsx:111` | button | Retry | fetchTodo |  |
| 363 | `frontend/src/components/TodoPanel.tsx:130` | button | scan summary | () => setShowMeta((v) => !v) |  |
| 364 | `frontend/src/components/TodoPanel.tsx:139` | input |  |  |  |
| 365 | `frontend/src/components/Toolbar.tsx:47` | select | {LANGUAGE_OPTIONS.map((lang) => ( ))} |  |  |
| 366 | `frontend/src/components/Toolbar.tsx:62` | button |  | () => setTargetOS(os.value) | os.label |
| 367 | `frontend/src/components/Toolbar.tsx:74` | button |  | onPlan | planMode ? 'Big Plan Mode is ON — you are designing, not bu… |
| 368 | `frontend/src/components/Toolbar.tsx:84` | button | 🧠 Build from Description | onBlueprint | Build from a plain-language description — matches the 1228-… |
| 369 | `frontend/src/components/Toolbar.tsx:92` | button |  | onGenerate |  |
| 370 | `frontend/src/components/Toolbar.tsx:100` | button |  | onBuild | Generate code and preview the app |
| 371 | `frontend/src/components/Toolbar.tsx:109` | button | 📦 Export | onExport |  |
| 372 | `frontend/src/components/Toolbar.tsx:117` | button | 🗑 Clear | onClear |  |
| 373 | `frontend/src/components/TutorialOverlay.tsx:155` | button |  | () => goToStep(idx) |  |
| 374 | `frontend/src/components/TutorialOverlay.tsx:166` | button | Skip Tour | skip |  |
| 375 | `frontend/src/components/TutorialOverlay.tsx:170` | button | ← Back | prev |  |
| 376 | `frontend/src/components/TutorialOverlay.tsx:177` | button |  | next |  |
| 377 | `frontend/src/components/UIFunctionNode.tsx:237` | button |  | (e) => { e.stopPropagation(); setShowBridge(!showBridge); } | showBridge ? 'Collapse' : 'Expand' |
| 378 | `frontend/src/components/UIFunctionNode.tsx:276` | button | 🎯 Generate Suggestions Now | fetchSuggestions |  |
| 379 | `frontend/src/components/UIFunctionNode.tsx:317` | button | ↻ Regenerate | fetchSuggestions |  |
| 380 | `frontend/src/components/UIFunctionNode.tsx:339` | input |  |  |  |
| 381 | `frontend/src/components/UIFunctionNode.tsx:353` | button | ✕ | () => setSearchQuery('') |  |
| 382 | `frontend/src/components/UIFunctionNode.tsx:519` | select | — Select a node — {codeNodes.map((n) => ( ( ) ))} |  |  |
| 383 | `frontend/src/components/UIFunctionNode.tsx:547` | button |  | () => setNodeMapping(prev => ({ ...prev, [fn.id]: isActive … |  |
| 384 | `frontend/src/components/UIFunctionNode.tsx:606` | button |  | handleFinalize |  |
| 385 | `frontend/src/components/UIFunctionNode.tsx:636` | button |  | () => handleCopyCode(finalCode) | Copy to clipboard |
| 386 | `frontend/src/components/UserNamePrompt.tsx:121` | input |  |  |  |
| 387 | `frontend/src/components/UserNamePrompt.tsx:134` | button |  | handleSubmit |  |
| 388 | `frontend/src/components/WikiPanel.tsx:73` | button | 🔄 | fetchWiki | Refresh the wiki |
| 389 | `frontend/src/components/WikiPanel.tsx:87` | button | Retry | fetchWiki |  |
| 390 | `frontend/src/components/WikiPanel.tsx:94` | input |  |  |  |
| 391 | `frontend/src/components/WikiPanel.tsx:108` | button |  | () => setSelected(s.number) | s.title |
