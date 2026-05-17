// database.js
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const db = new sqlite3.Database(path.join(__dirname, 'qr_codes.db'));

// Initialize database tables
db.serialize(() => {
    // QR codes table
    db.run(`
        CREATE TABLE IF NOT EXISTS qr_codes (
            id TEXT PRIMARY KEY,
            short_code TEXT UNIQUE NOT NULL,
            destination_url TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            scan_count INTEGER DEFAULT 0,
            status TEXT DEFAULT 'active'
        )
    `);
    
    // Scan logs table
    db.run(`
        CREATE TABLE IF NOT EXISTS scan_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            short_code TEXT NOT NULL,
            scanned_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            ip_address TEXT,
            user_agent TEXT,
            referrer TEXT
        )
    `);
    
    console.log('✅ Database initialized');
});

// Helper functions
const dbHelpers = {
    // Create new QR code
    createQRCode: (id, shortCode, destinationUrl) => {
        return new Promise((resolve, reject) => {
            db.run(
                `INSERT INTO qr_codes (id, short_code, destination_url) VALUES (?, ?, ?)`,
                [id, shortCode, destinationUrl],
                (err) => {
                    if (err) reject(err);
                    else resolve();
                }
            );
        });
    },
    
    // Get destination by short code
    getDestination: (shortCode) => {
        return new Promise((resolve, reject) => {
            db.get(
                `SELECT destination_url, id FROM qr_codes WHERE short_code = ? AND status = 'active'`,
                [shortCode],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                }
            );
        });
    },
    
    // Update destination URL
    updateDestination: (shortCode, newUrl) => {
        return new Promise((resolve, reject) => {
            db.run(
                `UPDATE qr_codes SET destination_url = ?, updated_at = CURRENT_TIMESTAMP WHERE short_code = ?`,
                [newUrl, shortCode],
                (err) => {
                    if (err) reject(err);
                    else resolve();
                }
            );
        });
    },
    
    // Increment scan count
    incrementScanCount: (shortCode) => {
        db.run(
            `UPDATE qr_codes SET scan_count = scan_count + 1 WHERE short_code = ?`,
            [shortCode]
        );
    },
    
    // Log scan
    logScan: (shortCode, ip, userAgent, referrer) => {
        db.run(
            `INSERT INTO scan_logs (short_code, ip_address, user_agent, referrer) VALUES (?, ?, ?, ?)`,
            [shortCode, ip, userAgent, referrer]
        );
    },
    
    // Get all QR codes
    getAllQRCodes: () => {
        return new Promise((resolve, reject) => {
            db.all(
                `SELECT short_code, destination_url, created_at, updated_at, scan_count, status FROM qr_codes ORDER BY created_at DESC`,
                (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows);
                }
            );
        });
    },
    
    // Delete QR code
    deleteQRCode: (shortCode) => {
        return new Promise((resolve, reject) => {
            db.run(
                `DELETE FROM qr_codes WHERE short_code = ?`,
                [shortCode],
                (err) => {
                    if (err) reject(err);
                    else resolve();
                }
            );
        });
    },
    
    // Get scan statistics
    getStats: (shortCode) => {
        return new Promise((resolve, reject) => {
            db.get(
                `SELECT 
                    COUNT(*) as total_scans,
                    DATE(scanned_at) as scan_date
                 FROM scan_logs 
                 WHERE short_code = ? 
                 GROUP BY DATE(scanned_at)
                 ORDER BY scan_date DESC
                 LIMIT 30`,
                [shortCode],
                (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows);
                }
            );
        });
    }
};

module.exports = dbHelpers;