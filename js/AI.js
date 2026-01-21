// ============================================
// AI CONSTANTS
// ============================================

const AI_DIFFICULTY = {
    EASY: 'easy',
    MEDIUM: 'medium',
    HARD: 'hard'
};

const AI_PERSONALITY = {
    EXPANSIONIST: 'expansionist',
    MILITARISTIC: 'militaristic'
};

const AI_ACTION_TYPE = {
    MOVE_UNIT: 'move_unit',
    ATTACK: 'attack',
    BUILD_CITY: 'build_city',
    DECLARE_WAR: 'declare_war',
    PROPOSE_PEACE: 'propose_peace',
    ACCEPT_PEACE: 'accept_peace',
    SET_PRODUCTION: 'set_production'
};

const AI_GOAL_TYPE = {
    BORDER_ESTABLISHMENT: 'border_establishment',
    DEFENSE_INDUSTRY: 'defense_industry',
    DARPA: 'darpa',
    POSTURING: 'posturing',
    WAR_DEMILITARIZE: 'war_demilitarize',
    WAR_CONQUER: 'war_conquer',
    EXPANSION: 'expansion',
    ATTACK_BUILDUP: 'attack_buildup'
};

// ============================================
// AI MANAGER
// ============================================
class AIManager {
    constructor(engine) {
        this.engine = engine;
        this.aiPlayers = new Map(); // playerId -> CivChessAI
    }

    registerAIPlayer(playerId, difficulty) {
        // Randomly assign personality
        const personality = Math.random() < 0.5 ?
            AI_PERSONALITY.EXPANSIONIST : AI_PERSONALITY.MILITARISTIC;

        const ai = new CivChessAI(this.engine, playerId, personality, difficulty);
        this.aiPlayers.set(playerId, ai);

        console.log(`[AI] Registered Player ${playerId + 1} as ${personality} AI (${difficulty})`);
    }

    isAIPlayer(playerId) {
        return this.aiPlayers.has(playerId);
    }

    getAI(playerId) {
        return this.aiPlayers.get(playerId);
    }

    executeAITurn(playerId) {
        const ai = this.aiPlayers.get(playerId);
        if (!ai) {
            console.error(`[AI] No AI registered for player ${playerId}`);
            return [];
        }

        return ai.executeTurn();
    }
}

// ============================================
// CivChess AI - Individual AI Brain
// ============================================
class CivChessAI {
    constructor(engine, playerId, personality, difficulty) {
        this.engine = engine;
        this.playerId = playerId;
        this.personality = personality;
        this.difficulty = difficulty;

        // Warrior objective tracking
        this.warriorObjectives = new Map(); // pieceId -> { target, turnsTracking, initialTargetHp, initialDistance }

        // Track other players' behaviors
        this.playerProfiles = new Map(); // playerId -> { personality, threatLevel, previousWarriorCount }

        // Current strategic goals (prioritized list)
        this.activeGoals = [];

        // Track previous war declarations against us
        this.previousAggressors = new Set();

        // Track our target for militaristic posturing
        this.postureTarget = null;
    }

    // ========================================
    // MAIN TURN EXECUTION
    // ========================================
    executeTurn() {
        const actions = [];

        // Analyze the board state
        this.analyzeBoard();

        // Profile other players
        this.profilePlayers();

        // Determine strategic goals based on personality and situation
        this.determineGoals();

        // Handle diplomatic actions first
        actions.push(...this.handleDiplomacy());

        // Handle peace proposals from others
        actions.push(...this.handlePeaceProposals());

        // Set city production
        actions.push(...this.handleProduction());

        // Update warrior objectives
        this.updateWarriorObjectives();

        // Move units according to goals
        actions.push(...this.handleUnitMovement());

        // Handle settler city building
        actions.push(...this.handleSettlerActions());

        return actions;
    }

    // ========================================
    // BOARD ANALYSIS
    // ========================================
    analyzeBoard() {
        this.gameState = this.engine.getGameStateForAI(this.playerId);
        this.threatHeatmap = this.engine.getThreatHeatmap(this.playerId);
        this.opportunityHeatmap = this.engine.getOpportunityHeatmap(this.playerId);
        this.territoryHeatmap = this.engine.getTerritoryHeatmap(this.playerId);
        this.expansionHeatmap = this.engine.getExpansionHeatmap(this.playerId);
        this.strategicPositions = this.engine.getStrategicPositions(this.playerId);
        this.myStrength = this.engine.getPlayerStrength(this.playerId);
    }

    profilePlayers() {
        for (const [targetId, pieces] of Object.entries(this.gameState.enemyPieces)) {
            const targetIdNum = parseInt(targetId);
            const targetStrength = this.engine.getPlayerStrength(targetIdNum);

            let profile = this.playerProfiles.get(targetIdNum) || {
                personality: null,
                threatLevel: 0,
                previousWarriorCount: 0,
                isBuilding: false,
                hasDeclaredWar: false
            };

            // Check if they're building up forces
            const currentWarriorCount = pieces.warriors.length;
            profile.isBuilding = currentWarriorCount > profile.previousWarriorCount;
            profile.previousWarriorCount = currentWarriorCount;

            // Determine their personality based on behavior
            const hasSettlers = pieces.settlers.length > 0;
            const hasManyWarriors = currentWarriorCount > pieces.cities.length * 3;

            if (hasManyWarriors && !hasSettlers) {
                profile.personality = AI_PERSONALITY.MILITARISTIC;
            } else if (hasSettlers || pieces.cities.length > 1) {
                profile.personality = AI_PERSONALITY.EXPANSIONIST;
            }

            // Calculate threat level
            const relativeStrength = this.engine.getRelativeStrength(this.playerId, targetIdNum);
            const relation = this.gameState.relations[targetIdNum];

            profile.threatLevel = 0;
            if (relation && relation.status === 'war') {
                profile.threatLevel += 5;
                profile.hasDeclaredWar = true;
                this.previousAggressors.add(targetIdNum);
            }
            if (profile.isBuilding) {
                profile.threatLevel += 2;
            }
            if (relativeStrength && relativeStrength.ratio < 1) {
                profile.threatLevel += 3 * (1 - relativeStrength.ratio);
            }
            if (this.previousAggressors.has(targetIdNum)) {
                profile.threatLevel += 2;
            }

            // Apply human scrutiny for hard difficulty
            if (this.difficulty === AI_DIFFICULTY.HARD) {
                const player = this.engine.players[targetIdNum];
                if (player && player.isHuman) {
                    profile.threatLevel *= 1.5;
                }
            } else if (this.difficulty === AI_DIFFICULTY.MEDIUM) {
                const player = this.engine.players[targetIdNum];
                if (player && player.isHuman) {
                    profile.threatLevel *= 1.2;
                }
            }

            this.playerProfiles.set(targetIdNum, profile);
        }
    }

    // ========================================
    // GOAL DETERMINATION
    // ========================================
    determineGoals() {
        this.activeGoals = [];

        const atWar = this.isAtWar();
        const enemies = this.getEnemies();

        if (atWar) {
            // War takes priority
            if (this.personality === AI_PERSONALITY.EXPANSIONIST) {
                this.activeGoals.push({ type: AI_GOAL_TYPE.WAR_DEMILITARIZE, priority: 10 });
                this.activeGoals.push({ type: AI_GOAL_TYPE.WAR_CONQUER, priority: 8 });
                this.activeGoals.push({ type: AI_GOAL_TYPE.DARPA, priority: 7 });
            } else {
                // Militaristic - focus on conquering
                this.activeGoals.push({ type: AI_GOAL_TYPE.WAR_CONQUER, priority: 10 });
                this.activeGoals.push({ type: AI_GOAL_TYPE.WAR_DEMILITARIZE, priority: 8 });
            }
        } else {
            // Peacetime goals
            if (this.personality === AI_PERSONALITY.EXPANSIONIST) {
                this.activeGoals.push({ type: AI_GOAL_TYPE.BORDER_ESTABLISHMENT, priority: 8 });
                this.activeGoals.push({ type: AI_GOAL_TYPE.DEFENSE_INDUSTRY, priority: 7 });
                this.activeGoals.push({ type: AI_GOAL_TYPE.EXPANSION, priority: 9 });

                // Check if we need DARPA
                if (this.needsTechParity()) {
                    this.activeGoals.push({ type: AI_GOAL_TYPE.DARPA, priority: 10 });
                }

                // Check posturing
                if (this.detectEnemyBuildup()) {
                    this.activeGoals.push({ type: AI_GOAL_TYPE.POSTURING, priority: 9 });
                }
            } else {
                // Militaristic
                this.activeGoals.push({ type: AI_GOAL_TYPE.BORDER_ESTABLISHMENT, priority: 6 });
                this.activeGoals.push({ type: AI_GOAL_TYPE.ATTACK_BUILDUP, priority: 10 });

                // Select target for invasion
                this.selectInvasionTarget();

                if (this.detectEnemyBuildup()) {
                    this.activeGoals.push({ type: AI_GOAL_TYPE.POSTURING, priority: 9 });
                }
            }
        }

        // Sort by priority
        this.activeGoals.sort((a, b) => b.priority - a.priority);
    }

    isAtWar() {
        for (const [id, rel] of Object.entries(this.gameState.relations)) {
            if (rel.status === 'war') return true;
        }
        return false;
    }

    getEnemies() {
        const enemies = [];
        for (const [id, rel] of Object.entries(this.gameState.relations)) {
            if (rel.status === 'war') {
                enemies.push(parseInt(id));
            }
        }
        return enemies;
    }

    needsTechParity() {
        for (const [id, profile] of this.playerProfiles) {
            if (profile.threatLevel > 2) {
                const theirStrength = this.engine.getPlayerStrength(id);
                if (theirStrength && theirStrength.breakdown.techLevel > this.gameState.techLevel) {
                    return true;
                }
            }
        }
        return false;
    }

    detectEnemyBuildup() {
        for (const [id, profile] of this.playerProfiles) {
            if (profile.isBuilding && profile.threatLevel > 2) {
                return true;
            }
        }
        return false;
    }

    selectInvasionTarget() {
        let bestTarget = null;
        let bestScore = -Infinity;

        for (const [targetId, pieces] of Object.entries(this.gameState.enemyPieces)) {
            const targetIdNum = parseInt(targetId);
            const profile = this.playerProfiles.get(targetIdNum);
            const relStrength = this.engine.getRelativeStrength(this.playerId, targetIdNum);

            if (!relStrength) continue;

            let score = 0;

            // Prefer weaker targets
            score += relStrength.ratio * 2;

            // Prefer those building up (posturing response)
            if (profile && profile.isBuilding) {
                score += 3;
                this.postureTarget = targetIdNum;
            }

            // Prefer closer targets
            const closestCity = this.findClosestEnemyCity(targetIdNum);
            if (closestCity) {
                score += (10 - closestCity.distance) * 0.5;
            }

            if (score > bestScore) {
                bestScore = score;
                bestTarget = targetIdNum;
            }
        }

        this.invasionTarget = bestTarget;
    }

    findClosestEnemyCity(targetId) {
        const enemyPieces = this.gameState.enemyPieces[targetId];
        if (!enemyPieces || enemyPieces.cities.length === 0) return null;

        let closest = null;
        let minDist = Infinity;

        for (const city of enemyPieces.cities) {
            for (const myCity of this.gameState.ownPieces.cities) {
                const dist = Math.max(Math.abs(city.row - myCity.row), Math.abs(city.col - myCity.col));
                if (dist < minDist) {
                    minDist = dist;
                    closest = { city, distance: dist };
                }
            }
        }

        return closest;
    }

    // ========================================
    // DIPLOMACY HANDLING
    // ========================================
    handleDiplomacy() {
        const actions = [];

        if (this.isAtWar()) {
            // Handle war diplomacy
            actions.push(...this.handleWarDiplomacy());
        } else if (this.personality === AI_PERSONALITY.MILITARISTIC) {
            // Check if we should declare war
            actions.push(...this.considerDeclaringWar());
        }

        return actions;
    }

    handleWarDiplomacy() {
        const actions = [];
        const enemies = this.getEnemies();

        for (const enemyId of enemies) {
            const relStrength = this.engine.getRelativeStrength(this.playerId, enemyId);
            if (!relStrength) continue;

            if (this.personality === AI_PERSONALITY.EXPANSIONIST) {
                // Expansionist wants peace unless dominating
                if (relStrength.ratio > 2) {
                    // We're much stronger - continue war to take cities
                    const enemyPieces = this.gameState.enemyPieces[enemyId];
                    const startingCities = enemyPieces ? enemyPieces.cities.length : 0;
                    // Try to take at least 50% of their cities
                    // For now, just continue war
                } else {
                    // Propose peace
                    if (this.engine.proposePeace(this.playerId, enemyId)) {
                        actions.push({
                            type: AI_ACTION_TYPE.PROPOSE_PEACE,
                            target: enemyId
                        });
                    }
                }
            }
            // Militaristic AI doesn't propose peace (they want to conquer)
        }

        return actions;
    }

    considerDeclaringWar() {
        const actions = [];

        if (!this.invasionTarget) return actions;

        const relStrength = this.engine.getRelativeStrength(this.playerId, this.invasionTarget);
        if (!relStrength) return actions;

        // Calculate required force ratio
        const targetStrength = this.engine.getPlayerStrength(this.invasionTarget);
        const techDiff = targetStrength ? targetStrength.breakdown.techLevel - this.gameState.techLevel : 0;

        // Need 2x warriors, adjusted for tech difference
        const requiredRatio = 2 + techDiff;

        if (relStrength.militaryRatio >= requiredRatio) {
            // We're ready to attack
            if (this.engine.declareWar(this.playerId, this.invasionTarget)) {
                actions.push({
                    type: AI_ACTION_TYPE.DECLARE_WAR,
                    target: this.invasionTarget
                });
            }
        }

        return actions;
    }

    handlePeaceProposals() {
        const actions = [];

        for (const [id, rel] of Object.entries(this.gameState.relations)) {
            const targetId = parseInt(id);

            if (rel.theirStatus === 'peace_proposed') {
                const relStrength = this.engine.getRelativeStrength(this.playerId, targetId);

                if (this.personality === AI_PERSONALITY.EXPANSIONIST) {
                    // Accept peace immediately unless dominating
                    if (!relStrength || relStrength.ratio <= 2) {
                        if (this.engine.acceptPeace(this.playerId, targetId)) {
                            actions.push({
                                type: AI_ACTION_TYPE.ACCEPT_PEACE,
                                target: targetId
                            });
                        }
                    }
                } else {
                    // Militaristic - only accept if we're losing badly
                    if (relStrength && relStrength.ratio < 0.5) {
                        if (this.engine.acceptPeace(this.playerId, targetId)) {
                            actions.push({
                                type: AI_ACTION_TYPE.ACCEPT_PEACE,
                                target: targetId
                            });
                        }
                    }
                }
            }
        }

        return actions;
    }

    // ========================================
    // PRODUCTION HANDLING
    // ========================================
    handleProduction() {
        const actions = [];
        const cities = this.gameState.ownPieces.cities;
        const atWar = this.isAtWar();

        for (const city of cities) {
            // Only set production if city has none or just completed something
            const engineCity = this.engine.pieces.find(p => p.id === city.id);
            if (!engineCity) continue;

            // Check if production just completed or is null
            if (engineCity.production !== null && engineCity.productionProgress > 0) {
                continue; // Already producing something
            }

            const production = this.decideProduction(city, atWar);

            if (production && this.maybeError()) {
                // On error, pick random production
                const options = ['WARRIOR', 'DIPLOMACY', 'SCIENCE', 'SETTLER'];
                const randomProd = options[Math.floor(Math.random() * options.length)];
                if (this.engine.setProduction(engineCity, randomProd)) {
                    actions.push({
                        type: AI_ACTION_TYPE.SET_PRODUCTION,
                        city: city.id,
                        production: randomProd
                    });
                }
            } else if (production) {
                if (this.engine.setProduction(engineCity, production)) {
                    actions.push({
                        type: AI_ACTION_TYPE.SET_PRODUCTION,
                        city: city.id,
                        production: production
                    });
                }
            }
        }

        return actions;
    }

    decideProduction(city, atWar) {
        const warriors = this.gameState.ownPieces.warriors.length;
        const cities = this.gameState.ownPieces.cities.length;
        const settlers = this.gameState.ownPieces.settlers.length;

        // Check if city needs repair
        if (city.hp < city.maxHp * 0.5) {
            return 'REPAIR';
        }

        if (atWar) {
            // War production
            if (this.personality === AI_PERSONALITY.EXPANSIONIST) {
                // Keep one city on science if we have 3+ cities
                if (cities >= 3 && this.getCitiesProducing('SCIENCE').length === 0) {
                    return 'SCIENCE';
                }
                return 'WARRIOR';
            } else {
                // Militaristic - all warriors during war
                return 'WARRIOR';
            }
        }

        // Peacetime production
        if (this.personality === AI_PERSONALITY.EXPANSIONIST) {
            // Check for valid city spots
            const validCitySpots = this.findValidCitySpots();

            // Need settlers for valid spots (one settler per spot)
            if (validCitySpots.length > settlers && settlers < 2) {
                return 'SETTLER';
            }

            // Defense Industry: 4 warriors per city
            if (warriors < cities * 4) {
                return 'WARRIOR';
            }

            // DARPA goal
            if (this.hasGoal(AI_GOAL_TYPE.DARPA)) {
                return 'SCIENCE';
            }

            // Expansion through diplomacy
            return 'DIPLOMACY';
        } else {
            // Militaristic peacetime
            // Build up forces for invasion
            if (!this.invasionTarget) {
                return 'WARRIOR';
            }

            const targetStrength = this.engine.getPlayerStrength(this.invasionTarget);
            const requiredWarriors = targetStrength ?
                targetStrength.breakdown.warriors * 2 * (1 + (targetStrength.breakdown.techLevel - this.gameState.techLevel)) :
                warriors + 2;

            if (warriors < requiredWarriors) {
                return 'WARRIOR';
            }

            // If we have enough warriors, build tech to match
            if (targetStrength && targetStrength.breakdown.techLevel > this.gameState.techLevel) {
                return 'SCIENCE';
            }

            return 'WARRIOR';
        }
    }

    getCitiesProducing(productionType) {
        return this.gameState.ownPieces.cities.filter(c => {
            const engineCity = this.engine.pieces.find(p => p.id === c.id);
            return engineCity && engineCity.production === productionType;
        });
    }

    findValidCitySpots() {
        const spots = [];
        for (let r = 0; r < BOARD_SIZE; r++) {
            for (let c = 0; c < BOARD_SIZE; c++) {
                if (this.expansionHeatmap[r][c] > 0 &&
                    this.engine.tileOwnership[r][c] === this.playerId) {
                    spots.push({ row: r, col: c, value: this.expansionHeatmap[r][c] });
                }
            }
        }
        return spots.sort((a, b) => b.value - a.value);
    }

    hasGoal(goalType) {
        return this.activeGoals.some(g => g.type === goalType);
    }

    // ========================================
    // WARRIOR OBJECTIVE TRACKING
    // ========================================
    updateWarriorObjectives() {
        const warriors = this.gameState.ownPieces.warriors;

        for (const warrior of warriors) {
            let objective = this.warriorObjectives.get(warrior.id);

            if (objective) {
                objective.turnsTracking++;

                // Re-evaluate after 5 turns
                if (objective.turnsTracking >= 5) {
                    const progress = this.evaluateObjectiveProgress(warrior, objective);
                    if (!progress) {
                        // No progress, assign new objective
                        objective = null;
                    } else {
                        // Reset tracking
                        objective.turnsTracking = 0;
                        objective.initialDistance = this.getDistance(warrior, objective.target);
                        if (objective.target.hp !== undefined) {
                            objective.initialTargetHp = objective.target.hp;
                        }
                    }
                }
            }

            if (!objective) {
                // Assign new objective
                objective = this.assignWarriorObjective(warrior);
                if (objective) {
                    this.warriorObjectives.set(warrior.id, objective);
                }
            }
        }

        // Clean up objectives for dead warriors
        const warriorIds = new Set(warriors.map(w => w.id));
        for (const [id, _] of this.warriorObjectives) {
            if (!warriorIds.has(id)) {
                this.warriorObjectives.delete(id);
            }
        }
    }

    evaluateObjectiveProgress(warrior, objective) {
        const currentDist = this.getDistance(warrior, objective.target);

        // Check if we're closer
        if (currentDist < objective.initialDistance) {
            return true;
        }

        // Check if target has taken damage (for enemy targets)
        if (objective.target.hp !== undefined && objective.initialTargetHp !== undefined) {
            const currentTarget = this.findPiece(objective.target.id);
            if (currentTarget && currentTarget.hp < objective.initialTargetHp) {
                return true;
            }
        }

        return false;
    }

    assignWarriorObjective(warrior) {
        const atWar = this.isAtWar();
        const enemies = this.getEnemies();

        if (atWar) {
            if (this.personality === AI_PERSONALITY.EXPANSIONIST) {
                // Demilitarize first - target enemy warriors
                const enemyWarriors = this.getAllEnemyWarriors(enemies);
                if (enemyWarriors.length > 0) {
                    const target = this.findClosestTarget(warrior, enemyWarriors);
                    if (target) {
                        return {
                            target: target,
                            type: 'demilitarize',
                            turnsTracking: 0,
                            initialDistance: this.getDistance(warrior, target),
                            initialTargetHp: target.hp
                        };
                    }
                }

                // Then target undefended cities
                const vulnerableCities = this.strategicPositions.vulnerableCities;
                if (vulnerableCities.length > 0) {
                    const target = vulnerableCities[0];
                    return {
                        target: { row: target.row, col: target.col, id: `city_${target.row}_${target.col}` },
                        type: 'conquer',
                        turnsTracking: 0,
                        initialDistance: this.getDistance(warrior, target)
                    };
                }
            } else {
                // Militaristic - target cities directly
                for (const enemyId of enemies) {
                    const enemyPieces = this.gameState.enemyPieces[enemyId];
                    if (enemyPieces && enemyPieces.cities.length > 0) {
                        const target = this.findClosestTarget(warrior, enemyPieces.cities);
                        if (target) {
                            return {
                                target: target,
                                type: 'conquer',
                                turnsTracking: 0,
                                initialDistance: this.getDistance(warrior, target),
                                initialTargetHp: target.hp
                            };
                        }
                    }
                }
            }
        } else {
            // Peacetime objectives
            if (this.hasGoal(AI_GOAL_TYPE.BORDER_ESTABLISHMENT)) {
                const borderPos = this.findBorderPosition(warrior);
                if (borderPos) {
                    return {
                        target: borderPos,
                        type: 'border',
                        turnsTracking: 0,
                        initialDistance: this.getDistance(warrior, borderPos)
                    };
                }
            }

            if (this.hasGoal(AI_GOAL_TYPE.DEFENSE_INDUSTRY)) {
                const defensePos = this.findDefensePosition(warrior);
                if (defensePos) {
                    return {
                        target: defensePos,
                        type: 'defense',
                        turnsTracking: 0,
                        initialDistance: this.getDistance(warrior, defensePos)
                    };
                }
            }

            if (this.hasGoal(AI_GOAL_TYPE.POSTURING)) {
                const posturePos = this.findPosturePosition(warrior);
                if (posturePos) {
                    return {
                        target: posturePos,
                        type: 'posture',
                        turnsTracking: 0,
                        initialDistance: this.getDistance(warrior, posturePos)
                    };
                }
            }
        }

        return null;
    }

    getAllEnemyWarriors(enemies) {
        const warriors = [];
        for (const enemyId of enemies) {
            const enemyPieces = this.gameState.enemyPieces[enemyId];
            if (enemyPieces) {
                warriors.push(...enemyPieces.warriors);
            }
        }
        return warriors;
    }

    findClosestTarget(warrior, targets) {
        let closest = null;
        let minDist = Infinity;

        for (const target of targets) {
            const dist = this.getDistance(warrior, target);
            if (dist < minDist) {
                minDist = dist;
                closest = target;
            }
        }

        return closest;
    }

    getDistance(from, to) {
        return Math.max(Math.abs(from.row - to.row), Math.abs(from.col - to.col));
    }

    findPiece(pieceId) {
        return this.engine.pieces.find(p => p.id === pieceId);
    }

    // ========================================
    // POSITION FINDING
    // ========================================
    findBorderPosition(warrior) {
        // Find good border positions
        // Ideal: diagonal walls >= 25% of board, or surrounding enemy heat maps
        const positions = [];

        for (let r = 0; r < BOARD_SIZE; r++) {
            for (let c = 0; c < BOARD_SIZE; c++) {
                // Skip occupied tiles
                if (this.engine.board[r][c]) continue;

                // Check if this is a good border position
                const isEdge = r === 0 || r === BOARD_SIZE - 1 || c === 0 || c === BOARD_SIZE - 1;
                const controlValue = this.territoryHeatmap[r][c];

                // Good border: on our side but close to contested
                if (controlValue > -0.2 && controlValue < 0.5) {
                    // Check if it forms part of a diagonal/orthogonal wall
                    const wallScore = this.calculateWallScore(r, c);
                    positions.push({ row: r, col: c, score: wallScore });
                }
            }
        }

        if (positions.length === 0) return null;

        // Sort by score and distance
        positions.sort((a, b) => {
            const distA = this.getDistance(warrior, a);
            const distB = this.getDistance(warrior, b);
            return (b.score - distA * 0.1) - (a.score - distB * 0.1);
        });

        return positions[0];
    }

    calculateWallScore(row, col) {
        let score = 0;

        // Check for nearby friendly warriors that could form a wall
        const directions = [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [-1, 1], [1, -1], [1, 1]];

        for (const [dr, dc] of directions) {
            const nr = row + dr;
            const nc = col + dc;
            if (nr < 0 || nr >= BOARD_SIZE || nc < 0 || nc >= BOARD_SIZE) continue;

            const piece = this.engine.board[nr][nc];
            if (piece && piece.type === PIECE_TYPES.WARRIOR && piece.ownerId === this.playerId) {
                // Adjacent friendly warrior - good for wall
                if (Math.abs(dr) === 1 && Math.abs(dc) === 1) {
                    score += 3; // Diagonal - forms blockade
                } else {
                    score += 2; // Orthogonal - solid wall
                }
            }
        }

        // Bonus for positions that block enemy approaches
        const threatValue = this.threatHeatmap[row][col];
        if (threatValue > 0.3) {
            score += threatValue * 2; // Good to block high-threat approaches
        }

        return score;
    }

    findDefensePosition(warrior) {
        // Find positions that defend our cities
        // Ideal: 4 warriors per city in orthogonal positions
        const defensePositions = this.strategicPositions.defensivePositions;

        if (defensePositions.length === 0) return null;

        // Check which positions are unoccupied and not already assigned
        const availablePositions = defensePositions.filter(pos => {
            const piece = this.engine.board[pos.row][pos.col];
            return !piece;
        });

        if (availablePositions.length === 0) return null;

        // Find closest available position
        return this.findClosestTarget(warrior, availablePositions);
    }

    findPosturePosition(warrior) {
        // Find position near enemy buildup
        const builderIds = [];
        for (const [id, profile] of this.playerProfiles) {
            if (profile.isBuilding) {
                builderIds.push(id);
            }
        }

        if (builderIds.length === 0) return null;

        // Find positions facing the buildup
        const positions = [];
        for (const builderId of builderIds) {
            const enemyPieces = this.gameState.enemyPieces[builderId];
            if (!enemyPieces) continue;

            // Find center of enemy forces
            let avgRow = 0, avgCol = 0, count = 0;
            for (const w of enemyPieces.warriors) {
                avgRow += w.row;
                avgCol += w.col;
                count++;
            }
            if (count === 0) continue;

            avgRow = Math.round(avgRow / count);
            avgCol = Math.round(avgCol / count);

            // Find positions between us and them
            for (const city of this.gameState.ownPieces.cities) {
                const midRow = Math.round((city.row + avgRow) / 2);
                const midCol = Math.round((city.col + avgCol) / 2);

                // Find empty tiles near midpoint
                for (let dr = -2; dr <= 2; dr++) {
                    for (let dc = -2; dc <= 2; dc++) {
                        const r = midRow + dr;
                        const c = midCol + dc;
                        if (r < 0 || r >= BOARD_SIZE || c < 0 || c >= BOARD_SIZE) continue;
                        if (this.engine.board[r][c]) continue;

                        positions.push({ row: r, col: c });
                    }
                }
            }
        }

        if (positions.length === 0) return null;

        return this.findClosestTarget(warrior, positions);
    }

    // ========================================
    // UNIT MOVEMENT
    // ========================================
    handleUnitMovement() {
        const actions = [];
        const warriors = this.gameState.ownPieces.warriors;

        for (const warrior of warriors) {
            const engineWarrior = this.engine.pieces.find(p => p.id === warrior.id);
            if (!engineWarrior || engineWarrior.hasMoved) continue;

            const moveAction = this.moveWarrior(engineWarrior);
            if (moveAction) {
                actions.push(moveAction);
            }
        }

        return actions;
    }

    moveWarrior(warrior) {
        // Check for adjacent enemies (1/3 chance to attack regardless of objective)
        const adjacentEnemies = this.getAdjacentEnemies(warrior);
        if (adjacentEnemies.length > 0 && Math.random() < 1/3) {
            const target = adjacentEnemies[Math.floor(Math.random() * adjacentEnemies.length)];
            return this.attackTarget(warrior, target);
        }

        // Check for diagonal blockade - treat as enemy in the way
        const blockingEnemies = this.getBlockingEnemies(warrior);
        if (blockingEnemies.length > 0) {
            const target = blockingEnemies[0];
            return this.attackTarget(warrior, target);
        }

        // Get objective
        const objective = this.warriorObjectives.get(warrior.id);
        if (!objective) {
            // No objective - move randomly or stay
            if (this.maybeError()) {
                return this.moveRandomly(warrior);
            }
            return null;
        }

        // Apply difficulty-based errors
        if (this.maybeError()) {
            return this.moveRandomly(warrior);
        }

        // Move toward objective
        return this.moveTowardTarget(warrior, objective.target);
    }

    getAdjacentEnemies(warrior) {
        const enemies = [];
        const atWarWith = this.getEnemies();

        for (let dr = -1; dr <= 1; dr++) {
            for (let dc = -1; dc <= 1; dc++) {
                if (dr === 0 && dc === 0) continue;

                const r = warrior.row + dr;
                const c = warrior.col + dc;
                if (r < 0 || r >= BOARD_SIZE || c < 0 || c >= BOARD_SIZE) continue;

                const piece = this.engine.board[r][c];
                if (piece && piece.ownerId !== this.playerId && atWarWith.includes(piece.ownerId)) {
                    enemies.push(piece);
                }
            }
        }

        return enemies;
    }

    getBlockingEnemies(warrior) {
        // Check if there are enemies forming a diagonal blockade
        const objective = this.warriorObjectives.get(warrior.id);
        if (!objective) return [];

        const target = objective.target;
        const rowDir = Math.sign(target.row - warrior.row);
        const colDir = Math.sign(target.col - warrior.col);

        // If moving diagonally and blocked
        if (rowDir !== 0 && colDir !== 0) {
            const pos1 = this.engine.board[warrior.row][warrior.col + colDir];
            const pos2 = this.engine.board[warrior.row + rowDir][warrior.col];

            const blockers = [];
            if (pos1 && pos1.type === PIECE_TYPES.WARRIOR && pos1.ownerId !== this.playerId) {
                blockers.push(pos1);
            }
            if (pos2 && pos2.type === PIECE_TYPES.WARRIOR && pos2.ownerId !== this.playerId) {
                blockers.push(pos2);
            }

            // Check if both form a blockade (same owner, diagonal)
            if (blockers.length === 2 && blockers[0].ownerId === blockers[1].ownerId) {
                return blockers;
            }
        }

        return [];
    }

    attackTarget(warrior, target) {
        const result = this.engine.movePiece(warrior, target.row, target.col);
        if (result.success) {
            return {
                type: result.combat ? AI_ACTION_TYPE.ATTACK : AI_ACTION_TYPE.MOVE_UNIT,
                pieceId: warrior.id,
                from: { row: warrior.row, col: warrior.col },
                to: { row: target.row, col: target.col },
                combat: result.combat
            };
        }
        return null;
    }

    moveTowardTarget(warrior, target) {
        const validMoves = this.engine.getValidMoves(warrior);
        if (validMoves.length === 0) return null;

        // Find best move toward target
        let bestMove = null;
        let bestDist = Infinity;

        for (const move of validMoves) {
            const dist = this.getDistance(move, target);
            const movePiece = this.engine.board[move.row][move.col];

            // Prioritize attacking enemies
            if (movePiece && movePiece.ownerId !== this.playerId) {
                const isEnemy = this.getEnemies().includes(movePiece.ownerId);
                if (isEnemy) {
                    bestMove = move;
                    bestDist = -1; // Highest priority
                    continue;
                }
            }

            if (dist < bestDist) {
                bestDist = dist;
                bestMove = move;
            }
        }

        if (!bestMove) return null;

        const result = this.engine.movePiece(warrior, bestMove.row, bestMove.col);
        if (result.success) {
            return {
                type: result.combat ? AI_ACTION_TYPE.ATTACK : AI_ACTION_TYPE.MOVE_UNIT,
                pieceId: warrior.id,
                from: { row: warrior.row, col: warrior.col },
                to: bestMove,
                combat: result.combat
            };
        }

        return null;
    }

    moveRandomly(warrior) {
        const validMoves = this.engine.getValidMoves(warrior);
        if (validMoves.length === 0) return null;

        const randomMove = validMoves[Math.floor(Math.random() * validMoves.length)];
        const result = this.engine.movePiece(warrior, randomMove.row, randomMove.col);

        if (result.success) {
            return {
                type: result.combat ? AI_ACTION_TYPE.ATTACK : AI_ACTION_TYPE.MOVE_UNIT,
                pieceId: warrior.id,
                from: { row: warrior.row, col: warrior.col },
                to: randomMove,
                combat: result.combat
            };
        }

        return null;
    }

    // ========================================
    // SETTLER ACTIONS
    // ========================================
    handleSettlerActions() {
        const actions = [];
        const settlers = this.gameState.ownPieces.settlers;

        for (const settler of settlers) {
            const engineSettler = this.engine.pieces.find(p => p.id === settler.id);
            if (!engineSettler || engineSettler.hasMoved) continue;

            // Check if we can build a city here
            const canBuild = this.engine.canSettlerBuildCity(engineSettler);
            if (canBuild.valid) {
                const buildResult = this.engine.settlerBuildCity(engineSettler);
                if (buildResult.success) {
                    actions.push({
                        type: AI_ACTION_TYPE.BUILD_CITY,
                        settlerId: settler.id,
                        location: { row: settler.row, col: settler.col }
                    });
                    continue;
                }
            }

            // Move toward best city location
            const moveAction = this.moveSettler(engineSettler);
            if (moveAction) {
                actions.push(moveAction);
            }
        }

        return actions;
    }

    moveSettler(settler) {
        // Find best city spot
        const validSpots = this.findValidCitySpots();
        if (validSpots.length === 0) {
            // No valid spots on owned territory - find unowned territory to expand to
            return this.moveSettlerToExpand(settler);
        }

        // Find closest valid spot
        let bestSpot = null;
        let minDist = Infinity;

        for (const spot of validSpots) {
            const dist = this.getDistance(settler, spot);
            if (dist < minDist) {
                minDist = dist;
                bestSpot = spot;
            }
        }

        if (!bestSpot) return null;

        // Move toward the spot
        const validMoves = this.engine.getValidMoves(settler);
        if (validMoves.length === 0) return null;

        let bestMove = null;
        let bestMoveDist = Infinity;

        for (const move of validMoves) {
            const dist = this.getDistance(move, bestSpot);
            if (dist < bestMoveDist) {
                bestMoveDist = dist;
                bestMove = move;
            }
        }

        if (!bestMove || bestMoveDist >= minDist) return null;

        const result = this.engine.movePiece(settler, bestMove.row, bestMove.col);
        if (result.success) {
            return {
                type: AI_ACTION_TYPE.MOVE_UNIT,
                pieceId: settler.id,
                from: { row: settler.row, col: settler.col },
                to: bestMove
            };
        }

        return null;
    }

    moveSettlerToExpand(settler) {
        // Move toward territory we could build a city on once we expand
        const potentialSpots = [];

        for (let r = 0; r < BOARD_SIZE; r++) {
            for (let c = 0; c < BOARD_SIZE; c++) {
                if (this.expansionHeatmap[r][c] > 0 &&
                    this.engine.tileOwnership[r][c] === null) {
                    potentialSpots.push({ row: r, col: c, value: this.expansionHeatmap[r][c] });
                }
            }
        }

        if (potentialSpots.length === 0) return null;

        // Sort by value and pick best
        potentialSpots.sort((a, b) => b.value - a.value);
        const target = potentialSpots[0];

        const validMoves = this.engine.getValidMoves(settler);
        if (validMoves.length === 0) return null;

        let bestMove = null;
        let bestDist = Infinity;

        for (const move of validMoves) {
            const dist = this.getDistance(move, target);
            if (dist < bestDist) {
                bestDist = dist;
                bestMove = move;
            }
        }

        if (!bestMove) return null;

        const result = this.engine.movePiece(settler, bestMove.row, bestMove.col);
        if (result.success) {
            return {
                type: AI_ACTION_TYPE.MOVE_UNIT,
                pieceId: settler.id,
                from: { row: settler.row, col: settler.col },
                to: bestMove
            };
        }

        return null;
    }

    // ========================================
    // DIFFICULTY ERROR SYSTEM
    // ========================================
    maybeError() {
        switch (this.difficulty) {
            case AI_DIFFICULTY.EASY:
                // Frequent errors - 30% chance
                return Math.random() < 0.30;
            case AI_DIFFICULTY.MEDIUM:
                // Occasional errors - 10% chance
                return Math.random() < 0.10;
            case AI_DIFFICULTY.HARD:
                // No errors
                return false;
            default:
                return false;
        }
    }
}
