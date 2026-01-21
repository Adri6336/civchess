// ============================================
// MENU SCENE
// ============================================
class MenuScene extends Phaser.Scene {
    constructor() {
        super({ key: 'MenuScene' });
        this.selectedPlayers = 2;
        this.selectedColorIndex = 0;
    }

    create() {
        this.cameras.main.setBackgroundColor(COLORS.background);

        const config = layoutConfig;
        const centerX = config.gameWidth / 2;
        const mobile = config.mobile;

        // Adjust spacing and font sizes for mobile
        const titleSize = mobile ? '32px' : '48px';
        const subtitleSize = mobile ? '14px' : '20px';
        const labelSize = mobile ? '18px' : '24px';
        const instructionSize = mobile ? '11px' : '14px';
        const spacing = mobile ? 0.7 : 1;

        let y = mobile ? 40 : 80;

        // Title
        this.add.text(centerX, y, 'CIVCHESS', {
            fontSize: titleSize,
            fontStyle: 'bold',
            color: COLORS.textPrimary
        }).setOrigin(0.5);

        y += 60 * spacing;

        // Subtitle
        this.add.text(centerX, y, 'Civilization meets Chess', {
            fontSize: subtitleSize,
            color: COLORS.textSecondary
        }).setOrigin(0.5);

        y += 60 * spacing;

        // Player count selection
        this.add.text(centerX, y, 'Number of Players:', {
            fontSize: labelSize,
            color: COLORS.textPrimary
        }).setOrigin(0.5);

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
        }
        this.updatePlayerButtons();

        y += 60 * spacing;

        // Color selection
        this.add.text(centerX, y, 'Your Color:', {
            fontSize: labelSize,
            color: COLORS.textPrimary
        }).setOrigin(0.5);

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
        });
        this.updateColorSwatches();

        y += 70 * spacing;

        // Play button
        this.createButton(centerX, y, 'PLAY', () => {
            this.startGame();
        }, mobile ? 120 : 150, mobile ? 40 : 50);

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
            this.add.text(centerX, y + i * lineSpacing, text, {
                fontSize: instructionSize,
                color: COLORS.textSecondary
            }).setOrigin(0.5);
        });
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
