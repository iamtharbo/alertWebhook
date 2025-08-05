// websocket-server.js
const WebSocket = require('ws');
const mysql = require('mysql2/promise');
const uuid = require('uuid');

// MySQL connection pool
const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10
});

const wss = new WebSocket.Server({ port: process.env.PORT || 8080 });

// Track connected clients and their roles
const clients = new Map();

wss.on('connection', (ws, req) => {
  const clientId = uuid.v4();
  console.log(`New connection: ${clientId}`);
  
  // Determine if this is an admin connection (simple example - in production use proper auth)
  const isAdmin = req.url.includes('?admin=true');
  
  clients.set(clientId, { ws, isAdmin });
  
  if (isAdmin) {
    // Send pending submissions to admin
    sendPendingSubmissions(ws);
  }
  
  ws.on('message', async (message) => {
    try {
      const data = JSON.parse(message);
      
      if (isAdmin) {
        // Handle admin actions
        if (data.action === 'approve' || data.action === 'deny') {
          await handleAdminDecision(data.submissionId, data.action, clientId);
        }
      } else {
        // Handle form submission from regular client
        await handleFormSubmission(data, clientId);
      }
    } catch (error) {
      console.error('Error processing message:', error);
      ws.send(JSON.stringify({
        type: 'error',
        message: 'Error processing your request'
      }));
    }
  });
  
  ws.on('close', () => {
    console.log(`Client disconnected: ${clientId}`);
    clients.delete(clientId);
  });
});

async function handleFormSubmission(formData, clientId) {
  const client = clients.get(clientId);
  
  // Store form in MySQL
  const [result] = await pool.execute(
    'INSERT INTO form_submissions (form_data, status, client_id) VALUES (?, ?, ?)',
    [JSON.stringify(formData), 'pending', clientId]
  );
  
  const submissionId = result.insertId;
  
  // Send acknowledgment to submitter
  client.ws.send(JSON.stringify({
    type: 'acknowledge',
    submissionId,
    message: 'Form received and pending approval'
  }));
  
  // Notify all admins about new submission
  notifyAdminsOfNewSubmission(submissionId, formData);
}

async function handleAdminDecision(submissionId, decision, adminClientId) {
  const status = decision === 'approve' ? 'approved' : 'denied';
  
  // Update status in database
  await pool.execute(
    'UPDATE form_submissions SET status = ? WHERE id = ?',
    [status, submissionId]
  );
  
  // Get the submission details
  const [rows] = await pool.execute(
    'SELECT client_id, form_data FROM form_submissions WHERE id = ?',
    [submissionId]
  );
  
  if (rows.length === 0) return;
  
  const submission = rows[0];
  const clientId = submission.client_id;
  
  // Notify the original submitter
  if (clients.has(clientId)) {
    const submitter = clients.get(clientId);
    submitter.ws.send(JSON.stringify({
      type: 'decision',
      submissionId,
      status,
      message: `Your form has been ${status}!`
    }));
    
    // Close connection after short delay
    setTimeout(() => submitter.ws.close(), 1000);
  }
  
  // Notify all admins about the decision
  notifyAdminsOfDecision(submissionId, status, adminClientId);
}

async function sendPendingSubmissions(adminWs) {
  const [submissions] = await pool.execute(
    'SELECT id, form_data FROM form_submissions WHERE status = ?',
    ['pending']
  );
  
  adminWs.send(JSON.stringify({
    type: 'initial_submissions',
    submissions: submissions.map(sub => ({
      id: sub.id,
      data: JSON.parse(sub.form_data)
    }))
  }));
}

function notifyAdminsOfNewSubmission(submissionId, formData) {
  clients.forEach((client, clientId) => {
    if (client.isAdmin) {
      client.ws.send(JSON.stringify({
        type: 'new_submission',
        submissionId,
        data: formData
      }));
    }
  });
}

function notifyAdminsOfDecision(submissionId, status, adminClientId) {
  clients.forEach((client, clientId) => {
    if (client.isAdmin && clientId !== adminClientId) {
      client.ws.send(JSON.stringify({
        type: 'submission_decision',
        submissionId,
        status
      }));
    }
  });
}

console.log('WebSocket server running on ws://localhost:8080');
