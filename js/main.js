// ============================================
// GAME CONFIGURATION
// ============================================
const config = {
    type: Phaser.AUTO,
    width: GAME_WIDTH,
    height: GAME_HEIGHT,
    parent: 'game-container',
    backgroundColor: COLORS.background,
    scene: [MenuScene, GameScene]
};

// Create game instance
const game = new Phaser.Game(config);
