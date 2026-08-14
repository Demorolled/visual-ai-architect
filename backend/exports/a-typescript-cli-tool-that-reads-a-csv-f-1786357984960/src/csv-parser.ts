export function parseCSV(content: string): string[][] {
    const rows = content.split('\n').map(row => row.split(','));
    return rows;
}