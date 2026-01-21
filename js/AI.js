// ============================================
// AI SYSTEM - Personality-Based Architecture
// ============================================
// The AI uses a personality-driven approach where:
// 1. Each AI is randomly assigned MILITARISTIC or EXPANSIONIST personality
// 2. Militaristic: builds armies, researches tech, declares war, conquers
// 3. Expansionist: maintains comparable army, expands territory, builds cities
// 4. Production is reevaluated whenever a project completes
// ============================================

// ============================================
// CONSTANTS
// ============================================

const AI_DIFFICULTY = {
    EASY: 'easy',
    MEDIUM: 'medium',
    HARD: 'hard'
};

const AI_PERSONALITY = {
    MILITARISTIC: 'militaristic',
    EXPANSIONIST: 'expansionist'
};

const AI_ACTION_TYPE = {
    MOVE_UNIT: 'move_unit',
    ATTACK: 'attack',
    BUILD_CITY: 'build_city',
    SET_PRODUCTION: 'set_production',
    DECLARE_WAR: 'declare_war',
    PROPOSE_PEACE: 'propose_peace',
    ACCEPT_PEACE: 'accept_peace',
    END_TURN: 'end_turn'
};

const DIFFICULTY_CONFIG = {
    [AI_DIFFICULTY.EASY]: {
        mistakeChance: 0.3,       // Chance to make suboptimal move
        aggressionBonus: 0,       // Modifier for war threshold
        defenseAwareness: 0.5    // How much to weigh defense
    },
    [AI_DIFFICULTY.MEDIUM]: {
        mistakeChance: 0.15,
        aggressionBonus: 0.1,
        defenseAwareness: 0.8
    },
    [AI_DIFFICULTY.HARD]: {
        mistakeChance: 0.0,
        aggressionBonus: 0.2,
        defenseAwareness: 1.0
    }
};

// ============================================
// AI CONTROLLER CLASS
// ============================================

class AIController {
    constructor(engine, playerId, difficulty = AI_DIFFICULTY.MEDIUM) {
        this.engine = engine;
        this.playerId = playerId;
        this.difficulty = difficulty;
        this.config = DIFFICULTY_CONFIG[difficulty];

        // Randomly assign personality
        this.personality = Math.random() < 0.5 ? AI_PERSONALITY.MILITARISTIC : AI_PERSONALITY.EXPANSIONIST;
        console.log(`[AI] Player ${playerId} personality: ${this.personality}`);

        // Track state for decision making
        this.turnsAtWar = {};
        this.lastWarDeclaration = -10;  // Turn when last declared war
    }

    // ========================================
    // MAIN TURN EXECUTION
    // ========================================

    executeTurn() {
        const actionsTaken = [];
        console.log(`[AI] Player ${this.playerId} turn (${this.personality}) - Turn ${this.engine.turnNumber}`);

        // 1. Analyze the current board state
        const boardState = this.analyzeBoardState();

        // 2. Handle diplomacy based on personality
        const diplomacyActions = this.handleDiplomacy(boardState);
        actionsTaken.push(...diplomacyActions);

        // 3. Handle city production (reevaluate for any city without active production)
        const productionActions = this.handleProduction(boardState);
        actionsTaken.push(...productionActions);

        // 4. Execute unit movements based on personality
        const unitActions = this.executeUnitActions(boardState);
        actionsTaken.push(...unitActions);

        console.log(`[AI] Player ${this.playerId} completed ${actionsTaken.length} actions`);
        return actionsTaken;
    }

    // ========================================
    // BOARD STATE ANALYSIS
    // ========================================

    analyzeBoardState() {
        const baseState = this.engine.getGameStateForAI(this.playerId);

        // Count armies for each player
        const armyCounts = {};
        armyCounts[this.playerId] = baseState.ownPieces.warriors.length;

        let maxEnemyArmy = 0;
        for (const enemyId in baseState.enemyPieces) {
            const count = baseState.enemyPieces[enemyId].warriors.length;
            armyCounts[enemyId] = count;
            maxEnemyArmy = Math.max(maxEnemyArmy, count);
        }

        // Find vulnerable enemy cities
        const vulnerableCities = this.findVulnerableCities(baseState);

        // Find good expansion spots
        const expansionSpots = this.findExpansionSpots();

        // Find threatened own cities
        const threatenedCities = this.findThreatenedCities(baseState);

        // Calculate territory counts
        const territoryCounts = {};
        for (let r = 0; r < BOARD_SIZE; r++) {
            for (let c = 0; c < BOARD_SIZE; c++) {
                const owner = this.engine.tileOwnership[r][c];
                if (owner !== null) {
                    territoryCounts[owner] = (territoryCounts[owner] || 0) + 1;
                }
            }
        }

        return {
            ...baseState,
            armyCounts,
            maxEnemyArmy,
            myArmy: armyCounts[this.playerId] || 0,
            vulnerableCities,
            expansionSpots,
            threatenedCities,
            territoryCounts,
            myTerritory: territoryCounts[this.playerId] || 0
        };
    }

    findVulnerableCities(baseState) {
        const targets = [];
        const player = this.engine.players[this.playerId];

        for (const enemyId in baseState.enemyPieces) {
            const enemy = baseState.enemyPieces[enemyId];
            const atWar = player.relations[enemyId] === 'war';

            for (const city of enemy.cities) {
                // Count defenders within 2 tiles
                const defenders = enemy.warriors.filter(w =>
                    this.chebyshevDistance(w.row, w.col, city.row, city.col) <= 2
                ).length;

                // Calculate distance from our nearest warrior
                let closestDist = BOARD_SIZE * 2;
                for (const warrior of baseState.ownPieces.warriors) {
                    const dist = this.chebyshevDistance(warrior.row, warrior.col, city.row, city.col);
                    closestDist = Math.min(closestDist, dist);
                }

                targets.push({
                    city,
                    ownerId: parseInt(enemyId),
                    defenders,
                    distance: closestDist,
                    atWar,
                    hp: city.hp,
                    // Vulnerability score: low HP, few defenders, close = more vulnerable
                    vulnerability: (4 - city.hp) * 10 + (3 - defenders) * 15 + Math.max(0, 10 - closestDist) * 5
                });
            }
        }

        return targets.sort((a, b) => b.vulnerability - a.vulnerability);
    }

    findExpansionSpots() {
        const spots = [];

        for (let r = 0; r < BOARD_SIZE; r++) {
            for (let c = 0; c < BOARD_SIZE; c++) {
                if (this.canBuildCityAt(r, c)) {
                    const score = this.evaluateCityLocation(r, c);
                    spots.push({ row: r, col: c, score });
                }
            }
        }

        return spots.sort((a, b) => b.score - a.score).slice(0, 5);
    }

    canBuildCityAt(row, col) {
        if (this.engine.board[row][col]) return false;

        for (const piece of this.engine.pieces) {
            if (piece.type === PIECE_TYPES.CITY) {
                const dist = Math.max(Math.abs(piece.row - row), Math.abs(piece.col - col));
                if (dist < 2) return false;
            }
        }
        return true;
    }

    evaluateCityLocation(row, col) {
        let score = 0;

        // Prefer central positions
        const fromEdge = Math.min(row, col, BOARD_SIZE - 1 - row, BOARD_SIZE - 1 - col);
        score += fromEdge * 3;

        // Prefer our own territory
        if (this.engine.tileOwnership[row][col] === this.playerId) {
            score += 10;
        }

        // Avoid enemy cities
        for (const piece of this.engine.pieces) {
            if (piece.type === PIECE_TYPES.CITY && piece.ownerId !== this.playerId) {
                const dist = this.chebyshevDistance(row, col, piece.row, piece.col);
                if (dist < 4) score -= (4 - dist) * 5;
            }
        }

        return score;
    }

    findThreatenedCities(baseState) {
        const threatened = [];

        for (const city of baseState.ownPieces.cities) {
            const nearbyEnemies = [];

            for (const enemyId in baseState.enemyPieces) {
                const enemy = baseState.enemyPieces[enemyId];
                for (const warrior of enemy.warriors) {
                    const dist = this.chebyshevDistance(city.row, city.col, warrior.row, warrior.col);
                    if (dist <= 3) {
                        nearbyEnemies.push({ ...warrior, distance: dist, ownerId: parseInt(enemyId) });
                    }
                }
            }

            if (nearbyEnemies.length > 0) {
                threatened.push({
                    city,
                    enemies: nearbyEnemies,
                    threatLevel: nearbyEnemies.reduce((sum, e) => sum + (4 - e.distance), 0)
                });
            }
        }

        return threatened.sort((a, b) => b.threatLevel - a.threatLevel);
    }

    // ========================================
    // DIPLOMACY HANDLING
    // ========================================

    handleDiplomacy(boardState) {
        const actions = [];
        const player = this.engine.players[this.playerId];

        // Handle incoming peace proposals
        for (let otherId = 0; otherId < this.engine.players.length; otherId++) {
            if (otherId === this.playerId) continue;
            const otherPlayer = this.engine.players[otherId];
            if (!otherPlayer) continue;

            if (otherPlayer.relations[this.playerId] === 'peace_proposed') {
                if (this.shouldAcceptPeace(otherId, boardState)) {
                    this.engine.acceptPeace(this.playerId, otherId);
                    actions.push({ type: AI_ACTION_TYPE.ACCEPT_PEACE, target: otherId });
                    console.log(`[AI] Player ${this.playerId} accepted peace from ${otherId}`);
                }
            }
        }

        // Consider declaring war based on personality
        if (this.personality === AI_PERSONALITY.MILITARISTIC) {
            // Militaristic: declare war when army is ready
            const turnsSinceLastWar = this.engine.turnNumber - this.lastWarDeclaration;
            const armyReady = boardState.myArmy >= 3;

            if (armyReady && turnsSinceLastWar >= 5 && boardState.vulnerableCities.length > 0) {
                for (const target of boardState.vulnerableCities) {
                    if (player.relations[target.ownerId] === 'peace') {
                        // Check relative strength
                        const theirArmy = boardState.armyCounts[target.ownerId] || 0;
                        if (boardState.myArmy >= theirArmy) {
                            this.engine.declareWar(this.playerId, target.ownerId);
                            this.lastWarDeclaration = this.engine.turnNumber;
                            actions.push({ type: AI_ACTION_TYPE.DECLARE_WAR, target: target.ownerId });
                            console.log(`[AI] Player ${this.playerId} (militaristic) declared war on ${target.ownerId}`);
                            break;
                        }
                    }
                }
            }
        } else {
            // Expansionist: only declare war if threatened or to capture critical territory
            const isDirectlyThreatened = boardState.threatenedCities.length > 0;
            const hasSignificantAdvantage = boardState.myArmy >= boardState.maxEnemyArmy + 2;

            if ((isDirectlyThreatened || hasSignificantAdvantage) && boardState.vulnerableCities.length > 0) {
                for (const target of boardState.vulnerableCities) {
                    if (player.relations[target.ownerId] === 'peace' && target.vulnerability > 50) {
                        this.engine.declareWar(this.playerId, target.ownerId);
                        this.lastWarDeclaration = this.engine.turnNumber;
                        actions.push({ type: AI_ACTION_TYPE.DECLARE_WAR, target: target.ownerId });
                        console.log(`[AI] Player ${this.playerId} (expansionist) declared war on ${target.ownerId}`);
                        break;
                    }
                }
            }
        }

        // Consider proposing peace if losing badly
        for (let otherId = 0; otherId < this.engine.players.length; otherId++) {
            if (otherId === this.playerId) continue;
            if (player.relations[otherId] !== 'war') continue;

            const theirArmy = boardState.armyCounts[otherId] || 0;
            if (theirArmy > boardState.myArmy * 2 && boardState.ownPieces.cities.length <= 1) {
                this.engine.proposePeace(this.playerId, otherId);
                actions.push({ type: AI_ACTION_TYPE.PROPOSE_PEACE, target: otherId });
                console.log(`[AI] Player ${this.playerId} proposed peace to ${otherId}`);
            }
        }

        return actions;
    }

    shouldAcceptPeace(proposerId, boardState) {
        const theirArmy = boardState.armyCounts[proposerId] || 0;

        // Accept if we're weaker or equal
        if (theirArmy >= boardState.myArmy) return true;

        // Accept if multiple enemies
        let warCount = 0;
        const player = this.engine.players[this.playerId];
        for (const rel of Object.values(player.relations)) {
            if (rel === 'war') warCount++;
        }
        if (warCount > 1) return true;

        // Militaristic is less likely to accept peace
        if (this.personality === AI_PERSONALITY.MILITARISTIC) {
            return boardState.myArmy < 2;
        }

        return true;
    }

    // ========================================
    // PRODUCTION HANDLING
    // ========================================

    handleProduction(boardState) {
        const actions = [];

        for (const cityData of boardState.ownPieces.cities) {
            const city = this.engine.pieces.find(p => p.id === cityData.id);
            if (!city) continue;

            // CRITICAL: Reevaluate if no production is set (project completed or never set)
            if (!city.production) {
                const choice = this.chooseProduction(city, boardState);
                if (choice) {
                    this.engine.setProduction(city, choice);
                    actions.push({
                        type: AI_ACTION_TYPE.SET_PRODUCTION,
                        city: city,
                        production: choice
                    });
                    console.log(`[AI] Player ${this.playerId} set ${city.id} production to ${choice}`);
                }
            }
        }

        return actions;
    }

    chooseProduction(city, boardState) {
        // Priority 1: Repair if city is damaged significantly
        if (city.hp < city.maxHp * 0.5) {
            return 'REPAIR';
        }

        if (this.personality === AI_PERSONALITY.MILITARISTIC) {
            return this.chooseMilitaristicProduction(city, boardState);
        } else {
            return this.chooseExpansionistProduction(city, boardState);
        }
    }

    chooseMilitaristicProduction(city, boardState) {
        const player = this.engine.players[this.playerId];
        const atWar = Object.values(player.relations).some(r => r === 'war');

        // Militaristic priority:
        // 1. Build army until strong
        // 2. Research science for power
        // 3. Build more army
        // 4. Settler only if many cities needed for production

        // Early game: focus on getting an army
        if (boardState.myArmy < 3) {
            return 'WARRIOR';
        }

        // If at war, keep building warriors
        if (atWar) {
            return 'WARRIOR';
        }

        // If we have good army, alternate between warriors and science
        const techScore = boardState.techLevel || 0;
        if (techScore < 3 && Math.random() < 0.4) {
            return 'SCIENCE';
        }

        // Build more warriors if we have less than max enemy
        if (boardState.myArmy <= boardState.maxEnemyArmy) {
            return 'WARRIOR';
        }

        // Consider settler if we have few cities and good spots
        if (boardState.ownPieces.cities.length < 3 &&
            boardState.ownPieces.settlers.length === 0 &&
            boardState.expansionSpots.length > 0 &&
            Math.random() < 0.3) {
            return 'SETTLER';
        }

        // Default: build warriors
        return 'WARRIOR';
    }

    chooseExpansionistProduction(city, boardState) {
        const player = this.engine.players[this.playerId];
        const atWar = Object.values(player.relations).some(r => r === 'war');

        // Expansionist priority:
        // 1. Keep army comparable to enemies
        // 2. Build settlers for expansion
        // 3. Expand territory (diplomacy) but not unchecked
        // 4. Some science for balance

        // Maintain army parity with biggest threat
        if (boardState.myArmy < boardState.maxEnemyArmy) {
            return 'WARRIOR';
        }

        // At war: build warriors
        if (atWar && boardState.myArmy < boardState.maxEnemyArmy + 2) {
            return 'WARRIOR';
        }

        // Priority: settlers for new cities
        if (boardState.ownPieces.settlers.length === 0 &&
            boardState.expansionSpots.length > 0) {
            return 'SETTLER';
        }

        // Territory expansion but cap it to prevent endless diplomacy
        // Don't expand territory beyond ~25 tiles or if territory is already double enemy average
        const avgEnemyTerritory = this.getAverageEnemyTerritory(boardState);
        const maxTerritory = Math.max(25, avgEnemyTerritory * 2);

        if (boardState.myTerritory < maxTerritory && Math.random() < 0.35) {
            return 'DIPLOMACY';
        }

        // Some science for balance
        const techScore = boardState.techLevel || 0;
        if (techScore < 2 && Math.random() < 0.25) {
            return 'SCIENCE';
        }

        // Ensure standing army (at least 1 per city)
        if (boardState.myArmy < boardState.ownPieces.cities.length) {
            return 'WARRIOR';
        }

        // Default for expansionist: settler if spots available, else warrior
        if (boardState.ownPieces.settlers.length === 0 && boardState.expansionSpots.length > 0) {
            return 'SETTLER';
        }

        return 'WARRIOR';
    }

    getAverageEnemyTerritory(boardState) {
        let total = 0;
        let count = 0;

        for (const enemyId in boardState.enemyPieces) {
            const territory = boardState.territoryCounts[enemyId] || 0;
            total += territory;
            count++;
        }

        return count > 0 ? total / count : 10;
    }

    // ========================================
    // UNIT ACTIONS
    // ========================================

    executeUnitActions(boardState) {
        const actions = [];

        // Process settlers first (they can build cities)
        for (const settler of boardState.ownPieces.settlers) {
            const piece = this.engine.pieces.find(p => p.id === settler.id);
            if (!piece || piece.hasMoved) continue;

            const action = this.executeSettlerAction(piece, boardState);
            if (action) {
                const result = this.executeAction(action);
                if (result.success) actions.push(action);
            }
        }

        // Process warriors
        for (const warrior of boardState.ownPieces.warriors) {
            const piece = this.engine.pieces.find(p => p.id === warrior.id);
            if (!piece || piece.hasMoved) continue;

            const action = this.executeWarriorAction(piece, boardState);
            if (action) {
                const result = this.executeAction(action);
                if (result.success) actions.push(action);
            }
        }

        return actions;
    }

    executeSettlerAction(settler, boardState) {
        // Check if we can build city here
        const canBuild = this.engine.canSettlerBuildCity(settler);

        // If at a good spot, build
        if (canBuild.valid) {
            return { type: AI_ACTION_TYPE.BUILD_CITY, piece: settler };
        }

        // Move toward best expansion spot
        if (boardState.expansionSpots.length > 0) {
            const target = boardState.expansionSpots[0];
            return this.moveToward(settler, target.row, target.col, boardState);
        }

        // No good spots - just stay safe
        return this.moveToSafety(settler, boardState);
    }

    executeWarriorAction(warrior, boardState) {
        const player = this.engine.players[this.playerId];

        // Random chance for mistake (difficulty-based)
        if (Math.random() < this.config.mistakeChance) {
            return this.randomMove(warrior);
        }

        // Priority 1: Defend threatened cities
        if (boardState.threatenedCities.length > 0) {
            const threat = boardState.threatenedCities[0];
            const distToThreat = this.chebyshevDistance(warrior.row, warrior.col, threat.city.row, threat.city.col);

            // If close to threatened city, defend it
            if (distToThreat <= 4) {
                // Attack nearby enemy if at war
                for (const enemy of threat.enemies) {
                    if (player.relations[enemy.ownerId] === 'war') {
                        const dist = this.chebyshevDistance(warrior.row, warrior.col, enemy.row, enemy.col);
                        if (dist === 1) {
                            return {
                                type: AI_ACTION_TYPE.ATTACK,
                                piece: warrior,
                                targetRow: enemy.row,
                                targetCol: enemy.col
                            };
                        }
                    }
                }

                // Move toward threat
                if (threat.enemies.length > 0) {
                    const nearestEnemy = threat.enemies[0];
                    return this.moveToward(warrior, nearestEnemy.row, nearestEnemy.col, boardState);
                }
            }
        }

        // Priority 2: Attack enemies if at war
        const nearbyEnemy = this.findNearbyEnemy(warrior, boardState, 1);
        if (nearbyEnemy && player.relations[nearbyEnemy.ownerId] === 'war') {
            return {
                type: AI_ACTION_TYPE.ATTACK,
                piece: warrior,
                targetRow: nearbyEnemy.row,
                targetCol: nearbyEnemy.col
            };
        }

        // Personality-driven behavior
        if (this.personality === AI_PERSONALITY.MILITARISTIC) {
            return this.militaristicWarriorMove(warrior, boardState);
        } else {
            return this.expansionistWarriorMove(warrior, boardState);
        }
    }

    militaristicWarriorMove(warrior, boardState) {
        const player = this.engine.players[this.playerId];

        // If at war, move toward enemy cities
        const atWar = Object.values(player.relations).some(r => r === 'war');

        if (atWar && boardState.vulnerableCities.length > 0) {
            // Find enemy city we're at war with
            for (const target of boardState.vulnerableCities) {
                if (player.relations[target.ownerId] === 'war') {
                    return this.moveToward(warrior, target.city.row, target.city.col, boardState);
                }
            }
        }

        // Not at war: position near potential targets
        if (boardState.vulnerableCities.length > 0) {
            const potentialTarget = boardState.vulnerableCities[0];
            const dist = this.chebyshevDistance(warrior.row, warrior.col, potentialTarget.city.row, potentialTarget.city.col);

            // Move closer but don't get too close (stay 2-3 tiles away until war)
            if (dist > 3) {
                return this.moveToward(warrior, potentialTarget.city.row, potentialTarget.city.col, boardState);
            }
        }

        // Fallback: stay near own cities for defense
        return this.moveTowardOwnCity(warrior, boardState);
    }

    expansionistWarriorMove(warrior, boardState) {
        const player = this.engine.players[this.playerId];

        // If at war, defend and counterattack
        const atWar = Object.values(player.relations).some(r => r === 'war');

        if (atWar && boardState.vulnerableCities.length > 0) {
            for (const target of boardState.vulnerableCities) {
                if (player.relations[target.ownerId] === 'war') {
                    return this.moveToward(warrior, target.city.row, target.city.col, boardState);
                }
            }
        }

        // Escort settlers
        for (const settler of boardState.ownPieces.settlers) {
            const dist = this.chebyshevDistance(warrior.row, warrior.col, settler.row, settler.col);
            if (dist <= 3) {
                // Stay close to settler
                if (dist > 1) {
                    return this.moveToward(warrior, settler.row, settler.col, boardState);
                }
                // Move with settler toward expansion
                if (boardState.expansionSpots.length > 0) {
                    const target = boardState.expansionSpots[0];
                    return this.moveToward(warrior, target.row, target.col, boardState);
                }
            }
        }

        // Default: patrol own territory and stay near cities
        return this.moveTowardOwnCity(warrior, boardState);
    }

    moveTowardOwnCity(warrior, boardState) {
        if (boardState.ownPieces.cities.length === 0) {
            return this.randomMove(warrior);
        }

        // Find nearest own city
        let nearestCity = null;
        let minDist = Infinity;

        for (const city of boardState.ownPieces.cities) {
            const dist = this.chebyshevDistance(warrior.row, warrior.col, city.row, city.col);
            if (dist < minDist) {
                minDist = dist;
                nearestCity = city;
            }
        }

        // Stay within 3 tiles of city
        if (nearestCity && minDist > 3) {
            return this.moveToward(warrior, nearestCity.row, nearestCity.col, boardState);
        }

        // Already near city - patrol around
        return this.patrolMove(warrior, boardState);
    }

    patrolMove(warrior, boardState) {
        const moves = this.engine.getValidMoves(warrior);
        if (moves.length === 0) return null;

        // Filter to unoccupied squares
        const validMoves = moves.filter(m => !this.engine.board[m.row][m.col]);
        if (validMoves.length === 0) return null;

        // Prefer unclaimed or own territory
        let bestMove = null;
        let bestScore = -Infinity;

        for (const move of validMoves) {
            let score = 0;
            const owner = this.engine.tileOwnership[move.row][move.col];

            if (owner === null) score += 3;
            else if (owner === this.playerId) score += 1;
            else score -= 1;

            // Add some randomness
            score += Math.random() * 2;

            if (score > bestScore) {
                bestScore = score;
                bestMove = move;
            }
        }

        if (bestMove) {
            return {
                type: AI_ACTION_TYPE.MOVE_UNIT,
                piece: warrior,
                targetRow: bestMove.row,
                targetCol: bestMove.col
            };
        }

        return null;
    }

    // ========================================
    // MOVEMENT HELPERS
    // ========================================

    findNearbyEnemy(unit, boardState, maxDist) {
        for (const enemyId in boardState.enemyPieces) {
            const enemy = boardState.enemyPieces[enemyId];

            for (const w of enemy.warriors) {
                const dist = this.chebyshevDistance(unit.row, unit.col, w.row, w.col);
                if (dist <= maxDist) {
                    return { ...w, ownerId: parseInt(enemyId) };
                }
            }

            for (const s of enemy.settlers) {
                const dist = this.chebyshevDistance(unit.row, unit.col, s.row, s.col);
                if (dist <= maxDist) {
                    return { ...s, ownerId: parseInt(enemyId) };
                }
            }

            for (const c of enemy.cities) {
                const dist = this.chebyshevDistance(unit.row, unit.col, c.row, c.col);
                if (dist <= maxDist) {
                    return { ...c, ownerId: parseInt(enemyId) };
                }
            }
        }
        return null;
    }

    moveToward(unit, targetRow, targetCol, boardState) {
        const moves = this.engine.getValidMoves(unit);
        if (moves.length === 0) return null;

        const currentDist = this.chebyshevDistance(unit.row, unit.col, targetRow, targetCol);
        let bestMove = null;
        let bestDist = currentDist;

        for (const move of moves) {
            const occupant = this.engine.board[move.row][move.col];

            // Skip friendly units
            if (occupant && occupant.ownerId === this.playerId) continue;

            const dist = this.chebyshevDistance(move.row, move.col, targetRow, targetCol);

            // Check if this is an attack opportunity
            if (occupant && occupant.ownerId !== this.playerId) {
                const player = this.engine.players[this.playerId];
                if (player.relations[occupant.ownerId] === 'war') {
                    return {
                        type: AI_ACTION_TYPE.ATTACK,
                        piece: unit,
                        targetRow: move.row,
                        targetCol: move.col
                    };
                }
                continue; // Can't move through enemy if not at war
            }

            if (dist < bestDist) {
                bestDist = dist;
                bestMove = move;
            }
        }

        if (bestMove) {
            return {
                type: AI_ACTION_TYPE.MOVE_UNIT,
                piece: unit,
                targetRow: bestMove.row,
                targetCol: bestMove.col
            };
        }

        return null;
    }

    moveToSafety(unit, boardState) {
        const moves = this.engine.getValidMoves(unit);
        if (moves.length === 0) return null;

        let safestMove = null;
        let maxDist = 0;

        // Find move that maximizes distance from enemies
        for (const move of moves) {
            if (this.engine.board[move.row][move.col]) continue;

            let minEnemyDist = Infinity;
            for (const enemyId in boardState.enemyPieces) {
                for (const warrior of boardState.enemyPieces[enemyId].warriors) {
                    const dist = this.chebyshevDistance(move.row, move.col, warrior.row, warrior.col);
                    minEnemyDist = Math.min(minEnemyDist, dist);
                }
            }

            if (minEnemyDist > maxDist) {
                maxDist = minEnemyDist;
                safestMove = move;
            }
        }

        if (safestMove) {
            return {
                type: AI_ACTION_TYPE.MOVE_UNIT,
                piece: unit,
                targetRow: safestMove.row,
                targetCol: safestMove.col
            };
        }

        return null;
    }

    randomMove(unit) {
        const moves = this.engine.getValidMoves(unit);
        if (moves.length === 0) return null;

        const validMoves = moves.filter(m => !this.engine.board[m.row][m.col]);
        if (validMoves.length === 0) return null;

        const move = validMoves[Math.floor(Math.random() * validMoves.length)];
        return {
            type: AI_ACTION_TYPE.MOVE_UNIT,
            piece: unit,
            targetRow: move.row,
            targetCol: move.col
        };
    }

    // ========================================
    // ACTION EXECUTION
    // ========================================

    executeAction(action) {
        if (!action) return { success: false };

        switch (action.type) {
            case AI_ACTION_TYPE.MOVE_UNIT:
            case AI_ACTION_TYPE.ATTACK:
                return this.engine.movePiece(action.piece, action.targetRow, action.targetCol);

            case AI_ACTION_TYPE.BUILD_CITY:
                return this.engine.settlerBuildCity(action.piece);

            case AI_ACTION_TYPE.SET_PRODUCTION:
                return { success: this.engine.setProduction(action.city, action.production) };

            case AI_ACTION_TYPE.DECLARE_WAR:
                return { success: this.engine.declareWar(this.playerId, action.target) };

            case AI_ACTION_TYPE.PROPOSE_PEACE:
                return { success: this.engine.proposePeace(this.playerId, action.target) };

            case AI_ACTION_TYPE.ACCEPT_PEACE:
                return { success: this.engine.acceptPeace(this.playerId, action.target) };

            default:
                return { success: false };
        }
    }

    // ========================================
    // UTILITY
    // ========================================

    chebyshevDistance(r1, c1, r2, c2) {
        return Math.max(Math.abs(r1 - r2), Math.abs(c1 - c2));
    }
}

// ============================================
// AI MANAGER
// ============================================

class AIManager {
    constructor(engine) {
        this.engine = engine;
        this.controllers = {};
    }

    registerAIPlayer(playerId, difficulty = AI_DIFFICULTY.MEDIUM) {
        this.controllers[playerId] = new AIController(this.engine, playerId, difficulty);
        console.log(`[AIManager] Registered AI for player ${playerId} (${difficulty}, ${this.controllers[playerId].personality})`);
    }

    isAIPlayer(playerId) {
        return playerId in this.controllers;
    }

    getController(playerId) {
        return this.controllers[playerId] || null;
    }

    executeAITurn(playerId) {
        const controller = this.controllers[playerId];
        if (!controller) {
            console.warn(`[AIManager] No AI controller for player ${playerId}`);
            return [];
        }
        return controller.executeTurn();
    }

    notifyEvent(event) {
        // No longer need complex event handling - AI reevaluates each turn
    }

    static getAIDifficulties() {
        return [AI_DIFFICULTY.EASY, AI_DIFFICULTY.MEDIUM, AI_DIFFICULTY.HARD];
    }
}
