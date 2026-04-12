const shuffleArray = require('./shuffleArray')

const nextPlayer = (currentTurn, dir, playerList, skip = 0) => {
    const n = playerList.length
    if (n === 0) return ''
    const idx = playerList.indexOf(currentTurn)
    if (idx === -1) return playerList[0]
    return playerList[((idx + dir * (1 + skip)) % n + n) % n]
}

const ensureCards = (drawPile, playedPile, needed) => {
    if (drawPile.length >= needed || playedPile.length <= 1) return
    const top = playedPile[playedPile.length - 1]
    const reshuffled = shuffleArray([...playedPile.slice(0, -1), ...drawPile])
    drawPile.length = 0;  drawPile.push(...reshuffled)
    playedPile.length = 0; playedPile.push(top)
}

const processBotTurn = (gameState, botName, difficulty) => {
    const botDeck = [...(gameState.playerDecks[botName] || [])];
    const drawCardPile = [...gameState.drawCardPile];
    const playedCardsPile = [...gameState.playedCardsPile];
    const players = gameState.players;
    const direction = gameState.direction;
    const turn = gameState.turn;
    const stackPenalty = gameState.stackPenalty || 0;
    const stackType = gameState.stackType || null;
    const currentColor = gameState.currentColor;
    const currentNumber = gameState.currentNumber;
    
    let nextState = null;
    let emoji = null;
    let declaredUno = false;
    let sound = '';
    
    // Play card helper
    const playCard = (cardToPlay, curDeck, currentDrawPile) => {
        const removeIdx = curDeck.indexOf(cardToPlay);
        if (removeIdx > -1) curDeck.splice(removeIdx, 1);

        const isSkip = cardToPlay.startsWith('skip');
        const isReverse = cardToPlay.startsWith('_');
        const isDraw2 = cardToPlay.startsWith('D2');
        const isWild = cardToPlay === 'W';
        const isDraw4 = cardToPlay === 'D4W';
        const cardColor = (isWild || isDraw4) ? null : cardToPlay[cardToPlay.length - 1];
        const cardNum = isSkip ? 404 : isReverse ? '_' : isDraw2 ? 252 : isWild ? 300 : isDraw4 ? 600 : cardToPlay[0];

        if (curDeck.length === 1) {
            declaredUno = true;
            sound = 'uno'; // can emit uno sound
        }

        const newDecks = { ...gameState.playerDecks, [botName]: curDeck };
        const isWinner = curDeck.length === 0;
        const newPlayedPile = [...playedCardsPile, cardToPlay];
        
        let newState = {
            ...gameState,
            playerDecks: newDecks,
            playedCardsPile: newPlayedPile,
            drawCardPile: currentDrawPile,
            stackPenalty: stackPenalty,
            stackType: stackType
        };

        if (isWinner) {
            newState.gameOver = true;
            newState.winner = botName;
            return newState;
        }

        if (isWild || isDraw4) {
            // Find most frequent color in hand
            const cnts = {R:0, G:0, B:0, Y:0};
            curDeck.forEach(c => { const col = c[c.length-1]; if(cnts[col]!==undefined) cnts[col]++; });
            let bestColor = 'R', maxC = -1;
            Object.keys(cnts).forEach(k => { if(cnts[k]>maxC){maxC=cnts[k]; bestColor=k;} });

            if (isWild) {
                sound = 'wild';
                return {
                    ...newState, currentColor: bestColor, currentNumber: 300, turn: nextPlayer(botName, direction, players)
                };
            } else {
                sound = 'draw4';
                emoji = '😂'; // Add emoji laugh when dropping +4
                return {
                    ...newState, currentColor: bestColor, currentNumber: 600, stackPenalty: stackPenalty + 4, stackType: 'D4',
                    turn: nextPlayer(botName, direction, players)
                };
            }
        }

        if (isSkip) {
            sound = 'skip';
            return {
                ...newState, currentColor: cardColor, currentNumber: 404, turn: nextPlayer(botName, direction, players, 1)
            };
        }

        if (isReverse) {
            const nDir = direction * -1;
            const nTurn = (players.length === 2 ? botName : nextPlayer(botName, nDir, players));
            sound = 'shuffle';
            return {
                ...newState, currentColor: cardColor, currentNumber: '_', direction: nDir, turn: nTurn
            };
        }

        if (isDraw2) {
            sound = 'draw2';
            emoji = '😂'; // emoji laugh when dropping +2
            return {
                ...newState, currentColor: cardColor, currentNumber: 252, stackPenalty: stackPenalty + 2, stackType: 'D2',
                turn: nextPlayer(botName, direction, players)
            };
        }

        sound = 'shuffle';
        return {
            ...newState, currentColor: cardColor, currentNumber: cardNum, turn: nextPlayer(botName, direction, players)
        };
    };

    // Stacking situation
    if (stackPenalty > 0) {
        const validStackCard = botDeck.find(c => {
            if (stackType === 'D4' && c === 'D4W') return true;
            if (stackType === 'D2' && (c.startsWith('D2') || c === 'D4W')) return true;
            return false;
        });

        if (validStackCard) {
            nextState = playCard(validStackCard, botDeck, drawCardPile);
        } else {
            // Must draw penalty
            ensureCards(drawCardPile, playedCardsPile, stackPenalty);
            for (let i = 0; i < stackPenalty; i++) {
                if (drawCardPile.length > 0) botDeck.push(drawCardPile.pop());
            }
            emoji = '😢'; // sad emoji when drawing penalty
            sound = 'draw2';
            nextState = {
                ...gameState,
                playerDecks: { ...gameState.playerDecks, [botName]: botDeck },
                drawCardPile,
                playedCardsPile,
                stackPenalty: 0,
                stackType: null,
                turn: nextPlayer(botName, direction, players)
            };
        }
    } else {
        // Normal turn: find all valid playable cards
        let validCards = botDeck.filter(c => {
            if (c === 'W' || c === 'D4W') return true;
            const cCol = c[c.length - 1];
            const cNum = c.startsWith('skip') ? 404 : c.startsWith('_') ? '_' : c.startsWith('D2') ? 252 : c[0];
            return (cCol === currentColor || String(cNum) === String(currentNumber));
        });

        if (validCards.length > 0) {
            // Artificial intelligence based on difficulty
            // Easy: completely random, Hard: prefers action cards and matching colors
            let cardToPlay = validCards[0];
            if (difficulty === 'hard') {
                const actionCards = validCards.filter(c => c.startsWith('skip') || c.startsWith('_') || c.startsWith('D2') || c === 'W' || c === 'D4W');
                if (actionCards.length > 0) {
                    cardToPlay = actionCards[Math.floor(Math.random() * actionCards.length)];
                } else {
                    cardToPlay = validCards[Math.floor(Math.random() * validCards.length)];
                }
            } else if (difficulty === 'easy') {
                cardToPlay = validCards[Math.floor(Math.random() * validCards.length)];
            } else {
                // Normal
                const prioritizeNonWild = validCards.find(c => c !== 'W' && c !== 'D4W');
                cardToPlay = prioritizeNonWild || validCards[0];
            }

            nextState = playCard(cardToPlay, botDeck, drawCardPile);
        } else {
            // Draw a card
            ensureCards(drawCardPile, playedCardsPile, 1);
            if (drawCardPile.length === 0) {
                // Literally out of cards, skip turn
                nextState = { ...gameState, turn: nextPlayer(botName, direction, players) };
            } else {
                const drawn = drawCardPile.pop();
                botDeck.push(drawn);
                const isW = drawn === 'W', isD4 = drawn === 'D4W';
                const colD = (isW || isD4) ? null : drawn[drawn.length - 1];
                const numD = drawn.startsWith('skip') ? 404 : drawn.startsWith('_') ? '_' : drawn.startsWith('D2') ? 252 : isW ? 300 : isD4 ? 600 : drawn[0];
                const canPlay = isW || isD4 || (colD === currentColor) || String(numD) === String(currentNumber);

                if (canPlay && difficulty !== 'easy') { // In easy mode, maybe don't play drawn card
                    nextState = playCard(drawn, botDeck, drawCardPile);
                } else {
                    emoji = difficulty === 'hard' ? '😤' : null;
                    nextState = {
                        ...gameState,
                        playerDecks: { ...gameState.playerDecks, [botName]: botDeck },
                        drawCardPile,
                        playedCardsPile,
                        turn: nextPlayer(botName, direction, players)
                    };
                }
            }
        }
    }

    return { nextState, emoji, declaredUno, sound };
};

module.exports = { processBotTurn };