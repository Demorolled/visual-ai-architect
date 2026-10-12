import { createPlaylist, addSong, removeSong, shufflePlaylist } from '../src/playlistService.ts';
import { loadPlaylists, savePlaylists } from '../src/storage.ts';

export async function run() {
  try {
    const args = process.argv.slice(2);
    const [command, ...params] = args;
    const filePath = 'playlists.json';
    let playlists = await loadPlaylists(filePath);

    switch (command) {
      case 'create':
        if (params.length < 2) throw new Error('Usage: create <playlistName> <songName>');
        const playlistName = params[0];
        const songName = params[1];
        const created = createPlaylist(playlistName);
        if (created) {
          console.log(`Created playlist "${playlistName}"`);
        } else {
          console.log(`Playlist "${playlistName}" already exists`);
        }
        playlists = await loadPlaylists(filePath);
        break;
      case 'add':
        if (params.length < 2) throw new Error('Usage: add <playlistName> <songName>');
        const playlistNameAdd = params[0];
        const songNameAdd = params[1];
        const added = addSong(playlistNameAdd, songNameAdd);
        if (added) {
          console.log(`Added song "${songNameAdd}" to playlist "${playlistNameAdd}"`);
        } else {
          console.log(`Playlist "${playlistNameAdd}" not found`);
        }
        playlists = await loadPlaylists(filePath);
        break;
      case 'remove':
        if (params.length < 2) throw new Error('Usage: remove <playlistName> <songName>');
        const playlistNameRemove = params[0];
        const songNameRemove = params[1];
        const removed = removeSong(playlistNameRemove, songNameRemove);
        if (removed) {
          console.log(`Removed song "${songNameRemove}" from playlist "${playlistNameRemove}"`);
        } else {
          console.log(`Playlist "${playlistNameRemove}" or song "${songNameRemove}" not found`);
        }
        playlists = await loadPlaylists(filePath);
        break;
      case 'shuffle':
        if (params.length < 1) throw new Error('Usage: shuffle <playlistName>');
        const playlistNameShuffle = params[0];
        const shuffled = shufflePlaylist(playlistNameShuffle);
        if (shuffled) {
          console.log(`Shuffled playlist "${playlistNameShuffle}"`);
        } else {
          console.log(`Playlist "${playlistNameShuffle}" not found`);
        }
        playlists = await loadPlaylists(filePath);
        break;
      case 'list':
        if (playlists.length === 0) {
          console.log('No playlists found');
        } else {
          playlists.forEach(p => console.log(`Playlist "${p.name}": ${p.songs.join(', ')}`));
        }
        break;
      default:
        console.error('Unknown command');
        console.error('Available commands: create, add, remove, shuffle, list');
        process.exit(1);
    }

    await savePlaylists(filePath, playlists);
  } catch (err) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }
}

export function main() {
  run();
}