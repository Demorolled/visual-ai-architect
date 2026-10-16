# TODO — later

Findings parked for later work. Newest first.

**Why this file is not called `TODO fixes.txt`:** that name is owned by the
app's Todo panel (`backend/src/routes/todo.ts` parses it, and
`todo.test.ts` asserts a present file has exactly 8 specific sections).
A separate name keeps this list out of that parser and its test.

---

## REA language coverage — what it can actually reverse engineer

*Found 2026-10-16, while dropping a Java project through Deep Scan. Everything
below was measured on this box unless marked "per docs".*

**The headline: REA does not take programming languages, it takes build
artifacts.** JavaScript/TypeScript is the only language it reads as source.
Everything else has to arrive compiled.

| You have | What REA needs | Path |
| --- | --- | --- |
| JS / TS / Electron | the files themselves | `analyze-javascript-application` |
| C# / F# / VB.NET | managed PE/CLI assembly | `inspect-managed-artifact` |
| C, C++, Swift, Obj-C, Kotlin/Native | native binary | `analyze` + Hopper/Ghidra/IDA |
| Go | binary | `inspect-go-binary` |
| Rust | binary (cargo-auditable) | `inspect-rust-binary` |
| Java / Kotlin (Android) | APK / dex | JADX → `inspect-android-class` |
| **Java (desktop .jar/.class)** | **nothing — unsupported** | — |
| Dart / Flutter | compiled AOT app | `identify-flutter-build`, `inspect-dart-aot` |
| WASM | `.wasm` | `inspect-wasm-artifact` |
| Solidity / EVM | bytecode | `inspect-evm-interface` |
| Python, Ruby, PHP, any other source | the source tree | `import-reference-source` (reference only) |
| Apple bundles, firmware, pcap, signals, crashes | those artifacts | per docs |

*(Rows other than JS/TS, and the provider requirements, are REA's own claims —
`node_modules/rea-agents/README.md` v6.5.0. Only the rows about the JS pipeline,
the reference-source import, and provider availability were executed here.)*

- [ ] **L.1 No `.jar`/`.class` reader — desktop Java cannot be analysed at all.**
      Android Java/Kotlin reaches REA as an APK (JADX → dex); desktop Java has no
      path except GraalVM `native-image` + a native engine, or
      `import-reference-source`, which reads structure and no semantics.
      Measured: `rea analyze` on the compiled `out/` ran the *JavaScript*
      pipeline (`analyze_javascript_application → parse_javascript_sources`) and
      reported **0 selected application source files** — it did not even
      inventory the `.class` files as source.
      → Either compile Java to native before analysis, or write a Java-aware
      reader. VACA today gets the structure for free and none of the meaning.

- [ ] **L.2 A non-JS drop silently becomes reference-only — every dependency is lost.**
      `planReaScan` (backend/src/reverse/deepScan.ts) sends any tree without a
      `package.json`/JS file to `import-reference-source`, whose imports are
      hashed, not parsed (`content_state: "hashed"`,
      `inventory_state: "partial"`). Measured on `~/Desktop/tic tac toe`: 3
      modules, 17/17 files, **0 edges** — for 7 classes that call each other
      (`Main → Game → Board/Player/AiPlayer/ConsoleUI`).
      → Warn the user in the UI *before* scanning, and/or resolve imports
      ourselves for the languages we can parse.

- [ ] **L.3 No analysis engine is installed here — native and APK analysis are dead ends.**
      `rea doctor` → `healthy: false`. node 24.18.0 ok, ubuntu 26.04 ok; then
      `hopper` missing (`HOPPER_LAUNCHER_PATH`), `ghidra` missing
      (`GHIDRA_INSTALL_DIR`), `ida` missing (`REA_IDA_MCP_CONFIG`), `jadx` missing
      (`REA_JADX_MCP_JAR` — REA never downloads it). `rea-dotnet-static` is
      available (static, no engine), and JS/Electron needs none.
      → Set those env vars to unlock native binaries and APKs.

- [ ] **L.4 REA's own environment has config drift.**
      `skill:identity` missing, `registration:opencode` drifting.
      → Run `rea setup` to refresh the skill and registrations.

- [ ] **L.5 Decide VACA's policy for non-JS drops.**
      Reference-only is honest but easy to mistake for analysis: the canvas looks
      populated while carrying no relationships. The copy is *positionally*
      faithful and *semantically* empty.
      → Pick per-language behaviour: reference-only with a loud label, a
      real parser, or refuse the scan.
