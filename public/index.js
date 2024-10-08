// public/index.js

const socket = io();

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

// 添加修改昵称的按钮和功能
document.getElementById('changeNameButton').addEventListener('click', () => {
    playerName = prompt('请输入新的昵称：');
    if (!playerName || playerName.trim() === '') {
        playerName = '玩家' + Math.floor(Math.random() * 1000);
    }
    localStorage.setItem('playerName', playerName);
    socket.emit('setPlayerName', playerName);
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
            onlineUsersUl.appendChild(li);
        }
    }
});

// 更新排行榜
fetch('/leaderboard')
    .then((response) => response.json())
    .then((data) => {
        updateLeaderboard(data);
    });

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
