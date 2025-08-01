const express = require('express');
const http = require('http');
const cors = require('cors');
const { Server } = require('socket.io');
const mysql = require('mysql2/promise');

const app = express();
const server = http.createServer(app);

app.use(cors());
app.use(express.json());

let pool;
async function initDb() {
  pool = await mysql.createPool({
    host: 'mydb.render.com',
    user: 'mha7_api',
    password: 'mha7_api',
    database: 'mha7_api',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
  });
}

initDb().catch(err => {
  console.error('Failed to initialize DB connection:', err);
  process.exit(1);
});

const io = new Server(server, {
  cors: {
    origin: "*",
  }
});

io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);
});

app.post('/webhook', async (req, res) => {
  const payload = req.body;

  if (!payload || Object.keys(payload).length === 0) {
    return res.status(400).json({ success: false, message: 'Empty payload' });
  }

  try {
    await pool.query(
      'INSERT INTO form_submissions (payload, checked) VALUES (?, ?)',
      [JSON.stringify(payload), false]
    );

    io.emit('form-submitted', payload);

    res.json({ success: true, message: 'Payload stored and event emitted' });
  } catch (err) {
    console.error('Error storing webhook payload:', err);
    res.status(500).json({ success: false, message: 'Database error' });
  }
});

app.get('/pending-submissions', async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT id, payload, received_at FROM form_submissions WHERE checked = false ORDER BY received_at DESC'
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    console.error('Error fetching pending submissions:', err);
    res.status(500).json({ success: false, message: 'Database error' });
  }
});

app.post('/mark-checked', async (req, res) => {
  const { id } = req.body;
  if (!id) {
    return res.status(400).json({ success: false, message: 'Missing submission ID' });
  }

  try {
    const [result] = await pool.query(
      'UPDATE form_submissions SET checked = true WHERE id = ?',
      [id]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: 'Submission not found' });
    }
    res.json({ success: true, message: 'Marked as checked' });
  } catch (err) {
    console.error('Error marking submission checked:', err);
    res.status(500).json({ success: false, message: 'Database error' });
  }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
