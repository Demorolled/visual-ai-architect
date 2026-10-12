import { RecipeItem } from './recipe';

export function loadRecipes(): RecipeItem[] {
  try {
    const data = require('../data/recipes.json');
    return data.recipes || [];
  } catch {
    return [];
  }
}

export function saveRecipes(recipes: RecipeItem[]) {
  const fs = require('fs');
  const path = require('path');
  const recipesData = { recipes };
  const recipesJson = JSON.stringify(recipesData, null, 2);
  const filePath = path.join(__dirname, '../data/recipes.json');
  fs.writeFileSync(filePath, recipesJson);
}