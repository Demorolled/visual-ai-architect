export class Portfolio {
  private holdings: Record<string, { shares: number; costBasis: number }>;

  constructor() {
    this.holdings = {};
  }

  addTransaction(symbol: string, shares: number, price: number): void {
    const current = this.holdings[symbol];
    if (current) {
      current.shares += shares;
      current.costBasis += shares * price;
    } else {
      this.holdings[symbol] = { shares, costBasis: shares * price };
    }
  }

  getHoldings(): Record<string, { shares: number; costBasis: number }> {
    return this.holdings;
  }

  getProfitLoss(currentPrices: Record<string, number>): Record<string, number> {
    const profitLoss: Record<string, number> = {};
    for (const [symbol, holding] of Object.entries(this.holdings)) {
      if (currentPrices[symbol]) {
        profitLoss[symbol] = (currentPrices[symbol] - holding.costBasis / holding.shares) * holding.shares;
      }
    }
    return profitLoss;
  }
}