import { ContactItem, addContact, listContacts, searchContacts, editContact, deleteContact } from '../contact';

export function run(input: string): void {
  try {
    const args = input.split(' ');
    if (args.length < 2) {
      console.log('Usage: <command> <arg>');
      return;
    }

    const command = args[0];
    const arg = args[1];

    switch (command) {
      case 'add':
        addContact(arg);
        console.log(`Contact added: ${arg}`);
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
        editContact(arg);
        console.log(`Contact edited: ${arg}`);
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