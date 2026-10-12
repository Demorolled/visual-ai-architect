export interface Song {
  id: string;
  title: string;
  artist: string;
  album: string;
  duration: number;
}

export interface Playlist {
  id: string;
  name: string;
  songs: Song[];
}

export function createPlaylist(name: string): Playlist {
  return {
    id: Date.now().toString(),
    name,
    songs: [],
  };
}

export function addSong(playlist: Playlist, song: Song): void {
  playlist.songs.push(song);
}

export function removeSong(playlist: Playlist, songId: string): void {
  playlist.songs = playlist.songs.filter((song) => song.id !== songId);
}

export function shufflePlaylist(playlist: Playlist): void {
  for (let i = playlist.songs.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [playlist.songs[i], playlist.songs[j]] = [playlist.songs[j], playlist.songs[i]];
  }
}

export function findPlaylist(playlists: Playlist[], name: string): Playlist | null {
  return playlists.find((playlist) => playlist.name === name) || null;
}

export function savePlaylists(playlists: Playlist[], filePath: string): void {
  const fs = require('fs');
  const data = JSON.stringify(playlists, null, 2);
  fs.writeFileSync(filePath, data);
}

export function loadPlaylists(filePath: string): Playlist[] {
  const fs = require('fs');
  try {
    const data = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(data) || [];
  } catch (e) {
    return [];
  }
}