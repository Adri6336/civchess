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
        this.loadGameElements = [];
    }

    create() {
        this.cameras.main.setBackgroundColor(COLORS.background);
        this.showMainMenu();
    }

    showMainMenu() {
        this.showingMainMenu = true;
        this.cleanupScrolling();
        this.clearElements(this.newGameElements);
        this.newGameElements = [];
        this.clearElements(this.loadGameElements);
        this.loadGameElements = [];

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

        y += 70 * spacing;

        // Load Game button
        const loadGameBtn = this.createButton(centerX, y, 'Load Game', () => {
            this.showLoadGameMenu();
        }, mobile ? 180 : 200, mobile ? 45 : 55);

        // Disable if no saved games
        if (savedGames.length === 0) {
            loadGameBtn.bg.setFillStyle(0x2a2a3a);
            loadGameBtn.bg.setAlpha(0.5);
            loadGameBtn.label.setAlpha(0.5);
            loadGameBtn.disableInteractive();
        }
        this.mainMenuElements.push(loadGameBtn);

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

    showLoadGameMenu() {
        this.showingMainMenu = false;
        this.clearElements(this.mainMenuElements);
        this.mainMenuElements = [];

        const config = layoutConfig;
        const centerX = config.gameWidth / 2;
        const mobile = config.mobile;

        const titleSize = mobile ? '32px' : '48px';
        const spacing = mobile ? 0.7 : 1;

        let y = mobile ? 40 : 80;

        // Title
        const title = this.add.text(centerX, y, 'LOAD GAME', {
            fontSize: titleSize,
            fontStyle: 'bold',
            color: COLORS.textPrimary
        }).setOrigin(0.5);
        this.loadGameElements.push(title);

        y += 60 * spacing;

        // Back button
        const backBtn = this.createButton(mobile ? 50 : 80, y - 30, '\u2190 Back', () => {
            this.cleanupScrolling();
            this.showMainMenu();
        }, mobile ? 80 : 100, mobile ? 30 : 35);
        this.loadGameElements.push(backBtn);

        y += 30 * spacing;

        // Get saved games (already sorted by most recent first in GameHistory)
        const savedGames = GameHistory.listSavedGames();

        if (savedGames.length === 0) {
            const noGames = this.add.text(centerX, y + 50, 'No saved games found', {
                fontSize: mobile ? '16px' : '20px',
                color: COLORS.textSecondary
            }).setOrigin(0.5);
            this.loadGameElements.push(noGames);
            return;
        }

        // Create scrollable game list
        const listStartY = y;
        const rowHeight = mobile ? 50 : 60;
        const listWidth = mobile ? config.gameWidth - 40 : config.gameWidth - 80;
        const maxVisibleRows = mobile ? 5 : 6;
        const visibleHeight = maxVisibleRows * rowHeight;
        const totalHeight = savedGames.length * rowHeight;

        // Create a container for all game entries
        this.scrollContainer = this.add.container(0, 0);
        this.loadGameElements.push(this.scrollContainer);

        // Track scroll position
        this.scrollY = 0;
        this.maxScrollY = Math.max(0, totalHeight - visibleHeight);
        this.listStartY = listStartY;
        this.visibleHeight = visibleHeight;

        savedGames.forEach((game, index) => {
            const rowY = listStartY + index * rowHeight;

            // Row background
            const rowBg = this.add.rectangle(centerX, rowY, listWidth, rowHeight - 5, 0x3a3a5a);
            rowBg.setStrokeStyle(1, 0x5a5a7a);
            rowBg.setInteractive({ useHandCursor: true });
            this.scrollContainer.add(rowBg);

            // Game name
            const nameX = centerX - listWidth / 2 + 15;
            const nameText = this.add.text(nameX, rowY - 8, game.gameId, {
                fontSize: mobile ? '14px' : '16px',
                fontStyle: 'bold',
                color: COLORS.textPrimary
            }).setOrigin(0, 0.5);
            this.scrollContainer.add(nameText);

            // Game info (players, status, datetime)
            const dateStr = game.startTime ? this.formatDateTime(new Date(game.startTime)) : 'Unknown';
            const status = game.winner !== null ? 'Finished' : 'In Progress';
            const infoText = this.add.text(nameX, rowY + 10, `${game.playerCount} players | ${status} | ${dateStr}`, {
                fontSize: mobile ? '10px' : '12px',
                color: COLORS.textSecondary
            }).setOrigin(0, 0.5);
            this.scrollContainer.add(infoText);

            // Button dimensions
            const btnWidth = mobile ? 55 : 70;
            const btnHeight = mobile ? 28 : 32;
            const btnSpacing = mobile ? 60 : 80;

            // Delete button (neon red) - rightmost
            const deleteX = centerX + listWidth / 2 - btnWidth / 2 - 10;
            const deleteBtn = this.createColoredButton(deleteX, rowY, 'Delete', 0xff0044, () => {
                this.deleteGame(game.gameId);
            }, btnWidth, btnHeight);
            this.scrollContainer.add(deleteBtn);

            // Rename button (neon green)
            const renameX = deleteX - btnSpacing;
            const renameBtn = this.createColoredButton(renameX, rowY, 'Rename', 0x00ff44, () => {
                this.showRenameDialog(game.gameId);
            }, btnWidth, btnHeight);
            this.scrollContainer.add(renameBtn);

            // Click on row to load game (but not on buttons)
            rowBg.on('pointerdown', (pointer) => {
                // Check if click is not on the buttons area
                const btnAreaStart = renameX - btnWidth / 2 - 5;
                if (pointer.x < btnAreaStart) {
                    this.loadGame(game.gameId);
                }
            });

            rowBg.on('pointerover', () => {
                rowBg.setFillStyle(0x4a4a6a);
            });
            rowBg.on('pointerout', () => {
                rowBg.setFillStyle(0x3a3a5a);
            });
        });

        // Create mask for scrolling (only if content exceeds visible area)
        if (totalHeight > visibleHeight) {
            const maskShape = this.make.graphics();
            maskShape.fillStyle(0xffffff);
            maskShape.fillRect(0, listStartY - rowHeight / 2, config.gameWidth, visibleHeight + rowHeight / 2);
            const mask = maskShape.createGeometryMask();
            this.scrollContainer.setMask(mask);
            this.scrollMaskGraphics = maskShape;

            // Add scroll indicator
            this.createScrollIndicator(config.gameWidth - 20, listStartY, visibleHeight, totalHeight);

            // Setup mouse wheel scrolling
            this.setupScrolling();
        }
    }

    /**
     * Format a date as datetime string (e.g., "Jan 21, 2026 3:45 PM")
     */
    formatDateTime(date) {
        const options = {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
            hour12: true
        };
        return date.toLocaleString(undefined, options);
    }

    /**
     * Create a scroll indicator bar
     */
    createScrollIndicator(x, y, visibleHeight, totalHeight) {
        const trackHeight = visibleHeight - 20;
        const thumbHeight = Math.max(30, (visibleHeight / totalHeight) * trackHeight);

        // Track background
        this.scrollTrack = this.add.rectangle(x, y + trackHeight / 2, 6, trackHeight, 0x2a2a3a);
        this.scrollTrack.setStrokeStyle(1, 0x4a4a6a);
        this.loadGameElements.push(this.scrollTrack);

        // Thumb
        this.scrollThumb = this.add.rectangle(x, y + thumbHeight / 2, 6, thumbHeight, 0x6a6a8a);
        this.loadGameElements.push(this.scrollThumb);

        this.scrollTrackY = y;
        this.scrollTrackHeight = trackHeight;
        this.scrollThumbHeight = thumbHeight;
    }

    /**
     * Update scroll indicator position
     */
    updateScrollIndicator() {
        if (this.scrollThumb && this.maxScrollY > 0) {
            const scrollPercent = this.scrollY / this.maxScrollY;
            const thumbTravel = this.scrollTrackHeight - this.scrollThumbHeight;
            this.scrollThumb.y = this.scrollTrackY + this.scrollThumbHeight / 2 + (scrollPercent * thumbTravel);
        }
    }

    /**
     * Setup mouse wheel and touch scrolling
     */
    setupScrolling() {
        // Mouse wheel scrolling
        this.scrollHandler = (pointer, gameObjects, deltaX, deltaY) => {
            if (this.scrollContainer && this.maxScrollY > 0) {
                this.scrollY = Phaser.Math.Clamp(this.scrollY + deltaY * 0.5, 0, this.maxScrollY);
                this.scrollContainer.y = -this.scrollY;
                this.updateScrollIndicator();
            }
        };
        this.input.on('wheel', this.scrollHandler);

        // Touch drag scrolling for mobile
        this.isDragging = false;
        this.lastPointerY = 0;

        this.pointerDownHandler = (pointer) => {
            if (pointer.y >= this.listStartY && pointer.y <= this.listStartY + this.visibleHeight) {
                this.isDragging = true;
                this.lastPointerY = pointer.y;
            }
        };

        this.pointerMoveHandler = (pointer) => {
            if (this.isDragging && this.scrollContainer && this.maxScrollY > 0) {
                const deltaY = this.lastPointerY - pointer.y;
                this.scrollY = Phaser.Math.Clamp(this.scrollY + deltaY, 0, this.maxScrollY);
                this.scrollContainer.y = -this.scrollY;
                this.lastPointerY = pointer.y;
                this.updateScrollIndicator();
            }
        };

        this.pointerUpHandler = () => {
            this.isDragging = false;
        };

        this.input.on('pointerdown', this.pointerDownHandler);
        this.input.on('pointermove', this.pointerMoveHandler);
        this.input.on('pointerup', this.pointerUpHandler);
    }

    /**
     * Cleanup scrolling event handlers
     */
    cleanupScrolling() {
        if (this.scrollHandler) {
            this.input.off('wheel', this.scrollHandler);
            this.scrollHandler = null;
        }
        if (this.pointerDownHandler) {
            this.input.off('pointerdown', this.pointerDownHandler);
            this.pointerDownHandler = null;
        }
        if (this.pointerMoveHandler) {
            this.input.off('pointermove', this.pointerMoveHandler);
            this.pointerMoveHandler = null;
        }
        if (this.pointerUpHandler) {
            this.input.off('pointerup', this.pointerUpHandler);
            this.pointerUpHandler = null;
        }
        if (this.scrollMaskGraphics) {
            this.scrollMaskGraphics.destroy();
            this.scrollMaskGraphics = null;
        }
        this.scrollContainer = null;
        this.scrollThumb = null;
        this.scrollTrack = null;
    }

    createColoredButton(x, y, text, color, callback, width = 70, height = 32) {
        const container = this.add.container(x, y);

        const bg = this.add.rectangle(0, 0, width, height, color);
        bg.setStrokeStyle(2, 0xffffff);

        const label = this.add.text(0, 0, text, {
            fontSize: '14px',
            fontStyle: 'bold',
            color: '#000000'
        }).setOrigin(0.5);

        container.add([bg, label]);
        container.setSize(width, height);
        container.setInteractive({ useHandCursor: true });

        container.on('pointerover', () => {
            bg.setAlpha(0.8);
        });
        container.on('pointerout', () => {
            bg.setAlpha(1);
        });
        container.on('pointerdown', callback);

        container.bg = bg;
        container.label = label;
        return container;
    }

    loadGame(gameId) {
        // Update timestamp to make it most recent
        GameHistory.updateTimestamp(gameId);

        const savedGame = GameHistory.loadFromLocalStorage(gameId);
        if (savedGame) {
            this.cleanupScrolling();
            this.scene.start('GameScene', { savedGame: savedGame });
        }
    }

    deleteGame(gameId) {
        GameHistory.deleteSavedGame(gameId);
        // Refresh the load game menu
        this.cleanupScrolling();
        this.clearElements(this.loadGameElements);
        this.loadGameElements = [];
        this.showLoadGameMenu();
    }

    showRenameDialog(gameId) {
        const newName = prompt('Enter new name for the save:', gameId);
        if (newName && newName.trim() && newName !== gameId) {
            const success = GameHistory.renameSavedGame(gameId, newName.trim());
            if (success) {
                // Refresh the load game menu
                this.cleanupScrolling();
                this.clearElements(this.loadGameElements);
                this.loadGameElements = [];
                this.showLoadGameMenu();
            } else {
                alert('Failed to rename. A save with that name may already exist.');
            }
        }
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
