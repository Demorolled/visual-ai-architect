import { readFileSync, writeFileSync } from 'fs';

export function parseExpense(line: string): { date: string; description: string; amount: number } {
    const [date, description, amountStr] = line.split(' - ');
    return { date, description, amount: parseFloat(amountStr) };
}

export async function readFromFile(filePath: string): Promise<string[]> {
    return new Promise((resolve, reject) => {
        try {
            const data = readFileSync(filePath, 'utf-8');
            resolve(data.split('\n'));
        } catch (err) {
            reject(err);
        }
    });
}

export async function writeToFile(filePath: string, data: string): Promise<void> {
    return new Promise((resolve, reject) => {
        try {
            writeFileSync(filePath, data);
            resolve();
        } catch (err) {
            reject(err);
        }
    });
}