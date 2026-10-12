import { loadPlaylists, savePlaylists } from '../storage.ts';

interface Playlist {
  id: string;
  name: string;
  songs: string[];
}

export class PlaylistManager {
  private playlists: Playlist[] = [];

  constructor() {
    this.loadPlaylists();
  }

  private loadPlaylists() {
    this.playlists = loadPlaylists();
  }

  private savePlaylists() {
    savePlaylists(this.playlists);
  }

  create(name: string): Playlist {
    const playlist: Playlist = {
      id: Date.now().toString(),
      name,
      songs: [],
    };
    this.playlists.push(playlist);
    this.savePlaylists();
    return playlist;
  }

  delete(id: string): boolean {
    const index = this.playlists.findIndex(p => p.id === id);
    if (index === -1) return false;
    this.playlists.splice(index, 1);
    this.savePlaylists();
    return true;
  }

  addSong(playlistId: string, song: string): boolean {
    const playlist = this.playlists.find(p => p.id === playlistId);
    if (!playlist) return false;
    playlist.songs.push(song);
    this.savePlaylists();
    return true;
  }

  removeSong(playlistId: string, song: string): boolean {
    const playlist = this.playlists.find(p => p.