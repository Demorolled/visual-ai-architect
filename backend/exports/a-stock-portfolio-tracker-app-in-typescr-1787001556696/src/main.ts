import { Portfolio, addTransaction, getHoldings, getProfitLoss } from './portfolio';

export function run() {
  // Parse arguments
  const args = process.argv.slice(2);
  const command = args[0];
  const symbol = args[1];
  const quantity = parseFloat(args[2]);
  const price = parseFloat(args[3]);

  // Validate input
  if (!command || !symbol || !quantity || !price) {
    console.error('Usage: <command> <symbol> <quantity> <price>');
    process.exit(1);
  }

  // Initialize portfolio
  const portfolio = new Portfolio();

  // Add transaction
  addTransaction(portfolio, symbol, quantity, price);

  // Get holdings
  const holdings = getHoldings(portfolio);

  // Get profit/loss
  const profitLoss = getProfitLoss(portfolio);

  // Display results
  console.log(`Holdings: ${JSON.stringify(holdings, null, 2)}`);
  console.log(`Profit/Loss: ${profitLoss.toFixed(2)}`);
}

export function main() {
  try {
    run();
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
}