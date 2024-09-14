// public/uno/client.js

const socket = io();

let roomId = null;
let players = {};
let currentRoomOwner = null;
let gameState = null;
let playerHand = [];

// 尝试从localStorage中获取用户名
let playerName = localStorage.getItem('playerName');
if (!playerName || playerName.trim() === '') {
  playerName = prompt('请输入你的昵称：');
  if (!playerName || playerName.trim() === '') {
    playerName = '玩家' + Math.floor(Math.random() * 1000);
  }
  // 将用户名存储到localStorage
  localStorage.setItem('playerName', playerName);
}
socket.emit('setPlayerName', playerName);

// 更新在线玩家数量
socket.on('updateOnlineUsers', (count) => {
  document.getElementById('onlineUsers').innerText = `在线玩家：${count}`;
});

// 更新在线用户列表（如果需要，可以添加对应的 HTML 和处理逻辑）

// 创建房间
document.getElementById('createRoom').addEventListener('click', () => {
  socket.emit('createRoom', 'uno', {}, (id) => {
    roomId = id;
    document.getElementById('roomId').innerText = `房间 ID: ${roomId}`;
    alert(`房间已创建，房间 ID: ${roomId}`);
    document.getElementById('startGameContainer').style.display = 'block';
    document.getElementById('leaveRoom').style.display = 'block';
    disableRoomButtons();
    socket.emit('requestPlayerList', roomId);
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
  socket.emit('quickMatch', 'uno', (roomIdReceived, settings) => {
    roomId = roomIdReceived;
    document.getElementById('roomId').innerText = `房间 ID: ${roomId}`;
    alert(`已加入房间，房间 ID: ${roomId}`);
    document.getElementById('leaveRoom').style.display = 'block';
    disableRoomButtons();
    socket.emit('requestPlayerList', roomId);
  });
});

function joinRoomById(roomIdToJoin) {
  if (roomId) {
    alert('您已经在房间中，无法加入其他房间');
    return;
  }
  socket.emit('joinRoom', roomIdToJoin, (success, gameType, settings) => {
    if (success) {
      if (gameType !== 'uno') {
        alert('该房间不是 UNO 游戏');
        return;
      }
      roomId = roomIdToJoin;
      document.getElementById('roomId').innerText = `房间 ID: ${roomId}`;
      alert(`已加入房间，房间 ID: ${roomId}`);
      document.getElementById('leaveRoom').style.display = 'block';
      disableRoomButtons();
      socket.emit('requestPlayerList', roomId);
    } else {
      alert('加入房间失败，房间不存在');
    }
  });
}

// 请求玩家列表和房主信息
socket.on('receivePlayerList', (data) => {
  players = data.players;
  currentRoomOwner = data.roomOwner;
  updatePlayerList();
  document.getElementById('playerCount').innerText = `玩家人数：${Object.keys(players).length}`;

  // 根据房主身份显示或隐藏“开始游戏”按钮
  if (roomId && currentRoomOwner === socket.id) {
    document.getElementById('startGameContainer').style.display = 'block';
  } else {
    document.getElementById('startGameContainer').style.display = 'none';
  }
});

// 添加对 updatePlayerList 事件的监听
socket.on('updatePlayerList', (data) => {
  players = data.players;
  currentRoomOwner = data.roomOwner;
  updatePlayerList();
  document.getElementById('playerCount').innerText = `玩家人数：${Object.keys(players).length}`;

  // 根据房主身份显示或隐藏“开始游戏”按钮
  if (roomId && currentRoomOwner === socket.id) {
    document.getElementById('startGameContainer').style.display = 'block';
  } else {
    document.getElementById('startGameContainer').style.display = 'none';
  }
});

function updatePlayerList() {
  const playersUl = document.getElementById('players');
  playersUl.innerHTML = '';
  for (const [id, name] of Object.entries(players)) {
    const isOwner = id === currentRoomOwner;
    const li = document.createElement('li');
    li.textContent = `${name}${isOwner ? ' (房主)' : ''}`;
    playersUl.appendChild(li);
  }
}

// 监听玩家离开事件
socket.on('playerLeft', (playerName) => {
  alert(`玩家 ${playerName} 离开了房间`);
});

// 监听玩家不足事件
socket.on('notEnoughPlayers', () => {
  alert('玩家不足，游戏结束');
  // 重置客户端状态
  resetClientState();
});

// 开始游戏
document.getElementById('startGame').addEventListener('click', () => {
  if (!roomId) {
    alert('请先创建或加入一个房间');
    return;
  }
  socket.emit('startGame', roomId);
});

// UNO 游戏开始
socket.on('unoGameStarted', (settings) => {
  document.getElementById('gameArea').style.display = 'block';
  document.getElementById('startGameContainer').style.display = 'none';
  document.getElementById('status').innerText = '游戏已开始！';

  // 清空手牌显示
  playerHand = [];
  updateHandCardsDisplay();

  // 清空游戏状态显示
  document.getElementById('gameStatus').innerText = '';

  // 清空弃牌堆顶牌显示
  document.getElementById('topCard').innerText = '';

  // 启用抽牌按钮
  document.getElementById('drawCard').disabled = false;
});

// 接收自己的手牌
socket.on('updateHandCards', (hand) => {
  playerHand = hand;
  updateHandCardsDisplay();
});

// UNO 游戏状态更新
socket.on('unoGameStateUpdated', (data) => {
  gameState = data.gameState;
  updateGameState();
});

// UNO 有玩家出牌
socket.on('unoCardPlayed', (data) => {
  gameState = data.gameState;
  updateGameState();
});

// UNO 游戏结束
socket.on('unoGameEnded', (data) => {
  alert(`游戏结束！获胜者：${data.winner}`);
  // 显示“重新开始”按钮
  if (currentRoomOwner === socket.id) {
    document.getElementById('restartGame').style.display = 'block';
  }
});

// 重新开始游戏
document.getElementById('restartGame').addEventListener('click', () => {
  if (roomId) {
    socket.emit('restartUnoGame', roomId);
    document.getElementById('restartGame').style.display = 'none';
  }
});

// UNO 游戏重新开始
socket.on('unoGameRestarted', (data) => {
  gameState = data.gameState;
  updateGameState();

  // 清空手牌显示
  playerHand = [];
  updateHandCardsDisplay();

  // 清空游戏状态显示
  document.getElementById('gameStatus').innerText = '';

  // 清空弃牌堆顶牌显示
  document.getElementById('topCard').innerText = '';

  // 启用抽牌按钮
  document.getElementById('drawCard').disabled = false;
});

// 更新游戏状态
function updateGameState() {
  // 更新界面上的游戏状态
  document.getElementById('gameStatus').innerText = `当前颜色：${gameState.currentColor}，当前值：${gameState.currentValue}`;
  // 更新弃牌堆顶牌
  const topCardDiv = document.getElementById('topCard');
  topCardDiv.innerHTML = '';
  const cardDiv = document.createElement('div');
  cardDiv.classList.add('card');
  cardDiv.classList.add(gameState.topCard.color || 'black');

  const valueDiv = document.createElement('div');
  valueDiv.innerText = gameState.topCard.value;
  cardDiv.appendChild(valueDiv);

  topCardDiv.appendChild(cardDiv);

  // 更新手牌和当前玩家指示
  if (gameState.currentPlayerId === socket.id) {
    document.getElementById('gameStatus').innerText += '\n轮到你了！';
    // 启用手牌点击事件和抽牌按钮
    enableHandCards();
    document.getElementById('drawCard').disabled = false;
  } else {
    document.getElementById('gameStatus').innerText += `\n等待玩家 ${players[gameState.currentPlayerId]} 出牌...`;
    // 禁用手牌点击事件和抽牌按钮
    disableHandCards();
    document.getElementById('drawCard').disabled = true;
  }
}

// 更新手牌显示
function updateHandCardsDisplay() {
  const handCardsDiv = document.getElementById('handCards');
  handCardsDiv.innerHTML = '';
  playerHand.forEach((card, index) => {
    const cardDiv = document.createElement('div');
    cardDiv.classList.add('card');
    cardDiv.classList.add(card.color || 'black');
    cardDiv.dataset.index = index;

    const valueDiv = document.createElement('div');
    valueDiv.innerText = card.value;
    cardDiv.appendChild(valueDiv);

    handCardsDiv.appendChild(cardDiv);
  });
  // 如果是玩家的回合，启用手牌点击事件
  if (gameState && gameState.currentPlayerId === socket.id) {
    enableHandCards();
  } else {
    disableHandCards();
  }
}

// 点击手牌出牌
function onCardClick(e) {
  const index = e.target.dataset.index;
  const card = playerHand[index];
  let chosenColor = null;
  if (card.type === 'wild' || card.type === 'wildDrawFour') {
    chosenColor = prompt('请选择一个颜色（red, yellow, green, blue）:');
    if (!['red', 'yellow', 'green', 'blue'].includes(chosenColor)) {
      alert('颜色选择无效');
      return;
    }
  }
  socket.emit('playCard', roomId, card, chosenColor);
}

// 抽牌
document.getElementById('drawCard').addEventListener('click', () => {
  socket.emit('drawCard', roomId);
});

// 禁用手牌点击事件
function disableHandCards() {
  const handCardsDiv = document.getElementById('handCards');
  handCardsDiv.childNodes.forEach((cardDiv) => {
    cardDiv.removeEventListener('click', onCardClick);
  });
}

// 启用手牌点击事件
function enableHandCards() {
  const handCardsDiv = document.getElementById('handCards');
  handCardsDiv.childNodes.forEach((cardDiv) => {
    cardDiv.addEventListener('click', onCardClick);
  });
}

// 退出游戏
document.getElementById('leaveRoom').addEventListener('click', () => {
  if (roomId) {
    socket.emit('leaveRoom', roomId);
    // 重置客户端状态
    resetClientState();
  }
});

function resetClientState() {
  roomId = null;
  players = {};
  currentRoomOwner = null;
  gameState = null;
  playerHand = [];
  document.getElementById('roomId').innerText = '';
  document.getElementById('playerCount').innerText = '';
  document.getElementById('players').innerHTML = '';
  document.getElementById('gameArea').style.display = 'none';
  document.getElementById('startGameContainer').style.display = 'none';
  document.getElementById('leaveRoom').style.display = 'none';
  document.getElementById('restartGame').style.display = 'none';
  enableRoomButtons();
}

function disableRoomButtons() {
  document.getElementById('createRoom').disabled = true;
  document.getElementById('joinRoom').disabled = true;
  document.getElementById('quickMatch').disabled = true;
}

function enableRoomButtons() {
  document.getElementById('createRoom').disabled = false;
  document.getElementById('joinRoom').disabled = false;
  document.getElementById('quickMatch').disabled = false;
}

// 聊天功能
document.getElementById('sendChat').addEventListener('click', () => {
  const message = document.getElementById('chatInput').value.trim();
  if (message && roomId) {
    socket.emit('sendMessage', roomId, message);
    document.getElementById('chatInput').value = '';
  }
});

socket.on('receiveMessage', (data) => {
  const { player, message } = data;
  const messagesDiv = document.getElementById('messages');
  const messageP = document.createElement('p');
  messageP.textContent = `${player}: ${message}`;
  messagesDiv.appendChild(messageP);
  messagesDiv.scrollTop = messagesDiv.scrollHeight;
});

// 显示错误信息
socket.on('errorMessage', (message) => {
  alert(message);
});

// 添加主页按钮的点击事件
document.getElementById('homeButton').addEventListener('click', () => {
  if (roomId) {
    socket.emit('leaveRoom', roomId);
  }
  // 跳转到主页
  window.location.href = '/';
});
