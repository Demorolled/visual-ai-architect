import { Playlist, Song } from '../playlistService.ts';

export async function loadPlaylists(filePath: string): Promise<Playlist[]> {
  try {
    const data = await Deno.readTextFile(filePath);
    return JSON.parse(data);
  } catch (err) {
    console.error('Failed to load playlists:', err);
    return [];
  }
}

export async function savePlaylists(filePath: string, playlists: Playlist[]): Promise<void> {
  try {
    await Deno.writeTextFile(filePath, JSON.stringify(playlists, null, 2));
  } catch (err) {
    console.error('Failed to save playlists:', err);
  }
}