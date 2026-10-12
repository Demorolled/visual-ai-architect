export interface CalculatorState {
  currentNumber: number;
  previousNumber: number;
  operation: string;
}

export function handleNumberClick(number: number, state: CalculatorState): void {
  state.currentNumber = state.currentNumber * 10 + number;
}

export function handleOperationClick(operation: string, state: CalculatorState): void {
  if (state.previousNumber !== 0) {
    state.previousNumber = performOperation(state.previousNumber, state.currentNumber, state.operation);
  }
  state.previousNumber = state.currentNumber;
  state.currentNumber = 0;
  state.operation = operation;
}

export function handleEqualsClick(state: CalculatorState): number {
  if (state.previousNumber === 0) {
    return state.currentNumber;
  }
  return performOperation(state.previousNumber, state.currentNumber, state.operation);
}

function performOperation(num1: number, num2: number, op: string): number {
  switch (op) {
    case '+': return num1 + num2;
    case '-': return num1 - num2;
    case '*': return num1 * num2;
    case '/': return num1 / num2;
    default: return num1;
  }
}