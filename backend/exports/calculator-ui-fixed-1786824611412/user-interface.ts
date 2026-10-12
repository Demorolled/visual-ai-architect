import { DataStorage } from '../data-storage/data-storage.ts';

export function render(container: HTMLElement) {
  container.innerHTML = `
    <div class="calculator">
      <div class="display" id="display">0</div>
      <div class="buttons">
        <button class="btn" data-num="7">7</button>
        <button class="btn" data-num="8">8</button>
        <button class="btn" data-num="9">9</button>
        <button class="btn" data-op="/">÷</button>
        <button class="btn" data-num="4">4</button>
        <button class="btn" data-num="5">5</button>
        <button class="btn" data-num="6">6</button>
        <button class="btn" data-op="*">*</button>
        <button class="btn" data-num="1">1</button>
        <button class="btn" data-num="2">2</button>
        <button class="btn" data-num="3">3</button>
        <button class="btn" data-op="-">-</button>
        <button class="btn" data-num="0">0</button>
        <button class="btn" data-num=".">.</button>
        <button class="btn" data-clear="1">C</button>
        <button class="btn" data-op="+">+</button>
        <button class="btn" data-equals="1">=</button>
      </div>
    </div>
  `;

  let currentInput = '';
  let firstOperand: number | null = null;
  let operation: string | null = null;

  const display = container.querySelector('#display') as HTMLElement;

  container.querySelectorAll('.btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const num = (btn as HTMLElement).dataset.num;
      const op = (btn as HTMLElement).dataset.op;
      if (num !== undefined) {
        appendNumber(num);
      } else if (op !== undefined) {
        performOperation(op);
      } else if ((btn as HTMLElement).dataset.clear !== undefined) {
        clearDisplay();
      } else if ((btn as HTMLElement).dataset.equals !== undefined) {
        calculateResult();
      }
    });
  });

  function appendNumber(num: string) {
    if (currentInput === '0' && num === '0') return;
    if (num === '.') {
      if (currentInput.includes('.')) return;
      if (currentInput === '') currentInput = '0';
    }
    currentInput += num;
    updateDisplay();
  }

  function performOperation(op: string) {
    if (currentInput === '') return;
    if (firstOperand !== null) {
      calculateResult();
    }
    firstOperand = parseFloat(currentInput);
    operation = op;
    currentInput = '';
  }

  function clearDisplay() {
    currentInput = '';
    firstOperand = null;
    operation = null;
    updateDisplay();
  }

  function calculateResult() {
    if (currentInput === '' || firstOperand === null || operation === null) return;
    const secondOperand = parseFloat(currentInput);
    let result = 0;
    switch (operation) {
      case '+':
        result = firstOperand + secondOperand;
        break;
      case '-':
        result = firstOperand - secondOperand;
        break;
      case '*':
        result = firstOperand * secondOperand;
        break;
      case '/':
        if (secondOperand === 0) {
          currentInput = 'Error';
          updateDisplay();
          return;
        }
        result = firstOperand / secondOperand;
        break;
    }
    currentInput = result.toString();
    firstOperand = null;
    operation = null;
    updateDisplay();
  }

  function updateDisplay() {
    if (display) {
      display.textContent = currentInput || '0';
    }
  }
}
