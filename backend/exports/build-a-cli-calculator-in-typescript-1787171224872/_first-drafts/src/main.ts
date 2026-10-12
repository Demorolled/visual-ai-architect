import { add, subtract, multiply, divide } from './calculator';

function main() {
  const args = process.argv.slice(2);
  if (args.length !== 2) {
    console.error('Usage: node src/main.ts <number1> <number2>');
    return;
  }

  const num1 = parseInt(args[0], 10);
  const num2 = parseInt(args[1], 10);

  const result = add(num1, num2);
  console.log(`Result: ${result}`);
}

main();
```

This TypeScript code snippet defines a `main` function that takes two command-line arguments, converts them from strings to numbers, and then calculates and logs the sum of the two numbers using the `add` function from the `calculator` module. The `process.argv` array provides access to the command-line arguments, and `parseInt` is used to convert the command-line arguments to numbers. The `main` function checks if exactly two arguments are provided and then calculates the sum of the two numbers using the `add` function. Finally, it logs the result to the console.