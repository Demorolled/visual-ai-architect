import { DataStore } from '../data-store/data-store.ts';

export function searchAndFilter(query: string, items: any[]): any[] {
  if (!query) return items;
  const lowerQuery = query.toLowerCase();
  return items.filter((item) => {
    const title = item.title ? item.title.toLowerCase() : '';
    const description = item.description ? item.description.toLowerCase() : '';
    const tags = item.tags ? item.tags.join(',').toLowerCase() : '';
    return title.includes(lowerQuery) || description.includes(lowerQuery) || tags.includes(lowerQuery);
  });
}