import { startAPI } from './api';
import { NoteService } from './api';

const runTests = async () => {
    try {
        const api = await startAPI();
        const noteService = api.NoteService;
        await noteService.create({ title: 'Test Note' });
        await noteService.list();
        await noteService.update({ id: 1, title: 'Updated Note' });
        await noteService.delete(1);
        console.log('Tests passed.');
    } catch (error) {
        console.error('Tests failed:', error);
    }
};

export { runTests };