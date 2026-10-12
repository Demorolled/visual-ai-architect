import { addRecipe, scaleServings, searchRecipes } from './recipeService';
import { loadRecipes, saveRecipes } from './storage';

async function main() {
  const recipes = await loadRecipes();

  const recipe = {
    name: 'Chocolate Cake',
    servings: 8,
    ingredients: ['flour', 'sugar', 'eggs', 'cocoa'],
  };

  addRecipe(recipe);
  recipes.push(recipe);

  const scaled = scaleServings(recipe, 2);
  console.log('Scaled:', scaled);

  const searched = searchRecipes(recipes, 'eggs');
  console.log('Search results:', searched);

  await saveRecipes(recipes);
}

export { main };