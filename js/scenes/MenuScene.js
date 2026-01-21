// ============================================
// MENU SCENE
// ============================================
class MenuScene extends Phaser.Scene {
    constructor() {
        super({ key: 'MenuScene' });
        this.selectedPlayers = 2;
        this.selectedColorIndex = 0;
        this.showingMainMenu = true;
        this.mainMenuElements = [];
        this.newGameElements = [];
    }

    create() {
        this.cameras.main.setBackgroundColor(COLORS.background);
        this.showMainMenu();
    }

    showMainMenu() {
        this.showingMainMenu = true;
        this.clearElements(this.newGameElements);
        this.newGameElements = [];

        const config = layoutConfig;
        const centerX = config.gameWidth / 2;
        const mobile = config.mobile;

        const titleSize = mobile ? '32px' : '48px';
        const subtitleSize = mobile ? '14px' : '20px';
        const spacing = mobile ? 0.7 : 1;

        let y = mobile ? 60 : 100;

        // Title
        const title = this.add.text(centerX, y, 'CIVCHESS', {
            fontSize: titleSize,
            fontStyle: 'bold',
            color: COLORS.textPrimary
        }).setOrigin(0.5);
        this.mainMenuElements.push(title);

        y += 60 * spacing;

        // Subtitle
        const subtitle = this.add.text(centerX, y, 'Civilization meets Chess', {
            fontSize: subtitleSize,
            color: COLORS.textSecondary
        }).setOrigin(0.5);
        this.mainMenuElements.push(subtitle);

        y += 80 * spacing;

        // New Game button
        const newGameBtn = this.createButton(centerX, y, 'New Game', () => {
            this.showNewGameOptions();
        }, mobile ? 180 : 200, mobile ? 45 : 55);
        this.mainMenuElements.push(newGameBtn);

        y += 70 * spacing;

        // Continue Game button (check if there's a continuable game)
        const savedGames = GameHistory.listSavedGames();
        const continuableGame = savedGames.find(g => g.winner === null);

        const continueBtn = this.createButton(centerX, y, 'Continue Game', () => {
            this.continueGame(continuableGame.gameId);
        }, mobile ? 180 : 200, mobile ? 45 : 55);

        // Disable if no continuable game
        if (!continuableGame) {
            continueBtn.bg.setFillStyle(0x2a2a3a);
            continueBtn.bg.setAlpha(0.5);
            continueBtn.label.setAlpha(0.5);
            continueBtn.disableInteractive();
        }
        this.mainMenuElements.push(continueBtn);

        y += 100 * spacing;

        // Instructions
        const instructionSize = mobile ? '11px' : '14px';
        const instructions = mobile ? [
            'Cities - Build units & territory',
            'Warriors - Move 1, attack',
            'Settlers - Move 3, found cities',
            'Capture all cities to win!'
        ] : [
            'Cities (Rooks) - Build units and expand territory',
            'Warriors (Pawns) - Move 1 tile, attack enemies',
            'Settlers (Knights) - Move 3 tiles, found new cities',
            '',
            'First to capture all cities wins!'
        ];

        const lineSpacing = mobile ? 18 : 25;
        instructions.forEach((text, i) => {
            const instr = this.add.text(centerX, y + i * lineSpacing, text, {
                fontSize: instructionSize,
                color: COLORS.textSecondary
            }).setOrigin(0.5);
            this.mainMenuElements.push(instr);
        });
    }

    showNewGameOptions() {
        this.showingMainMenu = false;
        this.clearElements(this.mainMenuElements);
        this.mainMenuElements = [];

        const config = layoutConfig;
        const centerX = config.gameWidth / 2;
        const mobile = config.mobile;

        const titleSize = mobile ? '32px' : '48px';
        const labelSize = mobile ? '18px' : '24px';
        const instructionSize = mobile ? '11px' : '14px';
        const spacing = mobile ? 0.7 : 1;

        let y = mobile ? 40 : 80;

        // Title
        const title = this.add.text(centerX, y, 'CIVCHESS', {
            fontSize: titleSize,
            fontStyle: 'bold',
            color: COLORS.textPrimary
        }).setOrigin(0.5);
        this.newGameElements.push(title);

        y += 60 * spacing;

        // Back button
        const backBtn = this.createButton(mobile ? 50 : 80, y - 30, '\u2190 Back', () => {
            this.showMainMenu();
        }, mobile ? 80 : 100, mobile ? 30 : 35);
        this.newGameElements.push(backBtn);

        y += 30 * spacing;

        // Player count selection
        const playerLabel = this.add.text(centerX, y, 'Number of Players:', {
            fontSize: labelSize,
            color: COLORS.textPrimary
        }).setOrigin(0.5);
        this.newGameElements.push(playerLabel);

        y += 40 * spacing;

        // Player count buttons
        this.playerButtons = [];
        const btnSpacing = mobile ? 60 : 80;
        for (let i = 2; i <= 4; i++) {
            const btnX = centerX + (i - 3) * btnSpacing;
            const btn = this.createButton(btnX, y, `${i}`, () => {
                this.selectedPlayers = i;
                this.updatePlayerButtons();
            }, mobile ? 50 : 60, mobile ? 35 : 40);
            this.playerButtons.push({ btn, value: i });
            this.newGameElements.push(btn);
        }
        this.updatePlayerButtons();

        y += 60 * spacing;

        // Color selection
        const colorLabel = this.add.text(centerX, y, 'Your Color:', {
            fontSize: labelSize,
            color: COLORS.textPrimary
        }).setOrigin(0.5);
        this.newGameElements.push(colorLabel);

        y += 40 * spacing;

        // Color swatches
        this.colorSwatches = [];
        const swatchSize = mobile ? 16 : 20;
        const swatchSpacing = mobile ? 40 : 50;
        const swatchStartX = centerX - (PLAYER_COLORS.length * swatchSpacing) / 2 + swatchSpacing / 2;

        PLAYER_COLORS.forEach((color, index) => {
            const swatchX = swatchStartX + index * swatchSpacing;
            const swatch = this.add.circle(swatchX, y, swatchSize, color.hex);
            swatch.setStrokeStyle(3, 0x000000);
            swatch.setInteractive({ useHandCursor: true });
            swatch.on('pointerdown', () => {
                this.selectedColorIndex = index;
                this.updateColorSwatches();
            });
            this.colorSwatches.push({ swatch, index });
            this.newGameElements.push(swatch);
        });
        this.updateColorSwatches();

        y += 70 * spacing;

        // Play button
        const playBtn = this.createButton(centerX, y, 'PLAY', () => {
            this.startGame();
        }, mobile ? 120 : 150, mobile ? 40 : 50);
        this.newGameElements.push(playBtn);

        y += 60 * spacing;

        // Instructions - shorter on mobile
        const instructions = mobile ? [
            'Cities - Build units & territory',
            'Warriors - Move 1, attack',
            'Settlers - Move 3, found cities',
            'Capture all cities to win!'
        ] : [
            'Cities (Rooks) - Build units and expand territory',
            'Warriors (Pawns) - Move 1 tile, attack enemies',
            'Settlers (Knights) - Move 3 tiles, found new cities',
            '',
            'First to capture all cities wins!'
        ];

        const lineSpacing = mobile ? 18 : 25;
        instructions.forEach((text, i) => {
            const instr = this.add.text(centerX, y + i * lineSpacing, text, {
                fontSize: instructionSize,
                color: COLORS.textSecondary
            }).setOrigin(0.5);
            this.newGameElements.push(instr);
        });
    }

    clearElements(elements) {
        elements.forEach(el => {
            if (el && el.destroy) {
                el.destroy();
            }
        });
    }

    continueGame(gameId) {
        const savedGame = GameHistory.loadFromLocalStorage(gameId);
        if (savedGame) {
            this.scene.start('GameScene', { savedGame: savedGame });
        }
    }

    createButton(x, y, text, callback, width = 60, height = 40) {
        const container = this.add.container(x, y);

        const bg = this.add.rectangle(0, 0, width, height, 0x4a4a6a);
        bg.setStrokeStyle(2, 0x6a6a8a);

        const fontSize = width < 80 ? '16px' : '20px';
        const label = this.add.text(0, 0, text, {
            fontSize: fontSize,
            color: COLORS.textPrimary
        }).setOrigin(0.5);

        container.add([bg, label]);
        container.setSize(width, height);
        container.setInteractive({ useHandCursor: true });

        container.selected = false;
        container.on('pointerover', () => {
            if (!container.selected) bg.setFillStyle(0x5a5a7a);
        });
        container.on('pointerout', () => {
            if (!container.selected) bg.setFillStyle(0x4a4a6a);
        });
        container.on('pointerdown', callback);

        container.bg = bg;
        container.label = label;
        return container;
    }

    updatePlayerButtons() {
        this.playerButtons.forEach(({ btn, value }) => {
            if (value === this.selectedPlayers) {
                btn.selected = true;
                btn.bg.setFillStyle(0x00aa00);
            } else {
                btn.selected = false;
                btn.bg.setFillStyle(0x4a4a6a);
            }
        });
    }

    updateColorSwatches() {
        this.colorSwatches.forEach(({ swatch, index }) => {
            if (index === this.selectedColorIndex) {
                swatch.setStrokeStyle(4, 0xffffff);
                swatch.setScale(1.2);
            } else {
                swatch.setStrokeStyle(2, 0x000000);
                swatch.setScale(1);
            }
        });
    }

    startGame() {
        // Prepare player configs
        const playerConfigs = [];
        const usedColors = new Set();

        // Human player gets their selected color
        playerConfigs.push({ color: PLAYER_COLORS[this.selectedColorIndex] });
        usedColors.add(this.selectedColorIndex);

        // Other players get random colors
        for (let i = 1; i < this.selectedPlayers; i++) {
            let colorIndex;
            do {
                colorIndex = Math.floor(Math.random() * PLAYER_COLORS.length);
            } while (usedColors.has(colorIndex));
            usedColors.add(colorIndex);
            playerConfigs.push({ color: PLAYER_COLORS[colorIndex] });
        }

        this.scene.start('GameScene', { playerConfigs });
    }
}
