// ============================================
// GAME CONFIGURATION
// ============================================
const config = {
    type: Phaser.AUTO,
    width: layoutConfig.gameWidth,
    height: layoutConfig.gameHeight,
    parent: 'game-container',
    backgroundColor: COLORS.background,
    scene: [MenuScene, GameScene],
    render: {
        roundPixels: true
    },
    scale: {
        mode: Phaser.Scale.NONE,
        autoCenter: Phaser.Scale.CENTER_BOTH
    },
    input: {
        activePointers: 3 // Support multi-touch
    }
};

// Create game instance
const game = new Phaser.Game(config);
