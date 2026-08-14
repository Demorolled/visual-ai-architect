# Visual AI Code Architect

AI-powered development environment where users build software visually using flowcharts.

## Features

- **Visual Node Editor**: Drag-and-drop canvas for building application flow
- **Plain English Descriptions**: Describe what each node should do in natural language
- **Layered Code Generation**: AI builds infrastructure → logic → connectivity
- **Sandbox Validation**: Automatic testing in OS-specific containers
- **Multi-Platform Export**: Generate executables for Windows, Mac, Linux, iOS

## Quick Start

```bash
# Install dependencies
npm install

# Run both frontend and backend
npm run dev

# Or run separately
npm run dev:frontend  # Frontend on http://localhost:5173
npm run dev:backend   # Backend on http://localhost:3001
```

## Project Structure

```
visual-ai-architect/
├── frontend/          # React + React Flow UI
├── backend/           # Express API + AI engine
├── sandbox/           # Docker container configs
└── projects/          # Generated code output
```

## Architecture


