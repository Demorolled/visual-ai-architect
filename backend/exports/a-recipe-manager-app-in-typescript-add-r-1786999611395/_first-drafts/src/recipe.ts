export interface RecipeItem {
  name: string;
  ingredients: string[];
  servings: number;
}

export function addRecipe(recipes: RecipeItem[], recipe: RecipeItem) {
  recipes.push(recipe);
}

export function searchRecipesByIngredient(recipes: RecipeItem[], ingredient: string) {
  return recipes.filter(r => r.ingredients.includes(ingredient));
}

export function scaleServings(recipe: RecipeItem, servings: number) {
  return { ...recipe, servings };
}