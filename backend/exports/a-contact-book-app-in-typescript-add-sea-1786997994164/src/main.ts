import { ContactItem, addContact, listContacts, searchContacts, editContact, deleteContact } from './contact';
import { loadContacts, saveContacts } from './storage';

export function run(input: string): void {
  try {
    const args = input.split(' ');
    if (args.length < 2) {
      console.log('Usage: <command> <arg>');
      return;
    }

    const command = args[0];
    const arg = args.slice(1).join(' ');

    switch (command) {
      case 'add':
        const [name, email, phone, tagsStr] = arg.split(',');
        const tags = tagsStr ? tagsStr.split(',') : [];
        addContact(name, email, phone, tags);
        console.log(`Contact added: ${name}`);
        break;
      case 'list':
        const contacts = listContacts();
        console.log('Contacts:');
        contacts.forEach(contact => console.log(contact));
        break;
      case 'search':
        const results = searchContacts(arg);
        console.log('Search results:');
        results.forEach(contact => console.log(contact));
        break;
      case 'edit':
        const [id, newName, newEmail, newPhone, newTagsStr] = arg.split(',');
        const newTags = newTagsStr ? newTagsStr.split(',') : [];
        editContact(id, newName, newEmail, newPhone, newTags);
        console.log(`Contact edited: ${id}`);
        break;
      case 'delete':
        deleteContact(arg);
        console.log(`Contact deleted: ${arg}`);
        break;
      default:
        console.log('Unknown command');
    }
  } catch (error) {
    console.error('An error occurred:', error);
  }
}

export function main(): void {
  const input = process.argv.slice(2).join(' ');
  run(input);
}