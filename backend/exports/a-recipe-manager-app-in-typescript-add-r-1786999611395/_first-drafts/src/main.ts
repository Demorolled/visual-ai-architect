import { RecipeItem, addRecipe, searchRecipesByIngredient, scaleServings } from './recipe';

function main() {
  const recipes: RecipeItem[] = [];

  // Add recipes
  const recipe1: RecipeItem = {
    name: 'Spaghetti Carbonara',
    ingredients: ['spaghetti', 'eggs', 'pancetta', 'pecorino', 'black pepper'],
    servings: 4
  };
  const recipe2: RecipeItem = {
    name: 'Chicken Tikka Masala',
    ingredients: ['chicken', 'tomatoes', 'onions', 'garlic', 'curry powder', 'basmati rice'],
    servings: 6
  };

  addRecipe(recipes, recipe1);
  addRecipe(recipes, recipe2);

  // Scale servings
  const scaledRecipe = scaleServings(recipe1, 8);
  console.log(`Scaled servings: ${scaledRecipe.servings}`);

  // Search by ingredient
  const searchResults = searchRecipesByIngredient(recipes, 'chicken');
  console.log(`Search results: ${searchResults.length} recipes`);
}

export { main };