import { BudgetItem } from './budget';

export async function loadBudget(filePath: string): Promise<BudgetItem[]> {
  try {
    const data = await Deno.readTextFile(filePath);
    const items = JSON.parse(data) as BudgetItem[];
    return items;
  } catch (error) {
    console.error(`Error loading budget from ${filePath}: ${error.message}`);
    return [];
  }
}

export async function saveBudget(filePath: string, items: BudgetItem[]): Promise<void> {
  try {
    const data = JSON.stringify(items, null, 2);
    await Deno.writeTextFile(filePath, data);
  } catch (error) {
    console.error(`Error saving budget to ${filePath}: ${error.message}`);
  }
}