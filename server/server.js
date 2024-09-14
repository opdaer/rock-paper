// server/server.js

const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const gameLogic = require('./gameLogic');

const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// 设置静态文件目录
app.use(express.static(path.join(__dirname, '../public')));
// 如果路由不匹配，返回 index.html
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/index.html'));
});


// 存储房间信息
const rooms = {};
const availableRooms = []; // 可供匹配的房间列表

// 存储排行榜信息
let leaderboard = {};

// 从文件加载排行榜数据
const leaderboardPath = path.join(__dirname, '../leaderboard.json');
if (fs.existsSync(leaderboardPath)) {
    try {
        const data = fs.readFileSync(leaderboardPath, 'utf8');
        if (data) {
            leaderboard = JSON.parse(data);
        } else {
            leaderboard = {};
        }
    } catch (err) {
        console.error('Error parsing leaderboard.json:', err);
        leaderboard = {};
    }
} else {
    leaderboard = {};
}

let onlineUsers = 0;

io.on('connection', (socket) => {
    onlineUsers++;
    io.emit('updateOnlineUsers', onlineUsers);

    let playerName = socket.id.substr(0, 5);

    socket.on('setPlayerName', (name) => {
        playerName = name || playerName;
    });

    // 创建房间
    socket.on('createRoom', (settings, callback) => {
        const roomId = generateRoomId();
        rooms[roomId] = {
            players: {},
            choices: {},
            scores: {},
            status: {},
            settings: settings,
            round: 1,
        };
        socket.join(roomId);
        rooms[roomId].players[socket.id] = playerName;
        rooms[roomId].scores[socket.id] = 0;

        availableRooms.push(roomId);

        callback(roomId);
        io.to(roomId).emit('updatePlayerList', rooms[roomId].players);
        io.to(roomId).emit('updatePlayerStatus', rooms[roomId].status);
    });

    // 加入房间
    socket.on('joinRoom', (roomId, callback) => {
        if (rooms[roomId]) {
            socket.join(roomId);
            rooms[roomId].players[socket.id] = playerName;
            rooms[roomId].scores[socket.id] = 0;
            callback(true, rooms[roomId].settings);
            io.to(roomId).emit('updatePlayerList', rooms[roomId].players);
            io.to(roomId).emit('updatePlayerStatus', rooms[roomId].status);
        } else {
            callback(false);
        }
    });

    // 快速匹配
    socket.on('quickMatch', (callback) => {
        let roomId;
        if (availableRooms.length > 0) {
            roomId = availableRooms[Math.floor(Math.random() * availableRooms.length)];
            socket.join(roomId);
            rooms[roomId].players[socket.id] = playerName;
            rooms[roomId].scores[socket.id] = 0;

            // 如果房间人数达到4人，从可用房间列表中移除
            if (Object.keys(rooms[roomId].players).length >= 4) {
                const index = availableRooms.indexOf(roomId);
                if (index !== -1) {
                    availableRooms.splice(index, 1);
                }
            }

            callback(roomId, rooms[roomId].settings);
            io.to(roomId).emit('updatePlayerList', rooms[roomId].players);
            io.to(roomId).emit('updatePlayerStatus', rooms[roomId].status);
        } else {
            const settings = defaultGameSettings();
            roomId = generateRoomId();
            rooms[roomId] = {
                players: {},
                choices: {},
                scores: {},
                status: {},
                settings: settings,
                round: 1,
            };
            socket.join(roomId);
            rooms[roomId].players[socket.id] = playerName;
            rooms[roomId].scores[socket.id] = 0;

            availableRooms.push(roomId);

            callback(roomId, settings);
            io.to(roomId).emit('updatePlayerList', rooms[roomId].players);
            io.to(roomId).emit('updatePlayerStatus', rooms[roomId].status);
        }
    });

    // 开始游戏
    socket.on('startGame', (roomId) => {
        if (rooms[roomId]) {
            // 重置玩家状态为“思考中”
            const playerIds = Object.keys(rooms[roomId].players);
            playerIds.forEach((id) => {
                rooms[roomId].status[id] = '思考中';
            });

            // 通知客户端更新状态
            io.to(roomId).emit('updatePlayerStatus', rooms[roomId].status);

            io.to(roomId).emit('gameStarted', rooms[roomId].settings);
        }
    });

    // 玩家选择
    socket.on('makeChoice', (roomId, choice) => {
        if (rooms[roomId]) {
            rooms[roomId].choices[socket.id] = choice;
            rooms[roomId].status[socket.id] = '已出招';

            // 通知房间内的所有玩家，更新玩家状态
            io.to(roomId).emit('updatePlayerStatus', rooms[roomId].status);

            // 如果所有玩家都做出了选择
            if (
                Object.keys(rooms[roomId].choices).length ===
                Object.keys(rooms[roomId].players).length
            ) {
                // 计算结果
                const results = gameLogic.calculateResults(rooms[roomId].choices);
                // 更新分数
                for (const winnerId of results.winners) {
                    rooms[roomId].scores[winnerId] += 1;
                }

                // 检查是否达到胜利条件
                let gameEnded = false;
                if (rooms[roomId].settings.victoryCondition === 'score') {
                    const targetScore = rooms[roomId].settings.targetScore;
                    for (const [playerId, score] of Object.entries(rooms[roomId].scores)) {
                        if (score >= targetScore) {
                            gameEnded = true;
                            io.to(roomId).emit('gameEnded', {
                                winner: rooms[roomId].players[playerId],
                                scores: rooms[roomId].scores,
                            });
                            updateLeaderboard(rooms[roomId].players[playerId]);
                            break;
                        }
                    }
                } else if (rooms[roomId].settings.victoryCondition === 'rounds') {
                    if (rooms[roomId].round >= rooms[roomId].settings.totalRounds) {
                        gameEnded = true;
                        const maxScore = Math.max(...Object.values(rooms[roomId].scores));
                        const winners = [];
                        for (const [playerId, score] of Object.entries(rooms[roomId].scores)) {
                            if (score === maxScore) {
                                winners.push(rooms[roomId].players[playerId]);
                                updateLeaderboard(rooms[roomId].players[playerId]);
                            }
                        }
                        io.to(roomId).emit('gameEnded', {
                            winner: winners.join(', '),
                            scores: rooms[roomId].scores,
                        });
                    } else {
                        rooms[roomId].round += 1;
                    }
                }

                // 发送本轮结果
                io.to(roomId).emit('roundResult', {
                    choices: rooms[roomId].choices,
                    scores: rooms[roomId].scores,
                    winners: results.winners,
                    players: rooms[roomId].players,
                    round: rooms[roomId].round,
                });

                if (!gameEnded) {
                    // 清除本轮选择
                    rooms[roomId].choices = {};
                    // 重置玩家状态为“思考中”
                    const playerIds = Object.keys(rooms[roomId].players);
                    playerIds.forEach((id) => {
                        rooms[roomId].status[id] = '思考中';
                    });
                    // 通知客户端更新状态
                    io.to(roomId).emit('updatePlayerStatus', rooms[roomId].status);
                } else {
                    // 删除房间
                    delete rooms[roomId];
                    const index = availableRooms.indexOf(roomId);
                    if (index !== -1) {
                        availableRooms.splice(index, 1);
                    }
                }
            }
        }
    });

    // 聊天功能
    socket.on('sendMessage', (roomId, message) => {
        if (rooms[roomId]) {
            io.to(roomId).emit('receiveMessage', {
                player: playerName,
                message: message,
            });
        }
    });

    // 断开连接
    socket.on('disconnect', () => {
        onlineUsers--;
        io.emit('updateOnlineUsers', onlineUsers);

        for (const roomId in rooms) {
            if (rooms[roomId].players[socket.id]) {
                delete rooms[roomId].players[socket.id];
                delete rooms[roomId].scores[socket.id];
                delete rooms[roomId].choices[socket.id];
                delete rooms[roomId].status[socket.id];
                io.to(roomId).emit('playerLeft', playerName);
                // 更新玩家列表和状态
                io.to(roomId).emit('updatePlayerList', rooms[roomId].players);
                io.to(roomId).emit('updatePlayerStatus', rooms[roomId].status);

                // 如果房间没人了，删除房间
                if (Object.keys(rooms[roomId].players).length === 0) {
                    delete rooms[roomId];
                    const index = availableRooms.indexOf(roomId);
                    if (index !== -1) {
                        availableRooms.splice(index, 1);
                    }
                } else {
                    // 如果房间人数低于4人，重新添加到可用房间列表
                    if (!availableRooms.includes(roomId)) {
                        availableRooms.push(roomId);
                    }
                }
            }
        }
    });
});

// 生成随机房间 ID
function generateRoomId() {
    return Math.random().toString(36).substring(2, 8);
}

// 默认游戏设置
function defaultGameSettings() {
    return {
        victoryCondition: 'score',
        targetScore: 5,
        totalRounds: 5,
    };
}

// 更新排行榜
function updateLeaderboard(winnerName) {
    if (leaderboard[winnerName]) {
        leaderboard[winnerName] += 1;
    } else {
        leaderboard[winnerName] = 1;
    }
    // 保存排行榜数据到文件
    fs.writeFileSync(leaderboardPath, JSON.stringify(leaderboard));
}

// 获取排行榜
app.get('/leaderboard', (req, res) => {
    res.json(leaderboard);
});

// 启动服务器
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`服务器正在运行，端口：${PORT}`);
});

