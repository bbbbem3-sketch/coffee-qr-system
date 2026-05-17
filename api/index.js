const express = require('express');
const cors = require('cors');
const QRCode = require('qrcode');
const bwipjs = require('bwip-js');
const { v4: uuidv4 } = require('uuid');

const app = express();
app.use(cors());
app.use(express.json());

// In-memory storage for Vercel (use a real DB for production)
let qrCodes = [];

// Generate short code
function generateShortCode(length = 8) {
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
        result += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    return result;
}

// ============================================
// GENERATE QR + BARCODE
// ============================================

app.post('/api/qr/generate', async (req, res) => {
    try {
        const { 
            destinationUrl, 
            shortCode, 
            barcodeValue, 
            barcodeType = 'code128',
            qrDarkColor = '#000000',
            qrLightColor = '#FFFFFF',
            barcodeColor = '#000000'
        } = req.body;
        
        if (!destinationUrl) {
            return res.status(400).json({ error: 'Destination URL is required' });
        }
        
        let finalShortCode = shortCode || generateShortCode();
        
        // Check if exists
        if (qrCodes.find(c => c.shortCode === finalShortCode)) {
            return res.status(400).json({ error: 'Short code already exists' });
        }
        
        const id = uuidv4();
        const baseUrl = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000';
        const qrContent = `${baseUrl}/api/r/${finalShortCode}`;
        
        // Generate QR as base64
        const qrBuffer = await QRCode.toBuffer(qrContent, {
            type: 'png',
            width: 500,
            margin: 2,
            color: { dark: qrDarkColor, light: qrLightColor },
            errorCorrectionLevel: 'H'
        });
        
        const qrBase64 = qrBuffer.toString('base64');
        
        let barcodeBase64 = null;
        if (barcodeValue) {
            const barcodeBuffer = await new Promise((resolve, reject) => {
                bwipjs.toBuffer({
                    bcid: barcodeType,
                    text: barcodeValue,
                    scale: 3,
                    height: 10,
                    includetext: true,
                    textxalign: 'center',
                    barcolor: barcodeColor.replace('#', ''),
                    textcolor: barcodeColor.replace('#', '')
                }, (err, png) => {
                    if (err) reject(err);
                    else resolve(png);
                });
            });
            barcodeBase64 = barcodeBuffer.toString('base64');
        }
        
        // Save to memory
        qrCodes.push({
            id,
            shortCode: finalShortCode,
            destinationUrl,
            barcodeValue,
            qrDarkColor,
            qrLightColor,
            barcodeColor,
            scanCount: 0,
            createdAt: new Date().toISOString()
        });
        
        res.json({
            success: true,
            shortCode: finalShortCode,
            qrImage: `data:image/png;base64,${qrBase64}`,
            barcodeImage: barcodeBase64 ? `data:image/png;base64,${barcodeBase64}` : null,
            barcodeValue: barcodeValue,
            destinationUrl: destinationUrl,
            editUrl: `${baseUrl}/admin/${finalShortCode}`
        });
        
    } catch (error) {
        console.error('Generation error:', error);
        res.status(500).json({ error: error.message });
    }
});

// ============================================
// REDIRECT ENDPOINT
// ============================================

app.get('/api/r/:shortCode', async (req, res) => {
    try {
        const { shortCode } = req.params;
        console.log(`📱 SCAN: ${shortCode}`);
        
        const qrData = qrCodes.find(c => c.shortCode === shortCode);
        
        if (!qrData) {
            return res.status(404).send(`
                <!DOCTYPE html>
                <html>
                <head><title>QR Code Not Found</title></head>
                <body style="font-family: Arial; text-align: center; padding: 50px;">
                    <h1>❌ QR Code Not Found</h1>
                    <p>The code "${shortCode}" is not active or does not exist.</p>
                </body>
                </html>
            `);
        }
        
        qrData.scanCount++;
        
        // Redirect to destination
        res.redirect(qrData.destinationUrl);
        
    } catch (error) {
        console.error('Redirect error:', error);
        res.status(500).send('Server error');
    }
});

// ============================================
// MANAGEMENT ENDPOINTS
// ============================================

app.get('/api/qr/list', (req, res) => {
    res.json({ 
        success: true, 
        codes: qrCodes.map(c => ({
            short_code: c.shortCode,
            destination_url: c.destinationUrl,
            barcode_value: c.barcodeValue,
            scan_count: c.scanCount,
            created_at: c.createdAt
        }))
    });
});

app.put('/api/qr/update/:shortCode', (req, res) => {
    const { shortCode } = req.params;
    const { destinationUrl } = req.body;
    
    const code = qrCodes.find(c => c.shortCode === shortCode);
    if (!code) {
        return res.status(404).json({ error: 'Code not found' });
    }
    
    code.destinationUrl = destinationUrl;
    res.json({ success: true, message: `Updated ${shortCode}` });
});

app.delete('/api/qr/delete/:shortCode', (req, res) => {
    const { shortCode } = req.params;
    const index = qrCodes.findIndex(c => c.shortCode === shortCode);
    
    if (index === -1) {
        return res.status(404).json({ error: 'Code not found' });
    }
    
    qrCodes.splice(index, 1);
    res.json({ success: true, message: `Deleted ${shortCode}` });
});

app.get('/api/qr/stats/:shortCode', (req, res) => {
    const { shortCode } = req.params;
    const code = qrCodes.find(c => c.shortCode === shortCode);
    
    res.json({ 
        success: true, 
        stats: { total_scans: code?.scanCount || 0 }
    });
});

app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        timestamp: new Date().toISOString(),
        total_codes: qrCodes.length
    });
});

// Export for Vercel
module.exports = app;