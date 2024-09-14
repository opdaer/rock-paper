// server/server.js

const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const gameLogic = require('./gameLogic');
const fs = require('fs');
const cors = require('cors');

const app = express();
const server = http.createServer(app);

// 使用 CORS 中间件
app.use(cors());

// 设置静态文件目录
app.use(express.static(path.join(__dirname, '../public')));

// 如果路由不匹配，返回 index.html
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/index.html'));
});

// 初始化 Socket.IO
const io = socketIo(server, {
    cors: {
        origin: '*', // 或者指定您的客户端 URL
        methods: ['GET', 'POST']
    }
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
let onlineUserList = {}; // 在线用户列表
let roomList = {}; // 房间列表

io.on('connection', (socket) => {
    onlineUsers++;
    io.emit('updateOnlineUsers', onlineUsers);

    let playerName = socket.id.substr(0, 5);

    // 设置玩家昵称
    socket.on('setPlayerName', (name) => {
        playerName = name || playerName;
        onlineUserList[socket.id] = playerName;
        io.emit('updateOnlineUserList', onlineUserList);
    });

    // 当用户连接时，添加到在线用户列表
    onlineUserList[socket.id] = playerName;
    io.emit('updateOnlineUserList', onlineUserList);

    console.log(`新用户连接：${socket.id}，当前在线用户：${onlineUsers}`);

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

        // 更新房间列表
        roomList[roomId] = {
            id: roomId,
            players: rooms[roomId].players,
            settings: settings,
        };
        io.emit('updateRoomList', roomList);

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

            // 更新房间列表
            roomList[roomId].players = rooms[roomId].players;
            io.emit('updateRoomList', roomList);

            // 向房间内所有玩家广播更新后的玩家列表和状态
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

            // 更新房间列表
            roomList[roomId].players = rooms[roomId].players;
            io.emit('updateRoomList', roomList);

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

            // 更新房间列表
            roomList[roomId] = {
                id: roomId,
                players: rooms[roomId].players,
                settings: settings,
            };
            io.emit('updateRoomList', roomList);

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
                    // 增加当前回合数（在回合数模式下）
                    if (rooms[roomId].settings.victoryCondition === 'rounds') {
                        rooms[roomId].round += 1;
                    }

                    // 清除本轮选择
                    rooms[roomId].choices = {};
                    // 重置玩家状态为“思考中”
                    const playerIds = Object.keys(rooms[roomId].players);
                    playerIds.forEach((id) => {
                        rooms[roomId].status[id] = '思考中';
                    });
                    // 通知客户端更新状态和当前回合数
                    io.to(roomId).emit('updatePlayerStatus', rooms[roomId].status);
                    io.to(roomId).emit('updateRound', rooms[roomId].round);
                } else {
                    // 保留房间信息，等待重新开始
                    rooms[roomId].choices = {};
                    rooms[roomId].round = 1;
                    // 重置玩家状态
                    const playerIds = Object.keys(rooms[roomId].players);
                    playerIds.forEach((id) => {
                        rooms[roomId].scores[id] = 0;
                        rooms[roomId].status[id] = '等待中';
                    });
                }
            }
        }
    });

    // 玩家离开房间
    socket.on('leaveRoom', (roomId) => {
        if (rooms[roomId]) {
            socket.leave(roomId);
            const playerName = rooms[roomId].players[socket.id];
            delete rooms[roomId].players[socket.id];
            delete rooms[roomId].scores[socket.id];
            delete rooms[roomId].choices[socket.id];
            delete rooms[roomId].status[socket.id];

            // 更新房间状态
            io.to(roomId).emit('playerLeft', playerName);
            io.to(roomId).emit('updatePlayerList', rooms[roomId].players);
            io.to(roomId).emit('updatePlayerStatus', rooms[roomId].status);

            // 更新房间列表
            if (Object.keys(rooms[roomId].players).length === 0) {
                delete rooms[roomId];
                delete roomList[roomId];
                const index = availableRooms.indexOf(roomId);
                if (index !== -1) {
                    availableRooms.splice(index, 1);
                }
            } else {
                // 如果房间人数低于4人，重新添加到可用房间列表
                if (!availableRooms.includes(roomId)) {
                    availableRooms.push(roomId);
                }
                roomList[roomId].players = rooms[roomId].players;
            }
            io.emit('updateRoomList', roomList);
        }
    });

    // 重新开始游戏
    socket.on('restartGame', (roomId) => {
        if (rooms[roomId]) {
            rooms[roomId].choices = {};
            rooms[roomId].scores = {};
            rooms[roomId].status = {};
            rooms[roomId].round = 1;
            const playerIds = Object.keys(rooms[roomId].players);
            playerIds.forEach((id) => {
                rooms[roomId].scores[id] = 0;
                rooms[roomId].status[id] = '思考中';
            });
            io.to(roomId).emit('gameRestarted', rooms[roomId].settings);
            io.to(roomId).emit('updatePlayerStatus', rooms[roomId].status);
        }
    });

    // 处理游戏邀请
    socket.on('invitePlayer', (targetSocketId) => {
        io.to(targetSocketId).emit('receiveInvitation', {
            from: socket.id,
            name: playerName,
        });
    });

    // 处理接受邀请
    socket.on('acceptInvitation', (data) => {
        const { fromSocketId } = data;
        const roomId = generateRoomId();
        rooms[roomId] = {
            players: {},
            choices: {},
            scores: {},
            status: {},
            settings: defaultGameSettings(),
            round: 1,
        };
        // 两个玩家加入同一个房间
        const fromSocket = io.sockets.sockets.get(fromSocketId);
        if (fromSocket) {
            fromSocket.join(roomId);
            rooms[roomId].players[fromSocketId] = onlineUserList[fromSocketId];
            rooms[roomId].scores[fromSocketId] = 0;
        }
        socket.join(roomId);
        rooms[roomId].players[socket.id] = playerName;
        rooms[roomId].scores[socket.id] = 0;

        // 更新房间列表
        roomList[roomId] = {
            id: roomId,
            players: rooms[roomId].players,
            settings: rooms[roomId].settings,
        };
        io.emit('updateRoomList', roomList);

        // 通知双方进入房间
        if (fromSocket) {
            fromSocket.emit('invitationAccepted', { roomId, settings: rooms[roomId].settings });
        }
        socket.emit('invitationAccepted', { roomId, settings: rooms[roomId].settings });

        // 更新玩家列表和状态
        io.to(roomId).emit('updatePlayerList', rooms[roomId].players);
        io.to(roomId).emit('updatePlayerStatus', rooms[roomId].status);
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
        console.log(`用户断开连接：${socket.id}，当前在线用户：${onlineUsers}`);

        // 从在线用户列表中删除
        delete onlineUserList[socket.id];
        io.emit('updateOnlineUserList', onlineUserList);

        for (const roomId in rooms) {
            if (rooms[roomId].players[socket.id]) {
                const playerName = rooms[roomId].players[socket.id];
                delete rooms[roomId].players[socket.id];
                delete rooms[roomId].scores[socket.id];
                delete rooms[roomId].choices[socket.id];
                delete rooms[roomId].status[socket.id];
                io.to(roomId).emit('playerLeft', playerName);
                // 更新玩家列表和状态
                io.to(roomId).emit('updatePlayerList', rooms[roomId].players);
                io.to(roomId).emit('updatePlayerStatus', rooms[roomId].status);

                // 更新房间列表
                if (Object.keys(rooms[roomId].players).length === 0) {
                    delete rooms[roomId];
                    delete roomList[roomId];
                    const index = availableRooms.indexOf(roomId);
                    if (index !== -1) {
                        availableRooms.splice(index, 1);
                    }
                } else {
                    // 如果房间人数低于4人，重新添加到可用房间列表
                    if (!availableRooms.includes(roomId)) {
                        availableRooms.push(roomId);
                    }
                    roomList[roomId].players = rooms[roomId].players;
                }
                io.emit('updateRoomList', roomList);
            }
        }
    });
});

// 生成随机房间 ID（6位数字）
function generateRoomId() {
    let roomId;
    do {
        roomId = Math.floor(100000 + Math.random() * 900000).toString();
    } while (rooms[roomId]);
    return roomId;
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
