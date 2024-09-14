// server/gameLogic.js

function calculateResults(choices) {
    const playerChoices = Object.values(choices);
    const uniqueChoices = [...new Set(playerChoices)];
    let winners = [];

    if (uniqueChoices.length === 1 || uniqueChoices.length === 3) {
        // 平局
        winners = [];
    } else {
        // 判定赢家
        let winningChoice;
        if (uniqueChoices.includes('rock') && uniqueChoices.includes('scissors')) {
            winningChoice = 'rock';
        } else if (
            uniqueChoices.includes('scissors') &&
            uniqueChoices.includes('paper')
        ) {
            winningChoice = 'scissors';
        } else if (uniqueChoices.includes('paper') && uniqueChoices.includes('rock')) {
            winningChoice = 'paper';
        }
        // 找出赢家
        for (const [playerId, choice] of Object.entries(choices)) {
            if (choice === winningChoice) {
                winners.push(playerId);
            }
        }
    }
    return { winners };
}

module.exports = {
    calculateResults,
};
