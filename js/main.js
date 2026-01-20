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

// Handle orientation/resize changes - recompose instead of scale
let resizeTimeout;
window.addEventListener('resize', () => {
    // Debounce resize events
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => {
        const newConfig = Layout.calculate();
        layoutConfig = newConfig;

        // Resize the canvas to new dimensions
        game.scale.resize(newConfig.gameWidth, newConfig.gameHeight);

        // Restart the active scene to recompose with new tile size
        const activeScene = game.scene.getScenes(true)[0];
        if (activeScene) {
            activeScene.scene.restart();
        }
    }, 150);
});
