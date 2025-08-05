const WebSocket = require('ws');

// Simple in-memory storage (for testing only - will reset on server restart)
const submissions = new Map();
const decisions = new Map();

const wss = new WebSocket.Server({ port: process.env.PORT || 8080 });
const activeConnections = new Map();

wss.on('connection', (ws, req) => {
  const clientId = req.headers['sec-websocket-key'];
  activeConnections.set(clientId, ws);

  // Check for pending decision
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

console.log('Server running');
