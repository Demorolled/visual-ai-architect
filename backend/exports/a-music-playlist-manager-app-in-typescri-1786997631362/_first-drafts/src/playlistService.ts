import { createPlaylist, addSong, removeSong, shufflePlaylist } from '../src/playlistService.ts';

// Test suite for playlistService.ts
describe('playlistService.ts', () => {
  let playlists: Playlist[] = [];

  beforeEach(() => {
    playlists = [];
  });

  // Helper function to get a playlist by name
  const getPlaylist = (name: string): Playlist | undefined => {
    return playlists.find(p => p.name === name);
  };

  it('should create a playlist', () => {
    const name = 'My Playlist';
    createPlaylist(name);
    const playlist = getPlaylist(name);
    expect(playlist).toBeTruthy();
    expect(playlist!.name).toBe(name);
    expect(playlist!.songs).toEqual([]);
  });

  it('should add a song to a playlist', () => {
    const playlistName = 'My Playlist';
    const songName = 'Song Name';
    createPlaylist(playlistName);
    addSong(playlistName, songName);
    const playlist = getPlaylist(playlistName);
    expect(playlist).