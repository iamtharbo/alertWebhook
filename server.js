const WebSocket = require('ws');
const http = require('http');
const axios = require('axios');

const PORT = process.env.PORT || 8090;
const server = http.createServer();
const wss = new WebSocket.Server({ server });

const clients = new Map();
const sockets = {};
 
const API_BASE_URL = process.env.API_BASE_URL || 'https://mha777.com/dev/autotran/socket/';

wss.on('connection', (ws) => {
  console.log('New WebSocket connection');

  ws.on('message', async (message) => {
    try {
      const data = JSON.parse(message);
      if (data.type === 'auth') {
        const { username, role } = data;
        if (!username || !role) {
          return ws.send(JSON.stringify({ status: 'error', message: 'err data' }));
        }

        clients.set(ws, { username, role });
        sockets[username] = ws;

        ws.send(JSON.stringify({ status: 'success', message: `loggedin as ${username}` }));
        await sendUnreadMessages(ws, username, role);
        return;
      }

      if (data.type === 'message') {
        const senderInfo = clients.get(ws);
        const sender = senderInfo?.username;
        const role = senderInfo?.role;
        const { message: msg, receiver } = data;

        if (!sender || !msg || !receiver) {
          return ws.send(JSON.stringify({ status: 'error', message: 'err message data' }));
        }
 
        const response = await axios.post(`${API_BASE_URL}/store_message.php`, {
          sender,
          receiver,
          message: msg,
          is_read: false,
        });

        if (response.data.status !== 'success') {
          throw new Error(response.data.message || 'err store message');
        }

        const payload = {
          sender,
          receiver,
          message: msg,
          sent_at: new Date().toISOString().slice(0, 19).replace('T', ' '),
        };

        const target = sockets[receiver];
        if (target && target.readyState === WebSocket.OPEN) {
          target.send(JSON.stringify(payload)); 
          await axios.post(`${API_BASE_URL}/update_message_read.php`, {
            sender,
            receiver,
            message: msg,
          });
        }

        ws.send(JSON.stringify(payload));
        return;
      }
    } catch (e) {
      console.error('Error message:', e.message);
      ws.send(JSON.stringify({ status: 'error', message: 'sr err' }));
    }
  });

  ws.on('close', () => {
    const user = clients.get(ws)?.username;
    if (user) {
      delete sockets[user];
      console.log(`User ${user} dc`);
    }
    clients.delete(ws);
  });

  ws.on('error', (error) => {
    console.error('socket err:', error.message);
  });
});

async function sendUnreadMessages(ws, username, role) {
  try {
    const receiver = role === 'admin' ? 'admin' : username;
 
    const response = await axios.post(`${API_BASE_URL}/get_unread_messages.php`, {
      receiver,
    });

    if (response.data.status !== 'success') {
      throw new Error(response.data.message || 'Failed to fetch unread messages');
    }

    const messages = response.data.messages || [];
    for (const msg of messages) {
      ws.send(JSON.stringify(msg));
    }
  } catch (e) {
    console.error('err unread messages:', e.message);
  }
}

async function startServer() {
  server.listen(PORT, () => {
    console.log(`socket running ${PORT}`);
  });
}

startServer();