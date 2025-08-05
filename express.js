// admin-server.js
require('dotenv').config(); // Load environment variables from .env file

const express = require('express');
const mysql = require('mysql2/promise'); // Use promise-based version for async/await
const path = require('path');

const app = express();

// --- Database Configuration ---
const DB_HOST = process.env.DB_HOST || 'localhost';
const DB_USER = process.env.DB_USER || 'your_mysql_user';
const DB_PASSWORD = process.env.DB_PASSWORD || 'your_mysql_password';
const DB_NAME = process.env.DB_NAME || 'form_submissions_db';

// --- Server Configuration ---
const ADMIN_PORT = process.env.PORT || 3000; // Render will provide a PORT

let pool; // Database connection pool

// Function to initialize the database connection pool
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
        console.log('Successfully connected to MySQL database pool for Admin Panel!');
    } catch (err) {
        console.error('Failed to connect to MySQL database for Admin Panel:', err);
        process.exit(1);
    }
}

// Initialize the DB pool when the server starts
initializeDbPool();

// Serve static files (like CSS if you add any)
app.use(express.static(path.join(__dirname, 'public')));

// Route to display all form submissions
app.get('/', async (req, res) => {
    let connection;
    try {
        connection = await pool.getConnection();
        const [rows] = await connection.execute('SELECT * FROM form_submissions ORDER BY submission_time DESC');

        let htmlContent = `
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Form Submissions Admin</title>
                <script src="https://cdn.tailwindcss.com"></script>
                <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
                <style>
                    body {
                        font-family: 'Inter', sans-serif;
                        background-color: #f3f4f6;
                        color: #333;
                        padding: 2rem;
                    }
                    .container {
                        max-width: 1000px;
                        margin: 0 auto;
                        background-color: #ffffff;
                        padding: 2rem;
                        border-radius: 0.75rem;
                        box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
                    }
                    h1 {
                        font-size: 2.25rem;
                        font-weight: 700;
                        color: #1f2937;
                        margin-bottom: 1.5rem;
                        text-align: center;
                    }
                    table {
                        width: 100%;
                        border-collapse: collapse;
                        margin-top: 1.5rem;
                    }
                    th, td {
                        padding: 0.75rem;
                        border: 1px solid #e5e7eb;
                        text-align: left;
                    }
                    th {
                        background-color: #f9fafb;
                        font-weight: 600;
                        color: #4b5563;
                    }
                    tr:nth-child(even) {
                        background-color: #f9fafb;
                    }
                    .status-approved {
                        color: #059669; /* Green */
                        font-weight: 500;
                    }
                    .status-denied {
                        color: #dc2626; /* Red */
                        font-weight: 500;
                    }
                    .status-pending {
                        color: #f59e0b; /* Amber */
                        font-weight: 500;
                    }
                </style>
            </head>
            <body>
                <div class="container">
                    <h1>Form Submissions Admin Panel</h1>
                    <table>
                        <thead>
                            <tr>
                                <th>ID</th>
                                <th>Name</th>
                                <th>Email</th>
                                <th>Message</th>
                                <th>Submitted At</th>
                                <th>Status</th>
                                <th>Decision At</th>
                                <th>Reason</th>
                            </tr>
                        </thead>
                        <tbody>
        `;

        if (rows.length === 0) {
            htmlContent += `<tr><td colspan="8" class="text-center py-4">No submissions yet.</td></tr>`;
        } else {
            rows.forEach(row => {
                const submissionTime = row.submission_time ? new Date(row.submission_time).toLocaleString() : 'N/A';
                const decisionTime = row.decision_time ? new Date(row.decision_time).toLocaleString() : 'N/A';
                const statusClass = `status-${row.status.toLowerCase()}`;

                htmlContent += `
                    <tr>
                        <td>${row.id}</td>
                        <td>${row.name}</td>
                        <td>${row.email}</td>
                        <td>${row.message}</td>
                        <td>${submissionTime}</td>
                        <td class="${statusClass}">${row.status.toUpperCase()}</td>
                        <td>${decisionTime}</td>
                        <td>${row.approval_reason || 'N/A'}</td>
                    </tr>
                `;
            });
        }

        htmlContent += `
                        </tbody>
                    </table>
                </div>
            </body>
            </html>
        `;

        res.send(htmlContent);

    } catch (err) {
        console.error('Error fetching data from database:', err);
        res.status(500).send('<h1>Error loading submissions</h1><p>Could not retrieve data from the database.</p>');
    } finally {
        if (connection) {
            connection.release(); // Release the connection back to the pool
        }
    }
});

app.listen(ADMIN_PORT, () => {
    console.log(`Admin panel server listening on http://localhost:${ADMIN_PORT}`);
    console.log(`Access admin panel at http://localhost:${ADMIN_PORT}`);
});

// Handle graceful shutdown
process.on('SIGINT', async () => {
    console.log('Shutting down Admin panel server...');
    if (pool) {
        pool.end(err => {
            if (err) console.error('Error closing DB pool for admin:', err);
            else console.log('MySQL connection pool for admin closed.');
            process.exit(0);
        });
    } else {
        process.exit(0);
    }
});
