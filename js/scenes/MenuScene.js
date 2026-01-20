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

        const centerX = GAME_WIDTH / 2;
        let y = 80;

        // Title
        this.add.text(centerX, y, 'CIVCHESS', {
            fontSize: '48px',
            fontStyle: 'bold',
            color: COLORS.textPrimary
        }).setOrigin(0.5);

        y += 80;

        // Subtitle
        this.add.text(centerX, y, 'Civilization meets Chess', {
            fontSize: '20px',
            color: COLORS.textSecondary
        }).setOrigin(0.5);

        y += 80;

        // Player count selection
        this.add.text(centerX, y, 'Number of Players:', {
            fontSize: '24px',
            color: COLORS.textPrimary
        }).setOrigin(0.5);

        y += 50;

        // Player count buttons
        this.playerButtons = [];
        for (let i = 2; i <= 4; i++) {
            const btnX = centerX + (i - 3) * 80;
            const btn = this.createButton(btnX, y, `${i}`, () => {
                this.selectedPlayers = i;
                this.updatePlayerButtons();
            });
            this.playerButtons.push({ btn, value: i });
        }
        this.updatePlayerButtons();

        y += 80;

        // Color selection
        this.add.text(centerX, y, 'Your Color:', {
            fontSize: '24px',
            color: COLORS.textPrimary
        }).setOrigin(0.5);

        y += 50;

        // Color swatches
        this.colorSwatches = [];
        const swatchStartX = centerX - (PLAYER_COLORS.length * 50) / 2 + 25;

        PLAYER_COLORS.forEach((color, index) => {
            const swatchX = swatchStartX + index * 50;
            const swatch = this.add.circle(swatchX, y, 20, color.hex);
            swatch.setStrokeStyle(3, 0x000000);
            swatch.setInteractive({ useHandCursor: true });
            swatch.on('pointerdown', () => {
                this.selectedColorIndex = index;
                this.updateColorSwatches();
            });
            this.colorSwatches.push({ swatch, index });
        });
        this.updateColorSwatches();

        y += 100;

        // Play button
        this.createButton(centerX, y, 'PLAY', () => {
            this.startGame();
        }, 150, 50);

        y += 80;

        // Instructions
        const instructions = [
            'Cities (Rooks) - Build units and expand territory',
            'Warriors (Pawns) - Move 1 tile, attack enemies',
            'Settlers (Knights) - Move 3 tiles, found new cities',
            '',
            'First to capture all cities wins!'
        ];

        instructions.forEach((text, i) => {
            this.add.text(centerX, y + i * 25, text, {
                fontSize: '14px',
                color: COLORS.textSecondary
            }).setOrigin(0.5);
        });
    }

    createButton(x, y, text, callback, width = 60, height = 40) {
        const container = this.add.container(x, y);

        const bg = this.add.rectangle(0, 0, width, height, 0x4a4a6a);
        bg.setStrokeStyle(2, 0x6a6a8a);

        const label = this.add.text(0, 0, text, {
            fontSize: '20px',
            color: COLORS.textPrimary
        }).setOrigin(0.5);

        container.add([bg, label]);
        container.setSize(width, height);
        container.setInteractive({ useHandCursor: true });

        container.on('pointerover', () => bg.setFillStyle(0x5a5a7a));
        container.on('pointerout', () => bg.setFillStyle(0x4a4a6a));
        container.on('pointerdown', callback);

        return container;
    }

    updatePlayerButtons() {
        this.playerButtons.forEach(({ btn, value }) => {
            const bg = btn.list[0];
            if (value === this.selectedPlayers) {
                bg.setFillStyle(0x00aa00);
            } else {
                bg.setFillStyle(0x4a4a6a);
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
