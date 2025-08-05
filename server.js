const WebSocket = require('ws');
const Redis = require('ioredis');

// Connect to Redis (add Redis in Render dashboard)
const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

const wss = new WebSocket.Server({ port: process.env.PORT || 8080 });

// Track active connections
const activeConnections = new Map();

wss.on('connection', (ws, req) => {
  const clientId = req.headers['sec-websocket-key'];
  activeConnections.set(clientId, ws);
  
  console.log(`Client connected: ${clientId}`);

  // Check for pending decisions when reconnecting
  redis.get(`decision:${clientId}`).then(decision => {
    if (decision) {
      ws.send(JSON.stringify({ 
        type: 'decision', 
        status: decision,
        message: `Your submission was ${decision} while you were offline`
      }));
      redis.del(`decision:${clientId}`);
    }
  });

  ws.on('message', async (message) => {
    try {
      const data = JSON.parse(message);
      
      if (data.type === 'submit') {
        // Store submission in Redis for 24 hours
        await redis.set(
          `submission:${clientId}`,
          JSON.stringify(data.formData),
          'EX', 86400 // 24h TTL
        );
        
        console.log(`New submission from ${clientId}`);
        notifyAdmins(clientId, data.formData);
        
        ws.send(JSON.stringify({
          type: 'acknowledge',
          message: 'Form received. You can leave this page - we\'ll notify you later.',
          clientId // Send back their ID for reconnection
        }));
      }
      
      if (data.type === 'admin_decision' && data.clientId) {
        // Store the admin's decision
        await redis.set(
          `decision:${data.clientId}`,
          data.decision,
          'EX', 86400
        );
        
        // Notify user if still connected
        if (activeConnections.has(data.clientId)) {
          activeConnections.get(data.clientId).send(JSON.stringify({
            type: 'decision',
            status: data.decision,
            message: `Your submission was ${data.decision}`
          }));
        }
      }
      
    } catch (err) {
      console.error('Error:', err);
    }
  });

  ws.on('close', () => {
    activeConnections.delete(clientId);
    console.log(`Client disconnected: ${clientId}`);
  });
});

function notifyAdmins(clientId, formData) {
  // Broadcast to all admin connections
  activeConnections.forEach((ws, id) => {
    if (id.includes('admin')) { // Simple admin check
      ws.send(JSON.stringify({
        type: 'new_submission',
        clientId,
        formData
      }));
    }
  });
}

console.log('WebSocket server running');
