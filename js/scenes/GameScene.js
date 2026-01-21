// ============================================
// GAME SCENE
// ============================================
class GameScene extends Phaser.Scene {
    constructor() {
        super({ key: 'GameScene' });
        this.engine = new GameEngine();
        this.pieceSprites = new Map();
        this.tileGraphics = null;
        this.ownershipGraphics = null;
        this.highlightGraphics = null;
        this.selectedPiece = null;
        this.draggedPiece = null;
        this.originalPosition = null;
        this.hasDragged = false;
    }

    init(data) {
        this.playerConfigs = data.playerConfigs || null;
        this.savedGame = data.savedGame || null;
    }

    create() {
        this.cameras.main.setBackgroundColor(COLORS.background);

        // Initialize game engine - either new game or restored game
        if (this.savedGame) {
            this.engine.restoreFromSavedGame(this.savedGame);
        } else {
            this.engine.setupGame(this.playerConfigs);
        }

        // Create graphics layers
        this.tileGraphics = this.add.graphics();
        this.ownershipGraphics = this.add.graphics();
        this.highlightGraphics = this.add.graphics();

        // Draw the board
        this.drawBoard();
        this.drawOwnership();

        // Create pieces
        this.createAllPieces();

        // Create UI panel
        this.createUIPanel();

        // Set up input
        this.setupInput();

        // Add board border
        const borderGraphics = this.add.graphics();
        borderGraphics.lineStyle(3, COLORS.border);
        borderGraphics.strokeRect(
            BOARD_OFFSET - 2,
            BOARD_OFFSET - 2,
            BOARD_SIZE * TILE_SIZE + 4,
            BOARD_SIZE * TILE_SIZE + 4
        );

        // Add coordinates
        this.addCoordinates();

        // Update UI
        this.updateUI();
    }

    drawBoard() {
        this.tileGraphics.clear();

        for (let row = 0; row < BOARD_SIZE; row++) {
            for (let col = 0; col < BOARD_SIZE; col++) {
                const isLight = (row + col) % 2 === 0;
                const color = isLight ? COLORS.lightTile : COLORS.darkTile;

                this.tileGraphics.fillStyle(color);
                this.tileGraphics.fillRect(
                    BOARD_OFFSET + col * TILE_SIZE,
                    BOARD_OFFSET + row * TILE_SIZE,
                    TILE_SIZE,
                    TILE_SIZE
                );
            }
        }
    }

    drawOwnership() {
        this.ownershipGraphics.clear();

        for (let row = 0; row < BOARD_SIZE; row++) {
            for (let col = 0; col < BOARD_SIZE; col++) {
                const owner = this.engine.tileOwnership[row][col];
                if (owner !== null) {
                    const player = this.engine.players[owner];
                    const x = BOARD_OFFSET + col * TILE_SIZE;
                    const y = BOARD_OFFSET + row * TILE_SIZE;

                    this.ownershipGraphics.fillStyle(player.color.hex, 0.25);
                    this.ownershipGraphics.fillRoundedRect(x + 4, y + 4, TILE_SIZE - 8, TILE_SIZE - 8, 8);

                    this.ownershipGraphics.lineStyle(2, player.color.hex, 0.5);
                    this.ownershipGraphics.strokeRoundedRect(x + 4, y + 4, TILE_SIZE - 8, TILE_SIZE - 8, 8);
                }
            }
        }
    }

    addCoordinates() {
        for (let i = 0; i < BOARD_SIZE; i++) {
            // Column numbers (bottom)
            this.add.text(
                BOARD_OFFSET + i * TILE_SIZE + TILE_SIZE / 2,
                BOARD_OFFSET + BOARD_SIZE * TILE_SIZE + 10,
                String(i + 1),
                { fontSize: '14px', color: COLORS.textSecondary }
            ).setOrigin(0.5);

            // Row numbers (left)
            this.add.text(
                BOARD_OFFSET - 15,
                BOARD_OFFSET + i * TILE_SIZE + TILE_SIZE / 2,
                String(i + 1),
                { fontSize: '14px', color: COLORS.textSecondary }
            ).setOrigin(0.5);
        }
    }

    createAllPieces() {
        this.engine.pieces.forEach(piece => {
            this.createPieceSprite(piece);
        });
    }

    createPieceSprite(piece) {
        const x = BOARD_OFFSET + piece.col * TILE_SIZE + TILE_SIZE / 2;
        const y = BOARD_OFFSET + piece.row * TILE_SIZE + TILE_SIZE / 2;
        const player = this.engine.players[piece.ownerId];

        const container = this.add.container(x, y);

        // Background circle
        const bg = this.add.circle(0, 0, TILE_SIZE / 2 - 6, 0x1a1a3a, 0.9);
        bg.setStrokeStyle(3, player.color.hex);

        // Piece symbol
        const symbols = {
            [PIECE_TYPES.CITY]: '\u265C',    // Rook
            [PIECE_TYPES.WARRIOR]: '\u265F', // Pawn
            [PIECE_TYPES.SETTLER]: '\u265E'  // Knight
        };

        const text = this.add.text(0, 0, symbols[piece.type], {
            fontSize: '32px',
            color: player.color.css
        }).setOrigin(0.5);

        container.add([bg, text]);

        // Health bar (initially hidden if full health)
        const healthBarBg = this.add.rectangle(0, -TILE_SIZE / 2 + 8, TILE_SIZE - 16, 8, 0x333333, 0.7);
        healthBarBg.setStrokeStyle(1, 0x666666);

        const healthBarFill = this.add.rectangle(
            -(TILE_SIZE - 16) / 2 + ((piece.hp / piece.maxHp) * (TILE_SIZE - 16)) / 2,
            -TILE_SIZE / 2 + 8,
            (piece.hp / piece.maxHp) * (TILE_SIZE - 16),
            6,
            0x00ff00
        );

        container.add([healthBarBg, healthBarFill]);
        container.healthBarBg = healthBarBg;
        container.healthBarFill = healthBarFill;

        // Hide health bar if at full health
        healthBarBg.setVisible(piece.hp < piece.maxHp);
        healthBarFill.setVisible(piece.hp < piece.maxHp);

        // Production indicator for cities
        if (piece.type === PIECE_TYPES.CITY) {
            const prodIndicator = this.add.text(0, TILE_SIZE / 2 - 12, '', {
                fontSize: '10px',
                color: '#ffffff',
                backgroundColor: '#333333aa'
            }).setOrigin(0.5);
            container.add(prodIndicator);
            container.prodIndicator = prodIndicator;
        }

        // Make interactive
        container.setSize(TILE_SIZE - 10, TILE_SIZE - 10);
        container.setInteractive({ draggable: true, useHandCursor: true });

        container.pieceData = piece;
        container.bgCircle = bg;
        container.pieceText = text;

        // Apply grayscale if piece has already moved
        if (piece.hasMoved) {
            this.applyGrayscale(container);
        }

        this.pieceSprites.set(piece.id, container);
    }

    applyGrayscale(container) {
        if (container.isGrayscale) return;
        container.isGrayscale = true;

        // Apply grayscale using PostFX color matrix (WebGL only)
        if (container.postFX) {
            container.grayscaleFX = container.postFX.addColorMatrix();
            container.grayscaleFX.grayscale(1);
        } else {
            // Fallback: reduce alpha for Canvas renderer
            container.setAlpha(0.5);
        }
    }

    removeGrayscale(container) {
        if (!container.isGrayscale) return;
        container.isGrayscale = false;

        // Remove grayscale effect
        if (container.postFX && container.grayscaleFX) {
            container.postFX.remove(container.grayscaleFX);
            container.grayscaleFX = null;
        } else {
            // Fallback: restore alpha
            container.setAlpha(1);
        }
    }

    updatePieceSprite(piece) {
        const sprite = this.pieceSprites.get(piece.id);
        if (!sprite) return;

        const player = this.engine.players[piece.ownerId];

        // Update position
        sprite.x = BOARD_OFFSET + piece.col * TILE_SIZE + TILE_SIZE / 2;
        sprite.y = BOARD_OFFSET + piece.row * TILE_SIZE + TILE_SIZE / 2;

        // Update color
        sprite.bgCircle.setStrokeStyle(3, player.color.hex);
        sprite.pieceText.setColor(player.color.css);

        // Update health bar
        const healthPercent = piece.hp / piece.maxHp;
        sprite.healthBarBg.setVisible(piece.hp < piece.maxHp);
        sprite.healthBarFill.setVisible(piece.hp < piece.maxHp);

        if (piece.hp < piece.maxHp) {
            sprite.healthBarFill.setSize((TILE_SIZE - 16) * healthPercent, 6);
            sprite.healthBarFill.x = -(TILE_SIZE - 16) / 2 + ((TILE_SIZE - 16) * healthPercent) / 2;

            // Color based on health
            let color = 0x00ff00;
            if (healthPercent < 0.3) color = 0xff0000;
            else if (healthPercent < 0.6) color = 0xffff00;
            sprite.healthBarFill.setFillStyle(color);
        }

        // Update production indicator
        if (piece.type === PIECE_TYPES.CITY && sprite.prodIndicator) {
            if (piece.production) {
                const prodType = PRODUCTION_TYPES[piece.production];
                const progress = `${piece.productionProgress}/${prodType.turns}`;
                sprite.prodIndicator.setText(progress);
                sprite.prodIndicator.setVisible(true);

                if (piece.productionPaused) {
                    sprite.prodIndicator.setBackgroundColor('#ff0000aa');
                } else {
                    sprite.prodIndicator.setBackgroundColor('#333333aa');
                }
            } else {
                sprite.prodIndicator.setVisible(false);
            }
        }

        // Update grayscale based on movement state
        if (piece.hasMoved) {
            this.applyGrayscale(sprite);
        } else {
            this.removeGrayscale(sprite);
        }
    }

    removePieceSprite(pieceId) {
        const sprite = this.pieceSprites.get(pieceId);
        if (sprite) {
            // Random direction for the "fling" effect
            const angle = Math.random() * Math.PI * 2;
            const distance = 100 + Math.random() * 100;
            const targetX = sprite.x + Math.cos(angle) * distance;
            const targetY = sprite.y + Math.sin(angle) * distance + 200; // Add gravity effect
            const rotation = (Math.random() - 0.5) * Math.PI * 4; // Random spin

            this.tweens.add({
                targets: sprite,
                x: targetX,
                y: targetY,
                alpha: 0,
                scale: 0.2,
                rotation: rotation,
                duration: 1500,
                ease: 'Quad.easeOut',
                onComplete: () => {
                    sprite.destroy();
                    this.pieceSprites.delete(pieceId);
                }
            });
        }
    }

    handleEliminationAnimation(elimination) {
        // Animate destruction of 75% of units
        for (const unit of elimination.destroyedUnits) {
            this.removePieceSprite(unit.id);
        }

        // Animate conversion of 25% of units (destroy old, create new warrior for conqueror)
        for (const conversion of elimination.convertedUnits) {
            const oldSprite = this.pieceSprites.get(conversion.oldUnit.id);
            if (oldSprite) {
                // Get position before destroying
                const x = oldSprite.x;
                const y = oldSprite.y;

                // Destroy old sprite with animation
                const angle = Math.random() * Math.PI * 2;
                const distance = 100 + Math.random() * 100;
                const targetX = x + Math.cos(angle) * distance;
                const targetY = y + Math.sin(angle) * distance + 200;
                const rotation = (Math.random() - 0.5) * Math.PI * 4;

                this.tweens.add({
                    targets: oldSprite,
                    x: targetX,
                    y: targetY,
                    alpha: 0,
                    scale: 0.2,
                    rotation: rotation,
                    duration: 1500,
                    ease: 'Quad.easeOut',
                    onComplete: () => {
                        oldSprite.destroy();
                        this.pieceSprites.delete(conversion.oldUnit.id);
                    }
                });
            }

            // Create new warrior sprite for conqueror (slight delay for visual effect)
            this.time.delayedCall(300, () => {
                this.createPieceSprite(conversion.newWarrior);
                this.drawOwnership();
            });
        }
    }

    createUIPanel() {
        const config = layoutConfig;

        if (config.mobile) {
            this.createMobileUIPanel();
        } else {
            this.createDesktopUIPanel();
        }
    }

    createDesktopUIPanel() {
        const panelX = BOARD_OFFSET * 2 + BOARD_SIZE * TILE_SIZE;
        const panelWidth = UI_PANEL_WIDTH - 20;
        const gameHeight = BOARD_SIZE * TILE_SIZE + BOARD_OFFSET * 2;

        // Panel background
        const panelBg = this.add.rectangle(
            panelX + panelWidth / 2,
            gameHeight / 2,
            panelWidth,
            gameHeight - 40,
            COLORS.uiBackground
        );
        panelBg.setStrokeStyle(2, COLORS.border);

        let y = 30;

        // Current turn indicator
        this.turnText = this.add.text(panelX + 10, y, 'Turn: Player 1', {
            fontSize: '18px',
            fontStyle: 'bold',
            color: COLORS.textPrimary
        });

        y += 40;

        // Tech score
        this.techText = this.add.text(panelX + 10, y, 'Tech: 0', {
            fontSize: '16px',
            color: COLORS.textPrimary
        });

        y += 40;

        // Player list header
        this.add.text(panelX + 10, y, 'Players:', {
            fontSize: '16px',
            fontStyle: 'bold',
            color: COLORS.textPrimary
        });

        y += 25;

        // Player entries with diplomacy buttons
        this.playerEntries = [];
        for (let i = 0; i < 4; i++) {
            const entry = this.createPlayerEntry(panelX + 10, y, i, false);
            this.playerEntries.push(entry);
            y += 45;
        }

        y += 20;

        // Selected unit info
        this.add.text(panelX + 10, y, 'Selected:', {
            fontSize: '16px',
            fontStyle: 'bold',
            color: COLORS.textPrimary
        });

        y += 25;

        this.selectedInfoText = this.add.text(panelX + 10, y, 'None', {
            fontSize: '14px',
            color: COLORS.textSecondary,
            wordWrap: { width: panelWidth - 20 }
        });

        y += 80;

        // City production buttons (hidden by default)
        this.productionButtons = [];
        const prodTypes = ['DIPLOMACY', 'SCIENCE', 'WARRIOR', 'SETTLER', 'REPAIR'];
        prodTypes.forEach((type, i) => {
            const btn = this.createSmallButton(
                panelX + 65 + (i % 2) * 120,
                y + Math.floor(i / 2) * 35,
                PRODUCTION_TYPES[type].name,
                () => this.selectProduction(type)
            );
            btn.setVisible(false);
            this.productionButtons.push({ btn, type });
        });

        // Repeat toggle for city production
        this.repeatToggle = this.createToggleSwitch(
            panelX + 65,
            y + Math.floor(prodTypes.length / 2) * 35 + 35,
            'Repeat',
            (enabled) => this.toggleRepeat(enabled)
        );
        this.repeatToggle.container.setVisible(false);

        // Settle button for settlers
        this.settleBtn = this.createSmallButton(
            panelX + 65,
            y,
            'Settle',
            () => this.settleCity()
        );
        this.settleBtn.setVisible(false);

        y += 150;

        // Next Turn button
        this.nextTurnBtn = this.createButton(
            panelX + panelWidth / 2,
            y,
            'Next Turn',
            () => this.endTurn(),
            120,
            40
        );
    }

    createMobileUIPanel() {
        const boardHeight = BOARD_SIZE * TILE_SIZE + BOARD_OFFSET * 2;
        const panelY = boardHeight;
        const panelWidth = BOARD_SIZE * TILE_SIZE + BOARD_OFFSET * 2;
        const panelHeight = layoutConfig.panelHeight;

        // Panel background
        const panelBg = this.add.rectangle(
            panelWidth / 2,
            panelY + panelHeight / 2,
            panelWidth,
            panelHeight,
            COLORS.uiBackground
        );
        panelBg.setStrokeStyle(2, COLORS.border);

        // Mobile layout: Two columns
        // Left column: Turn info, players
        // Right column: Selected info, actions, next turn

        const leftColX = 15;
        const rightColX = panelWidth / 2 + 10;
        const colWidth = panelWidth / 2 - 25;
        let leftY = panelY + 15;
        let rightY = panelY + 15;

        // Left column - Turn and Players
        this.turnText = this.add.text(leftColX, leftY, 'Turn: Player 1', {
            fontSize: '14px',
            fontStyle: 'bold',
            color: COLORS.textPrimary
        });
        leftY += 22;

        this.techText = this.add.text(leftColX, leftY, 'Tech: 0', {
            fontSize: '12px',
            color: COLORS.textPrimary
        });
        leftY += 25;

        // Compact player entries
        this.playerEntries = [];
        for (let i = 0; i < 4; i++) {
            const entry = this.createPlayerEntry(leftColX, leftY, i, true);
            this.playerEntries.push(entry);
            leftY += 32;
        }

        // Right column - Selected info and actions
        this.add.text(rightColX, rightY, 'Selected:', {
            fontSize: '12px',
            fontStyle: 'bold',
            color: COLORS.textPrimary
        });
        rightY += 18;

        this.selectedInfoText = this.add.text(rightColX, rightY, 'None', {
            fontSize: '11px',
            color: COLORS.textSecondary,
            wordWrap: { width: colWidth - 10 }
        });
        rightY += 55;

        // Production buttons in a compact grid (3 columns)
        this.productionButtons = [];
        const prodTypes = ['DIPLOMACY', 'SCIENCE', 'WARRIOR', 'SETTLER', 'REPAIR'];
        const btnWidth = 80;
        const btnSpacing = 85;
        prodTypes.forEach((type, i) => {
            const btn = this.createSmallButton(
                rightColX + 40 + (i % 3) * btnSpacing,
                rightY + Math.floor(i / 3) * 28,
                PRODUCTION_TYPES[type].name.substring(0, 8),
                () => this.selectProduction(type),
                btnWidth
            );
            btn.setVisible(false);
            this.productionButtons.push({ btn, type });
        });

        // Repeat toggle
        this.repeatToggle = this.createToggleSwitch(
            rightColX + 40,
            rightY + 56,
            'Repeat',
            (enabled) => this.toggleRepeat(enabled)
        );
        this.repeatToggle.container.setVisible(false);

        // Settle button
        this.settleBtn = this.createSmallButton(
            rightColX + 40,
            rightY,
            'Settle',
            () => this.settleCity(),
            btnWidth
        );
        this.settleBtn.setVisible(false);

        // Next Turn button at bottom right
        this.nextTurnBtn = this.createButton(
            panelWidth - 70,
            panelY + panelHeight - 30,
            'Next Turn',
            () => this.endTurn(),
            100,
            35
        );
    }

    createPlayerEntry(x, y, index, compact = false) {
        const container = this.add.container(x, y);

        if (compact) {
            // Mobile compact layout
            const colorDot = this.add.circle(6, 8, 5, 0xffffff);
            const nameText = this.add.text(18, 0, '', {
                fontSize: '11px',
                color: COLORS.textPrimary
            });
            const relationText = this.add.text(18, 12, '', {
                fontSize: '10px',
                color: COLORS.textSecondary
            });

            const diplomacyBtn = this.createSmallButton(160, 6, 'War', () => {
                this.toggleDiplomacy(index);
            }, 55);
            diplomacyBtn.setVisible(false);

            container.add([colorDot, nameText, relationText, diplomacyBtn]);
            container.colorDot = colorDot;
            container.nameText = nameText;
            container.relationText = relationText;
            container.diplomacyBtn = diplomacyBtn;
            container.playerIndex = index;
            container.compact = true;
        } else {
            // Desktop layout
            const colorDot = this.add.circle(10, 10, 8, 0xffffff);
            const nameText = this.add.text(30, 0, '', {
                fontSize: '14px',
                color: COLORS.textPrimary
            });
            const relationText = this.add.text(30, 16, '', {
                fontSize: '12px',
                color: COLORS.textSecondary
            });

            const diplomacyBtn = this.createSmallButton(180, 8, 'War', () => {
                this.toggleDiplomacy(index);
            });
            diplomacyBtn.setVisible(false);

            container.add([colorDot, nameText, relationText, diplomacyBtn]);
            container.colorDot = colorDot;
            container.nameText = nameText;
            container.relationText = relationText;
            container.diplomacyBtn = diplomacyBtn;
            container.playerIndex = index;
            container.compact = false;
        }

        return container;
    }

    createButton(x, y, text, callback, width = 100, height = 40) {
        const container = this.add.container(x, y);

        const bg = this.add.rectangle(0, 0, width, height, 0x4a4a6a);
        bg.setStrokeStyle(2, 0x6a6a8a);

        const label = this.add.text(0, 0, text, {
            fontSize: '16px',
            color: COLORS.textPrimary
        }).setOrigin(0.5);

        container.add([bg, label]);
        container.setSize(width, height);
        container.setInteractive({ useHandCursor: true });

        container.on('pointerover', () => bg.setFillStyle(0x5a5a7a));
        container.on('pointerout', () => bg.setFillStyle(0x4a4a6a));
        container.on('pointerdown', callback);

        container.bg = bg;
        container.label = label;

        return container;
    }

    createSmallButton(x, y, text, callback, width = 110) {
        const container = this.add.container(x, y);

        const bg = this.add.rectangle(0, 0, width, 24, 0x3a3a5a);
        bg.setStrokeStyle(1, 0x5a5a7a);

        const fontSize = width < 80 ? '10px' : '12px';
        const label = this.add.text(0, 0, text, {
            fontSize: fontSize,
            color: COLORS.textPrimary
        }).setOrigin(0.5);

        container.add([bg, label]);
        container.setSize(width, 24);
        container.setInteractive({ useHandCursor: true });

        container.selected = false;
        container.on('pointerover', () => {
            if (!container.selected) bg.setFillStyle(0x4a4a6a);
        });
        container.on('pointerout', () => {
            if (!container.selected) bg.setFillStyle(0x3a3a5a);
        });
        container.on('pointerdown', callback);

        container.bg = bg;
        container.label = label;

        return container;
    }

    createToggleSwitch(x, y, labelText, callback) {
        const container = this.add.container(x, y);

        // Label
        const label = this.add.text(-50, 0, labelText, {
            fontSize: '12px',
            color: COLORS.textPrimary
        }).setOrigin(0, 0.5);

        // Switch background
        const switchBg = this.add.rectangle(30, 0, 40, 20, 0x3a3a5a);
        switchBg.setStrokeStyle(1, 0x5a5a7a);

        // Switch knob
        const knob = this.add.circle(15, 0, 8, 0x888888);

        container.add([label, switchBg, knob]);
        container.setSize(110, 28);
        container.setInteractive({ useHandCursor: true });

        container.enabled = false;
        container.knob = knob;
        container.switchBg = switchBg;

        container.on('pointerdown', () => {
            container.enabled = !container.enabled;
            if (container.enabled) {
                knob.x = 45;
                knob.setFillStyle(0x00ff00);
                switchBg.setFillStyle(0x1a4a1a);
            } else {
                knob.x = 15;
                knob.setFillStyle(0x888888);
                switchBg.setFillStyle(0x3a3a5a);
            }
            callback(container.enabled);
        });

        return { container, setEnabled: (enabled) => {
            container.enabled = enabled;
            if (enabled) {
                knob.x = 45;
                knob.setFillStyle(0x00ff00);
                switchBg.setFillStyle(0x1a4a1a);
            } else {
                knob.x = 15;
                knob.setFillStyle(0x888888);
                switchBg.setFillStyle(0x3a3a5a);
            }
        }};
    }

    updateUI() {
        const currentPlayer = this.engine.getCurrentPlayer();

        // Update turn text
        this.turnText.setText(`Turn: ${currentPlayer.name}`);
        this.turnText.setColor(currentPlayer.color.css);

        // Update tech text
        this.techText.setText(`Tech: ${currentPlayer.techScore}`);

        // Update player entries
        this.playerEntries.forEach((entry, i) => {
            if (i < this.engine.players.length) {
                const player = this.engine.players[i];
                entry.setVisible(true);
                entry.colorDot.setFillStyle(player.color.hex);
                entry.nameText.setText(player.name);

                const cities = this.engine.getPlayerCities(i).length;
                entry.relationText.setText(`Cities: ${cities}`);

                // Show diplomacy button for other players
                if (i !== this.engine.currentPlayerIndex && cities > 0) {
                    entry.diplomacyBtn.setVisible(true);
                    const relation = currentPlayer.relations[i];
                    // Use shorter text for compact mobile layout
                    if (entry.compact) {
                        entry.diplomacyBtn.label.setText(relation === 'peace' ? 'War' : 'Peace');
                    } else {
                        entry.diplomacyBtn.label.setText(relation === 'peace' ? 'Declare War' : 'Propose Peace');
                    }
                } else {
                    entry.diplomacyBtn.setVisible(false);
                }
            } else {
                entry.setVisible(false);
            }
        });

        // Update all piece sprites
        this.engine.pieces.forEach(piece => {
            this.updatePieceSprite(piece);
        });

        // Check for victory
        if (this.engine.gameOver) {
            this.showVictoryScreen();
        }
    }

    updateSelectedInfo() {
        if (!this.selectedPiece) {
            this.selectedInfoText.setText('None');
            this.productionButtons.forEach(({ btn }) => btn.setVisible(false));
            this.repeatToggle.container.setVisible(false);
            this.settleBtn.setVisible(false);
            return;
        }

        const piece = this.selectedPiece.pieceData;
        const owner = this.engine.players[piece.ownerId];
        console.log(piece.type)

        let info = `Type: ${piece.type}\n`;
        info += `HP: ${piece.hp}/${piece.maxHp}\n`;

        if (piece.type === PIECE_TYPES.WARRIOR) {
            info += `Damage: ${piece.damage}\n`;
        }

        if (piece.type === PIECE_TYPES.CITY && piece.production) {
            const prodType = PRODUCTION_TYPES[piece.production];
            info += `Building: ${prodType.name}\n`;
            info += `Progress: ${piece.productionProgress}/${prodType.turns}`;
        }

        this.selectedInfoText.setText(info);

        // Show/hide production buttons for owned cities
        const isOwnedCity = piece.type === PIECE_TYPES.CITY &&
                            piece.ownerId === this.engine.currentPlayerIndex;

        this.productionButtons.forEach(({ btn, type }) => {
            btn.setVisible(isOwnedCity);
            if (isOwnedCity) {
                // Highlight the currently selected production
                const isSelected = piece.production === type;
                btn.selected = isSelected;

                // Disable repair button if city is at full health
                if (type === 'REPAIR') {
                    const isFullHealth = piece.hp >= piece.maxHp;
                    btn.bg.setFillStyle(isFullHealth ? 0x2a2a3a : (isSelected ? 0x00aa00 : 0x3a3a5a));
                    btn.bg.setAlpha(isFullHealth ? 0.5 : 1);
                    btn.label.setAlpha(isFullHealth ? 0.5 : 1);
                } else {
                    btn.bg.setFillStyle(isSelected ? 0x00aa00 : 0x3a3a5a);
                    btn.bg.setAlpha(1);
                    btn.label.setAlpha(1);
                }
            }
        });

        // Show/hide repeat toggle for owned cities
        if (isOwnedCity) {
            this.repeatToggle.container.setVisible(true);
            this.repeatToggle.setEnabled(piece.repeatProduction || false);
        } else {
            this.repeatToggle.container.setVisible(false);
        }

        // Show/hide settle button for owned settlers
        const isOwnedSettler = piece.type === PIECE_TYPES.SETTLER &&
                               piece.ownerId === this.engine.currentPlayerIndex;
        if (isOwnedSettler) {
            const canSettle = this.engine.canSettlerBuildCity(piece);
            this.settleBtn.setVisible(true);
            this.settleBtn.bg.setFillStyle(canSettle.valid ? 0x3a3a5a : 0x2a2a3a);
        } else {
            this.settleBtn.setVisible(false);
        }
    }

    setupInput() {
        // Drag events
        this.input.on('dragstart', (pointer, gameObject) => {
            if (!gameObject.pieceData) return;

            const piece = gameObject.pieceData;
            if (piece.ownerId !== this.engine.currentPlayerIndex) return;
            if (piece.type === PIECE_TYPES.CITY) return;

            this.draggedPiece = gameObject;
            this.originalPosition = { x: gameObject.x, y: gameObject.y };
            this.hasDragged = false;

            this.children.bringToTop(gameObject);
            this.tweens.add({
                targets: gameObject,
                scaleX: 1.1,
                scaleY: 1.1,
                duration: 100
            });

            this.showValidMoves(piece);
        });

        this.input.on('drag', (pointer, gameObject, dragX, dragY) => {
            if (this.draggedPiece !== gameObject) return;
            this.hasDragged = true;
            gameObject.x = dragX;
            gameObject.y = dragY;
        });

        this.input.on('dragend', (pointer, gameObject) => {
            if (this.draggedPiece !== gameObject) return;

            this.tweens.add({
                targets: gameObject,
                scaleX: 1,
                scaleY: 1,
                duration: 100
            });

            // Only process move if actual dragging occurred
            if (this.hasDragged) {
                const col = Math.floor((gameObject.x - BOARD_OFFSET) / TILE_SIZE);
                const row = Math.floor((gameObject.y - BOARD_OFFSET) / TILE_SIZE);
                const piece = gameObject.pieceData;

                if (this.engine.isValidTile(row, col)) {
                    const result = this.engine.movePiece(piece, row, col);
                    if (result.success) {
                        this.onMoveSuccess(piece, result);
                    } else {
                        this.returnToOriginal(gameObject);
                    }
                } else {
                    this.returnToOriginal(gameObject);
                }

                this.clearHighlights();
            }

            this.draggedPiece = null;
        });

        // Click to select
        this.input.on('pointerdown', (pointer) => {
            // Only process clicks within the board area
            const boardLeft = BOARD_OFFSET;
            const boardRight = BOARD_OFFSET + BOARD_SIZE * TILE_SIZE;
            const boardTop = BOARD_OFFSET;
            const boardBottom = BOARD_OFFSET + BOARD_SIZE * TILE_SIZE;

            if (pointer.x < boardLeft || pointer.x >= boardRight ||
                pointer.y < boardTop || pointer.y >= boardBottom) {
                // Click is outside the board, ignore for piece selection
                return;
            }

            const col = Math.floor((pointer.x - BOARD_OFFSET) / TILE_SIZE);
            const row = Math.floor((pointer.y - BOARD_OFFSET) / TILE_SIZE);

            if (!this.engine.isValidTile(row, col)) {
                this.deselectPiece();
                return;
            }

            const clickedPiece = this.engine.board[row][col];

            if (this.selectedPiece && !this.draggedPiece) {
                const piece = this.selectedPiece.pieceData;

                // Try to move to clicked tile
                if (piece.ownerId === this.engine.currentPlayerIndex && piece.type !== PIECE_TYPES.CITY) {
                    const result = this.engine.movePiece(piece, row, col);
                    if (result.success) {
                        this.onMoveSuccessAnimated(piece, result);
                        return;
                    }
                }
            }

            // Select clicked piece
            if (clickedPiece) {
                this.selectPiece(this.pieceSprites.get(clickedPiece.id));
            } else {
                this.deselectPiece();
            }
        });
    }

    selectPiece(sprite) {
        if (this.selectedPiece) {
            this.selectedPiece.bgCircle.setStrokeStyle(3,
                this.engine.players[this.selectedPiece.pieceData.ownerId].color.hex);
        }

        this.selectedPiece = sprite;
        sprite.bgCircle.setStrokeStyle(4, 0xffffff);

        const piece = sprite.pieceData;
        this.clearHighlights();
        if (piece.ownerId === this.engine.currentPlayerIndex && piece.type !== PIECE_TYPES.CITY) {
            this.showValidMoves(piece);
        }

        this.updateSelectedInfo();
    }

    deselectPiece() {
        if (this.selectedPiece) {
            this.selectedPiece.bgCircle.setStrokeStyle(3,
                this.engine.players[this.selectedPiece.pieceData.ownerId].color.hex);
        }
        this.selectedPiece = null;
        this.clearHighlights();
        this.updateSelectedInfo();
    }

    showValidMoves(piece) {
        this.clearHighlights();

        const moves = this.engine.getValidMoves(piece);
        moves.forEach(move => {
            const x = BOARD_OFFSET + move.col * TILE_SIZE;
            const y = BOARD_OFFSET + move.row * TILE_SIZE;

            this.highlightGraphics.lineStyle(3, 0x00ff00, 0.8);
            this.highlightGraphics.strokeRect(x + 2, y + 2, TILE_SIZE - 4, TILE_SIZE - 4);
        });
    }

    clearHighlights() {
        this.highlightGraphics.clear();
    }

    returnToOriginal(gameObject) {
        this.tweens.add({
            targets: gameObject,
            x: this.originalPosition.x,
            y: this.originalPosition.y,
            duration: 200,
            ease: 'Back.easeOut'
        });
    }

    playBumpAnimation(attackerSprite, result, attackerPiece) {
        const originalX = BOARD_OFFSET + result.originalPos.col * TILE_SIZE + TILE_SIZE / 2;
        const originalY = BOARD_OFFSET + result.originalPos.row * TILE_SIZE + TILE_SIZE / 2;
        const targetX = BOARD_OFFSET + result.targetPos.col * TILE_SIZE + TILE_SIZE / 2;
        const targetY = BOARD_OFFSET + result.targetPos.row * TILE_SIZE + TILE_SIZE / 2;

        // Calculate bump point (halfway between attacker and defender)
        const bumpX = (originalX + targetX) / 2;
        const bumpY = (originalY + targetY) / 2;

        // Get defender sprite
        const defenderPiece = this.engine.board[result.targetPos.row][result.targetPos.col];
        const defenderSprite = defenderPiece ? this.pieceSprites.get(defenderPiece.id) : null;

        // Check if this is a city capture
        const isCityCapture = result.combat && result.combat.cityFlipped;

        // Animate attacker moving toward target then bouncing back
        this.tweens.add({
            targets: attackerSprite,
            x: bumpX,
            y: bumpY,
            duration: 100,
            ease: 'Quad.easeOut',
            onComplete: () => {
                // Bounce back to original position
                this.tweens.add({
                    targets: attackerSprite,
                    x: originalX,
                    y: originalY,
                    duration: 150,
                    ease: 'Back.easeOut',
                    onComplete: () => {
                        // Update UI after animation completes
                        this.updatePieceSprite(attackerPiece);

                        // Handle city capture: delete old sprite and create new one for new owner
                        if (isCityCapture && defenderPiece) {
                            const oldSpriteId = defenderPiece.id;
                            const oldSprite = this.pieceSprites.get(oldSpriteId);
                            if (oldSprite) {
                                oldSprite.destroy();
                                this.pieceSprites.delete(oldSpriteId);
                            }
                            // Create new sprite for the captured city (now owned by attacker)
                            this.createPieceSprite(defenderPiece);
                            this.drawOwnership();

                            // Handle player elimination if it occurred
                            if (result.combat.elimination && result.combat.elimination.eliminated) {
                                this.handleEliminationAnimation(result.combat.elimination);
                            }
                        } else if (defenderPiece) {
                            this.updatePieceSprite(defenderPiece);
                        }
                        this.updateUI();
                    }
                });
            }
        });

        // If defender is a warrior (not a city), animate mutual bump
        if (defenderSprite && defenderPiece && defenderPiece.type === PIECE_TYPES.WARRIOR) {
            // Calculate defender's bump point (toward attacker)
            const defenderBumpX = (targetX + originalX) / 2;
            const defenderBumpY = (targetY + originalY) / 2;

            this.tweens.add({
                targets: defenderSprite,
                x: defenderBumpX,
                y: defenderBumpY,
                duration: 100,
                ease: 'Quad.easeOut',
                onComplete: () => {
                    // Bounce back to original position
                    this.tweens.add({
                        targets: defenderSprite,
                        x: targetX,
                        y: targetY,
                        duration: 150,
                        ease: 'Back.easeOut'
                    });
                }
            });
        }
    }

    onMoveSuccess(piece, result) {
        // Handle blocked attack with bump animation
        if (result.blocked) {
            const sprite = this.pieceSprites.get(piece.id);
            if (sprite) {
                this.playBumpAnimation(sprite, result, piece);
            }
            return;
        }

        // Update sprite position
        this.updatePieceSprite(piece);

        // Handle combat results
        if (result.combat) {
            if (result.combat.defenderDestroyed && !result.combat.cityFlipped) {
                this.removePieceSprite(result.combat.defender);
            }
        }

        // Update ownership display
        this.drawOwnership();
        this.updateUI();
    }

    onMoveSuccessAnimated(piece, result) {
        const sprite = this.pieceSprites.get(piece.id);
        if (!sprite) return;

        // Clear highlights immediately
        this.clearHighlights();

        // Handle blocked attack with bump animation
        if (result.blocked) {
            this.playBumpAnimation(sprite, result, piece);
            this.deselectPiece();
            return;
        }

        const targetX = BOARD_OFFSET + piece.col * TILE_SIZE + TILE_SIZE / 2;
        const targetY = BOARD_OFFSET + piece.row * TILE_SIZE + TILE_SIZE / 2;

        // Animate the piece movement
        this.tweens.add({
            targets: sprite,
            x: targetX,
            y: targetY,
            duration: 200,
            ease: 'Quad.easeOut',
            onComplete: () => {
                // Handle combat results
                if (result.combat) {
                    if (result.combat.defenderDestroyed && !result.combat.cityFlipped) {
                        this.removePieceSprite(result.combat.defender);
                    }
                }

                // Update ownership display
                this.drawOwnership();
                this.updateUI();
                this.deselectPiece();
            }
        });
    }

    selectProduction(type) {
        if (!this.selectedPiece || this.selectedPiece.pieceData.type !== PIECE_TYPES.CITY) {
            return;
        }

        const piece = this.selectedPiece.pieceData;

        // Don't allow repair if at full health
        if (type === 'REPAIR' && piece.hp >= piece.maxHp) {
            return;
        }

        this.engine.setProduction(piece, type);
        this.updatePieceSprite(piece);
        this.updateSelectedInfo();
    }

    toggleRepeat(enabled) {
        if (!this.selectedPiece || this.selectedPiece.pieceData.type !== PIECE_TYPES.CITY) {
            return;
        }

        const piece = this.selectedPiece.pieceData;
        piece.repeatProduction = enabled;
    }

    settleCity() {
        if (!this.selectedPiece || this.selectedPiece.pieceData.type !== PIECE_TYPES.SETTLER) {
            return;
        }

        const settler = this.selectedPiece.pieceData;
        const result = this.engine.settlerBuildCity(settler);

        if (result.success) {
            this.removePieceSprite(settler.id);
            this.createPieceSprite(result.city);
            this.drawOwnership();
            this.deselectPiece();
            this.updateUI();
        }
    }

    toggleDiplomacy(targetIndex) {
        const currentPlayer = this.engine.getCurrentPlayer();
        const relation = currentPlayer.relations[targetIndex];

        if (relation === 'peace') {
            this.engine.declareWar(this.engine.currentPlayerIndex, targetIndex);
        } else {
            this.engine.proposePeace(this.engine.currentPlayerIndex, targetIndex);
        }

        this.updateUI();
    }

    endTurn() {
        this.deselectPiece();
        this.engine.endTurn();

        // Refresh pieces (some may have spawned)
        const existingIds = new Set(this.pieceSprites.keys());
        this.engine.pieces.forEach(piece => {
            if (!existingIds.has(piece.id)) {
                this.createPieceSprite(piece);
            }
        });

        this.drawOwnership();
        this.updateUI();
    }

    showVictoryScreen() {
        const winner = this.engine.players[this.engine.winner];
        const config = layoutConfig;
        const centerX = config.gameWidth / 2;
        const centerY = config.gameHeight / 2;

        // Overlay
        const overlay = this.add.rectangle(
            centerX, centerY,
            config.gameWidth, config.gameHeight,
            0x000000, 0.8
        );

        // Victory text - smaller on mobile
        const titleSize = config.mobile ? '36px' : '48px';
        const subtitleSize = config.mobile ? '24px' : '32px';

        this.add.text(centerX, centerY - 50, 'VICTORY!', {
            fontSize: titleSize,
            fontStyle: 'bold',
            color: winner.color.css
        }).setOrigin(0.5);

        this.add.text(centerX, centerY + 20, `${winner.name} wins!`, {
            fontSize: subtitleSize,
            color: COLORS.textPrimary
        }).setOrigin(0.5);

        // Play again button
        this.createButton(centerX, centerY + 100, 'Play Again', () => {
            this.scene.start('MenuScene');
        }, 150, 50);
    }

    update() {
        // Sync piece sprites with engine state
        this.engine.pieces.forEach(piece => {
            const sprite = this.pieceSprites.get(piece.id);
            if (sprite && !this.draggedPiece) {
                // Smooth position updates
                const targetX = BOARD_OFFSET + piece.col * TILE_SIZE + TILE_SIZE / 2;
                const targetY = BOARD_OFFSET + piece.row * TILE_SIZE + TILE_SIZE / 2;

                if (Math.abs(sprite.x - targetX) > 1 || Math.abs(sprite.y - targetY) > 1) {
                    sprite.x = Phaser.Math.Linear(sprite.x, targetX, 0.2);
                    sprite.y = Phaser.Math.Linear(sprite.y, targetY, 0.2);
                }
            }
        });
    }
}
