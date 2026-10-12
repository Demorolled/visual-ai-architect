import { ContactItem, addContact, listContacts, searchContacts, editContact, deleteContact } from '../contact.ts';

export async function loadContacts(): Promise<ContactItem[]> {
  try {
    const data = await Deno.readTextFile('contacts.json');
    return JSON.parse(data) as ContactItem[];
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) {
      return [];
    }
    throw error;
  }
}

export async function saveContacts(contacts: ContactItem[]): Promise<void> {
  await Deno.writeTextFile('contacts.json', JSON.stringify(contacts, null, 2));
}