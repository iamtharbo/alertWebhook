require('dotenv').config(); 
const WebSocket = require('ws');
const mysql = require('mysql2/promise'); 
const crypto = require('crypto'); 
const DB_HOST = process.env.DB_HOST || 'localhost';
const DB_USER = process.env.DB_USER || 'your_mysql_user';
const DB_PASSWORD = process.env.DB_PASSWORD || 'your_mysql_password';
const DB_NAME = process.env.DB_NAME || 'form_submissions_db'; 
const WS_PORT = process.env.PORT || 8765;
const WS_HOST = '0.0.0.0'; 

let pool; 
async function initializeDbPool() {
    try {
        pool = mysql.createPool({
            host: DB_HOST,
            user: DB_USER,
            password: DB_PASSWORD,
            database: DB_NAME,
            waitForConnections: true,
            connectionLimit: 10, 
            queueLimit: 0
        });
        console.log('Successfully connected to MySQL database pool!');
    } catch (err) {
        console.error('Failed to connect to MySQL database:', err);
        process.exit(1); 
    }
} 
initializeDbPool();

const wss = new WebSocket.Server({ host: WS_HOST, port: WS_PORT });

wss.on('listening', () => {
    console.log(`WebSocket server started on ws://${WS_HOST}:${WS_PORT}`);
});

wss.on('connection', ws => {
    console.log('Client connected');

    ws.on('message', async message => {
        console.log(`Received message: ${message}`);
        let formData;
        try {
            formData = JSON.parse(message);
        } catch (e) {
            console.error('Invalid JSON received:', e);
            ws.send(JSON.stringify({ status: 'error', message: 'Invalid JSON format.' }));
            ws.close(); 
            return;
        }

        const { name, email, message: messageContent } = formData;

        if (!name || !email || !messageContent) {
            ws.send(JSON.stringify({ status: 'error', message: 'Missing form data fields.' }));
            ws.close(); 
            return;
        }

        let connection;
        try {
            connection = await pool.getConnection(); 
            const submissionTime = new Date();
            const status = "pending";  
            const insertSql = `
                INSERT INTO form_submissions (name, email, message, submission_time, status)
                VALUES (?, ?, ?, ?, ?)
            `;
            const [insertResult] = await connection.execute(insertSql, [name, email, messageContent, submissionTime, status]);
            const submissionId = insertResult.insertId;  
            console.log(`Form data stored in DB with ID: ${submissionId}`); 
            let finalStatus;
            let reason;
            if (messageContent.toLowerCase().includes("spam")) {
                finalStatus = "denied";
                reason = "Contains 'spam' keyword.";
            } else if (messageContent.length < 10) {
                finalStatus = "denied";
                reason = "Message too short.";
            } else {
                finalStatus = "approved";
                reason = "N/A";
            } 
            const updateSql = `
                UPDATE form_submissions
                SET status = ?, approval_reason = ?, decision_time = ?
                WHERE id = ?
            `;
            await connection.execute(updateSql, [finalStatus, reason, new Date(), submissionId]);
            console.log(`Form ID ${submissionId} status updated to: ${finalStatus}`); 
            const response = {
                status: finalStatus,
                submission_id: submissionId,
                reason: reason
            };
            ws.send(JSON.stringify(response));
            console.log(`Sent response to client for ID ${submissionId}: ${response}`);

        } catch (err) {
            console.error('Database or server error:', err);
            ws.send(JSON.stringify({ status: 'error', message: `Server error: ${err.message}` }));
        } finally {
            if (connection) {
                connection.release(); 
            } 
            console.log("Closing connection for this submission.");
            ws.close();
        }
    });

    ws.on('close', (code, reason) => {
        console.log(`Client disconnected: Code ${code}, Reason: ${reason}`);
    });

    ws.on('error', error => {
        console.error('WebSocket error:', error);
    });
}); 
process.on('SIGINT', async () => {
    console.log('Shutting down WebSocket server...');
    wss.close(() => {
        console.log('WebSocket server closed.');
        if (pool) {
            pool.end(err => {
                if (err) console.error('Error closing DB pool:', err);
                else console.log('MySQL connection pool closed.');
                process.exit(0);
            });
        } else {
            process.exit(0);
        }
    });
});
