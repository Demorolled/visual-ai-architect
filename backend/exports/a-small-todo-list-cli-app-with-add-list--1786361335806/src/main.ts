import { addTodo, listTodos, completeTodo } from './todo'

const args = process.argv.slice(2)
const command = args[0] ?? 'list'

switch (command) {
    case 'add': {
        const content = args[1] ?? ''
        addTodo({ content, id: Date.now() })
        break
    }
    case 'complete': {
        const id = parseInt(args[1] ?? '', 10)
        completeTodo({ id })
        break
    }
    default:
        listTodos()
        break
}