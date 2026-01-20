// ============================================
// CONSTANTS
// ============================================
const BOARD_SIZE = 10;
const TILE_SIZE = 60;
const BOARD_OFFSET = 40;
const UI_PANEL_WIDTH = 280;
const GAME_WIDTH = BOARD_SIZE * TILE_SIZE + BOARD_OFFSET * 2 + UI_PANEL_WIDTH;
const GAME_HEIGHT = BOARD_SIZE * TILE_SIZE + BOARD_OFFSET * 2;

// Neon colors for players
const PLAYER_COLORS = [
    { name: 'Cyan', hex: 0x00ffff, css: '#00ffff' },
    { name: 'Magenta', hex: 0xff00ff, css: '#ff00ff' },
    { name: 'Lime', hex: 0x00ff00, css: '#00ff00' },
    { name: 'Orange', hex: 0xff8800, css: '#ff8800' },
    { name: 'Pink', hex: 0xff66b2, css: '#ff66b2' },
    { name: 'Yellow', hex: 0xffff00, css: '#ffff00' }
];

// Dark mode colors
const COLORS = {
    background: 0x1a1a2e,
    lightTile: 0x3a3a5a,
    darkTile: 0x2d2d44,
    highlight: 0x00ff00,
    border: 0x5a5a7a,
    uiBackground: 0x252545,
    textPrimary: '#e0e0e0',
    textSecondary: '#888888'
};

// Piece types
const PIECE_TYPES = {
    CITY: 'city',
    WARRIOR: 'warrior',
    SETTLER: 'settler'
};

// Production types
const PRODUCTION_TYPES = {
    DIPLOMACY: { name: 'Diplomacy', turns: 4 },
    SCIENCE: { name: 'Science', turns: 10 },
    WARRIOR: { name: 'Make Warrior', turns: 4 },
    SETTLER: { name: 'Make Settler', turns: 6 },
    REPAIR: { name: 'Repair', turns: 1 }
};
