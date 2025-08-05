const http = require('http');
const WebSocket = require('ws');

const server = http.createServer((req, res) => {
  res.writeHead(200);
  res.end('WebSocket server running');
});

const wss = new WebSocket.Server({ noServer: true });

const allowedOrigins = ['https://mha777.com']; // add your allowed origins here

server.on('upgrade', (request, socket, head) => {
  const origin = request.headers.origin;
  if (!allowedOrigins.includes(origin)) {
    socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
    socket.destroy();
    return;
  }

  wss.handleUpgrade(request, socket, head, (ws) => {
    wss.emit('connection', ws, request);
  });
});

const activeConnections = new Map();
const submissions = new Map();
const decisions = new Map();

wss.on('connection', (ws, req) => {
  const clientId = req.headers['sec-websocket-key'];
  activeConnections.set(clientId, ws);

  if (decisions.has(clientId)) {
    ws.send(JSON.stringify({
      type: 'decision',
      status: decisions.get(clientId),
      message: `Your submission was ${decisions.get(clientId)}`
    }));
    decisions.delete(clientId);
  }

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);

      if (data.type === 'submit') {
        submissions.set(clientId, data.formData);
        notifyAdmins(clientId, data.formData);
        ws.send(JSON.stringify({
          type: 'acknowledge',
          message: 'Form received',
          clientId
        }));
      }

      if (data.type === 'admin_decision') {
        decisions.set(data.clientId, data.decision);
        if (activeConnections.has(data.clientId)) {
          activeConnections.get(data.clientId).send(JSON.stringify({
            type: 'decision',
            status: data.decision
          }));
        }
      }
    } catch (err) {
      console.error('Error:', err);
    }
  });

  ws.on('close', () => {
    activeConnections.delete(clientId);
  });
});

function notifyAdmins(clientId, formData) {
  activeConnections.forEach((ws, id) => {
    if (id.includes('admin')) {
      ws.send(JSON.stringify({
        type: 'new_submission',
        clientId,
        formData
      }));
    }
  });
}

const PORT = process.env.PORT || 8080;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
