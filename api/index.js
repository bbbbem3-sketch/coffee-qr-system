const express = require('express');
const cors = require('cors');
const QRCode = require('qrcode');

const app = express();
app.use(cors());
app.use(express.json());

// ============================================
// HEALTH CHECK
// ============================================
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        timestamp: new Date().toISOString(),
        message: 'QR System is running'
    });
});

// ============================================
// GENERATE QR CODE (Direct URL)
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
        
        res.json({
            success: true,
            shortCode: shortCode || 'direct',
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
// SIMPLE REDIRECT (for compatibility)
// ============================================
app.get('/api/r/:shortCode', (req, res) => {
    res.send(`
        <html>
        <body style="font-family: Arial; text-align: center; padding: 50px;">
            <h1>☕ QR Code System</h1>
            <p>This QR code uses direct URL encoding.</p>
            <p>The destination is embedded directly in the QR code.</p>
            <p>Scan again with a QR reader to see the destination.</p>
        </body>
        </html>
    `);
});

module.exports = app;