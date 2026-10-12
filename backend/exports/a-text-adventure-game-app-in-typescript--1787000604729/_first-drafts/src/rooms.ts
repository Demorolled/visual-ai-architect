export const ROOMS: Room[] = [
  {
    id: 'entrance',
    description: 'You are at the entrance of a small, dark cave. The air is damp and the ground is covered in a thick layer of moss.',
    items: [],
    connections: {
      north: 'hall',
      east: 'cave',
    },
  },
  {
    id: 'hall',
    description: 'You are in a long, narrow hallway. The walls are rough and the ceiling is low, barely allowing you to stand up straight.',
    items: [],
    connections: {
      north: 'treasure',
      south: 'entrance',
      east: 'secret',
    },
  },
  {
    id: 'treasure',
    description: 'You have found a treasure room! There are piles of gold and jewels everywhere. You feel like you have won the game.',
    items: ['gold', 'jewel'],
    connections: {
      south: 'hall',
    },
  },
  {
    id: 'cave',
    description: 'You are in a large open cave. The walls are smooth and the ceiling is high, letting in a lot of light. There is a small stream running through the center of the cave.',
    items: ['sword', 'shield'],
    connections: {
      west: 'entrance',
      south: 'secret',
    },
  },
  {
    id: 'secret',
    description: 'You have found a secret room! There is a small door on the wall, but it is locked. You need a key to open it.',
    items: ['key'],
    connections: {
      north: 'hall',
      west: 'cave',
    },
  },
];