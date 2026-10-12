import { PlaylistManager } from '../playlist';
import { loadPlaylists, savePlaylists } from '../storage';

export async function run() {
  const playlists = await loadPlaylists();
  const playlistManager = new PlaylistManager(playlists);

  const args = process.argv.slice(2);
  if (args.length < 2) {
    console.log('Usage: node main.js <command> <args>');
    return;
  }

  const command = args[0];
  const playlistName = args[1];

  switch (command) {
    case 'create':
      playlistManager.createPlaylist(playlistName);
      await savePlaylists(playlistManager.playlists);
      console.log(`Playlist "${playlistName}" created`);
      break;
    case 'delete':
      playlistManager.deletePlaylist(playlistName);
      await savePlaylists(playlistManager.playlists);
      console.log(`Playlist "${playlistName}" deleted`);
      break;
    case 'add':
      const song = args[2];
      playlistManager.addSong(playlistName, song);
      await savePlaylists(playlistManager.playlists);
      console.log(`Song "${song}" added to playlist "${playlistName}"`);
      break;
    case 'remove':
      const songToRemove = args[2];
      playlistManager.removeSong(playlistName, songToRemove);
      await savePlaylists(playlistManager.playlists);
      console.log(`Song "${songToRemove}" removed from playlist "${playlistName}"`);
      break;
    case 'shuffle':
      const shuffledSongs = playlistManager.shufflePlaylist(playlistName);
      console.log(`Shuffled playlist "${playlistName}":`, shuffledSongs);
      break;
    default:
      console.log('Unknown command');
  }
}