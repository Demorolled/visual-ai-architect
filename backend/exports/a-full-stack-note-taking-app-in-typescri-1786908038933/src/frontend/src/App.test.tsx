import ReactDOM from 'react-dom';
import NoteApp from './components/NoteApp';

 describe('NoteApp Component', () => {
   test('renders correctly', () => {
     const element = document.createElement('div');
     document.body.appendChild(element);
     ReactDOM.render(<NoteApp />, element);
     expect(element.innerHTML).toContain('Notes');
   });
 });