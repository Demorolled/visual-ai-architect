export { Habit };
import { loadHabits, saveHabits } from './storage';
import { Habit } from './types';

const run = () => {
    const habits = loadHabits();
    const add = (name: string, goal: number) => { const h = { name, desc: '', goal, lastChecked: 0, streak: 0 }; habits.push(h); return h; };
    const check = (name: string) => { const h = habits.find((h) => h.name === name); if (h) { h.lastChecked = Date.now(); h.streak = 1; for (let i = 0; i < habits.length; i++) { if (habits[i].name === name) { habits[i].streak = 1; break; } if (habits[i].lastChecked > h.lastChecked) h.streak = Math.max(h.streak, habits[i].streak + 1); } saveHabits(habits); } };
    const del = (name: string) => { const idx = habits.findIndex((h) => h.name === name); if (idx !== -1) { habits.splice(idx, 1); saveHabits(habits); } };
    const report = () => { const s = habits.reduce((acc, h) => { acc.total++; if (h.streak > 0) acc.completed++; acc.streaks.push(h.streak); return acc; }, { total: 0, completed: 0, streaks: [] }); console.log(`Completed: ${s.completed}, Total: ${s.total}, Streaks: ${s.streaks.join(', ')}`); };
    process.argv.slice(2).forEach((arg) => {
        if (arg.startsWith('--add=') && arg.length > 5) {
            const [k, v] = arg.split('=');
            const h = add(k, parseInt(v));
            console.log(`Added: ${h.name} (streak: 0)`);
        } else if (arg.startsWith('--check=') && arg.length > 8) {
            check(arg.split('=')[1]);
        } else if (arg.startsWith('--del=') && arg.length > 6) {
            del(arg.split('=')[1]);
        } else if (arg === '--report') {
            report();
        }
    });
};

export { run };