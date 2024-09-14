// public/client.js

const socket = io();

let roomId = null;
let hasMadeChoice = false;

// 存储玩家列表
let players = {};
let currentRoomOwner = null;

// 设置玩家昵称
let playerName = prompt('请输入你的昵称：');
if (!playerName || playerName.trim() === '') {
    playerName = '玩家' + Math.floor(Math.random() * 1000);
}
socket.emit('setPlayerName', playerName);

// 更新排行榜
fetch('/leaderboard')
    .then((response) => response.json())
    .then((data) => {
        updateLeaderboard(data);
    });

// 更新在线玩家数量
socket.on('updateOnlineUsers', (count) => {
    document.getElementById('onlineUsers').innerText = `在线玩家：${count}`;
});

// 更新在线用户列表
socket.on('updateOnlineUserList', (userList) => {
    const onlineUsersUl = document.getElementById('onlineUsersList');
    onlineUsersUl.innerHTML = '';
    for (const [id, name] of Object.entries(userList)) {
        if (id !== socket.id) { // 不显示自己
            const li = document.createElement('li');
            li.textContent = name;
            li.dataset.userId = id;
            li.addEventListener('click', () => {
                inviteUser(id);
            });
            onlineUsersUl.appendChild(li);
        }
    }
});

// 更新房间列表
socket.on('updateRoomList', (roomList) => {
    const roomListUl = document.getElementById('roomList');
    roomListUl.innerHTML = '';
    for (const roomId in roomList) {
        const li = document.createElement('li');
        const room = roomList[roomId];
        const ownerName = room.players[room.roomOwner];
        li.textContent = `房间 ${roomId} - 房主：${ownerName} - 玩家人数：${Object.keys(room.players).length}`;
        li.dataset.roomId = roomId;
        li.addEventListener('click', () => {
            joinRoomById(roomId);
        });
        roomListUl.appendChild(li);
    }
});

// 加入指定房间
function joinRoomById(roomIdToJoin) {
    if (roomId) {
        alert('您已经在房间中，无法加入其他房间');
        return;
    }
    socket.emit('joinRoom', roomIdToJoin, (success, settings) => {
        if (success) {
            roomId = roomIdToJoin;
            document.getElementById('roomId').innerText = `房间 ID: ${roomId}`;
            alert(`已加入房间，房间 ID: ${roomId}`);
            applyGameSettings(settings);
            document.getElementById('gameSettings').style.display = 'none';
            document.getElementById('choices').style.display = 'none'; // 等待游戏开始后再显示
            disableRoomButtons();
            document.getElementById('status').innerText = '等待房主开始游戏...';
            document.getElementById('leaveRoom').style.display = 'block'; // 显示“退出游戏”按钮
        } else {
            alert('加入房间失败，房间不存在');
        }
    });
}

// 邀请用户
function inviteUser(targetSocketId) {
    if (roomId) {
        alert('您已经在房间中，无法邀请其他玩家');
        return;
    }
    socket.emit('invitePlayer', targetSocketId);
    alert('邀请已发送，等待对方接受');
}

// 接收邀请
socket.on('receiveInvitation', (data) => {
    const { from, name } = data;
    const accept = confirm(`玩家 ${name} 邀请您进行游戏，是否接受？`);
    if (accept) {
        socket.emit('acceptInvitation', { fromSocketId: from });
    }
});

// 邀请被接受，加入房间
socket.on('invitationAccepted', (data) => {
    const { roomId: newRoomId, settings } = data;
    roomId = newRoomId;
    document.getElementById('roomId').innerText = `房间 ID: ${roomId}`;
    applyGameSettings(settings);
    document.getElementById('gameSettings').style.display = 'none';
    document.getElementById('choices').style.display = 'none'; // 等待游戏开始后再显示
    disableRoomButtons();
    document.getElementById('status').innerText = '等待房主开始游戏...';
    document.getElementById('leaveRoom').style.display = 'block'; // 显示“退出游戏”按钮
});

// 创建房间
document.getElementById('createRoom').addEventListener('click', () => {
    document.getElementById('gameSettings').style.display = 'block'; // 显示游戏设置
    document.getElementById('playerActions').style.display = 'block'; // 显示确认按钮
    disableRoomButtons(); // 禁用房间相关按钮
});

// 确认游戏设置并创建房间
document.getElementById('confirmSettings').addEventListener('click', () => {
    const settings = getGameSettings();
    socket.emit('createRoom', settings, (id) => {
        roomId = id;
        document.getElementById('roomId').innerText = `房间 ID: ${roomId}`;
        alert(`房间已创建，房间 ID: ${roomId}`);
        applyGameSettings(settings);
        document.getElementById('gameSettings').style.display = 'none';
        document.getElementById('choices').style.display = 'none'; // 等待游戏开始后再显示
        document.getElementById('playerActions').style.display = 'none';
        document.getElementById('leaveRoom').style.display = 'block'; // 显示“退出游戏”按钮

        // 显示“开始游戏”按钮
        if (currentRoomOwner === socket.id) {
            document.getElementById('startGameContainer').style.display = 'block';
        }
    });
});

// 加入房间
document.getElementById('joinRoom').addEventListener('click', () => {
    const inputRoomId = document.getElementById('roomIdInput').value.trim();
    if (!inputRoomId) {
        alert('请输入房间 ID');
        return;
    }
    joinRoomById(inputRoomId);
});

// 快速匹配
document.getElementById('quickMatch').addEventListener('click', () => {
    socket.emit('quickMatch', (roomIdReceived, settings) => {
        roomId = roomIdReceived;
        document.getElementById('roomId').innerText = `房间 ID: ${roomId}`;
        alert(`已加入房间，房间 ID: ${roomId}`);
        applyGameSettings(settings);
        document.getElementById('gameSettings').style.display = 'none';
        document.getElementById('choices').style.display = 'none'; // 等待游戏开始后再显示
        disableRoomButtons();
        document.getElementById('status').innerText = '等待房主开始游戏...';
        document.getElementById('leaveRoom').style.display = 'block'; // 显示“退出游戏”按钮
    });
});

// 开始游戏
document.getElementById('startGame').addEventListener('click', () => {
    if (!roomId) {
        alert('请先创建或加入一个房间');
        return;
    }
    socket.emit('startGame', roomId);
});

// 玩家选择
document.getElementById('choices').addEventListener('click', (e) => {
    if (e.target.tagName === 'BUTTON') {
        const choice = e.target.dataset.choice;
        if (!roomId) {
            alert('请先创建或加入一个房间');
            return;
        }
        if (hasMadeChoice) {
            alert('你已经做出了选择，等待其他玩家...');
            return;
        }
        socket.emit('makeChoice', roomId, choice);
        document.getElementById('status').innerText = '已提交选择，等待其他玩家...';
        // 禁用选择按钮
        disableChoiceButtons();
        hasMadeChoice = true;
    }
});

// 退出游戏
document.getElementById('leaveRoom').addEventListener('click', () => {
    if (roomId) {
        socket.emit('leaveRoom', roomId);
        // 重置客户端状态
        resetClientState();
    }
});

// 重新开始游戏
document.getElementById('restartGame').addEventListener('click', () => {
    if (roomId) {
        socket.emit('restartGame', roomId);
        document.getElementById('restartGame').style.display = 'none';
    }
});

function resetClientState() {
    roomId = null;
    players = {};
    hasMadeChoice = false;
    currentRoomOwner = null;
    document.getElementById('roomId').innerText = '';
    document.getElementById('playerCount').innerText = '';
    document.getElementById('status').innerText = '';
    document.getElementById('choices').style.display = 'none';
    document.getElementById('startGameContainer').style.display = 'none';
    document.getElementById('leaveRoom').style.display = 'none';
    document.getElementById('currentRound').style.display = 'none';
    document.getElementById('restartGame').style.display = 'none';
    enableRoomButtons();
}

function enableRoomButtons() {
    document.getElementById('createRoom').disabled = false;
    document.getElementById('joinRoom').disabled = false;
    document.getElementById('quickMatch').disabled = false;
}

// 更新玩家列表
socket.on('updatePlayerList', (data) => {
    players = data.players;
    currentRoomOwner = data.roomOwner;
    console.log('更新的玩家列表：', players);
    updatePlayerStatusDisplay(); // 更新玩家列表显示
    document.getElementById('playerCount').innerText = `玩家人数：${Object.keys(players).length}`;

    // 根据房主身份显示或隐藏“开始游戏”按钮
    if (roomId && currentRoomOwner === socket.id) {
        document.getElementById('startGameContainer').style.display = 'block';
    } else {
        document.getElementById('startGameContainer').style.display = 'none';
    }
});

// 更新玩家状态
socket.on('updatePlayerStatus', (status) => {
    updatePlayerStatusDisplay(status);
});

function updatePlayerStatusDisplay(status = {}) {
    const playersUl = document.getElementById('players');
    playersUl.innerHTML = ''; // 清空列表
    for (const [id, name] of Object.entries(players)) {
        const playerStatus = status[id] || '思考中';
        const isOwner = id === currentRoomOwner;
        const li = document.createElement('li');
        li.textContent = `${name}${isOwner ? ' (房主)' : ''} - ${playerStatus}`;
        playersUl.appendChild(li);
    }
}

// 游戏开始
socket.on('gameStarted', (settings) => {
    document.getElementById('status').innerText = '游戏已开始，请选择：';
    hasMadeChoice = false;
    enableChoiceButtons();
    applyGameSettings(settings);
    document.getElementById('choices').style.display = 'block'; // 显示选择按钮
    document.getElementById('startGameContainer').style.display = 'none'; // 隐藏“开始游戏”按钮
    document.getElementById('currentRound').style.display = 'block'; // 显示当前回合数
});

// 更新当前回合数
socket.on('updateRound', (round) => {
    document.getElementById('currentRound').innerText = `当前回合：${round}`;
});

// 本轮结果
socket.on('roundResult', (data) => {
    const { choices, scores, winners, players, round } = data;
    let resultText = `第 ${round} 回合结果：\n`;
    for (const [playerId, choice] of Object.entries(choices)) {
        resultText += `${players[playerId]}: ${translateChoice(choice)}\n`;
    }
    resultText += '\n当前分数：\n';
    for (const [playerId, score] of Object.entries(scores)) {
        resultText += `${players[playerId]}: ${score}\n`;
    }
    if (winners.length > 0) {
        const winnerNames = winners.map((id) => players[id]);
        resultText += `\n本轮获胜者：${winnerNames.join(', ')}`;
    } else {
        resultText += '\n本轮平局';
    }
    document.getElementById('status').innerText = resultText;
    hasMadeChoice = false;
    enableChoiceButtons();
});

// 游戏结束
socket.on('gameEnded', (data) => {
    const { winner, scores } = data;
    let resultText = `游戏结束！\n获胜者：${winner}\n最终分数：\n`;
    for (const [playerId, score] of Object.entries(scores)) {
        resultText += `${players[playerId]}: ${score}\n`;
    }
    document.getElementById('status').innerText = resultText;
    document.getElementById('choices').style.display = 'none';
    document.getElementById('currentRound').style.display = 'none'; // 隐藏当前回合数
    fetch('/leaderboard')
        .then((response) => response.json())
        .then((data) => {
            updateLeaderboard(data);
        });
    // 显示“重新开始”按钮（如果是房主）
    if (currentRoomOwner === socket.id) {
        document.getElementById('restartGame').style.display = 'block';
    }
});

// 游戏重新开始
socket.on('gameRestarted', (settings) => {
    document.getElementById('status').innerText = '游戏已重新开始，请选择：';
    hasMadeChoice = false;
    enableChoiceButtons();
    applyGameSettings(settings);
    document.getElementById('choices').style.display = 'block';
    document.getElementById('currentRound').style.display = 'block';
    document.getElementById('restartGame').style.display = 'none';
});

// 错误信息
socket.on('errorMessage', (msg) => {
    alert(msg);
});

// 玩家加入
socket.on('playerJoined', (playerName) => {
    console.log(`玩家加入：${playerName}`);
    alert(`玩家 ${playerName} 加入了房间`);
});

// 玩家离开
socket.on('playerLeft', (playerName) => {
    console.log(`玩家离开：${playerName}`);
    alert(`玩家 ${playerName} 离开了房间`);
});

// 接收聊天消息
socket.on('receiveMessage', (data) => {
    const { player, message } = data;
    const messagesDiv = document.getElementById('messages');
    const messageP = document.createElement('p');
    messageP.textContent = `${player}: ${message}`;
    messagesDiv.appendChild(messageP);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
});

// 发送聊天消息
document.getElementById('sendChat').addEventListener('click', () => {
    const message = document.getElementById('chatInput').value.trim();
    if (message && roomId) {
        socket.emit('sendMessage', roomId, message);
        document.getElementById('chatInput').value = '';
    }
});

// 快捷回复
document.getElementById('quickReplies').addEventListener('click', (e) => {
    if (e.target.classList.contains('quickReply')) {
        const message = e.target.textContent;
        if (roomId) {
            socket.emit('sendMessage', roomId, message);
        }
    }
});

// 工具函数
function disableChoiceButtons() {
    const buttons = document.querySelectorAll('#choices button');
    buttons.forEach((button) => {
        button.disabled = true;
    });
}

function enableChoiceButtons() {
    const buttons = document.querySelectorAll('#choices button');
    buttons.forEach((button) => {
        button.disabled = false;
    });
}

function translateChoice(choice) {
    switch (choice) {
        case 'rock':
            return '石头';
        case 'paper':
            return '布';
        case 'scissors':
            return '剪刀';
        default:
            return choice;
    }
}

function getGameSettings() {
    const victoryConditionElement = document.getElementById('victoryCondition');
    const targetScoreElement = document.getElementById('targetScore');
    const totalRoundsElement = document.getElementById('totalRounds');

    const victoryCondition = victoryConditionElement ? victoryConditionElement.value : 'score';
    const targetScore = targetScoreElement ? parseInt(targetScoreElement.value) || 5 : 5;
    const totalRounds = totalRoundsElement ? parseInt(totalRoundsElement.value) || 5 : 5;

    return {
        victoryCondition,
        targetScore,
        totalRounds,
    };
}

function applyGameSettings(settings) {
    if (settings.victoryCondition === 'score') {
        document.getElementById('targetScoreLabel').style.display = 'block';
        document.getElementById('totalRoundsLabel').style.display = 'none';
    } else if (settings.victoryCondition === 'rounds') {
        document.getElementById('targetScoreLabel').style.display = 'none';
        document.getElementById('totalRoundsLabel').style.display = 'block';
    }
    // 初始化当前回合数
    document.getElementById('currentRound').innerText = `当前回合：1`;
}

document.getElementById('victoryCondition').addEventListener('change', (e) => {
    if (e.target.value === 'score') {
        document.getElementById('targetScoreLabel').style.display = 'block';
        document.getElementById('totalRoundsLabel').style.display = 'none';
    } else if (e.target.value === 'rounds') {
        document.getElementById('targetScoreLabel').style.display = 'none';
        document.getElementById('totalRoundsLabel').style.display = 'block';
    }
});

// 更新排行榜
function updateLeaderboard(data) {
    const leaderboardUl = document.getElementById('leaderboard');
    leaderboardUl.innerHTML = '';
    const sortedPlayers = Object.entries(data).sort((a, b) => b[1] - a[1]);
    sortedPlayers.forEach(([name, wins]) => {
        const li = document.createElement('li');
        li.textContent = `${name}: ${wins} 胜`;
        leaderboardUl.appendChild(li);
    });
}

// 输入验证
document.getElementById('targetScore').addEventListener('input', (e) => {
    if (e.target.value < 1) e.target.value = 1;
});

document.getElementById('totalRounds').addEventListener('input', (e) => {
    if (e.target.value < 1) e.target.value = 1;
});

function disableRoomButtons() {
    document.getElementById('createRoom').disabled = true;
    document.getElementById('joinRoom').disabled = true;
    document.getElementById('quickMatch').disabled = true;
}
