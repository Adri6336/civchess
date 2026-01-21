// ============================================
// GAME ENGINE
// ============================================
class GameEngine {
    constructor() {
        this.reset();
    }

    reset() {
        this.players = [];
        this.currentPlayerIndex = 0;
        this.board = this.createEmptyBoard();
        this.pieces = [];
        this.tileOwnership = this.createEmptyBoard();
        this.actionLog = [];
        this.gameOver = false;
        this.winner = null;
        this.turnNumber = 0;
        this.history = new GameHistory();
    }

    createEmptyBoard() {
        return Array(BOARD_SIZE).fill(null).map(() => Array(BOARD_SIZE).fill(null));
    }

    log(action, details) {
        const entry = {
            turn: this.currentPlayerIndex,
            player: this.players[this.currentPlayerIndex]?.name || 'System',
            action: action,
            details: details,
            timestamp: Date.now()
        };
        this.actionLog.push(entry);
        console.log(`[${entry.player}] ${action}:`, details);
        return entry;
    }

    setupGame(playerConfigs) {
        this.reset();

        // Create players
        playerConfigs.forEach((config, index) => {
            this.players.push({
                id: index,
                name: `Player ${index + 1}`,
                color: config.color,
                techScore: 0,
                isHuman: true,
                relations: {} // will be filled with peace/war status
            });
        });

        // Initialize all players at peace with each other
        this.players.forEach((player, i) => {
            this.players.forEach((other, j) => {
                if (i !== j) {
                    player.relations[j] = 'peace';
                }
            });
        });

        // Place starting cities randomly on one end for each player
        this.placeStartingPieces();

        this.log('GAME_START', { players: this.players.length });

        // Initialize history tracking
        this.history.initGame(this.players);
        this.history.captureSnapshot(this, 'GAME_START', { players: this.players.length });

        return true;
    }

    placeStartingPieces() {
        const startingPositions = this.getStartingPositions(this.players.length);

        startingPositions.forEach((pos, playerIndex) => {
            // Create starting city
            const city = this.createPiece(PIECE_TYPES.CITY, playerIndex, pos.row, pos.col);
            this.pieces.push(city);
            this.board[pos.row][pos.col] = city;

            // Own the tile
            this.tileOwnership[pos.row][pos.col] = playerIndex;

            // Create starting warrior adjacent to city
            const warriorPos = this.findAdjacentEmptyTile(pos.row, pos.col);
            if (warriorPos) {
                const warrior = this.createPiece(PIECE_TYPES.WARRIOR, playerIndex, warriorPos.row, warriorPos.col);
                this.pieces.push(warrior);
                this.board[warriorPos.row][warriorPos.col] = warrior;
            }
        });
    }

    getStartingPositions(numPlayers) {
        const positions = [];
        const corners = [
            { row: 0, col: 0 },
            { row: 0, col: BOARD_SIZE - 1 },
            { row: BOARD_SIZE - 1, col: 0 },
            { row: BOARD_SIZE - 1, col: BOARD_SIZE - 1 }
        ];

        // Shuffle corners
        for (let i = corners.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [corners[i], corners[j]] = [corners[j], corners[i]];
        }

        for (let i = 0; i < numPlayers; i++) {
            positions.push(corners[i]);
        }

        return positions;
    }

    findAdjacentEmptyTile(row, col) {
        const directions = [
            [-1, 0], [1, 0], [0, -1], [0, 1],
            [-1, -1], [-1, 1], [1, -1], [1, 1]
        ];

        for (const [dr, dc] of directions) {
            const newRow = row + dr;
            const newCol = col + dc;
            if (this.isValidTile(newRow, newCol) && !this.board[newRow][newCol]) {
                return { row: newRow, col: newCol };
            }
        }
        return null;
    }

    createPiece(type, ownerId, row, col) {
        const baseStats = {
            [PIECE_TYPES.CITY]: { hp: 4, maxHp: 4, damage: 0 },
            [PIECE_TYPES.WARRIOR]: { hp: 1, maxHp: 1, damage: 1 },
            [PIECE_TYPES.SETTLER]: { hp: 1, maxHp: 1, damage: 0 }
        };

        const stats = baseStats[type];
        const player = this.players[ownerId];

        // Apply tech bonuses
        if (player && player.techScore > 0) {
            if (type === PIECE_TYPES.CITY || type === PIECE_TYPES.WARRIOR) {
                stats.hp += player.techScore;
                stats.maxHp += player.techScore;
            }
            if (type === PIECE_TYPES.WARRIOR) {
                stats.damage += player.techScore;
            }
        }

        return {
            id: `${type}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            type: type,
            ownerId: ownerId,
            row: row,
            col: col,
            hp: stats.hp,
            maxHp: stats.maxHp,
            damage: stats.damage,
            hasMoved: false,
            production: null,
            productionProgress: 0,
            productionPaused: false,
            repeatProduction: true
        };
    }

    isValidTile(row, col) {
        return row >= 0 && row < BOARD_SIZE && col >= 0 && col < BOARD_SIZE;
    }

    getCurrentPlayer() {
        return this.players[this.currentPlayerIndex];
    }

    canMoveTo(piece, targetRow, targetCol) {
        if (!this.isValidTile(targetRow, targetCol)) {
            return { valid: false, reason: 'Out of bounds' };
        }

        if (piece.hasMoved) {
            return { valid: false, reason: 'Piece has already moved this turn' };
        }

        if (piece.type === PIECE_TYPES.CITY) {
            return { valid: false, reason: 'Cities cannot move' };
        }

        const currentPlayer = this.players[piece.ownerId];
        const tileOwner = this.tileOwnership[targetRow][targetCol];

        // Check tile ownership restrictions
        if (tileOwner !== null && tileOwner !== piece.ownerId) {
            const relation = currentPlayer.relations[tileOwner];
            if (relation === 'peace') {
                return { valid: false, reason: 'Cannot move onto tile owned by player at peace' };
            }
        }

        // Check movement range
        const rowDiff = Math.abs(targetRow - piece.row);
        const colDiff = Math.abs(targetCol - piece.col);

        if (piece.type === PIECE_TYPES.WARRIOR) {
            // Warriors move 1 tile including diagonals
            if (rowDiff > 1 || colDiff > 1) {
                return { valid: false, reason: 'Warriors can only move 1 tile' };
            }
            if (rowDiff === 0 && colDiff === 0) {
                return { valid: false, reason: 'Must move to a different tile' };
            }
        } else if (piece.type === PIECE_TYPES.SETTLER) {
            // Settlers move up to 3 tiles orthogonally (no diagonal)
            if (rowDiff > 0 && colDiff > 0) {
                return { valid: false, reason: 'Settlers cannot move diagonally' };
            }
            if (rowDiff > 3 || colDiff > 3) {
                return { valid: false, reason: 'Settlers can only move up to 3 tiles' };
            }
            if (rowDiff === 0 && colDiff === 0) {
                return { valid: false, reason: 'Must move to a different tile' };
            }
            // Check path is clear for settler
            if (!this.isPathClear(piece.row, piece.col, targetRow, targetCol)) {
                return { valid: false, reason: 'Path is blocked' };
            }
        }

        // Check for blockade (two warriors on opposite diagonal of a 2x2 square)
        if (this.isBlockedByBlockade(piece.row, piece.col, targetRow, targetCol, piece.ownerId)) {
            return { valid: false, reason: 'Blocked by enemy blockade' };
        }

        // Check for piece collision
        const targetPiece = this.board[targetRow][targetCol];
        if (targetPiece) {
            if (piece.type === PIECE_TYPES.SETTLER) {
                return { valid: false, reason: 'Settlers cannot attack' };
            }
            if (piece.type === PIECE_TYPES.WARRIOR) {
                const relation = currentPlayer.relations[targetPiece.ownerId];
                if (relation === 'peace') {
                    return { valid: false, reason: 'Cannot attack player at peace' };
                }
                if (targetPiece.ownerId === piece.ownerId) {
                    return { valid: false, reason: 'Cannot attack own piece' };
                }
            }
        }

        return { valid: true };
    }

    isPathClear(fromRow, fromCol, toRow, toCol) {
        const rowDir = Math.sign(toRow - fromRow);
        const colDir = Math.sign(toCol - fromCol);

        let r = fromRow + rowDir;
        let c = fromCol + colDir;

        while (r !== toRow || c !== toCol) {
            if (this.board[r][c]) {
                return false;
            }
            r += rowDir;
            c += colDir;
        }

        return true;
    }

    /**
     * Check if movement is blocked by a blockade.
     * A blockade forms when two warriors from the same player occupy diagonal
     * corners of a 2x2 square. Pieces cannot cross between them diagonally.
     *
     * Example: Warriors at positions marked W form a blockade:
     *   W .    or    . W
     *   . W          W .
     *
     * A piece at top-right cannot move to bottom-left (and vice versa) in the first case.
     * A piece at top-left cannot move to bottom-right (and vice versa) in the second case.
     */
    isBlockedByBlockade(fromRow, fromCol, toRow, toCol, movingOwnerId) {
        const rowDiff = toRow - fromRow;
        const colDiff = toCol - fromCol;

        // Only diagonal movements (1 step) can be blocked by a blockade
        if (Math.abs(rowDiff) !== 1 || Math.abs(colDiff) !== 1) {
            return false;
        }

        // For diagonal movement, check if the opposite diagonal of the 2x2 square
        // has two warriors from the same player (forming a blockade)
        // The opposite diagonal positions are: (fromRow, toCol) and (toRow, fromCol)
        const pos1Row = fromRow;
        const pos1Col = toCol;
        const pos2Row = toRow;
        const pos2Col = fromCol;

        const piece1 = this.board[pos1Row]?.[pos1Col];
        const piece2 = this.board[pos2Row]?.[pos2Col];

        // Both positions must have warriors from the same player
        if (!piece1 || !piece2) return false;
        if (piece1.type !== PIECE_TYPES.WARRIOR || piece2.type !== PIECE_TYPES.WARRIOR) return false;
        if (piece1.ownerId !== piece2.ownerId) return false;

        // A player's own blockade does not block their own pieces
        if (piece1.ownerId === movingOwnerId) return false;

        return true;
    }

    getValidMoves(piece) {
        const moves = [];

        if (piece.type === PIECE_TYPES.CITY || piece.hasMoved) {
            return moves;
        }

        if (piece.type === PIECE_TYPES.WARRIOR) {
            // Check all 8 adjacent tiles
            for (let dr = -1; dr <= 1; dr++) {
                for (let dc = -1; dc <= 1; dc++) {
                    if (dr === 0 && dc === 0) continue;
                    const newRow = piece.row + dr;
                    const newCol = piece.col + dc;
                    if (this.canMoveTo(piece, newRow, newCol).valid) {
                        moves.push({ row: newRow, col: newCol });
                    }
                }
            }
        } else if (piece.type === PIECE_TYPES.SETTLER) {
            // Check orthogonal moves up to 3 tiles
            const directions = [[-1, 0], [1, 0], [0, -1], [0, 1]];
            for (const [dr, dc] of directions) {
                for (let dist = 1; dist <= 3; dist++) {
                    const newRow = piece.row + dr * dist;
                    const newCol = piece.col + dc * dist;
                    if (this.canMoveTo(piece, newRow, newCol).valid) {
                        moves.push({ row: newRow, col: newCol });
                    } else {
                        break; // Can't go further in this direction
                    }
                }
            }
        }

        return moves;
    }

    movePiece(piece, targetRow, targetCol) {
        const canMove = this.canMoveTo(piece, targetRow, targetCol);
        if (!canMove.valid) {
            this.log('MOVE_DENIED', { piece: piece.id, reason: canMove.reason });
            return { success: false, reason: canMove.reason };
        }

        const targetPiece = this.board[targetRow][targetCol];
        let combatResult = null;

        // Handle combat
        if (targetPiece && piece.type === PIECE_TYPES.WARRIOR) {
            combatResult = this.resolveCombat(piece, targetPiece);
            if (!combatResult.attackerSurvived) {
                return { success: true, combat: combatResult };
            }
            // If defender survived OR city was captured, attacker stays at original position
            if (!combatResult.defenderDestroyed || combatResult.cityFlipped) {
                piece.hasMoved = true;
                return {
                    success: true,
                    combat: combatResult,
                    blocked: true,
                    originalPos: { row: piece.row, col: piece.col },
                    targetPos: { row: targetRow, col: targetCol }
                };
            }
        }

        // Move the piece
        this.board[piece.row][piece.col] = null;
        piece.row = targetRow;
        piece.col = targetCol;
        this.board[targetRow][targetCol] = piece;
        piece.hasMoved = true;

        // Warriors flip tile ownership only if owned by enemy at war
        if (piece.type === PIECE_TYPES.WARRIOR) {
            const tileOwner = this.tileOwnership[targetRow][targetCol];
            if (tileOwner !== null && tileOwner !== piece.ownerId) {
                const relation = this.players[piece.ownerId].relations[tileOwner];
                if (relation === 'war') {
                    this.tileOwnership[targetRow][targetCol] = piece.ownerId;
                }
            }
        }

        this.log('MOVE', { piece: piece.id, to: { row: targetRow, col: targetCol } });

        // Capture history snapshot after move
        this.history.captureSnapshot(this, 'MOVE', {
            piece: piece.id,
            to: { row: targetRow, col: targetCol },
            combat: combatResult
        });

        const result = { success: true };
        if (combatResult) {
            result.combat = combatResult;
        }
        return result;
    }

    resolveCombat(attacker, defender) {
        const originalOwnerId = defender.ownerId;
        const result = {
            attacker: attacker.id,
            defender: defender.id,
            damageDealt: attacker.damage,
            defenderDestroyed: false,
            cityFlipped: false,
            attackerSurvived: true,
            elimination: null
        };

        defender.hp -= attacker.damage;

        if (defender.hp <= 0) {
            result.defenderDestroyed = true;

            if (defender.type === PIECE_TYPES.CITY) {
                // City is captured
                defender.hp = Math.ceil(defender.maxHp / 3);
                defender.ownerId = attacker.ownerId;
                defender.production = null;
                defender.productionProgress = 0;
                result.cityFlipped = true;
                result.defenderDestroyed = false;
                this.tileOwnership[defender.row][defender.col] = attacker.ownerId;
                this.log('CITY_CAPTURED', { city: defender.id, newOwner: attacker.ownerId });

                // Capture history snapshot for city capture
                this.history.captureSnapshot(this, 'CITY_CAPTURED', {
                    city: defender.id,
                    newOwner: attacker.ownerId,
                    previousOwner: originalOwnerId
                });

                // Check for player elimination
                result.elimination = this.checkPlayerElimination(originalOwnerId);
            } else {
                // Remove the piece
                this.removePiece(defender);
            }
        }

        this.log('COMBAT', result);
        this.checkVictory();
        return result;
    }

    removePiece(piece) {
        const index = this.pieces.indexOf(piece);
        if (index > -1) {
            this.pieces.splice(index, 1);
        }
        this.board[piece.row][piece.col] = null;
        this.log('PIECE_REMOVED', { piece: piece.id });
    }

    checkPlayerElimination(playerId) {
        const playerCities = this.pieces.filter(p =>
            p.type === PIECE_TYPES.CITY && p.ownerId === playerId
        );

        if (playerCities.length === 0) {
            // Player is eliminated
            const conquerer = this.currentPlayerIndex;

            // Get warriors and settlers separately
            const playerWarriors = this.pieces.filter(p =>
                p.ownerId === playerId && p.type === PIECE_TYPES.WARRIOR
            );
            const playerSettlers = this.pieces.filter(p =>
                p.ownerId === playerId && p.type === PIECE_TYPES.SETTLER
            );

            // 25% of warriors are converted, at least 1 if any warriors exist
            const warriorsToConvert = playerWarriors.length > 0
                ? Math.max(1, Math.floor(playerWarriors.length * 0.25))
                : 0;

            // Shuffle warriors to randomly select which ones to convert
            const shuffledWarriors = [...playerWarriors].sort(() => Math.random() - 0.5);

            const convertedUnits = [];
            const destroyedUnits = [];

            // Process warriors: convert 25%, destroy 75%
            shuffledWarriors.forEach((warrior, index) => {
                if (index < warriorsToConvert) {
                    // Convert this warrior: destroy it and create a new warrior for conqueror
                    const row = warrior.row;
                    const col = warrior.col;
                    this.removePiece(warrior);

                    // Create new warrior for conqueror at same position
                    const newWarrior = this.createPiece(PIECE_TYPES.WARRIOR, conquerer, row, col);
                    this.pieces.push(newWarrior);
                    this.board[row][col] = newWarrior;

                    convertedUnits.push({ oldUnit: warrior, newWarrior: newWarrior });
                } else {
                    // Destroy this warrior
                    this.removePiece(warrior);
                    destroyedUnits.push(warrior);
                }
            });

            // Destroy all settlers
            playerSettlers.forEach(settler => {
                this.removePiece(settler);
                destroyedUnits.push(settler);
            });

            this.log('PLAYER_ELIMINATED', { player: playerId, conquerer: conquerer });

            // Capture history snapshot for player elimination
            this.history.captureSnapshot(this, 'PLAYER_ELIMINATED', {
                player: playerId,
                conquerer: conquerer,
                convertedUnits: convertedUnits.length,
                destroyedUnits: destroyedUnits.length
            });

            return {
                eliminated: true,
                playerId: playerId,
                conquerer: conquerer,
                convertedUnits: convertedUnits,
                destroyedUnits: destroyedUnits
            };
        }

        return { eliminated: false };
    }

    checkVictory() {
        const cityOwners = new Set(
            this.pieces
                .filter(p => p.type === PIECE_TYPES.CITY)
                .map(p => p.ownerId)
        );

        if (cityOwners.size === 1) {
            this.gameOver = true;
            this.winner = [...cityOwners][0];
            this.log('VICTORY', { winner: this.winner });

            // Capture final history snapshot and mark game as ended
            this.history.captureSnapshot(this, 'VICTORY', { winner: this.winner });
            this.history.endGame(this.winner);
        }
    }

    setProduction(city, productionType) {
        if (city.type !== PIECE_TYPES.CITY) {
            this.log('PRODUCTION_DENIED', { reason: 'Not a city' });
            return false;
        }

        if (city.ownerId !== this.currentPlayerIndex) {
            this.log('PRODUCTION_DENIED', { reason: 'Not your city' });
            return false;
        }

        city.production = productionType;
        city.productionProgress = 0;
        city.productionPaused = false;
        this.log('PRODUCTION_SET', { city: city.id, production: productionType });

        // Capture history snapshot for production set
        this.history.captureSnapshot(this, 'PRODUCTION_SET', {
            city: city.id,
            production: productionType,
            owner: city.ownerId
        });

        return true;
    }

    canSettlerBuildCity(settler) {
        if (settler.type !== PIECE_TYPES.SETTLER) {
            return { valid: false, reason: 'Not a settler' };
        }

        // Check if tile is owned by settler's owner (per game rules: "tile is owned")
        const tileOwner = this.tileOwnership[settler.row][settler.col];
        if (tileOwner !== settler.ownerId) {
            return { valid: false, reason: 'Must be on owned tile' };
        }

        // Check distance from other cities (at least 2 tiles)
        for (const piece of this.pieces) {
            if (piece.type === PIECE_TYPES.CITY) {
                const rowDiff = Math.abs(piece.row - settler.row);
                const colDiff = Math.abs(piece.col - settler.col);
                if (rowDiff <= 1 && colDiff <= 1) {
                    return { valid: false, reason: 'Too close to another city' };
                }
            }
        }

        return { valid: true };
    }

    settlerBuildCity(settler) {
        const canBuild = this.canSettlerBuildCity(settler);
        if (!canBuild.valid) {
            this.log('BUILD_CITY_DENIED', { reason: canBuild.reason });
            return { success: false, reason: canBuild.reason };
        }

        // Remove settler
        this.removePiece(settler);

        // Create city
        const city = this.createPiece(PIECE_TYPES.CITY, settler.ownerId, settler.row, settler.col);
        this.pieces.push(city);
        this.board[settler.row][settler.col] = city;
        this.tileOwnership[settler.row][settler.col] = settler.ownerId;

        this.log('CITY_BUILT', { city: city.id, location: { row: settler.row, col: settler.col } });

        // Capture history snapshot for city built
        this.history.captureSnapshot(this, 'CITY_BUILT', {
            city: city.id,
            location: { row: settler.row, col: settler.col },
            owner: settler.ownerId
        });

        return { success: true, city: city };
    }

    declareWar(playerId, targetId) {
        if (playerId === targetId) return false;

        const player = this.players[playerId];
        player.relations[targetId] = 'war';
        this.players[targetId].relations[playerId] = 'war';

        this.log('WAR_DECLARED', { attacker: playerId, defender: targetId });

        // Capture history snapshot for war declaration
        this.history.captureSnapshot(this, 'WAR_DECLARED', {
            attacker: playerId,
            defender: targetId
        });

        return true;
    }

    proposePeace(playerId, targetId) {
        if (playerId === targetId) return false;

        // Only set proposing player's relation - other player must accept
        const player = this.players[playerId];
        player.relations[targetId] = 'peace_proposed';

        this.log('PEACE_PROPOSED', { proposer: playerId, target: targetId });

        // Capture history snapshot for peace proposal
        this.history.captureSnapshot(this, 'PEACE_PROPOSED', {
            proposer: playerId,
            target: targetId
        });

        return true;
    }

    acceptPeace(playerId, targetId) {
        if (playerId === targetId) return false;

        // Check that target has proposed peace
        const target = this.players[targetId];
        if (target.relations[playerId] !== 'peace_proposed') return false;

        // Both players now at peace
        const player = this.players[playerId];
        player.relations[targetId] = 'peace';
        target.relations[playerId] = 'peace';

        this.log('PEACE_MADE', { player1: playerId, player2: targetId });

        // Capture history snapshot for peace
        this.history.captureSnapshot(this, 'PEACE_MADE', {
            player1: playerId,
            player2: targetId
        });

        return true;
    }

    endTurn() {
        // Process city productions
        this.pieces.forEach(piece => {
            if (piece.type === PIECE_TYPES.CITY && piece.ownerId === this.currentPlayerIndex) {
                this.processProduction(piece);
            }
        });

        // Reset movement for current player's pieces
        this.pieces.forEach(piece => {
            if (piece.ownerId === this.currentPlayerIndex) {
                piece.hasMoved = false;
            }
        });

        // Next player
        do {
            this.currentPlayerIndex = (this.currentPlayerIndex + 1) % this.players.length;
        } while (this.getPlayerCities(this.currentPlayerIndex).length === 0 && !this.gameOver);

        this.turnNumber++;
        this.log('TURN_END', { nextPlayer: this.currentPlayerIndex });

        // Capture history snapshot at end of each turn
        this.history.captureSnapshot(this, 'TURN_END', {
            turnNumber: this.turnNumber,
            nextPlayer: this.currentPlayerIndex
        });
    }

    getPlayerCities(playerId) {
        return this.pieces.filter(p =>
            p.type === PIECE_TYPES.CITY && p.ownerId === playerId
        );
    }

    processProduction(city) {
        if (!city.production || city.productionPaused) {
            city.productionPaused = false;
            return;
        }

        city.productionProgress++;
        const prodType = PRODUCTION_TYPES[city.production];

        if (city.productionProgress >= prodType.turns) {
            this.completeProduction(city);
        }
    }

    completeProduction(city) {
        const production = city.production;

        switch (production) {
            case 'DIPLOMACY':
                this.expandTerritory(city.ownerId);
                break;
            case 'SCIENCE':
                this.players[city.ownerId].techScore++;
                this.applyTechBonus(city.ownerId);
                this.log('TECH_COMPLETE', { player: city.ownerId, newScore: this.players[city.ownerId].techScore });

                // Capture history snapshot for tech advancement
                this.history.captureSnapshot(this, 'TECH_COMPLETE', {
                    player: city.ownerId,
                    newScore: this.players[city.ownerId].techScore
                });
                break;
            case 'WARRIOR':
                this.spawnUnit(city, PIECE_TYPES.WARRIOR);
                break;
            case 'SETTLER':
                this.spawnUnit(city, PIECE_TYPES.SETTLER);
                break;
            case 'REPAIR':
                if (city.hp < city.maxHp) {
                    city.hp++;
                }
                break;
        }

        this.log('PRODUCTION_COMPLETE', { city: city.id, production: production });

        // Handle repeat production
        if (city.repeatProduction) {
            // Don't repeat repair if at full health
            if (production === 'REPAIR' && city.hp >= city.maxHp) {
                city.production = null;
                city.productionProgress = 0;
            } else {
                city.productionProgress = 0;
                // Keep production the same - it will continue next turn
            }
        } else {
            city.production = null;
            city.productionProgress = 0;
        }
    }

    spawnUnit(city, unitType) {
        const spawnTile = this.findAdjacentEmptyTile(city.row, city.col);

        if (spawnTile) {
            const unit = this.createPiece(unitType, city.ownerId, spawnTile.row, spawnTile.col);
            this.pieces.push(unit);
            this.board[spawnTile.row][spawnTile.col] = unit;
            this.log('UNIT_SPAWNED', { type: unitType, location: spawnTile });

            // Capture history snapshot for unit spawned
            this.history.captureSnapshot(this, 'UNIT_SPAWNED', {
                type: unitType,
                location: spawnTile,
                owner: city.ownerId
            });
        } else {
            // No valid tile, pause production
            city.productionProgress--;
            city.productionPaused = true;
            this.log('SPAWN_BLOCKED', { city: city.id });
        }
    }

    expandTerritory(playerId) {
        // Find boundary tiles and try to claim one
        const ownedTiles = [];
        for (let r = 0; r < BOARD_SIZE; r++) {
            for (let c = 0; c < BOARD_SIZE; c++) {
                if (this.tileOwnership[r][c] === playerId) {
                    ownedTiles.push({ row: r, col: c });
                }
            }
        }

        // Find unowned adjacent tiles
        const candidates = [];
        const directions = [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [-1, 1], [1, -1], [1, 1]];

        for (const tile of ownedTiles) {
            for (const [dr, dc] of directions) {
                const newR = tile.row + dr;
                const newC = tile.col + dc;
                if (this.isValidTile(newR, newC) && this.tileOwnership[newR][newC] !== playerId) {
                    candidates.push({ row: newR, col: newC, owned: this.tileOwnership[newR][newC] !== null });
                }
            }
        }

        // Prefer unowned tiles
        let unownedCandidates = candidates.filter(c => !c.owned);
        if (unownedCandidates.length === 0) {
            unownedCandidates = candidates;
        }

        if (unownedCandidates.length > 0) {
            const chosen = unownedCandidates[Math.floor(Math.random() * unownedCandidates.length)];
            this.tileOwnership[chosen.row][chosen.col] = playerId;

            // Check if city is on this tile
            const piece = this.board[chosen.row][chosen.col];
            if (piece && piece.type === PIECE_TYPES.CITY) {
                piece.ownerId = playerId;
            }

            this.log('TERRITORY_EXPANDED', { player: playerId, tile: chosen });

            // Capture history snapshot for territory expansion
            this.history.captureSnapshot(this, 'TERRITORY_EXPANDED', {
                player: playerId,
                tile: chosen
            });
        }
    }

    applyTechBonus(playerId) {
        this.pieces.forEach(piece => {
            if (piece.ownerId === playerId) {
                if (piece.type === PIECE_TYPES.CITY || piece.type === PIECE_TYPES.WARRIOR) {
                    piece.maxHp++;
                    piece.hp++;
                }
                if (piece.type === PIECE_TYPES.WARRIOR) {
                    piece.damage++;
                }
            }
        });
    }

    // ========================================
    // AI SUPPORT FUNCTIONS
    // ========================================
    // These functions provide game state analysis for AI decision-making.
    // They generate heatmaps, evaluate positions, and calculate strategic metrics.

    /**
     * getGameStateForAI - Comprehensive snapshot of game state for AI analysis
     *
     * Returns all information an AI needs to make decisions:
     * - Own pieces and their states
     * - Enemy pieces and their positions
     * - Territory ownership
     * - Player relations and relative strengths
     * - Available actions
     *
     * @param {number} playerId - The AI player requesting the state
     * @returns {Object} Complete game state from this player's perspective
     */
    getGameStateForAI(playerId) {
        const player = this.players[playerId];
        if (!player) return null;

        // Categorize all pieces by owner
        const ownPieces = {
            cities: [],
            warriors: [],
            settlers: []
        };
        const enemyPieces = {};

        this.pieces.forEach(piece => {
            const category = piece.type === PIECE_TYPES.CITY ? 'cities' :
                            piece.type === PIECE_TYPES.WARRIOR ? 'warriors' : 'settlers';

            if (piece.ownerId === playerId) {
                ownPieces[category].push({
                    id: piece.id,
                    row: piece.row,
                    col: piece.col,
                    hp: piece.hp,
                    maxHp: piece.maxHp,
                    damage: piece.damage,
                    hasMoved: piece.hasMoved,
                    production: piece.production,
                    productionProgress: piece.productionProgress
                });
            } else {
                if (!enemyPieces[piece.ownerId]) {
                    enemyPieces[piece.ownerId] = { cities: [], warriors: [], settlers: [] };
                }
                enemyPieces[piece.ownerId][category].push({
                    id: piece.id,
                    row: piece.row,
                    col: piece.col,
                    hp: piece.hp,
                    maxHp: piece.maxHp,
                    damage: piece.damage
                });
            }
        });

        // Calculate territory counts
        const territoryCounts = {};
        for (let r = 0; r < BOARD_SIZE; r++) {
            for (let c = 0; c < BOARD_SIZE; c++) {
                const owner = this.tileOwnership[r][c];
                if (owner !== null) {
                    territoryCounts[owner] = (territoryCounts[owner] || 0) + 1;
                }
            }
        }

        // Get relations with all players
        const relations = {};
        this.players.forEach((p, i) => {
            if (i !== playerId) {
                relations[i] = {
                    status: player.relations[i],
                    theirStatus: p.relations[playerId]
                };
            }
        });

        return {
            playerId: playerId,
            turnNumber: this.turnNumber,
            ownPieces: ownPieces,
            enemyPieces: enemyPieces,
            territory: {
                owned: territoryCounts[playerId] || 0,
                byPlayer: territoryCounts
            },
            techLevel: player.techScore,
            relations: relations,
            gamePhase: this.getGamePhase()
        };
    }

    /**
     * getGamePhase - Determine current phase of the game
     *
     * Phases affect AI strategy selection:
     * - EARLY: Expansion and setup (turns 0-15, <3 cities average)
     * - MID: Development and positioning (turns 15-40)
     * - LATE: Decisive combat and endgame (turns 40+)
     *
     * @returns {string} 'early', 'mid', or 'late'
     */
    getGamePhase() {
        const activePlayers = this.players.filter((p, i) =>
            this.getPlayerCities(i).length > 0
        ).length;
        const totalCities = this.pieces.filter(p => p.type === PIECE_TYPES.CITY).length;
        const avgCities = totalCities / Math.max(activePlayers, 1);

        if (this.turnNumber < 15 && avgCities < 3) {
            return 'early';
        } else if (this.turnNumber < 40 && activePlayers > 2) {
            return 'mid';
        } else {
            return 'late';
        }
    }

    /**
     * getThreatHeatmap - Generate heatmap of danger levels for a player
     *
     * Each tile gets a threat score based on:
     * - Distance to enemy warriors (closer = more threat)
     * - Enemy warrior strength (damage/hp)
     * - Number of enemies that can reach the tile
     * - Whether tile is contested or behind enemy lines
     *
     * @param {number} playerId - Player to calculate threats for
     * @returns {Array<Array<number>>} 2D array of threat values (0-1 normalized)
     */
    getThreatHeatmap(playerId) {
        const heatmap = Array(BOARD_SIZE).fill(null)
            .map(() => Array(BOARD_SIZE).fill(0));

        const player = this.players[playerId];
        if (!player) return heatmap;

        // Find all enemy warriors that are at war with us
        const enemyWarriors = this.pieces.filter(p =>
            p.type === PIECE_TYPES.WARRIOR &&
            p.ownerId !== playerId &&
            player.relations[p.ownerId] === 'war'
        );

        // For each tile, calculate threat from nearby enemies
        let maxThreat = 0;
        for (let r = 0; r < BOARD_SIZE; r++) {
            for (let c = 0; c < BOARD_SIZE; c++) {
                let threat = 0;

                enemyWarriors.forEach(warrior => {
                    // Chebyshev distance (diagonal movement)
                    const dist = Math.max(
                        Math.abs(warrior.row - r),
                        Math.abs(warrior.col - c)
                    );

                    // Threat decreases with distance, weighted by damage
                    if (dist <= 5) {
                        const baseThreat = warrior.damage * (1 / (dist + 1));
                        threat += baseThreat;
                    }
                });

                heatmap[r][c] = threat;
                maxThreat = Math.max(maxThreat, threat);
            }
        }

        // Normalize to 0-1
        if (maxThreat > 0) {
            for (let r = 0; r < BOARD_SIZE; r++) {
                for (let c = 0; c < BOARD_SIZE; c++) {
                    heatmap[r][c] /= maxThreat;
                }
            }
        }

        return heatmap;
    }

    /**
     * getOpportunityHeatmap - Generate heatmap of valuable targets
     *
     * Each tile gets an opportunity score based on:
     * - Proximity to enemy cities (high value targets)
     * - Proximity to undefended enemy units
     * - Unclaimed or weakly held territory
     * - Strategic chokepoints
     *
     * @param {number} playerId - Player to calculate opportunities for
     * @returns {Array<Array<number>>} 2D array of opportunity values (0-1 normalized)
     */
    getOpportunityHeatmap(playerId) {
        const heatmap = Array(BOARD_SIZE).fill(null)
            .map(() => Array(BOARD_SIZE).fill(0));

        const player = this.players[playerId];
        if (!player) return heatmap;

        let maxOpp = 0;

        for (let r = 0; r < BOARD_SIZE; r++) {
            for (let c = 0; c < BOARD_SIZE; c++) {
                let opportunity = 0;

                // Check for nearby enemy cities we're at war with
                this.pieces.forEach(piece => {
                    if (piece.ownerId === playerId) return;
                    if (player.relations[piece.ownerId] !== 'war') return;

                    const dist = Math.max(
                        Math.abs(piece.row - r),
                        Math.abs(piece.col - c)
                    );

                    if (piece.type === PIECE_TYPES.CITY) {
                        // Cities are high-value targets
                        // Lower HP = more vulnerable = higher opportunity
                        const vulnerability = 1 - (piece.hp / piece.maxHp);
                        opportunity += (5 + vulnerability * 3) / (dist + 1);
                    } else if (piece.type === PIECE_TYPES.SETTLER) {
                        // Settlers are vulnerable targets
                        opportunity += 3 / (dist + 1);
                    } else if (piece.type === PIECE_TYPES.WARRIOR) {
                        // Warriors are moderate targets
                        opportunity += 1 / (dist + 1);
                    }
                });

                // Bonus for unclaimed territory
                if (this.tileOwnership[r][c] === null) {
                    opportunity += 0.5;
                }

                // Bonus for enemy territory
                const tileOwner = this.tileOwnership[r][c];
                if (tileOwner !== null && tileOwner !== playerId) {
                    if (player.relations[tileOwner] === 'war') {
                        opportunity += 1;
                    }
                }

                heatmap[r][c] = opportunity;
                maxOpp = Math.max(maxOpp, opportunity);
            }
        }

        // Normalize to 0-1
        if (maxOpp > 0) {
            for (let r = 0; r < BOARD_SIZE; r++) {
                for (let c = 0; c < BOARD_SIZE; c++) {
                    heatmap[r][c] /= maxOpp;
                }
            }
        }

        return heatmap;
    }

    /**
     * getTerritoryHeatmap - Generate heatmap of territorial control
     *
     * Shows how strongly each tile is controlled:
     * - Positive values = controlled by the player
     * - Negative values = controlled by enemies
     * - Values near 0 = contested
     *
     * Factors:
     * - Direct ownership
     * - Proximity to cities
     * - Proximity to warriors
     *
     * @param {number} playerId - Player perspective
     * @returns {Array<Array<number>>} 2D array (-1 to 1, player control vs enemy)
     */
    getTerritoryHeatmap(playerId) {
        const heatmap = Array(BOARD_SIZE).fill(null)
            .map(() => Array(BOARD_SIZE).fill(0));

        for (let r = 0; r < BOARD_SIZE; r++) {
            for (let c = 0; c < BOARD_SIZE; c++) {
                let control = 0;

                // Base ownership
                const owner = this.tileOwnership[r][c];
                if (owner === playerId) {
                    control += 0.3;
                } else if (owner !== null) {
                    control -= 0.3;
                }

                // Influence from nearby pieces
                this.pieces.forEach(piece => {
                    const dist = Math.max(
                        Math.abs(piece.row - r),
                        Math.abs(piece.col - c)
                    );

                    if (dist > 4) return; // Too far to matter

                    let influence = 0;
                    if (piece.type === PIECE_TYPES.CITY) {
                        influence = 3 / (dist + 1);
                    } else if (piece.type === PIECE_TYPES.WARRIOR) {
                        influence = 1.5 / (dist + 1);
                    }

                    if (piece.ownerId === playerId) {
                        control += influence;
                    } else {
                        control -= influence;
                    }
                });

                // Clamp to -1 to 1
                heatmap[r][c] = Math.max(-1, Math.min(1, control / 5));
            }
        }

        return heatmap;
    }

    /**
     * getExpansionHeatmap - Generate heatmap of good city locations
     *
     * Evaluates each tile for city-building potential:
     * - Must be >= 2 tiles from existing cities
     * - Prefers owned territory
     * - Prefers distance from enemies
     * - Prefers central positions (more expansion room)
     *
     * @param {number} playerId - Player to calculate for
     * @returns {Array<Array<number>>} 2D array of expansion values (0-1, or -1 if invalid)
     */
    getExpansionHeatmap(playerId) {
        const heatmap = Array(BOARD_SIZE).fill(null)
            .map(() => Array(BOARD_SIZE).fill(0));

        const player = this.players[playerId];
        if (!player) return heatmap;

        // Pre-calculate city positions
        const cities = this.pieces.filter(p => p.type === PIECE_TYPES.CITY);
        const enemyCities = cities.filter(c => c.ownerId !== playerId);
        const ownCities = cities.filter(c => c.ownerId === playerId);

        let maxValue = 0;

        for (let r = 0; r < BOARD_SIZE; r++) {
            for (let c = 0; c < BOARD_SIZE; c++) {
                // Check minimum distance from all cities
                let tooClose = false;
                let minDistToEnemy = Infinity;
                let minDistToOwn = Infinity;

                cities.forEach(city => {
                    const dist = Math.max(
                        Math.abs(city.row - r),
                        Math.abs(city.col - c)
                    );
                    if (dist <= 1) {
                        tooClose = true;
                    }
                    if (city.ownerId !== playerId) {
                        minDistToEnemy = Math.min(minDistToEnemy, dist);
                    } else {
                        minDistToOwn = Math.min(minDistToOwn, dist);
                    }
                });

                if (tooClose || this.board[r][c] !== null) {
                    heatmap[r][c] = -1; // Invalid location
                    continue;
                }

                let value = 0;

                // Prefer owned territory
                if (this.tileOwnership[r][c] === playerId) {
                    value += 3;
                } else if (this.tileOwnership[r][c] === null) {
                    value += 1;
                }

                // Prefer distance from enemies (safety)
                value += Math.min(minDistToEnemy, 5) * 0.5;

                // Prefer not too far from own cities (logistics)
                if (minDistToOwn < Infinity) {
                    value += Math.max(0, 5 - minDistToOwn) * 0.3;
                }

                // Prefer central positions
                const centerDist = Math.abs(r - 4.5) + Math.abs(c - 4.5);
                value += Math.max(0, 5 - centerDist) * 0.2;

                heatmap[r][c] = value;
                maxValue = Math.max(maxValue, value);
            }
        }

        // Normalize valid tiles to 0-1
        if (maxValue > 0) {
            for (let r = 0; r < BOARD_SIZE; r++) {
                for (let c = 0; c < BOARD_SIZE; c++) {
                    if (heatmap[r][c] > 0) {
                        heatmap[r][c] /= maxValue;
                    }
                }
            }
        }

        return heatmap;
    }

    /**
     * getPlayerStrength - Calculate overall strength of a player
     *
     * Combines multiple factors into a single strength score:
     * - Military power (warrior count and quality)
     * - Economic power (city count and health)
     * - Territory control
     * - Technology level
     *
     * @param {number} playerId - Player to evaluate
     * @returns {Object} Breakdown of strength components and total
     */
    getPlayerStrength(playerId) {
        const player = this.players[playerId];
        if (!player) return null;

        const cities = this.pieces.filter(p =>
            p.type === PIECE_TYPES.CITY && p.ownerId === playerId
        );
        const warriors = this.pieces.filter(p =>
            p.type === PIECE_TYPES.WARRIOR && p.ownerId === playerId
        );
        const settlers = this.pieces.filter(p =>
            p.type === PIECE_TYPES.SETTLER && p.ownerId === playerId
        );

        // Territory count
        let territory = 0;
        for (let r = 0; r < BOARD_SIZE; r++) {
            for (let c = 0; c < BOARD_SIZE; c++) {
                if (this.tileOwnership[r][c] === playerId) territory++;
            }
        }

        // Calculate sub-scores
        const militaryPower = warriors.reduce((sum, w) =>
            sum + w.hp + w.damage * 2, 0
        );
        const economicPower = cities.reduce((sum, c) =>
            sum + c.hp + 5, 0
        );
        const expansionPotential = settlers.length * 10;
        const techPower = player.techScore * 5;
        const territorialPower = territory * 0.5;

        const total = militaryPower + economicPower + expansionPotential +
                      techPower + territorialPower;

        return {
            playerId: playerId,
            military: militaryPower,
            economic: economicPower,
            expansion: expansionPotential,
            technology: techPower,
            territory: territorialPower,
            total: total,
            breakdown: {
                cities: cities.length,
                warriors: warriors.length,
                settlers: settlers.length,
                techLevel: player.techScore,
                tiles: territory
            }
        };
    }

    /**
     * getRelativeStrength - Compare strength between two players
     *
     * @param {number} playerId - First player
     * @param {number} targetId - Second player to compare against
     * @returns {Object} Comparison metrics
     */
    getRelativeStrength(playerId, targetId) {
        const ownStrength = this.getPlayerStrength(playerId);
        const targetStrength = this.getPlayerStrength(targetId);

        if (!ownStrength || !targetStrength) return null;

        const ratio = ownStrength.total / Math.max(targetStrength.total, 1);

        return {
            ownTotal: ownStrength.total,
            targetTotal: targetStrength.total,
            ratio: ratio,
            advantage: ratio > 1.2 ? 'strong' :
                       ratio > 0.8 ? 'even' : 'weak',
            militaryRatio: ownStrength.military / Math.max(targetStrength.military, 1),
            economicRatio: ownStrength.economic / Math.max(targetStrength.economic, 1),
            techRatio: ownStrength.technology / Math.max(targetStrength.technology, 1)
        };
    }

    /**
     * getStrategicPositions - Identify key positions on the board
     *
     * Returns positions that have strategic importance:
     * - Chokepoints (tiles that control movement)
     * - Contested borders between players
     * - Vulnerable enemy cities
     * - Good defensive positions
     *
     * @param {number} playerId - Player perspective
     * @returns {Object} Categorized strategic positions
     */
    getStrategicPositions(playerId) {
        const positions = {
            chokepoints: [],
            contestedBorders: [],
            vulnerableCities: [],
            defensivePositions: []
        };

        const player = this.players[playerId];
        if (!player) return positions;

        // Find contested border tiles (adjacent to both own and enemy territory)
        for (let r = 0; r < BOARD_SIZE; r++) {
            for (let c = 0; c < BOARD_SIZE; c++) {
                const owner = this.tileOwnership[r][c];
                let touchesOwn = owner === playerId;
                let touchesEnemy = owner !== null && owner !== playerId;

                // Check adjacent tiles
                for (let dr = -1; dr <= 1; dr++) {
                    for (let dc = -1; dc <= 1; dc++) {
                        if (dr === 0 && dc === 0) continue;
                        const nr = r + dr;
                        const nc = c + dc;
                        if (!this.isValidTile(nr, nc)) continue;

                        const adjOwner = this.tileOwnership[nr][nc];
                        if (adjOwner === playerId) touchesOwn = true;
                        if (adjOwner !== null && adjOwner !== playerId) touchesEnemy = true;
                    }
                }

                if (touchesOwn && touchesEnemy) {
                    positions.contestedBorders.push({ row: r, col: c, owner: owner });
                }
            }
        }

        // Find vulnerable enemy cities
        this.pieces.forEach(piece => {
            if (piece.type !== PIECE_TYPES.CITY) return;
            if (piece.ownerId === playerId) return;
            if (player.relations[piece.ownerId] !== 'war') return;

            // Check if city is low HP or undefended
            const defenders = this.pieces.filter(p =>
                p.type === PIECE_TYPES.WARRIOR &&
                p.ownerId === piece.ownerId &&
                Math.max(Math.abs(p.row - piece.row), Math.abs(p.col - piece.col)) <= 2
            );

            const vulnerability = (1 - piece.hp / piece.maxHp) +
                                  (defenders.length === 0 ? 0.5 : 0);

            if (vulnerability > 0.3) {
                positions.vulnerableCities.push({
                    row: piece.row,
                    col: piece.col,
                    hp: piece.hp,
                    maxHp: piece.maxHp,
                    defenders: defenders.length,
                    vulnerability: vulnerability
                });
            }
        });

        // Find good defensive positions for own cities
        this.pieces.forEach(piece => {
            if (piece.type !== PIECE_TYPES.CITY) return;
            if (piece.ownerId !== playerId) return;

            // Find tiles around city that would be good for defenders
            for (let dr = -1; dr <= 1; dr++) {
                for (let dc = -1; dc <= 1; dc++) {
                    if (dr === 0 && dc === 0) continue;
                    const nr = piece.row + dr;
                    const nc = piece.col + dc;
                    if (!this.isValidTile(nr, nc)) continue;
                    if (this.board[nr][nc]) continue; // Occupied

                    // Score based on coverage of approaches
                    positions.defensivePositions.push({
                        row: nr,
                        col: nc,
                        protects: piece.id,
                        cityPos: { row: piece.row, col: piece.col }
                    });
                }
            }
        });

        // Sort vulnerable cities by vulnerability
        positions.vulnerableCities.sort((a, b) => b.vulnerability - a.vulnerability);

        return positions;
    }

    /**
     * getPieceThreats - Get all pieces that threaten a specific tile or piece
     *
     * @param {number} row - Target row
     * @param {number} col - Target column
     * @param {number} defenderId - Owner of tile/piece being threatened
     * @returns {Array<Object>} List of threatening pieces with threat details
     */
    getPieceThreats(row, col, defenderId) {
        const threats = [];

        this.pieces.forEach(piece => {
            if (piece.type !== PIECE_TYPES.WARRIOR) return;
            if (piece.ownerId === defenderId) return;

            const defender = this.players[defenderId];
            if (defender.relations[piece.ownerId] !== 'war') return;

            const dist = Math.max(
                Math.abs(piece.row - row),
                Math.abs(piece.col - col)
            );

            if (dist <= 3) { // Within threatening range
                threats.push({
                    piece: piece,
                    distance: dist,
                    canReachThisTurn: dist === 1,
                    turnsToReach: dist,
                    damage: piece.damage
                });
            }
        });

        // Sort by distance (immediate threats first)
        threats.sort((a, b) => a.distance - b.distance);

        return threats;
    }

    /**
     * simulateMove - Simulate a move without executing it
     *
     * Useful for AI lookahead to evaluate consequences of moves.
     * Returns the expected game state after the move.
     *
     * @param {Object} piece - Piece to move
     * @param {number} targetRow - Target row
     * @param {number} targetCol - Target column
     * @returns {Object} Simulated result including combat outcomes
     */
    simulateMove(piece, targetRow, targetCol) {
        const result = {
            valid: false,
            combat: null,
            territoryGained: false,
            pieceDestroyed: null,
            ownPieceLost: false
        };

        const canMove = this.canMoveTo(piece, targetRow, targetCol);
        if (!canMove.valid) {
            return result;
        }

        result.valid = true;

        // Check for combat
        const targetPiece = this.board[targetRow][targetCol];
        if (targetPiece && piece.type === PIECE_TYPES.WARRIOR) {
            result.combat = {
                defender: targetPiece,
                defenderHpAfter: targetPiece.hp - piece.damage,
                defenderDestroyed: targetPiece.hp <= piece.damage
            };

            if (targetPiece.type === PIECE_TYPES.CITY && result.combat.defenderDestroyed) {
                result.combat.cityCapture = true;
                result.combat.defenderDestroyed = false;
            }

            result.pieceDestroyed = result.combat.defenderDestroyed ? targetPiece : null;
        }

        // Check territory change
        const tileOwner = this.tileOwnership[targetRow][targetCol];
        if (piece.type === PIECE_TYPES.WARRIOR && tileOwner !== piece.ownerId) {
            result.territoryGained = true;
        }

        return result;
    }

    // Legacy AI placeholder functions (kept for backwards compatibility)
    getAIMove(playerId) {
        // Placeholder for AI - returns null (no AI implemented yet)
        return null;
    }

    executeAITurn(playerId) {
        // Placeholder for AI turn execution
        this.log('AI_TURN_SKIP', { player: playerId, reason: 'AI not implemented' });
    }

    /**
     * Restore game state from a saved game snapshot
     * @param {Object} savedGame - The saved game data from localStorage
     */
    restoreFromSavedGame(savedGame) {
        this.reset();

        const latestSnapshot = savedGame.snapshots[savedGame.snapshots.length - 1];
        const metadata = savedGame.metadata;

        // Restore players from metadata
        metadata.players.forEach((p, index) => {
            this.players.push({
                id: p.id,
                name: p.name,
                color: p.color,
                techScore: 0,
                isHuman: true,
                relations: {}
            });
        });

        // Restore tech levels
        if (latestSnapshot.techLevels) {
            latestSnapshot.techLevels.forEach(tech => {
                if (this.players[tech.playerId]) {
                    this.players[tech.playerId].techScore = tech.techScore;
                }
            });
        }

        // Restore player relations
        if (latestSnapshot.playerRelations) {
            latestSnapshot.playerRelations.forEach(rel => {
                if (this.players[rel.playerId]) {
                    this.players[rel.playerId].relations = { ...rel.relations };
                }
            });
        }

        // Restore tile ownership
        if (latestSnapshot.tileOwnership) {
            this.tileOwnership = latestSnapshot.tileOwnership.map(row => row.slice());
        }

        // Restore pieces
        if (latestSnapshot.pieces) {
            latestSnapshot.pieces.forEach(p => {
                const piece = {
                    id: p.id,
                    type: p.type,
                    ownerId: p.ownerId,
                    row: p.row,
                    col: p.col,
                    hp: p.hp,
                    maxHp: p.maxHp,
                    damage: p.type === PIECE_TYPES.WARRIOR ? 1 + (this.players[p.ownerId]?.techScore || 0) : 0,
                    hasMoved: p.hasMoved || false,
                    production: p.production || null,
                    productionProgress: p.productionProgress || 0,
                    productionPaused: false,
                    repeatProduction: true
                };
                this.pieces.push(piece);
                this.board[piece.row][piece.col] = piece;
            });
        }

        // Restore game state
        this.currentPlayerIndex = latestSnapshot.currentPlayerIndex;
        this.turnNumber = latestSnapshot.turnNumber || 0;

        // Restore history with existing game ID
        this.history.gameId = savedGame.gameId;
        this.history.metadata = { ...metadata };
        this.history.snapshots = [...savedGame.snapshots];

        this.log('GAME_RESTORED', { gameId: savedGame.gameId, turnNumber: this.turnNumber });

        return true;
    }
}
