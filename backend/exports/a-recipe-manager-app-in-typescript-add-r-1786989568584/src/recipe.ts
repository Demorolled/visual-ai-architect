export interface Recipe {
  name: string;
  servings: number;
  ingredients: string[];
}

export function addRecipe(recipe: Recipe) {
  // Add recipe logic
}

export function listRecipes(): Recipe[] {
  // List recipes logic
  return [];
}