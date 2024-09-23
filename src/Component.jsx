// src/Component.jsx
import io from 'socket.io-client'
import React, { useEffect, useState } from 'react';
import { Home, Gamepad2, Users, Trophy, User, ChevronRight } from 'lucide-react';

const GameCard = ({ title, image, notifications, link }) => (
    <div className="relative rounded-2xl overflow-hidden" onClick={() => window.location.href = link}>
        <img src={image} alt={title} className="w-full h-full object-cover" />
        {notifications && (
            <div className="absolute top-2 left-2 bg-orange-500 text-white text-xs font-bold px-2 py-1 rounded-full">
                {notifications}
            </div>
        )}
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black to-transparent p-2">
            <h3 className="text-white text-sm font-bold">{title}</h3>
        </div>
    </div>
);

const AvailableRoomItem = ({ title, image, players, onClick }) => (
    <div className="flex items-center bg-gray-800 rounded-xl p-2 mb-2" onClick={onClick}>
        <img src={image} alt={title} className="w-12 h-12 rounded-lg mr-3" />
        <div className="flex-1">
            <h3 className="text-white text-sm font-bold">{title}</h3>
            <p className="text-gray-400 text-xs">{players} players</p>
        </div>
        <ChevronRight className="w-5 h-5 text-gray-400" />
    </div>
);

const OnlinePlayerItem = ({ name, avatar, status }) => (
    <div className="flex items-center mr-4">
        <div className="relative">
            <img src={avatar} alt={name} className="w-10 h-10 rounded-full" />
            <div className={`absolute bottom-0 right-0 w-3 h-3 rounded-full ${status === 'online' ? 'bg-green-500' : 'bg-gray-500'}`}></div>
        </div>
        <span className="ml-2 text-sm text-white">{name}</span>
    </div>
);

export default function Component() {
    const [onlinePlayers, setOnlinePlayers] = useState([]);
    const [availableRooms, setAvailableRooms] = useState([]);

    useEffect(() => {
        const socket = io();
        socket.on('updateOnlineUserList', (userList) => {
            const onlineUsersArray = Object.values(userList).map((name) => ({
                name,
                avatar: null,
                status: 'online',
            }));
            setOnlinePlayers(onlineUsersArray);
        });

        socket.on('updateRoomList', (roomList) => {
            const roomsArray = Object.values(roomList).map((room) => ({
                id: room.id,
                gameType: room.gameType,
                players: room.players,
                maxPlayers: room.gameType === 'rps' ? 4 : 8,
            }));
            setAvailableRooms(roomsArray);
        });
        // 组件卸载时断开连接
        return () => {
            socket.disconnect();
        };

        // 从服务器获取在线用户
        fetch('/api/online-users')
            .then((response) => response.json())
            .then((data) => {
                setOnlinePlayers(data);
            });

        // 从服务器获取可用房间
        fetch('/api/rooms')
            .then((response) => response.json())
            .then((data) => {
                setAvailableRooms(data);
            });


    }, []);

    return (
        <div className="bg-gray-900 min-h-screen text-white p-4 pt-12">
            {/* 用户头像 */}
            <div className="flex justify-end mb-6">
                <img
                    src="/images/default-avatar.png"
                    alt="Profile"
                    className="w-8 h-8 rounded-full"
                />
            </div>

            {/* 菜单 */}
            <div className="flex space-x-4 mb-6 overflow-x-auto pb-2">
                <button className="bg-orange-500 text-white px-4 py-2 rounded-full text-sm font-bold">
                    GAME
                </button>
                {/* 其他菜单项... */}
            </div>

            {/* 游戏列表 */}
            <div className="grid grid-cols-2 gap-4 mb-8">
                <GameCard
                    title="石头剪刀布"
                    image="/images/rps.jpg"
                    link="/rps/index.html"
                />
                <GameCard
                    title="UNO"
                    image="/images/uno.jpg"
                    link="/uno/index.html"
                />
            </div>

            {/* 在线玩家 */}
            <div className="mb-8">
                <h2 className="text-lg font-bold mb-4">在线玩家</h2>
                <div className="flex overflow-x-auto pb-2">
                    {onlinePlayers.map((player, index) => (
                        <OnlinePlayerItem key={index} name={player.name} avatar={player.avatar || '/images/default-avatar.png'} status="online" />
                    ))}
                </div>
            </div>

            {/* 可用房间 */}
            <div className="mb-20">
                <div className="flex justify-between items-center mb-4">
                    <h2 className="text-lg font-bold">可用房间</h2>
                    <button className="text-orange-500 text-sm">查看全部</button>
                </div>
                <div className="space-y-2">
                    {availableRooms.map((room, index) => (
                        <AvailableRoomItem
                            key={index}
                            title={`房间 ${room.id}`}
                            image="/images/room-icon.jpg"
                            players={`${Object.keys(room.players).length}/${room.maxPlayers}`}
                            onClick={() => window.location.href = `/room/${room.id}`}
                        />
                    ))}
                </div>
            </div>

            {/* 底部导航 */}
            <div className="fixed bottom-0 left-0 right-0 bg-gray-800 p-4 flex justify-between items-center">
                <button className="flex flex-col items-center">
                    <Home className="w-6 h-6 text-orange-500" />
                    <span className="text-orange-500 text-xs mt-1">主页</span>
                </button>
                {/* 其他导航项... */}
            </div>
        </div>
    );
}
