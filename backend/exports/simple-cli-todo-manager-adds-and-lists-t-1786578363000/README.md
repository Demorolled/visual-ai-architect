# Simple CLI Todo Manager

A minimal TypeScript CLI todo manager that adds and lists todos from the command line.

## Commands

```bash
todo add "Buy milk"      # add a todo
todo list                # list all todos
todo complete 1          # mark a todo as completed
todo remove 1            # remove a todo
todo --help              # show help
```

## Run

```bash
npm install
npm start -- add "Buy milk"
npm start -- list
```

Or directly with tsx:

```bash
npx tsx src/main.ts add "Buy milk"
npx tsx src/main.ts list
```

## Storage

Todos persist to `~/.todo-cli/todos.json` (override with the `TODO_FILE`
environment variable), so state survives across invocations.
