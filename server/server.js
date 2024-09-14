// server/server.js

const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const gameLogic = require('./gameLogic'); // 石头剪刀布的游戏逻辑
const unoGameLogic = require('./unoGameLogic'); // UNO 游戏的逻辑
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

    // 尝试从客户端获取昵称
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
    socket.on('createRoom', (gameType, settings, callback) => {
        const roomId = generateRoomId();
        rooms[roomId] = {
            gameType: gameType, // 游戏类型
            players: {},
            status: {},
            settings: settings,
            roomOwner: socket.id, // 设置房主
        };
        // 根据游戏类型初始化游戏数据
        if (gameType === 'rps') {
            rooms[roomId].choices = {};
            rooms[roomId].scores = {};
            rooms[roomId].round = 1;
        } else if (gameType === 'uno') {
            rooms[roomId].unoGame = unoGameLogic.createGame();
        }
        socket.join(roomId);
        rooms[roomId].players[socket.id] = playerName;

        if (gameType === 'rps') {
            rooms[roomId].scores[socket.id] = 0;
        }

        availableRooms.push(roomId);

        // 更新房间列表
        roomList[roomId] = {
            id: roomId,
            gameType: gameType,
            players: rooms[roomId].players,
            settings: settings,
            roomOwner: rooms[roomId].roomOwner,
        };
        io.emit('updateRoomList', roomList);

        callback(roomId);
        io.to(roomId).emit('updatePlayerList', {
            players: rooms[roomId].players,
            roomOwner: rooms[roomId].roomOwner,
        });
        io.to(roomId).emit('updatePlayerStatus', rooms[roomId].status);
    });

    // 加入房间
    socket.on('joinRoom', (roomId, callback) => {
        if (rooms[roomId]) {
            socket.join(roomId);
            rooms[roomId].players[socket.id] = playerName;
            if (rooms[roomId].gameType === 'rps') {
                rooms[roomId].scores[socket.id] = 0;
            }
            // 更新房间列表
            roomList[roomId].players = rooms[roomId].players;
            io.emit('updateRoomList', roomList);

            callback(true, rooms[roomId].gameType, rooms[roomId].settings);
            io.to(roomId).emit('updatePlayerList', {
                players: rooms[roomId].players,
                roomOwner: rooms[roomId].roomOwner,
            });
            io.to(roomId).emit('updatePlayerStatus', rooms[roomId].status);
        } else {
            callback(false);
        }
    });

    // 快速匹配
    socket.on('quickMatch', (gameType, callback) => {
        let roomId;
        const matchingRooms = availableRooms.filter(
            (id) => rooms[id].gameType === gameType
        );
        if (matchingRooms.length > 0) {
            roomId = matchingRooms[Math.floor(Math.random() * matchingRooms.length)];
            socket.join(roomId);
            rooms[roomId].players[socket.id] = playerName;
            if (gameType === 'rps') {
                rooms[roomId].scores[socket.id] = 0;
                // 如果房间人数达到4人，从可用房间列表中移除
                if (Object.keys(rooms[roomId].players).length >= 4) {
                    const index = availableRooms.indexOf(roomId);
                    if (index !== -1) {
                        availableRooms.splice(index, 1);
                    }
                }
            }
            // 更新房间列表
            roomList[roomId].players = rooms[roomId].players;
            io.emit('updateRoomList', roomList);

            callback(roomId, rooms[roomId].settings);
            io.to(roomId).emit('updatePlayerList', {
                players: rooms[roomId].players,
                roomOwner: rooms[roomId].roomOwner,
            });
            io.to(roomId).emit('updatePlayerStatus', rooms[roomId].status);
        } else {
            const settings = defaultGameSettings(gameType);
            roomId = generateRoomId();
            rooms[roomId] = {
                gameType: gameType,
                players: {},
                status: {},
                settings: settings,
                roomOwner: socket.id,
            };
            if (gameType === 'rps') {
                rooms[roomId].choices = {};
                rooms[roomId].scores = {};
                rooms[roomId].round = 1;
            } else if (gameType === 'uno') {
                rooms[roomId].unoGame = unoGameLogic.createGame();
            }
            socket.join(roomId);
            rooms[roomId].players[socket.id] = playerName;
            if (gameType === 'rps') {
                rooms[roomId].scores[socket.id] = 0;
            }

            availableRooms.push(roomId);

            // 更新房间列表
            roomList[roomId] = {
                id: roomId,
                gameType: gameType,
                players: rooms[roomId].players,
                settings: settings,
                roomOwner: rooms[roomId].roomOwner,
            };
            io.emit('updateRoomList', roomList);

            callback(roomId, settings);
            io.to(roomId).emit('updatePlayerList', {
                players: rooms[roomId].players,
                roomOwner: rooms[roomId].roomOwner,
            });
            io.to(roomId).emit('updatePlayerStatus', rooms[roomId].status);
        }
    });

    // 客户端请求玩家列表和房主信息
    socket.on('requestPlayerList', (roomId) => {
        if (rooms[roomId]) {
            socket.emit('receivePlayerList', {
                players: rooms[roomId].players,
                roomOwner: rooms[roomId].roomOwner,
            });
        }
    });

    // 处理石头剪刀布游戏的事件
    handleRpsGameEvents(socket);

    // 处理 UNO 游戏的事件
    handleUnoGameEvents(socket);

    // 处理聊天消息
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
                if (rooms[roomId].gameType === 'rps') {
                    delete rooms[roomId].scores[socket.id];
                    delete rooms[roomId].choices[socket.id];
                } else if (rooms[roomId].gameType === 'uno') {
                    // 从游戏中移除玩家
                    unoGameLogic.removePlayer(rooms[roomId].unoGame, socket.id);
                }
                delete rooms[roomId].status[socket.id];

                // 如果离开的是房主，转移房主身份
                if (rooms[roomId].roomOwner === socket.id) {
                    const remainingPlayers = Object.keys(rooms[roomId].players);
                    if (remainingPlayers.length > 0) {
                        rooms[roomId].roomOwner = remainingPlayers[0];
                    } else {
                        // 房间没人了，删除房间
                        delete rooms[roomId];
                        delete roomList[roomId];
                        const index = availableRooms.indexOf(roomId);
                        if (index !== -1) {
                            availableRooms.splice(index, 1);
                        }
                    }
                }

                // 更新房间列表
                if (rooms[roomId]) {
                    roomList[roomId].players = rooms[roomId].players;
                    roomList[roomId].roomOwner = rooms[roomId].roomOwner;
                } else {
                    delete roomList[roomId];
                }
                io.emit('updateRoomList', roomList);

                // 向房间内所有玩家发送玩家离开的通知
                io.to(roomId).emit('playerLeft', playerName);

                // 如果房间内的玩家人数少于 2 人，发送 notEnoughPlayers 事件
                if (rooms[roomId] && Object.keys(rooms[roomId].players).length < 2) {
                    io.to(roomId).emit('notEnoughPlayers');
                }

                // 向房间内所有玩家发送更新的玩家列表
                io.to(roomId).emit('updatePlayerList', {
                    players: rooms[roomId]?.players || {},
                    roomOwner: rooms[roomId]?.roomOwner || null,
                });
            }
        }
    });
});

// 处理石头剪刀布游戏的事件
function handleRpsGameEvents(socket) {
    // 处理 startGame 事件
    socket.on('startGame', (roomId) => {
        if (rooms[roomId] && rooms[roomId].gameType === 'rps') {
            if (rooms[roomId].roomOwner !== socket.id) {
                socket.emit('errorMessage', '只有房主才能开始游戏');
                return;
            }

            // 重置游戏状态
            rooms[roomId].status = {};
            rooms[roomId].choices = {};
            rooms[roomId].round = 1;

            io.to(roomId).emit('rpsGameStarted');
            io.to(roomId).emit('updatePlayerStatus', rooms[roomId].status);
        }
    });
}

// 处理 UNO 游戏的事件
function handleUnoGameEvents(socket) {
    // 开始 UNO 游戏
    socket.on('startGame', (roomId) => {
        if (rooms[roomId] && rooms[roomId].gameType === 'uno') {
            if (rooms[roomId].roomOwner !== socket.id) {
                socket.emit('errorMessage', '只有房主才能开始游戏');
                return;
            }

            const game = rooms[roomId].unoGame;
            unoGameLogic.initializeGame(game, rooms[roomId].players);

            // 向所有玩家发送游戏开始的事件和初始游戏状态
            const gameState = unoGameLogic.getGameState(game);

            // 发送给每个玩家他们的手牌
            for (const playerId of Object.keys(rooms[roomId].players)) {
                const hand = game.players[playerId];
                io.to(playerId).emit('updateHandCards', hand);
            }

            io.to(roomId).emit('unoGameStarted', rooms[roomId].settings);
            io.to(roomId).emit('unoGameStateUpdated', { gameState });
        }
    });

    // 处理玩家出牌
    socket.on('playCard', (roomId, card, chosenColor) => {
        if (rooms[roomId] && rooms[roomId].gameType === 'uno') {
            const game = rooms[roomId].unoGame;
            const playerId = socket.id;
            const result = unoGameLogic.playCard(game, playerId, card, chosenColor);
            if (result.success) {
                // 更新手牌并发送给玩家
                const hand = game.players[playerId];
                socket.emit('updateHandCards', hand);

                // 广播游戏状态更新
                const gameState = unoGameLogic.getGameState(game);
                io.to(roomId).emit('unoCardPlayed', {
                    playerId,
                    card,
                    gameState,
                });

                // 检查是否有赢家
                if (unoGameLogic.checkWinner(game, playerId)) {
                    io.to(roomId).emit('unoGameEnded', {
                        winner: rooms[roomId].players[playerId],
                    });
                    updateLeaderboard(rooms[roomId].players[playerId]);
                }
            } else {
                socket.emit('errorMessage', result.message);
            }
        }
    });

    // 处理玩家抽牌
    socket.on('drawCard', (roomId) => {
        if (rooms[roomId] && rooms[roomId].gameType === 'uno') {
            const game = rooms[roomId].unoGame;
            const playerId = socket.id;
            const result = unoGameLogic.drawCard(game, playerId);
            if (result.success) {
                // 更新手牌并发送给玩家
                const hand = game.players[playerId];
                socket.emit('updateHandCards', hand);

                // 广播游戏状态更新
                const gameState = unoGameLogic.getGameState(game);
                io.to(roomId).emit('unoGameStateUpdated', { gameState });
            } else {
                socket.emit('errorMessage', result.message);
            }
        }
    });

    // 重新开始 UNO 游戏
    socket.on('restartUnoGame', (roomId) => {
        if (rooms[roomId] && rooms[roomId].gameType === 'uno') {
            if (rooms[roomId].roomOwner !== socket.id) {
                socket.emit('errorMessage', '只有房主才能重新开始游戏');
                return;
            }

            rooms[roomId].unoGame = unoGameLogic.createGame();
            unoGameLogic.initializeGame(rooms[roomId].unoGame, rooms[roomId].players);
            const game = rooms[roomId].unoGame;

            // 发送初始游戏状态
            const gameState = unoGameLogic.getGameState(game);

            // 发送给每个玩家他们的手牌
            for (const playerId of Object.keys(rooms[roomId].players)) {
                const hand = game.players[playerId];
                io.to(playerId).emit('updateHandCards', hand);
            }

            io.to(roomId).emit('unoGameRestarted', {
                gameState,
            });
        }
    });
}

// 生成随机房间 ID（6位数字）
function generateRoomId() {
    let roomId;
    do {
        roomId = Math.floor(100000 + Math.random() * 900000).toString();
    } while (rooms[roomId]);
    return roomId;
}

// 默认游戏设置
function defaultGameSettings(gameType) {
    if (gameType === 'rps') {
        return {
            victoryCondition: 'score',
            targetScore: 5,
            totalRounds: 5,
        };
    } else if (gameType === 'uno') {
        return {}; // UNO 游戏的默认设置
    }
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
