import { Playlist } from '../types/types.ts';

export async function loadPlaylists(): Promise<Playlist[]> {
  try {
    const response = await fetch('/data/playlists.json');
    if (!response.ok) {
      throw new Error(`Failed to load playlists: ${response.statusText}`);
    }
    return await response.json();
  } catch (error) {
    console.error('Error loading playlists:', error);
    return [];
  }
}

export async function savePlaylists(playlists: Playlist[]): Promise<void> {
  try {
    const response = await fetch('/data/playlists.json', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(playlists),
    });
    if (!response.ok) {
      throw new Error(`Failed to save playlists: ${response.statusText}`);
    }
  } catch (error) {
    console.error('Error saving playlists:', error);
  }
}