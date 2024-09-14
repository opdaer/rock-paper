// server/unoGameLogic.js

// UNO 游戏逻辑实现

function createGame() {
    return {
        deck: [], // 牌堆
        discardPile: [], // 弃牌堆
        players: {}, // 玩家手牌
        playerOrder: [], // 玩家顺序
        currentPlayerIndex: 0, // 当前玩家索引
        direction: 1, // 游戏方向，1为顺时针，-1为逆时针
        currentColor: null, // 当前颜色
        currentValue: null, // 当前值（数字或功能）
    };
}

function initializeGame(game, players) {
    // 初始化牌堆和玩家手牌
    game.deck = generateDeck();
    shuffle(game.deck);
    const playerIds = Object.keys(players);
    game.playerOrder = playerIds;
    playerIds.forEach((playerId) => {
        game.players[playerId] = [];
        for (let i = 0; i < 7; i++) {
            game.players[playerId].push(game.deck.pop());
        }
    });
    // 翻开一张牌作为起始牌
    let firstCard;
    do {
        firstCard = game.deck.pop();
        game.discardPile.push(firstCard);
    } while (firstCard.type === 'wild' || firstCard.type === 'wildDrawFour');

    game.currentColor = firstCard.color;
    game.currentValue = firstCard.value;
}

function generateDeck() {
    const colors = ['red', 'yellow', 'green', 'blue'];
    const numbers = Array.from({ length: 10 }, (_, i) => i); // 0-9
    const deck = [];

    colors.forEach((color) => {
        numbers.forEach((number) => {
            deck.push({ color, value: number, type: 'number' });
            if (number !== 0) {
                deck.push({ color, value: number, type: 'number' });
            }
        });
        // 添加功能牌（跳过、反转、+2）
        deck.push({ color, value: 'skip', type: 'skip' });
        deck.push({ color, value: 'skip', type: 'skip' });
        deck.push({ color, value: 'reverse', type: 'reverse' });
        deck.push({ color, value: 'reverse', type: 'reverse' });
        deck.push({ color, value: 'drawTwo', type: 'drawTwo' });
        deck.push({ color, value: 'drawTwo', type: 'drawTwo' });
    });

    // 添加万能牌（改变颜色、+4）
    for (let i = 0; i < 4; i++) {
        deck.push({ color: null, value: 'wild', type: 'wild' });
        deck.push({ color: null, value: 'wildDrawFour', type: 'wildDrawFour' });
    }

    return deck;
}

function shuffle(deck) {
    for (let i = deck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [deck[i], deck[j]] = [deck[j], deck[i]];
    }
}

function playCard(game, playerId, card, chosenColor = null) {
    const playerHand = game.players[playerId];
    const handCardIndex = playerHand.findIndex(
        (c) =>
            c.color === card.color &&
            c.value === card.value &&
            c.type === card.type
    );
    if (handCardIndex === -1) {
        return { success: false, message: '你没有这张牌' };
    }

    // 检查是否可以出牌
    if (
        card.color === game.currentColor ||
        card.value === game.currentValue ||
        card.type === 'wild' ||
        card.type === 'wildDrawFour'
    ) {
        // 可以出牌
        playerHand.splice(handCardIndex, 1);
        game.discardPile.push(card);
        if (card.type === 'wild' || card.type === 'wildDrawFour') {
            if (!chosenColor) {
                return { success: false, message: '你需要选择一个颜色' };
            }
            game.currentColor = chosenColor;
        } else {
            game.currentColor = card.color;
        }
        game.currentValue = card.value;

        // 处理功能牌效果
        const actionResult = handleCardAction(game, card, playerId);
        if (!actionResult.success) {
            return actionResult;
        }

        // 下一个玩家
        moveToNextPlayer(game);

        return { success: true };
    } else {
        return { success: false, message: '不能出这张牌' };
    }
}

function handleCardAction(game, card, playerId) {
    // 处理功能牌效果
    if (card.type === 'skip') {
        // 跳过下一个玩家
        moveToNextPlayer(game);
    } else if (card.type === 'reverse') {
        // 改变游戏方向
        game.direction *= -1;
        if (game.playerOrder.length === 2) {
            // 两人游戏中，反转相当于跳过
            moveToNextPlayer(game);
        }
    } else if (card.type === 'drawTwo') {
        // 下一个玩家抽两张牌
        const nextPlayerId = getNextPlayerId(game);
        drawCards(game, nextPlayerId, 2);
        moveToNextPlayer(game);
    } else if (card.type === 'wildDrawFour') {
        // 下一个玩家抽四张牌
        const nextPlayerId = getNextPlayerId(game);
        drawCards(game, nextPlayerId, 4);
        moveToNextPlayer(game);
    }
    return { success: true };
}

function drawCard(game, playerId) {
    const card = game.deck.pop();
    if (!card) {
        // 如果牌堆为空，重新洗牌
        if (game.discardPile.length > 1) {
            const lastCard = game.discardPile.pop();
            game.deck = game.discardPile;
            game.discardPile = [lastCard];
            shuffle(game.deck);
            return drawCard(game, playerId);
        } else {
            // 无法抽牌
            return null;
        }
    }
    game.players[playerId].push(card);
    return card;
}

function drawCards(game, playerId, count) {
    for (let i = 0; i < count; i++) {
        drawCard(game, playerId);
    }
}

function moveToNextPlayer(game) {
    const playerCount = game.playerOrder.length;
    game.currentPlayerIndex =
        (game.currentPlayerIndex + game.direction + playerCount) % playerCount;
}

function getNextPlayerId(game) {
    const playerCount = game.playerOrder.length;
    const nextIndex =
        (game.currentPlayerIndex + game.direction + playerCount) % playerCount;
    return game.playerOrder[nextIndex];
}

function getGameState(game) {
    return {
        currentColor: game.currentColor,
        currentValue: game.currentValue,
        topCard: game.discardPile[game.discardPile.length - 1],
        players: game.playerOrder.map((playerId) => ({
            playerId,
            handCount: game.players[playerId].length,
        })),
        currentPlayerId: game.playerOrder[game.currentPlayerIndex],
    };
}

function checkWinner(game, playerId) {
    return game.players[playerId].length === 0;
}

function removePlayer(game, playerId) {
    delete game.players[playerId];
    const index = game.playerOrder.indexOf(playerId);
    if (index !== -1) {
        game.playerOrder.splice(index, 1);
        if (game.currentPlayerIndex >= index) {
            game.currentPlayerIndex--;
            if (game.currentPlayerIndex < 0) {
                game.currentPlayerIndex = 0;
            }
        }
    }
}

module.exports = {
    createGame,
    initializeGame,
    playCard,
    drawCard,
    getGameState,
    checkWinner,
    removePlayer,
};
