cat > api/index.js << 'EOF'
const express = require('express');
const cors = require('cors');
const QRCode = require('qrcode');

const app = express();
app.use(cors());
app.use(express.json());

// In-memory storage (will persist between requests on Vercel's serverless)
let qrCodes = [];

// ============================================
// HEALTH CHECK
// ============================================
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        timestamp: new Date().toISOString(),
        message: 'QR System is running',
        codesCount: qrCodes.length
    });
});

// ============================================
// GENERATE QR CODE
// ============================================
app.post('/api/qr/generate', async (req, res) => {
    try {
        const { destinationUrl, shortCode, qrDarkColor = '#000000', qrLightColor = '#FFFFFF' } = req.body;
        
        if (!destinationUrl) {
            return res.status(400).json({ error: 'Destination URL is required' });
        }
        
        // Use the destination URL directly in the QR code
        const qrContent = destinationUrl;
        
        console.log('📱 Generating QR for:', qrContent);
        
        // Generate QR code
        const qrBuffer = await QRCode.toBuffer(qrContent, {
            type: 'png',
            width: 500,
            margin: 2,
            color: { dark: qrDarkColor, light: qrLightColor },
            errorCorrectionLevel: 'H'
        });
        
        const qrBase64 = qrBuffer.toString('base64');
        
        // Store for management
        const finalShortCode = shortCode || `code_${qrCodes.length + 1}`;
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
            scanUrl: destinationUrl
        });
        
    } catch (error) {
        console.error('Generate error:', error);
        res.status(500).json({ error: error.message });
    }
});

// ============================================
// LIST ALL CODES (for Manage tab)
// ============================================
app.get('/api/qr/list', (req, res) => {
    try {
        const codes = qrCodes.map(c => ({
            short_code: c.shortCode,
            destination_url: c.destinationUrl,
            scan_count: c.scanCount || 0,
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
// SIMPLE REDIRECT (for compatibility)
// ============================================
app.get('/api/r/:shortCode', (req, res) => {
    const { shortCode } = req.params;
    const code = qrCodes.find(c => c.shortCode === shortCode);
    
    if (code) {
        res.redirect(code.destinationUrl);
    } else {
        res.send(`
            <html>
            <body style="font-family: Arial; text-align: center; padding: 50px;">
                <h1>☕ Luban Coffee</h1>
                <p>QR Code: ${shortCode}</p>
                <p>This QR code uses direct URL encoding.</p>
                <a href="/test.html">Generate new QR codes</a>
            </body>
            </html>
        `);
    }
});

module.exports = app;
EOF