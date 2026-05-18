const express = require('express');
const cors = require('cors');
const QRCode = require('qrcode');
const { v4: uuidv4 } = require('uuid');

const app = express();
app.use(cors());
app.use(express.json());

// Simple in-memory storage
let qrCodes = [];

function generateShortCode(length = 8) {
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
        result += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    return result;
}

// ============================================
// HEALTH CHECK (MUST WORK)
// ============================================
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        timestamp: new Date().toISOString(),
        message: 'QR System is running'
    });
});

// ============================================
// ROOT ENDPOINT (for testing)
// ============================================
app.get('/api', (req, res) => {
    res.json({ 
        message: 'QR API is working',
        endpoints: [
            'GET  /api/health',
            'POST /api/qr/generate',
            'GET  /api/r/:code',
            'GET  /api/qr/list',
            'PUT  /api/qr/update/:code',
            'DELETE /api/qr/delete/:code'
        ]
    });
});

// ============================================
// GENERATE QR CODE
// ============================================
app.post('/api/qr/generate', async (req, res) => {
    try {
        console.log('📝 Generate request received:', req.body);
        
        const { destinationUrl, shortCode, qrDarkColor = '#000000', qrLightColor = '#FFFFFF' } = req.body;
        
        if (!destinationUrl) {
            return res.status(400).json({ error: 'Destination URL is required' });
        }
        
        let finalShortCode = shortCode || generateShortCode();
        
        // Check for duplicate
        if (qrCodes.find(c => c.shortCode === finalShortCode)) {
            return res.status(400).json({ error: 'Short code already exists' });
        }
        
        // Get base URL
        const baseUrl = process.env.VERCEL_URL 
            ? `https://${process.env.VERCEL_URL}` 
            : 'https://coffee-qr-system.vercel.app';
        
        const qrContent = `${baseUrl}/api/r/${finalShortCode}`;
        console.log('📱 QR Content:', qrContent);
        
        // Generate QR code
        const qrBuffer = await QRCode.toBuffer(qrContent, {
            type: 'png',
            width: 500,
            margin: 2,
            color: { dark: qrDarkColor, light: qrLightColor },
            errorCorrectionLevel: 'H'
        });
        
        const qrBase64 = qrBuffer.toString('base64');
        
        // Store in memory
        qrCodes.push({
            shortCode: finalShortCode,
            destinationUrl,
            scanCount: 0,
            createdAt: new Date().toISOString(),
            qrDarkColor,
            qrLightColor
        });
        
        res.json({
            success: true,
            shortCode: finalShortCode,
            qrImage: `data:image/png;base64,${qrBase64}`,
            destinationUrl: destinationUrl,
            scanUrl: qrContent
        });
        
    } catch (error) {
        console.error('❌ Generate error:', error);
        res.status(500).json({ error: error.message });
    }
});

// ============================================
// REDIRECT ENDPOINT
// ============================================
app.get('/api/r/:shortCode', (req, res) => {
    try {
        const { shortCode } = req.params;
        console.log('📱 Scan request for:', shortCode);
        
        const qrData = qrCodes.find(c => c.shortCode === shortCode);
        
        if (!qrData) {
            return res.status(404).send(`
                <html>
                <body style="font-family: Arial; text-align: center; padding: 50px;">
                    <h1>❌ QR Code Not Found</h1>
                    <p>Code "${shortCode}" does not exist.</p>
                </body>
                </html>
            `);
        }
        
        qrData.scanCount++;
        console.log(`🔄 Redirecting ${shortCode} → ${qrData.destinationUrl}`);
        res.redirect(qrData.destinationUrl);
        
    } catch (error) {
        console.error('❌ Redirect error:', error);
        res.status(500).send('Server error');
    }
});

// ============================================
// LIST ALL CODES
// ============================================
app.get('/api/qr/list', (req, res) => {
    try {
        const codes = qrCodes.map(c => ({
            short_code: c.shortCode,
            destination_url: c.destinationUrl,
            scan_count: c.scanCount,
            created_at: c.createdAt
        }));
        res.json({ success: true, codes });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ============================================
// UPDATE DESTINATION
// ============================================
app.put('/api/qr/update/:shortCode', (req, res) => {
    try {
        const { shortCode } = req.params;
        const { destinationUrl } = req.body;
        
        const code = qrCodes.find(c => c.shortCode === shortCode);
        if (!code) {
            return res.status(404).json({ error: 'Code not found' });
        }
        
        code.destinationUrl = destinationUrl;
        res.json({ success: true, message: `Updated ${shortCode}` });
        
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ============================================
// DELETE CODE
// ============================================
app.delete('/api/qr/delete/:shortCode', (req, res) => {
    try {
        const { shortCode } = req.params;
        const index = qrCodes.findIndex(c => c.shortCode === shortCode);
        
        if (index === -1) {
            return res.status(404).json({ error: 'Code not found' });
        }
        
        qrCodes.splice(index, 1);
        res.json({ success: true, message: `Deleted ${shortCode}` });
        
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ============================================
// GET STATS
// ============================================
app.get('/api/qr/stats/:shortCode', (req, res) => {
    try {
        const { shortCode } = req.params;
        const code = qrCodes.find(c => c.shortCode === shortCode);
        res.json({ 
            success: true, 
            stats: { total_scans: code?.scanCount || 0 }
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ============================================
// EXPORT FOR VERCEL
// ============================================
module.exports = app;