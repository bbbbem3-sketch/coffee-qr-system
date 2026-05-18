cat > api/index.js << 'EOF'
const express = require('express');
const cors = require('cors');
const QRCode = require('qrcode');

const app = express();
app.use(cors());
app.use(express.json());

// Simple in-memory storage
let qrCodes = [];

// ============================================
// HEALTH CHECK
// ============================================
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        timestamp: new Date().toISOString()
    });
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
        
        // Generate short code if not provided
        let finalShortCode = shortCode;
        if (!finalShortCode) {
            finalShortCode = 'code_' + Date.now();
        }
        
        // Check for duplicate
        if (qrCodes.find(c => c.shortCode === finalShortCode)) {
            return res.status(400).json({ error: 'Short code already exists' });
        }
        
        // Generate QR code with destination URL directly
        const qrBuffer = await QRCode.toBuffer(destinationUrl, {
            type: 'png',
            width: 500,
            margin: 2,
            color: { dark: qrDarkColor, light: qrLightColor },
            errorCorrectionLevel: 'H'
        });
        
        const qrBase64 = qrBuffer.toString('base64');
        
        // Store for management
        qrCodes.push({
            shortCode: finalShortCode,
            destinationUrl: destinationUrl,
            scanCount: 0,
            createdAt: new Date().toISOString()
        });
        
        res.json({
            success: true,
            shortCode: finalShortCode,
            qrImage: `data:image/png;base64,${qrBase64}`,
            destinationUrl: destinationUrl
        });
        
    } catch (error) {
        console.error('Generate error:', error);
        res.status(500).json({ error: error.message });
    }
});

// ============================================
// LIST ALL CODES
// ============================================
app.get('/api/qr/list', (req, res) => {
    try {
        console.log('Listing codes, count:', qrCodes.length);
        const codes = qrCodes.map(c => ({
            short_code: c.shortCode,
            destination_url: c.destinationUrl,
            scan_count: c.scanCount || 0,
            created_at: c.createdAt
        }));
        res.json({ success: true, codes });
    } catch (error) {
        console.error('List error:', error);
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
        
        console.log('Update:', shortCode, destinationUrl);
        
        const code = qrCodes.find(c => c.shortCode === shortCode);
        if (!code) {
            return res.status(404).json({ error: 'Code not found' });
        }
        
        code.destinationUrl = destinationUrl;
        res.json({ success: true, message: `Updated ${shortCode}` });
        
    } catch (error) {
        console.error('Update error:', error);
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
        console.error('Delete error:', error);
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
// REDIRECT (for QR codes that use short code)
// ============================================
app.get('/api/r/:shortCode', (req, res) => {
    const { shortCode } = req.params;
    const code = qrCodes.find(c => c.shortCode === shortCode);
    
    if (code) {
        code.scanCount++;
        res.redirect(code.destinationUrl);
    } else {
        res.redirect('https://dynamic-qr-system-xi.vercel.app/luban-coffee.html');
    }
});

module.exports = app;
EOF