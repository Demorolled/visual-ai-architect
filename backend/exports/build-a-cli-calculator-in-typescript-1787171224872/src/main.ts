import { add, subtract, multiply, divide } from './calculator';

function main() {
  const args = process.argv.slice(2);
  if (args.length !== 3) {
    console.error('Usage: node src/main.ts <number1> <operator> <number2>');
    return;
  }

  const num1 = parseFloat(args[0]);
  const operator = args[1];
  const num2 = parseFloat(args[2]);

  if (isNaN(num1) || isNaN(num2)) {
    console.error('Invalid input. Please provide numbers.');
    return;
  }

  let result: number;
  switch (operator) {
    case '+':
      result = add(num1, num2);
      break;
    case '-':
      result = subtract(num1, num2);
      break;
    case '*':
      result = multiply(num1, num2);
      break;
    case '/':
      if (num2 === 0) {
        console.error('Division by zero.');
        return;
      }
      result = divide(num1, num2);
      break;
    default:
      console.error('Invalid operator. Use +, -, *, or /');
      return;
  }

  console.log(`Result: ${result}`);
}

main();