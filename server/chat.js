// chat.js

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
