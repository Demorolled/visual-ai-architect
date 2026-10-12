export interface ContactItem {
  id: string;
  name: string;
  email: string;
  phone: string;
  tags: string[];
}

let contacts: ContactItem[] = [];

export function addContact(name: string, email: string, phone: string, tags: string[]): ContactItem {
  const newContact: ContactItem = {
    id: Date.now().toString(),
    name,
    email,
    phone,
    tags,
  };
  contacts.push(newContact);
  return newContact;
}

export function listContacts(): ContactItem[] {
  return contacts;
}

export function searchContacts(query: string): ContactItem[] {
  return contacts.filter(contact => contact.name.toLowerCase().includes(query.toLowerCase()) || contact.tags.some(tag => tag.toLowerCase().includes(query.toLowerCase())));
}

export function editContact(id: string, name: string, email: string, phone: string, tags: string[]): boolean {
  const contact = contacts.find(c => c.id === id);
  if (!contact) return false;
  contact.name = name;
  contact.email = email;
  contact.phone = phone;
  contact.tags = tags;
  return true;
}

export function deleteContact(id: string): boolean {
  const index = contacts.findIndex(c => c.id === id);
  if (index === -1) return false;
  contacts.splice(index, 1);
  return true;
}