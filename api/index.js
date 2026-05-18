const express = require('express');
const cors = require('cors');
const QRCode = require('qrcode');

const app = express();
app.use(cors());
app.use(express.json());

// Simple storage
let qrCodes = [];

// ============================================
// SIMPLE TEST ENDPOINTS
// ============================================

app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', time: new Date().toISOString() });
});

app.get('/api/ping', (req, res) => {
    res.json({ message: 'pong', time: new Date().toISOString() });
});

// ============================================
// GENERATE QR CODE
// ============================================
app.post('/api/qr/generate', async (req, res) => {
    try {
        const { destinationUrl, shortCode, qrDarkColor = '#000000', qrLightColor = '#FFFFFF' } = req.body;
        
        console.log('Generate request:', { destinationUrl, shortCode });
        
        if (!destinationUrl) {
            return res.status(400).json({ error: 'Destination URL is required' });
        }
        
        const finalShortCode = shortCode || `qr_${Date.now()}`;
        
        // Generate QR code
        const qrBuffer = await QRCode.toBuffer(destinationUrl, {
            type: 'png',
            width: 500,
            margin: 2,
            color: { dark: qrDarkColor, light: qrLightColor },
            errorCorrectionLevel: 'H'
        });
        
        const qrBase64 = qrBuffer.toString('base64');
        
        // Save to memory
        qrCodes.push({
            shortCode: finalShortCode,
            destinationUrl: destinationUrl,
            createdAt: new Date().toISOString()
        });
        
        res.json({
            success: true,
            shortCode: finalShortCode,
            image: `data:image/png;base64,${qrBase64}`,
            destinationUrl: destinationUrl
        });
        
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ error: error.message });
    }
});

// ============================================
// LIST QR CODES
// ============================================
app.get('/api/qr/list', (req, res) => {
    try {
        const codes = qrCodes.map(c => ({
            short_code: c.shortCode,
            destination_url: c.destinationUrl,
            created_at: c.createdAt
        }));
        res.json({ success: true, codes });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ============================================
// UPDATE QR CODE DESTINATION
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
// DELETE QR CODE
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
// REDIRECT
// ============================================
app.get('/api/r/:shortCode', (req, res) => {
    const { shortCode } = req.params;
    const code = qrCodes.find(c => c.shortCode === shortCode);
    
    if (code) {
        res.redirect(code.destinationUrl);
    } else {
        res.redirect('https://dynamic-qr-system-xi.vercel.app/luban-coffee.html');
    }
});

module.exports = app;