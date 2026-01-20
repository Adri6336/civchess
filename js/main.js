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
    scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH,
        min: {
            width: 320,
            height: 480
        }
    },
    input: {
        activePointers: 3 // Support multi-touch
    }
};

// Create game instance
const game = new Phaser.Game(config);

// Handle orientation/resize changes
window.addEventListener('resize', () => {
    const newConfig = Layout.getConfig();
    const oldMobile = layoutConfig.mobile;
    layoutConfig = newConfig;

    // If layout mode changed, restart the current scene
    if (oldMobile !== newConfig.mobile && game.scene.scenes.length > 0) {
        const activeScene = game.scene.getScenes(true)[0];
        if (activeScene) {
            game.scale.resize(newConfig.gameWidth, newConfig.gameHeight);
            activeScene.scene.restart();
        }
    }
});
