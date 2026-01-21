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

        // For now, peace is automatically accepted
        const player = this.players[playerId];
        player.relations[targetId] = 'peace';
        this.players[targetId].relations[playerId] = 'peace';

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

    // AI placeholder functions
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
                    repeatProduction: false
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
