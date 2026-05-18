const express = require('express');
const cors = require('cors');
const QRCode = require('qrcode');
const bwipjs = require('bwip-js');

const app = express();
app.use(cors());
app.use(express.json());

// In-memory storage
let qrCodes = [];
let barcodes = [];

// Generate short code
function generateShortCode(prefix = 'code') {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
}

// ============================================
// HEALTH CHECK
// ============================================
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        timestamp: new Date().toISOString(),
        qrCount: qrCodes.length,
        barcodeCount: barcodes.length
    });
});

// ============================================
// QR CODE ENDPOINTS
// ============================================

// Generate QR code
app.post('/api/qr/generate', async (req, res) => {
    try {
        const { destinationUrl, shortCode, qrDarkColor = '#000000', qrLightColor = '#FFFFFF' } = req.body;
        
        if (!destinationUrl) {
            return res.status(400).json({ error: 'Destination URL is required' });
        }
        
        const finalShortCode = shortCode || generateShortCode('qr');
        
        // Generate QR code
        const qrBuffer = await QRCode.toBuffer(destinationUrl, {
            type: 'png',
            width: 500,
            margin: 2,
            color: { dark: qrDarkColor, light: qrLightColor },
            errorCorrectionLevel: 'H'
        });
        
        const qrBase64 = qrBuffer.toString('base64');
        
        // Store
        qrCodes.push({
            shortCode: finalShortCode,
            destinationUrl: destinationUrl,
            createdAt: new Date().toISOString(),
            qrDarkColor,
            qrLightColor
        });
        
        res.json({
            success: true,
            type: 'qr',
            shortCode: finalShortCode,
            image: `data:image/png;base64,${qrBase64}`,
            destinationUrl: destinationUrl
        });
        
    } catch (error) {
        console.error('QR generate error:', error);
        res.status(500).json({ error: error.message });
    }
});

// List all QR codes
app.get('/api/qr/list', (req, res) => {
    const codes = qrCodes.map(c => ({
        short_code: c.shortCode,
        destination_url: c.destinationUrl,
        type: 'qr',
        created_at: c.createdAt
    }));
    res.json({ success: true, codes });
});

// Delete QR code
app.delete('/api/qr/delete/:shortCode', (req, res) => {
    const { shortCode } = req.params;
    const index = qrCodes.findIndex(c => c.shortCode === shortCode);
    
    if (index === -1) {
        return res.status(404).json({ error: 'Code not found' });
    }
    
    qrCodes.splice(index, 1);
    res.json({ success: true, message: `Deleted ${shortCode}` });
});

// ============================================
// BARCODE ENDPOINTS
// ============================================

// Generate Barcode
app.post('/api/barcode/generate', async (req, res) => {
    try {
        const { value, barcodeType = 'code128', barcodeColor = '#000000', height = 10 } = req.body;
        
        if (!value) {
            return res.status(400).json({ error: 'Barcode value is required' });
        }
        
        const shortCode = generateShortCode('bar');
        
        // Generate barcode
        const barcodeBuffer = await new Promise((resolve, reject) => {
            bwipjs.toBuffer({
                bcid: barcodeType,
                text: value,
                scale: 3,
                height: height,
                includetext: true,
                textxalign: 'center',
                barcolor: barcodeColor.replace('#', ''),
                textcolor: barcodeColor.replace('#', '')
            }, (err, png) => {
                if (err) reject(err);
                else resolve(png);
            });
        });
        
        const barcodeBase64 = barcodeBuffer.toString('base64');
        
        // Store
        barcodes.push({
            shortCode: shortCode,
            value: value,
            type: barcodeType,
            color: barcodeColor,
            createdAt: new Date().toISOString()
        });
        
        res.json({
            success: true,
            type: 'barcode',
            shortCode: shortCode,
            image: `data:image/png;base64,${barcodeBase64}`,
            value: value
        });
        
    } catch (error) {
        console.error('Barcode generate error:', error);
        res.status(500).json({ error: error.message });
    }
});

// List all barcodes
app.get('/api/barcode/list', (req, res) => {
    const codes = barcodes.map(c => ({
        short_code: c.shortCode,
        value: c.value,
        type: c.type,
        created_at: c.createdAt
    }));
    res.json({ success: true, codes });
});

// Delete barcode
app.delete('/api/barcode/delete/:shortCode', (req, res) => {
    const { shortCode } = req.params;
    const index = barcodes.findIndex(c => c.shortCode === shortCode);
    
    if (index === -1) {
        return res.status(404).json({ error: 'Barcode not found' });
    }
    
    barcodes.splice(index, 1);
    res.json({ success: true, message: `Deleted ${shortCode}` });
});

// ============================================
// REDIRECT (for QR codes)
// ============================================
app.get('/api/r/:shortCode', (req, res) => {
    const { shortCode } = req.params;
    const qrData = qrCodes.find(c => c.shortCode === shortCode);
    
    if (qrData) {
        res.redirect(qrData.destinationUrl);
    } else {
        res.redirect('https://dynamic-qr-system-xi.vercel.app/luban-coffee.html');
    }
});

module.exports = app;