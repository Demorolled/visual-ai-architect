export function runCode(code: string): string {
  try {
    return eval(code) instanceof Object ? 'Result is not a string' : (code as unknown as string);
  } catch (e) {
    return e instanceof SyntaxError ? e.message : 'Error running code';
  }
}