fn evaluate_rpn(expression: &str) -> Result<f64, Box<dyn std::error::Error>> {
    let ops = expression.split_whitespace();
    let mut stack = vec![];

    for op in ops {
        if op.parse::<f64>().is_ok() {
            stack.push(op.parse::<f64>().unwrap());
        } else {
            if stack.len() < 2 {
                return Err("Stack underflow".into());
            }
            let b = stack.pop().unwrap();
            let a = stack.pop().unwrap();

            let result = match op {
                "+" => a + b,
                "-" => a - b,
                "*" => a * b,
                "/" => a / b,
                _ => return Err("Unknown operator".into()),
            };

          // Add
          stack.push(result);
        }
    }

    if !stack.is_empty() && stack.len() == 1 {
     return Ok(stack.pop().unwrap());
    }

Ok(0.0)
}