// ============================================
// CONSTANTS
// ============================================
const BOARD_SIZE = 10;
const BASE_TILE_SIZE = 60;
const BASE_BOARD_OFFSET = 40;
const UI_PANEL_WIDTH = 280;
const UI_PANEL_HEIGHT = 320;

// Dynamic values (recalculated based on viewport)
let TILE_SIZE = BASE_TILE_SIZE;
let BOARD_OFFSET = BASE_BOARD_OFFSET;

// Responsive layout detection and calculation
const Layout = {
    isMobile: function() {
        return window.innerWidth <= 768 || (window.innerWidth < window.innerHeight && window.innerWidth <= 1024);
    },

    calculate: function() {
        const mobile = this.isMobile();

        // Get available viewport space (with some padding for page elements)
        const availableWidth = window.innerWidth - 24;
        const availableHeight = window.innerHeight - 90;

        // Base dimensions at full size
        const baseBoardSize = BOARD_SIZE * BASE_TILE_SIZE + BASE_BOARD_OFFSET * 2;

        let targetWidth, targetHeight;
        if (mobile) {
            targetWidth = baseBoardSize;
            targetHeight = baseBoardSize + UI_PANEL_HEIGHT;
        } else {
            targetWidth = baseBoardSize + UI_PANEL_WIDTH;
            targetHeight = baseBoardSize;
        }

        // Calculate scale to fit viewport (never scale up beyond 1)
        const scale = Math.min(
            availableWidth / targetWidth,
            availableHeight / targetHeight,
            1
        );

        // Apply scale to dynamic values
        TILE_SIZE = Math.floor(BASE_TILE_SIZE * scale);
        BOARD_OFFSET = Math.floor(BASE_BOARD_OFFSET * scale);

        // Ensure minimum usable sizes
        TILE_SIZE = Math.max(TILE_SIZE, 35);
        BOARD_OFFSET = Math.max(BOARD_OFFSET, 20);

        // Calculate final dimensions
        const boardWidth = BOARD_SIZE * TILE_SIZE + BOARD_OFFSET * 2;
        const boardHeight = BOARD_SIZE * TILE_SIZE + BOARD_OFFSET * 2;

        // Scale panel height on mobile for better proportions
        const scaledPanelHeight = mobile ? Math.max(Math.floor(UI_PANEL_HEIGHT * scale), 180) : UI_PANEL_HEIGHT;

        if (mobile) {
            return {
                mobile: true,
                gameWidth: boardWidth,
                gameHeight: boardHeight + scaledPanelHeight,
                boardOffsetX: BOARD_OFFSET,
                boardOffsetY: BOARD_OFFSET,
                panelX: 0,
                panelY: boardHeight,
                panelWidth: boardWidth,
                panelHeight: scaledPanelHeight
            };
        } else {
            return {
                mobile: false,
                gameWidth: boardWidth + UI_PANEL_WIDTH,
                gameHeight: boardHeight,
                boardOffsetX: BOARD_OFFSET,
                boardOffsetY: BOARD_OFFSET,
                panelX: boardWidth,
                panelY: 0,
                panelWidth: UI_PANEL_WIDTH,
                panelHeight: boardHeight
            };
        }
    },

    getConfig: function() {
        return this.calculate();
    }
};

// Initial layout calculation
let layoutConfig = Layout.calculate();
const GAME_WIDTH = layoutConfig.gameWidth;
const GAME_HEIGHT = layoutConfig.gameHeight;

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
