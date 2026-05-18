const express = require('express');
const cors = require('cors');
const QRCode = require('qrcode');

const app = express();
app.use(cors());
app.use(express.json());

// Storage
let qrCodes = [];

// Health check
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', time: new Date().toISOString() });
});

// Generate QR
app.post('/api/qr/generate', async (req, res) => {
    try {
        const { destinationUrl, shortCode, qrDarkColor = '#000000', qrLightColor = '#FFFFFF' } = req.body;
        
        if (!destinationUrl) {
            return res.status(400).json({ error: 'Destination URL is required' });
        }
        
        const finalShortCode = shortCode || `qr_${Date.now()}`;
        
        const qrBuffer = await QRCode.toBuffer(destinationUrl, {
            type: 'png',
            width: 500,
            margin: 2,
            color: { dark: qrDarkColor, light: qrLightColor }
        });
        
        const qrBase64 = qrBuffer.toString('base64');
        
        qrCodes.push({
            shortCode: finalShortCode,
            destinationUrl: destinationUrl,
            scanCount: 0,
            createdAt: new Date().toISOString()
        });
        
        res.json({
            success: true,
            shortCode: finalShortCode,
            image: `data:image/png;base64,${qrBase64}`,
            destinationUrl: destinationUrl
        });
        
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// List QR codes
app.get('/api/qr/list', (req, res) => {
    const codes = qrCodes.map(c => ({
        short_code: c.shortCode,
        destination_url: c.destinationUrl,
        scan_count: c.scanCount,
        created_at: c.createdAt
    }));
    res.json({ success: true, codes });
});

// Update destination
app.put('/api/qr/update/:shortCode', (req, res) => {
    const { shortCode } = req.params;
    const { destinationUrl } = req.body;
    
    const code = qrCodes.find(c => c.shortCode === shortCode);
    if (!code) {
        return res.status(404).json({ error: 'Code not found' });
    }
    
    code.destinationUrl = destinationUrl;
    res.json({ success: true });
});

// Delete QR code
app.delete('/api/qr/delete/:shortCode', (req, res) => {
    const { shortCode } = req.params;
    const index = qrCodes.findIndex(c => c.shortCode === shortCode);
    
    if (index === -1) {
        return res.status(404).json({ error: 'Code not found' });
    }
    
    qrCodes.splice(index, 1);
    res.json({ success: true });
});

// Redirect
app.get('/api/r/:shortCode', (req, res) => {
    const { shortCode } = req.params;
    const code = qrCodes.find(c => c.shortCode === shortCode);
    
    if (code) {
        code.scanCount++;
        res.redirect(code.destinationUrl);
    } else {
        res.redirect('https://google.com');
    }
});

// Root API endpoint
app.get('/api', (req, res) => {
    res.json({ 
        message: 'QR API is running',
        endpoints: ['/api/health', '/api/qr/generate', '/api/qr/list', '/api/r/:code']
    });
});

module.exports = app;