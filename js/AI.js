// ============================================
// AI SYSTEM - Goal-Based Architecture
// ============================================
// The AI uses a goal-based approach where:
// 1. Goals are explicit objectives (found city, capture city, defend, etc.)
// 2. Units are assigned to goals and move together toward objectives
// 3. Production aligns with current goals (need warriors? build them!)
// 4. Strategy determines which goals to prioritize
// ============================================

// ============================================
// CONSTANTS
// ============================================

const AI_DIFFICULTY = {
    EASY: 'easy',
    MEDIUM: 'medium',
    HARD: 'hard',
    EXPERIMENTAL: 'experimental'
};

const AI_STRATEGY = {
    EXPANSION: 'expansion',
    RESEARCH: 'research',
    MILITARIZATION: 'militarization',
    DEFENSIVE: 'defensive'
};

/**
 * AI Goals - Explicit objectives the AI pursues
 */
const AI_GOAL = {
    // Expansion goals
    FOUND_CITY: 'found_city',           // Send settler to location and build city
    EXPAND_TERRITORY: 'expand_territory', // Use diplomacy to grow borders

    // Military goals
    CAPTURE_CITY: 'capture_city',       // Attack and capture enemy city
    DESTROY_UNIT: 'destroy_unit',       // Hunt down specific enemy unit
    BUILD_ARMY: 'build_army',           // Accumulate warriors before attacking

    // Defensive goals
    DEFEND_CITY: 'defend_city',         // Protect city from nearby threats
    ESCORT_SETTLER: 'escort_settler',   // Protect settler on journey

    // Economic goals
    TECH_UP: 'tech_up',                 // Increase tech level
    REPAIR_CITY: 'repair_city'          // Heal damaged city
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
        impairmentLevel: 0.4,
        maxLookahead: 1,
        threatAwareness: 0.5,
        goalPersistence: 0.6,       // How likely to stick with goals
        armySizeForAttack: 2,       // Warriors needed before attacking
        peaceThreshold: 0.3,
        warThreshold: 0.7,
        territoryBeforeWar: 8       // Territory tiles before considering war
    },
    [AI_DIFFICULTY.MEDIUM]: {
        impairmentLevel: 0.15,
        maxLookahead: 2,
        threatAwareness: 0.8,
        goalPersistence: 0.75,
        armySizeForAttack: 3,
        peaceThreshold: 0.5,
        warThreshold: 0.5,
        territoryBeforeWar: 12
    },
    [AI_DIFFICULTY.HARD]: {
        impairmentLevel: 0.0,
        maxLookahead: 3,
        threatAwareness: 1.0,
        goalPersistence: 0.9,
        armySizeForAttack: 4,
        peaceThreshold: 0.6,
        warThreshold: 0.35,
        territoryBeforeWar: 15
    },
    [AI_DIFFICULTY.EXPERIMENTAL]: {
        impairmentLevel: 0.0,
        maxLookahead: 4,
        threatAwareness: 1.0,
        goalPersistence: 0.85,
        armySizeForAttack: 3,
        peaceThreshold: 0.5,
        warThreshold: 0.4,
        territoryBeforeWar: 12
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

        // Strategic state
        this.currentStrategy = AI_STRATEGY.EXPANSION;
        this.strategyTurnsRemaining = 0;

        // Goal management
        this.activeGoals = [];          // List of {type, priority, target, assignedUnits, progress}
        this.unitAssignments = {};      // pieceId -> goalIndex

        // Memory
        this.eventMemory = [];
        this.pendingPeaceProposals = [];
        this.turnsAtWar = {};           // playerId -> turns at war
        this.lastArmySize = 0;
    }

    // ========================================
    // MAIN TURN EXECUTION
    // ========================================

    executeTurn() {
        const actionsTaken = [];
        console.log(`[AI] Player ${this.playerId} turn (${this.difficulty}) - Strategy: ${this.currentStrategy}`);

        // 1. Analyze game state
        const gameState = this.analyzeGameState();

        // 2. Update strategy based on game phase and situation
        this.updateStrategy(gameState);

        // 3. Handle diplomacy (peace proposals, war declarations)
        const diplomacyActions = this.handleDiplomacy(gameState);
        actionsTaken.push(...diplomacyActions);

        // 4. Update and prioritize goals
        this.updateGoals(gameState);

        // 5. Assign units to goals
        this.assignUnitsToGoals(gameState);

        // 6. Set city productions based on goals
        const productionActions = this.handleProduction(gameState);
        actionsTaken.push(...productionActions);

        // 7. Execute unit actions toward their assigned goals
        const unitActions = this.executeGoalActions(gameState);
        actionsTaken.push(...unitActions);

        console.log(`[AI] Player ${this.playerId} completed ${actionsTaken.length} actions`);
        return actionsTaken;
    }

    // ========================================
    // GAME STATE ANALYSIS
    // ========================================

    analyzeGameState() {
        const baseState = this.engine.getGameStateForAI(this.playerId);

        // Get heatmaps
        let threatHeatmap, opportunityHeatmap, territoryHeatmap, expansionHeatmap;
        try {
            threatHeatmap = this.engine.getThreatHeatmap(this.playerId);
            opportunityHeatmap = this.engine.getOpportunityHeatmap(this.playerId);
            territoryHeatmap = this.engine.getTerritoryHeatmap(this.playerId);
            expansionHeatmap = this.engine.getExpansionHeatmap(this.playerId);
        } catch (e) {
            // Fallback if heatmaps not available
            threatHeatmap = this.createEmptyHeatmap();
            opportunityHeatmap = this.createEmptyHeatmap();
            territoryHeatmap = this.createEmptyHeatmap();
            expansionHeatmap = this.createEmptyHeatmap();
        }

        // Find best expansion locations
        const expansionSpots = this.findExpansionSpots(expansionHeatmap);

        // Analyze threats to our cities
        const cityThreats = this.analyzeCityThreats(baseState, threatHeatmap);

        // Find vulnerable enemy cities
        const vulnerableEnemies = this.findVulnerableEnemies(baseState);

        // Calculate army strength
        const armyStrength = this.calculateArmyStrength(baseState);

        // Relative power against each enemy
        const relativePower = {};
        this.engine.players.forEach((player, i) => {
            if (i !== this.playerId && this.engine.getPlayerCities(i).length > 0) {
                relativePower[i] = this.engine.getRelativeStrength(this.playerId, i);
            }
        });

        return {
            ...baseState,
            threatHeatmap,
            opportunityHeatmap,
            territoryHeatmap,
            expansionHeatmap,
            expansionSpots,
            cityThreats,
            vulnerableEnemies,
            armyStrength,
            relativePower
        };
    }

    createEmptyHeatmap() {
        const heatmap = [];
        for (let r = 0; r < BOARD_SIZE; r++) {
            heatmap[r] = [];
            for (let c = 0; c < BOARD_SIZE; c++) {
                heatmap[r][c] = 0;
            }
        }
        return heatmap;
    }

    findExpansionSpots(expansionHeatmap) {
        const spots = [];
        for (let r = 0; r < BOARD_SIZE; r++) {
            for (let c = 0; c < BOARD_SIZE; c++) {
                // Check if this is a valid city location
                const canBuild = this.canBuildCityAt(r, c);
                if (canBuild) {
                    spots.push({
                        row: r,
                        col: c,
                        value: expansionHeatmap[r][c] + this.evaluateCityLocation(r, c)
                    });
                }
            }
        }
        spots.sort((a, b) => b.value - a.value);
        return spots.slice(0, 5);
    }

    canBuildCityAt(row, col) {
        // Check if position is valid for a new city
        if (this.engine.board[row][col]) return false; // Occupied

        // Must be 2+ tiles from other cities
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

        // Prefer positions with more adjacent tiles (not edges)
        const fromEdge = Math.min(row, col, BOARD_SIZE - 1 - row, BOARD_SIZE - 1 - col);
        score += fromEdge * 2;

        // Prefer tiles we already own
        if (this.engine.tileOwnership[row][col] === this.playerId) {
            score += 5;
        }

        // Bonus for distance from enemy cities (safer)
        let minEnemyDist = BOARD_SIZE;
        for (const piece of this.engine.pieces) {
            if (piece.type === PIECE_TYPES.CITY && piece.ownerId !== this.playerId) {
                const dist = AIUtils.chebyshevDistance(row, col, piece.row, piece.col);
                minEnemyDist = Math.min(minEnemyDist, dist);
            }
        }
        score += Math.min(minEnemyDist, 5);

        return score;
    }

    analyzeCityThreats(gameState, threatHeatmap) {
        const threats = [];
        for (const city of gameState.ownPieces.cities) {
            const threat = {
                city: city,
                level: threatHeatmap[city.row][city.col],
                nearbyEnemies: []
            };

            // Find enemy units within 3 tiles
            for (const enemyId in gameState.enemyPieces) {
                const enemy = gameState.enemyPieces[enemyId];
                for (const warrior of enemy.warriors) {
                    const dist = AIUtils.chebyshevDistance(city.row, city.col, warrior.row, warrior.col);
                    if (dist <= 3) {
                        threat.nearbyEnemies.push({ ...warrior, distance: dist, ownerId: parseInt(enemyId) });
                    }
                }
            }

            threat.level = Math.max(threat.level, threat.nearbyEnemies.length * 0.3);
            threats.push(threat);
        }
        return threats.sort((a, b) => b.level - a.level);
    }

    findVulnerableEnemies(gameState) {
        const targets = [];
        const player = this.engine.players[this.playerId];

        for (const enemyId in gameState.enemyPieces) {
            const enemy = gameState.enemyPieces[enemyId];
            const atWar = player.relations[enemyId] === 'war';

            for (const city of enemy.cities) {
                // Calculate vulnerability
                let vulnerability = 0;

                // Low HP = vulnerable
                vulnerability += (1 - city.hp / city.maxHp) * 50;

                // Few defenders = vulnerable
                const defenders = enemy.warriors.filter(w =>
                    AIUtils.chebyshevDistance(w.row, w.col, city.row, city.col) <= 2
                ).length;
                vulnerability += Math.max(0, 30 - defenders * 15);

                // Distance from our units
                let closestWarrior = BOARD_SIZE;
                for (const warrior of gameState.ownPieces.warriors) {
                    const dist = AIUtils.chebyshevDistance(warrior.row, warrior.col, city.row, city.col);
                    closestWarrior = Math.min(closestWarrior, dist);
                }
                vulnerability += Math.max(0, 20 - closestWarrior * 3);

                targets.push({
                    city: city,
                    ownerId: parseInt(enemyId),
                    vulnerability: vulnerability,
                    atWar: atWar,
                    defenders: defenders,
                    distance: closestWarrior
                });
            }
        }

        return targets.sort((a, b) => b.vulnerability - a.vulnerability);
    }

    calculateArmyStrength(gameState) {
        return {
            warriors: gameState.ownPieces.warriors.length,
            totalHP: gameState.ownPieces.warriors.reduce((sum, w) => sum + w.hp, 0),
            settlers: gameState.ownPieces.settlers.length
        };
    }

    // ========================================
    // STRATEGY SELECTION
    // ========================================

    updateStrategy(gameState) {
        if (this.strategyTurnsRemaining > 0 && Math.random() < this.config.goalPersistence) {
            this.strategyTurnsRemaining--;
            return this.currentStrategy;
        }

        const scores = {
            [AI_STRATEGY.EXPANSION]: 0,
            [AI_STRATEGY.RESEARCH]: 0,
            [AI_STRATEGY.MILITARIZATION]: 0,
            [AI_STRATEGY.DEFENSIVE]: 0
        };

        // === EXPANSION triggers ===
        // Few cities -> expand
        if (gameState.ownPieces.cities.length < 2) {
            scores[AI_STRATEGY.EXPANSION] += 50;
        }
        // Good expansion spots available
        if (gameState.expansionSpots.length > 0) {
            scores[AI_STRATEGY.EXPANSION] += 25;
        }
        // Have settler ready
        if (gameState.ownPieces.settlers.length > 0) {
            scores[AI_STRATEGY.EXPANSION] += 30;
        }
        // Early game
        if (gameState.gamePhase === 'early') {
            scores[AI_STRATEGY.EXPANSION] += 20;
        }

        // === MILITARIZATION triggers ===
        // Have army ready
        if (gameState.armyStrength.warriors >= this.config.armySizeForAttack) {
            scores[AI_STRATEGY.MILITARIZATION] += 35;
        }
        // Vulnerable enemy exists
        if (gameState.vulnerableEnemies.length > 0 && gameState.vulnerableEnemies[0].vulnerability > 40) {
            scores[AI_STRATEGY.MILITARIZATION] += 30;
        }
        // We're stronger than enemies
        let dominated = 0;
        for (const enemyId in gameState.relativePower) {
            if (gameState.relativePower[enemyId].advantage === 'strong') dominated++;
        }
        if (dominated > 0) {
            scores[AI_STRATEGY.MILITARIZATION] += dominated * 20;
        }
        // Mid/late game
        if (gameState.gamePhase === 'mid' || gameState.gamePhase === 'late') {
            scores[AI_STRATEGY.MILITARIZATION] += 15;
        }
        // Already at war
        const player = this.engine.players[this.playerId];
        const atWar = Object.values(player.relations).some(r => r === 'war');
        if (atWar) {
            scores[AI_STRATEGY.MILITARIZATION] += 25;
        }

        // === DEFENSIVE triggers ===
        // Cities under threat
        const highThreats = gameState.cityThreats.filter(t => t.level > 0.3).length;
        if (highThreats > 0) {
            scores[AI_STRATEGY.DEFENSIVE] += highThreats * 30;
        }
        // We're weaker than enemies
        let dominated_by = 0;
        for (const enemyId in gameState.relativePower) {
            if (gameState.relativePower[enemyId].advantage === 'weak') dominated_by++;
        }
        if (dominated_by > 0) {
            scores[AI_STRATEGY.DEFENSIVE] += dominated_by * 25;
        }

        // === RESEARCH triggers ===
        // Low tech
        if (gameState.techLevel < 2) {
            scores[AI_STRATEGY.RESEARCH] += 20;
        }
        // Behind in tech
        for (const enemyId in gameState.enemyPieces) {
            const enemy = this.engine.players[enemyId];
            if (enemy && enemy.techScore > gameState.techLevel) {
                scores[AI_STRATEGY.RESEARCH] += 15;
            }
        }
        // Safe position (no threats, good army)
        if (highThreats === 0 && gameState.armyStrength.warriors >= 2) {
            scores[AI_STRATEGY.RESEARCH] += 15;
        }

        // Find best strategy
        let best = AI_STRATEGY.EXPANSION;
        let bestScore = scores[best];
        for (const strategy in scores) {
            // Add some randomness based on impairment
            const noise = (Math.random() - 0.5) * this.config.impairmentLevel * 30;
            const adjustedScore = scores[strategy] + noise;
            if (adjustedScore > bestScore) {
                bestScore = adjustedScore;
                best = strategy;
            }
        }

        if (best !== this.currentStrategy) {
            console.log(`[AI] Player ${this.playerId} switching strategy: ${this.currentStrategy} -> ${best}`);
        }

        this.currentStrategy = best;
        this.strategyTurnsRemaining = 3 + Math.floor(Math.random() * 3);
        return best;
    }

    // ========================================
    // GOAL MANAGEMENT
    // ========================================

    updateGoals(gameState) {
        // Remove completed or invalid goals
        this.activeGoals = this.activeGoals.filter(goal => this.isGoalValid(goal, gameState));

        // Generate new goals based on strategy
        const newGoals = this.generateGoals(gameState);

        // Merge with existing goals (don't duplicate)
        for (const newGoal of newGoals) {
            const exists = this.activeGoals.some(g =>
                g.type === newGoal.type &&
                g.target?.row === newGoal.target?.row &&
                g.target?.col === newGoal.target?.col
            );
            if (!exists) {
                this.activeGoals.push(newGoal);
            }
        }

        // Sort by priority
        this.activeGoals.sort((a, b) => b.priority - a.priority);

        // Limit active goals
        this.activeGoals = this.activeGoals.slice(0, 5);

        console.log(`[AI] Player ${this.playerId} goals:`, this.activeGoals.map(g => `${g.type}(${g.priority})`).join(', '));
    }

    isGoalValid(goal, gameState) {
        switch (goal.type) {
            case AI_GOAL.FOUND_CITY:
                // Check if target location is still valid
                return this.canBuildCityAt(goal.target.row, goal.target.col) &&
                       gameState.ownPieces.settlers.length > 0;

            case AI_GOAL.CAPTURE_CITY:
                // Check if target city still exists and is enemy
                const targetCity = this.engine.board[goal.target.row][goal.target.col];
                return targetCity &&
                       targetCity.type === PIECE_TYPES.CITY &&
                       targetCity.ownerId !== this.playerId;

            case AI_GOAL.DEFEND_CITY:
                // Check if city still exists and is threatened
                const myCity = this.engine.board[goal.target.row][goal.target.col];
                return myCity &&
                       myCity.type === PIECE_TYPES.CITY &&
                       myCity.ownerId === this.playerId;

            case AI_GOAL.BUILD_ARMY:
                // Valid if we don't have enough warriors yet
                return gameState.armyStrength.warriors < this.config.armySizeForAttack;

            case AI_GOAL.EXPAND_TERRITORY:
            case AI_GOAL.TECH_UP:
                return true; // Always valid

            default:
                return true;
        }
    }

    generateGoals(gameState) {
        const goals = [];
        const player = this.engine.players[this.playerId];

        // === DEFENSIVE GOALS (highest priority when needed) ===
        for (const threat of gameState.cityThreats) {
            if (threat.level > 0.2 || threat.nearbyEnemies.length > 0) {
                goals.push({
                    type: AI_GOAL.DEFEND_CITY,
                    priority: 80 + threat.level * 20,
                    target: { row: threat.city.row, col: threat.city.col, id: threat.city.id },
                    threats: threat.nearbyEnemies
                });
            }
        }

        // === EXPANSION GOALS ===
        if (this.currentStrategy === AI_STRATEGY.EXPANSION || gameState.ownPieces.cities.length < 2) {
            // Found new city
            if (gameState.expansionSpots.length > 0 && gameState.ownPieces.settlers.length > 0) {
                const spot = gameState.expansionSpots[0];
                goals.push({
                    type: AI_GOAL.FOUND_CITY,
                    priority: this.currentStrategy === AI_STRATEGY.EXPANSION ? 70 : 50,
                    target: { row: spot.row, col: spot.col }
                });
            }

            // Expand territory via diplomacy
            if (gameState.territory.owned < this.config.territoryBeforeWar) {
                goals.push({
                    type: AI_GOAL.EXPAND_TERRITORY,
                    priority: 40
                });
            }
        }

        // === MILITARY GOALS ===
        if (this.currentStrategy === AI_STRATEGY.MILITARIZATION ||
            gameState.armyStrength.warriors >= this.config.armySizeForAttack) {

            // Build army first if needed
            if (gameState.armyStrength.warriors < this.config.armySizeForAttack) {
                goals.push({
                    type: AI_GOAL.BUILD_ARMY,
                    priority: 60,
                    needed: this.config.armySizeForAttack - gameState.armyStrength.warriors
                });
            }

            // Attack vulnerable city
            for (const target of gameState.vulnerableEnemies.slice(0, 2)) {
                const isAtWar = player.relations[target.ownerId] === 'war';

                // Only target if at war OR ready to declare war
                if (isAtWar || (gameState.armyStrength.warriors >= this.config.armySizeForAttack)) {
                    goals.push({
                        type: AI_GOAL.CAPTURE_CITY,
                        priority: isAtWar ? 75 : 55,
                        target: { row: target.city.row, col: target.city.col, ownerId: target.ownerId },
                        vulnerability: target.vulnerability
                    });
                }
            }
        }

        // === RESEARCH GOALS ===
        if (this.currentStrategy === AI_STRATEGY.RESEARCH) {
            goals.push({
                type: AI_GOAL.TECH_UP,
                priority: 50
            });
        }

        // === REPAIR GOALS ===
        for (const city of gameState.ownPieces.cities) {
            if (city.hp < city.maxHp * 0.5) {
                goals.push({
                    type: AI_GOAL.REPAIR_CITY,
                    priority: 45,
                    target: { row: city.row, col: city.col, id: city.id }
                });
            }
        }

        return goals;
    }

    // ========================================
    // UNIT ASSIGNMENT
    // ========================================

    assignUnitsToGoals(gameState) {
        this.unitAssignments = {};

        const availableWarriors = [...gameState.ownPieces.warriors];
        const availableSettlers = [...gameState.ownPieces.settlers];

        for (const goal of this.activeGoals) {
            switch (goal.type) {
                case AI_GOAL.DEFEND_CITY:
                    // Assign nearest warriors to defense
                    const defendersNeeded = Math.max(1, goal.threats?.length || 1);
                    const nearestDefenders = this.findNearestUnits(
                        availableWarriors,
                        goal.target.row,
                        goal.target.col,
                        defendersNeeded
                    );
                    for (const warrior of nearestDefenders) {
                        this.unitAssignments[warrior.id] = goal;
                        const idx = availableWarriors.findIndex(w => w.id === warrior.id);
                        if (idx >= 0) availableWarriors.splice(idx, 1);
                    }
                    break;

                case AI_GOAL.FOUND_CITY:
                    // Assign nearest settler
                    if (availableSettlers.length > 0) {
                        const nearest = this.findNearestUnits(
                            availableSettlers,
                            goal.target.row,
                            goal.target.col,
                            1
                        );
                        if (nearest.length > 0) {
                            this.unitAssignments[nearest[0].id] = goal;
                            const idx = availableSettlers.findIndex(s => s.id === nearest[0].id);
                            if (idx >= 0) availableSettlers.splice(idx, 1);
                        }
                    }
                    break;

                case AI_GOAL.CAPTURE_CITY:
                    // Assign multiple warriors to attack together
                    const attackers = this.findNearestUnits(
                        availableWarriors,
                        goal.target.row,
                        goal.target.col,
                        Math.min(this.config.armySizeForAttack, availableWarriors.length)
                    );
                    for (const warrior of attackers) {
                        this.unitAssignments[warrior.id] = goal;
                        const idx = availableWarriors.findIndex(w => w.id === warrior.id);
                        if (idx >= 0) availableWarriors.splice(idx, 1);
                    }
                    break;
            }
        }

        // Remaining warriors: default behavior based on strategy
        for (const warrior of availableWarriors) {
            if (this.currentStrategy === AI_STRATEGY.DEFENSIVE) {
                // Move toward nearest own city
                const nearestCity = this.findNearestCity(warrior, gameState.ownPieces.cities);
                if (nearestCity) {
                    this.unitAssignments[warrior.id] = {
                        type: AI_GOAL.DEFEND_CITY,
                        priority: 30,
                        target: nearestCity
                    };
                }
            } else if (this.currentStrategy === AI_STRATEGY.MILITARIZATION) {
                // Move toward enemy territory
                if (gameState.vulnerableEnemies.length > 0) {
                    const target = gameState.vulnerableEnemies[0];
                    this.unitAssignments[warrior.id] = {
                        type: AI_GOAL.CAPTURE_CITY,
                        priority: 40,
                        target: { row: target.city.row, col: target.city.col, ownerId: target.ownerId }
                    };
                }
            }
        }
    }

    findNearestUnits(units, targetRow, targetCol, count) {
        const sorted = units.map(u => ({
            ...u,
            distance: AIUtils.chebyshevDistance(u.row, u.col, targetRow, targetCol)
        })).sort((a, b) => a.distance - b.distance);

        return sorted.slice(0, count);
    }

    findNearestCity(unit, cities) {
        let nearest = null;
        let minDist = Infinity;
        for (const city of cities) {
            const dist = AIUtils.chebyshevDistance(unit.row, unit.col, city.row, city.col);
            if (dist < minDist) {
                minDist = dist;
                nearest = city;
            }
        }
        return nearest;
    }

    // ========================================
    // PRODUCTION HANDLING
    // ========================================

    handleProduction(gameState) {
        const actions = [];

        // Determine what we need based on goals
        const needs = this.assessProductionNeeds(gameState);

        for (const cityData of gameState.ownPieces.cities) {
            const city = this.engine.pieces.find(p => p.id === cityData.id);
            if (!city) continue;

            // If already building something and it aligns with needs, continue
            if (city.production) {
                const currentProd = city.production;
                if (needs[currentProd] > 0) {
                    needs[currentProd]--;
                    continue;
                }
                // Otherwise, might switch
                if (Math.random() < 0.7) continue; // Usually stick with current
            }

            // Choose best production
            const choice = this.chooseBestProduction(city, needs, gameState);
            if (choice && city.production !== choice) {
                this.engine.setProduction(city, choice);
                actions.push({
                    type: AI_ACTION_TYPE.SET_PRODUCTION,
                    city: city,
                    production: choice
                });
                if (needs[choice] > 0) needs[choice]--;
            }
        }

        return actions;
    }

    assessProductionNeeds(gameState) {
        const needs = {
            WARRIOR: 0,
            SETTLER: 0,
            SCIENCE: 0,
            DIPLOMACY: 0,
            REPAIR: 0
        };

        for (const goal of this.activeGoals) {
            switch (goal.type) {
                case AI_GOAL.BUILD_ARMY:
                case AI_GOAL.CAPTURE_CITY:
                case AI_GOAL.DEFEND_CITY:
                    needs.WARRIOR += 2;
                    break;
                case AI_GOAL.FOUND_CITY:
                    if (gameState.ownPieces.settlers.length === 0) {
                        needs.SETTLER += 1;
                    }
                    break;
                case AI_GOAL.EXPAND_TERRITORY:
                    needs.DIPLOMACY += 1;
                    break;
                case AI_GOAL.TECH_UP:
                    needs.SCIENCE += 1;
                    break;
                case AI_GOAL.REPAIR_CITY:
                    needs.REPAIR += 1;
                    break;
            }
        }

        // Strategy-based baseline
        switch (this.currentStrategy) {
            case AI_STRATEGY.EXPANSION:
                needs.SETTLER += 1;
                needs.DIPLOMACY += 1;
                break;
            case AI_STRATEGY.MILITARIZATION:
                needs.WARRIOR += 2;
                break;
            case AI_STRATEGY.DEFENSIVE:
                needs.WARRIOR += 1;
                break;
            case AI_STRATEGY.RESEARCH:
                needs.SCIENCE += 2;
                break;
        }

        return needs;
    }

    chooseBestProduction(city, needs, gameState) {
        const options = [];

        // Repair if city is damaged
        if (city.hp < city.maxHp) {
            const urgency = (1 - city.hp / city.maxHp) * 100;
            options.push({ type: 'REPAIR', score: urgency + needs.REPAIR * 20 });
        }

        // Warrior
        options.push({ type: 'WARRIOR', score: needs.WARRIOR * 15 + 10 });

        // Settler (only if expansion makes sense)
        if (gameState.expansionSpots.length > 0 && gameState.ownPieces.settlers.length < 2) {
            options.push({ type: 'SETTLER', score: needs.SETTLER * 25 + 5 });
        }

        // Science
        options.push({ type: 'SCIENCE', score: needs.SCIENCE * 15 + 5 });

        // Diplomacy (territory)
        if (gameState.territory.owned < 20) {
            options.push({ type: 'DIPLOMACY', score: needs.DIPLOMACY * 15 + 5 });
        }

        // Sort and pick (with impairment)
        options.sort((a, b) => b.score - a.score);

        if (Math.random() < this.config.impairmentLevel && options.length > 1) {
            return options[Math.floor(Math.random() * Math.min(3, options.length))].type;
        }

        return options[0]?.type || 'WARRIOR';
    }

    // ========================================
    // GOAL EXECUTION
    // ========================================

    executeGoalActions(gameState) {
        const actions = [];

        // Process settlers first (city founding)
        for (const settler of gameState.ownPieces.settlers) {
            const piece = this.engine.pieces.find(p => p.id === settler.id);
            if (!piece || piece.hasMoved) continue;

            const goal = this.unitAssignments[settler.id];
            const action = this.executeSettlerGoal(piece, goal, gameState);
            if (action) {
                const result = this.executeAction(action);
                if (result.success) actions.push(action);
            }
        }

        // Process warriors
        for (const warrior of gameState.ownPieces.warriors) {
            const piece = this.engine.pieces.find(p => p.id === warrior.id);
            if (!piece || piece.hasMoved) continue;

            const goal = this.unitAssignments[warrior.id];
            const action = this.executeWarriorGoal(piece, goal, gameState);
            if (action) {
                const result = this.executeAction(action);
                if (result.success) actions.push(action);
            }
        }

        return actions;
    }

    executeSettlerGoal(settler, goal, gameState) {
        // Check if we can build city here
        const canBuild = this.engine.canSettlerBuildCity(settler);

        if (goal?.type === AI_GOAL.FOUND_CITY) {
            // At target location? Build!
            if (settler.row === goal.target.row && settler.col === goal.target.col && canBuild.valid) {
                return { type: AI_ACTION_TYPE.BUILD_CITY, piece: settler };
            }

            // Move toward target
            return this.moveToward(settler, goal.target.row, goal.target.col, gameState);
        }

        // No specific goal - move toward best expansion spot if available
        if (canBuild.valid && gameState.expansionHeatmap[settler.row][settler.col] > 0.5) {
            return { type: AI_ACTION_TYPE.BUILD_CITY, piece: settler };
        }

        if (gameState.expansionSpots.length > 0) {
            const target = gameState.expansionSpots[0];
            return this.moveToward(settler, target.row, target.col, gameState);
        }

        // Just move somewhere safe
        return this.moveToSafety(settler, gameState);
    }

    executeWarriorGoal(warrior, goal, gameState) {
        const player = this.engine.players[this.playerId];

        if (goal?.type === AI_GOAL.DEFEND_CITY) {
            // Move toward city and intercept threats
            const targetCity = goal.target;
            const dist = AIUtils.chebyshevDistance(warrior.row, warrior.col, targetCity.row, targetCity.col);

            // If there are nearby enemies, attack them
            const nearbyEnemy = this.findNearbyEnemy(warrior, gameState, 1);
            if (nearbyEnemy && player.relations[nearbyEnemy.ownerId] === 'war') {
                return {
                    type: AI_ACTION_TYPE.ATTACK,
                    piece: warrior,
                    targetRow: nearbyEnemy.row,
                    targetCol: nearbyEnemy.col,
                    target: nearbyEnemy
                };
            }

            // Move toward city if not adjacent
            if (dist > 1) {
                return this.moveToward(warrior, targetCity.row, targetCity.col, gameState);
            }

            // Stay near city - maybe move to better defensive position
            return this.moveToDefensivePosition(warrior, targetCity, gameState);
        }

        if (goal?.type === AI_GOAL.CAPTURE_CITY) {
            const targetCity = goal.target;
            const dist = AIUtils.chebyshevDistance(warrior.row, warrior.col, targetCity.row, targetCity.col);

            // Adjacent to target? Attack!
            if (dist === 1 && player.relations[targetCity.ownerId] === 'war') {
                return {
                    type: AI_ACTION_TYPE.ATTACK,
                    piece: warrior,
                    targetRow: targetCity.row,
                    targetCol: targetCity.col
                };
            }

            // Move toward target
            return this.moveToward(warrior, targetCity.row, targetCity.col, gameState);
        }

        // No specific goal - default behavior
        // Look for nearby enemies to attack
        const nearbyEnemy = this.findNearbyEnemy(warrior, gameState, 1);
        if (nearbyEnemy && player.relations[nearbyEnemy.ownerId] === 'war') {
            return {
                type: AI_ACTION_TYPE.ATTACK,
                piece: warrior,
                targetRow: nearbyEnemy.row,
                targetCol: nearbyEnemy.col,
                target: nearbyEnemy
            };
        }

        // Move toward enemy territory if militarizing
        if (this.currentStrategy === AI_STRATEGY.MILITARIZATION && gameState.vulnerableEnemies.length > 0) {
            const target = gameState.vulnerableEnemies[0].city;
            return this.moveToward(warrior, target.row, target.col, gameState);
        }

        // Move toward nearest own city for defense
        const nearestCity = this.findNearestCity(warrior, gameState.ownPieces.cities);
        if (nearestCity) {
            const dist = AIUtils.chebyshevDistance(warrior.row, warrior.col, nearestCity.row, nearestCity.col);
            if (dist > 2) {
                return this.moveToward(warrior, nearestCity.row, nearestCity.col, gameState);
            }
        }

        // Patrol/explore - move to unclaimed territory
        return this.exploreMove(warrior, gameState);
    }

    findNearbyEnemy(unit, gameState, maxDist) {
        const player = this.engine.players[this.playerId];

        for (const enemyId in gameState.enemyPieces) {
            const enemy = gameState.enemyPieces[enemyId];

            // Check warriors
            for (const w of enemy.warriors) {
                const dist = AIUtils.chebyshevDistance(unit.row, unit.col, w.row, w.col);
                if (dist <= maxDist) {
                    return { ...w, ownerId: parseInt(enemyId) };
                }
            }

            // Check settlers
            for (const s of enemy.settlers) {
                const dist = AIUtils.chebyshevDistance(unit.row, unit.col, s.row, s.col);
                if (dist <= maxDist) {
                    return { ...s, ownerId: parseInt(enemyId) };
                }
            }

            // Check cities
            for (const c of enemy.cities) {
                const dist = AIUtils.chebyshevDistance(unit.row, unit.col, c.row, c.col);
                if (dist <= maxDist) {
                    return { ...c, ownerId: parseInt(enemyId) };
                }
            }
        }
        return null;
    }

    moveToward(unit, targetRow, targetCol, gameState) {
        const moves = this.engine.getValidMoves(unit);
        if (moves.length === 0) return null;

        // Find move that gets us closest to target
        let bestMove = null;
        let bestDist = AIUtils.chebyshevDistance(unit.row, unit.col, targetRow, targetCol);

        for (const move of moves) {
            // Skip if occupied by friendly unit
            const occupant = this.engine.board[move.row][move.col];
            if (occupant && occupant.ownerId === this.playerId) continue;

            const dist = AIUtils.chebyshevDistance(move.row, move.col, targetRow, targetCol);
            const threat = gameState.threatHeatmap[move.row][move.col];

            // Prefer moves that get closer, penalize dangerous squares
            const score = (bestDist - dist) * 10 - threat * 5;

            if (dist < bestDist || (dist === bestDist && score > 0)) {
                // Check if this would be an attack
                if (occupant && occupant.ownerId !== this.playerId) {
                    const player = this.engine.players[this.playerId];
                    if (player.relations[occupant.ownerId] === 'war') {
                        // Attack is good!
                        return {
                            type: AI_ACTION_TYPE.ATTACK,
                            piece: unit,
                            targetRow: move.row,
                            targetCol: move.col,
                            target: occupant
                        };
                    }
                    continue; // Can't attack if not at war
                }

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

    moveToSafety(unit, gameState) {
        const moves = this.engine.getValidMoves(unit);
        if (moves.length === 0) return null;

        let safestMove = null;
        let lowestThreat = gameState.threatHeatmap[unit.row][unit.col];

        for (const move of moves) {
            const occupant = this.engine.board[move.row][move.col];
            if (occupant) continue;

            const threat = gameState.threatHeatmap[move.row][move.col];
            if (threat < lowestThreat) {
                lowestThreat = threat;
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

    moveToDefensivePosition(warrior, city, gameState) {
        const moves = this.engine.getValidMoves(warrior);
        if (moves.length === 0) return null;

        let bestMove = null;
        let bestScore = -Infinity;

        for (const move of moves) {
            const occupant = this.engine.board[move.row][move.col];
            if (occupant) continue;

            const distToCity = AIUtils.chebyshevDistance(move.row, move.col, city.row, city.col);
            if (distToCity > 2) continue; // Stay close

            // Score: low threat, covers city approaches
            let score = 10 - gameState.threatHeatmap[move.row][move.col] * 5;
            score += (2 - distToCity) * 3; // Closer is better

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

    exploreMove(warrior, gameState) {
        const moves = this.engine.getValidMoves(warrior);
        if (moves.length === 0) return null;

        let bestMove = null;
        let bestScore = -Infinity;

        for (const move of moves) {
            const occupant = this.engine.board[move.row][move.col];
            if (occupant) continue;

            let score = 0;

            // Prefer unclaimed territory
            const owner = this.engine.tileOwnership[move.row][move.col];
            if (owner === null) score += 5;
            else if (owner !== this.playerId) score += 3;

            // Avoid high threat areas
            score -= gameState.threatHeatmap[move.row][move.col] * 5;

            // Prefer unexplored areas (far from own cities)
            let minDistToOwnCity = Infinity;
            for (const city of gameState.ownPieces.cities) {
                const dist = AIUtils.chebyshevDistance(move.row, move.col, city.row, city.col);
                minDistToOwnCity = Math.min(minDistToOwnCity, dist);
            }
            if (minDistToOwnCity > 3) score += 2;

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
    // DIPLOMACY
    // ========================================

    handleDiplomacy(gameState) {
        const actions = [];
        const player = this.engine.players[this.playerId];

        // Check for pending peace proposals
        for (let otherId = 0; otherId < this.engine.players.length; otherId++) {
            if (otherId === this.playerId) continue;
            const otherPlayer = this.engine.players[otherId];
            if (!otherPlayer) continue;

            if (otherPlayer.relations[this.playerId] === 'peace_proposed') {
                if (this.shouldAcceptPeace(otherId, gameState)) {
                    this.engine.acceptPeace(this.playerId, otherId);
                    actions.push({ type: AI_ACTION_TYPE.ACCEPT_PEACE, target: otherId });
                    console.log(`[AI] Player ${this.playerId} accepted peace from ${otherId}`);
                }
            }
        }

        // Consider declaring war
        if (this.currentStrategy === AI_STRATEGY.MILITARIZATION &&
            gameState.armyStrength.warriors >= this.config.armySizeForAttack) {

            for (const target of gameState.vulnerableEnemies) {
                if (player.relations[target.ownerId] === 'peace') {
                    if (this.shouldDeclareWar(target.ownerId, gameState)) {
                        this.engine.declareWar(this.playerId, target.ownerId);
                        actions.push({ type: AI_ACTION_TYPE.DECLARE_WAR, target: target.ownerId });
                        console.log(`[AI] Player ${this.playerId} declared war on ${target.ownerId}`);
                        break; // One war at a time
                    }
                }
            }
        }

        // Consider proposing peace if losing
        for (let otherId = 0; otherId < this.engine.players.length; otherId++) {
            if (otherId === this.playerId) continue;
            if (player.relations[otherId] !== 'war') continue;

            if (this.shouldProposePeace(otherId, gameState)) {
                this.engine.proposePeace(this.playerId, otherId);
                actions.push({ type: AI_ACTION_TYPE.PROPOSE_PEACE, target: otherId });
                console.log(`[AI] Player ${this.playerId} proposed peace to ${otherId}`);
            }
        }

        return actions;
    }

    shouldDeclareWar(targetId, gameState) {
        const rel = gameState.relativePower[targetId];
        if (!rel) return false;

        let score = 0;

        // Strong advantage
        if (rel.advantage === 'strong') score += 0.5;
        else if (rel.advantage === 'even') score += 0.1;
        else score -= 0.4;

        // Have enough army
        if (gameState.armyStrength.warriors >= this.config.armySizeForAttack) {
            score += 0.3;
        }

        // Vulnerable target exists
        const vulnTarget = gameState.vulnerableEnemies.find(v => v.ownerId === targetId);
        if (vulnTarget && vulnTarget.vulnerability > 50) {
            score += 0.2;
        }

        // Not already at war with others
        let otherWars = 0;
        for (const otherId in this.engine.players[this.playerId].relations) {
            if (this.engine.players[this.playerId].relations[otherId] === 'war') otherWars++;
        }
        score -= otherWars * 0.3;

        return score > this.config.warThreshold;
    }

    shouldAcceptPeace(proposerId, gameState) {
        const rel = gameState.relativePower[proposerId];

        let score = 0.5; // Neutral start

        // Weaker = accept
        if (rel?.advantage === 'weak') score += 0.3;
        else if (rel?.advantage === 'strong') score -= 0.2;

        // Cities threatened = accept
        const threats = gameState.cityThreats.filter(t => t.level > 0.3).length;
        score += threats * 0.15;

        // Multiple wars = accept
        let warCount = 0;
        for (const otherId in this.engine.players[this.playerId].relations) {
            if (this.engine.players[this.playerId].relations[otherId] === 'war') warCount++;
        }
        if (warCount > 1) score += 0.2;

        return score > this.config.peaceThreshold;
    }

    shouldProposePeace(targetId, gameState) {
        const rel = gameState.relativePower[targetId];

        let score = 0;

        // Weaker = propose
        if (rel?.advantage === 'weak') score += 0.4;

        // Losing cities
        if (gameState.ownPieces.cities.length === 1) score += 0.3;

        // Army depleted
        if (gameState.armyStrength.warriors < 2) score += 0.2;

        return score > this.config.peaceThreshold;
    }

    // ========================================
    // ACTION EXECUTION
    // ========================================

    executeAction(action) {
        if (!action) return { success: false };

        switch (action.type) {
            case AI_ACTION_TYPE.MOVE_UNIT:
                return this.engine.movePiece(action.piece, action.targetRow, action.targetCol);

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
    // EVENT HANDLING
    // ========================================

    respondToEvent(event) {
        if (Math.random() > this.config.threatAwareness) return;

        switch (event.type) {
            case 'WAR_DECLARED':
                if (event.details.defender === this.playerId) {
                    this.currentStrategy = AI_STRATEGY.DEFENSIVE;
                    this.strategyTurnsRemaining = 5;
                }
                break;

            case 'PEACE_PROPOSED':
                if (event.details.target === this.playerId) {
                    this.pendingPeaceProposals.push(event.details.proposer);
                }
                break;

            case 'CITY_CAPTURED':
                if (event.details.previousOwner === this.playerId) {
                    this.currentStrategy = AI_STRATEGY.MILITARIZATION;
                    this.strategyTurnsRemaining = 5;
                }
                break;
        }
    }
}

// ============================================
// UTILITY FUNCTIONS
// ============================================

class AIUtils {
    static manhattanDistance(r1, c1, r2, c2) {
        return Math.abs(r1 - r2) + Math.abs(c1 - c2);
    }

    static chebyshevDistance(r1, c1, r2, c2) {
        return Math.max(Math.abs(r1 - r2), Math.abs(c1 - c2));
    }

    static shuffleArray(array) {
        const result = [...array];
        for (let i = result.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [result[i], result[j]] = [result[j], result[i]];
        }
        return result;
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
        console.log(`[AIManager] Registered AI for player ${playerId} (${difficulty})`);
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
        for (const playerId in this.controllers) {
            this.controllers[playerId].respondToEvent(event);
        }
    }

    static getAIDifficulties() {
        return [AI_DIFFICULTY.EASY, AI_DIFFICULTY.MEDIUM, AI_DIFFICULTY.HARD];
    }
}
