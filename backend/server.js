const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const QRCode = require('qrcode');
const bwipjs = require('bwip-js');
const { v4: uuidv4 } = require('uuid');
const archiver = require('archiver');
const db = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;

// Create directories
const qrDir = path.join(__dirname, 'qr-codes');
const barcodeDir = path.join(__dirname, 'barcodes');
const tempDir = path.join(__dirname, 'temp');
const downloadsDir = path.join(__dirname, 'downloads');

[qrDir, barcodeDir, tempDir, downloadsDir].forEach(dir => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));
app.use('/qr-codes', express.static(qrDir));
app.use('/barcodes', express.static(barcodeDir));
app.use('/temp', express.static(tempDir));
app.use('/downloads', express.static(downloadsDir));

// ============================================
// PREVIEW ENDPOINTS (for live color preview)
// ============================================

// QR Code Preview
app.post('/api/preview/qr', async (req, res) => {
    try {
        const { text, darkColor = '#000000', lightColor = '#FFFFFF' } = req.body;
        const tempId = Date.now() + Math.random();
        const tempPath = path.join(tempDir, `preview_${tempId}.svg`);
        
        await QRCode.toFile(tempPath, text || 'PREVIEW', {
            type: 'svg',
            width: 150,
            margin: 1,
            color: { dark: darkColor, light: lightColor },
            errorCorrectionLevel: 'H'
        });
        
        res.json({ previewUrl: `/temp/preview_${tempId}.svg` });
        
        setTimeout(() => {
            if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
        }, 60000);
        
    } catch (error) {
        console.error('Preview error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Barcode Preview
app.post('/api/preview/barcode', async (req, res) => {
    try {
        const { value, type = 'code128', color = '#000000' } = req.body;
        const tempId = Date.now() + Math.random();
        const tempPath = path.join(tempDir, `barcode_${tempId}.png`);
        
        await new Promise((resolve, reject) => {
            bwipjs.toBuffer({
                bcid: type,
                text: value || 'SAMPLE',
                scale: 2,
                height: 8,
                includetext: true,
                textxalign: 'center',
                barcolor: color.replace('#', ''),
                textcolor: color.replace('#', '')
            }, (err, png) => {
                if (err) reject(err);
                else {
                    fs.writeFileSync(tempPath, png);
                    resolve();
                }
            });
        });
        
        res.json({ previewUrl: `/temp/barcode_${tempId}.png` });
        
        setTimeout(() => {
            if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
        }, 60000);
        
    } catch (error) {
        console.error('Preview error:', error);
        res.status(500).json({ error: error.message });
    }
});

// ============================================
// SINGLE QR + BARCODE GENERATION
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
        
        // Generate short code if not provided
        let finalShortCode = shortCode;
        if (!finalShortCode) {
            finalShortCode = generateShortCode();
        }
        
        // Check if short code already exists
        const existing = await db.getDestination(finalShortCode);
        if (existing) {
            return res.status(400).json({ error: 'Short code already exists' });
        }
        
        const id = uuidv4();
        const qrContent = `http://localhost:3000/r/${finalShortCode}`;
        const qrPath = path.join(qrDir, `${finalShortCode}.svg`);
        
        // Generate QR Code with custom colors
        await QRCode.toFile(qrPath, qrContent, {
            type: 'svg',
            width: 500,
            margin: 2,
            color: { 
                dark: qrDarkColor, 
                light: qrLightColor 
            },
            errorCorrectionLevel: 'H'
        });
        
        // Generate Barcode if value provided
        let barcodePath = null;
        if (barcodeValue) {
            barcodePath = path.join(barcodeDir, `${finalShortCode}.png`);
            await new Promise((resolve, reject) => {
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
                    else {
                        fs.writeFileSync(barcodePath, png);
                        resolve();
                    }
                });
            });
        }
        
        // Save to database
        await db.createQRCode(id, finalShortCode, destinationUrl, barcodeValue);
        
        res.json({
            success: true,
            shortCode: finalShortCode,
            qrCodeUrl: `/qr-codes/${finalShortCode}.svg`,
            barcodeUrl: barcodePath ? `/barcodes/${finalShortCode}.png` : null,
            barcodeValue: barcodeValue,
            destinationUrl: destinationUrl,
            qrDarkColor: qrDarkColor,
            qrLightColor: qrLightColor,
            barcodeColor: barcodeColor
        });
        
    } catch (error) {
        console.error('Generation error:', error);
        res.status(500).json({ error: error.message });
    }
});

// ============================================
// BATCH GENERATOR (Thousands of Labels)
// ============================================

app.post('/api/batch/generate', async (req, res) => {
    try {
        const { 
            prefix, 
            startNumber, 
            endNumber, 
            barcodePrefix, 
            destinationUrl,
            qrDarkColor = '#000000',
            qrLightColor = '#FFFFFF',
            barcodeColor = '#000000',
            barcodeType = 'code128'
        } = req.body;
        
        // Validation
        if (!prefix || startNumber === undefined || endNumber === undefined) {
            return res.status(400).json({ error: 'Missing required fields: prefix, startNumber, endNumber' });
        }
        
        const total = endNumber - startNumber + 1;
        if (total > 50000) {
            return res.status(400).json({ error: 'Maximum 50,000 labels per batch' });
        }
        
        console.log(`📦 Starting batch generation: ${total} labels`);
        console.log(`   Colors: QR Dark=${qrDarkColor}, QR Light=${qrLightColor}, Barcode=${barcodeColor}`);
        
        const results = [];
        const errors = [];
        const padLength = String(endNumber).length;
        
        // Process in chunks to show progress
        for (let i = startNumber; i <= endNumber; i++) {
            try {
                const paddedNumber = String(i).padStart(padLength, '0');
                const shortCode = `${prefix}${paddedNumber}`;
                const barcodeValue = barcodePrefix ? `${barcodePrefix}${paddedNumber}` : shortCode;
                
                // Build destination URL with placeholders
                let destUrl = destinationUrl || `https://yourcoffee.com/promo/{code}`;
                destUrl = destUrl
                    .replace('{code}', shortCode)
                    .replace('{number}', paddedNumber)
                    .replace('{prefix}', prefix);
                
                const id = uuidv4();
                const qrContent = `http://localhost:3000/r/${shortCode}`;
                const qrPath = path.join(qrDir, `${shortCode}.svg`);
                
                // Generate QR Code
                await QRCode.toFile(qrPath, qrContent, {
                    type: 'svg',
                    width: 500,
                    margin: 2,
                    color: { 
                        dark: qrDarkColor, 
                        light: qrLightColor 
                    },
                    errorCorrectionLevel: 'H'
                });
                
                // Generate Barcode
                let barcodePath = null;
                if (barcodeValue) {
                    barcodePath = path.join(barcodeDir, `${shortCode}.png`);
                    await new Promise((resolve, reject) => {
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
                            else {
                                fs.writeFileSync(barcodePath, png);
                                resolve();
                            }
                        });
                    });
                }
                
                // Save to database
                await db.createQRCode(id, shortCode, destUrl, barcodeValue);
                
                results.push({ 
                    shortCode, 
                    qrCodeUrl: `/qr-codes/${shortCode}.svg`, 
                    barcodeUrl: barcodePath ? `/barcodes/${shortCode}.png` : null, 
                    barcodeValue, 
                    destinationUrl: destUrl 
                });
                
                // Progress log every 100 items
                if ((i - startNumber + 1) % 100 === 0) {
                    console.log(`   Generated ${i - startNumber + 1}/${total} labels`);
                }
                
            } catch (err) {
                console.error(`   Error generating ${prefix}${String(i).padStart(padLength, '0')}:`, err.message);
                errors.push({ number: i, error: err.message });
            }
        }
        
        // Create ZIP archive
        const zipName = `${prefix}_${startNumber}_to_${endNumber}.zip`;
        const zipPath = path.join(downloadsDir, zipName);
        const output = fs.createWriteStream(zipPath);
        const archive = archiver('zip', { zlib: { level: 9 } });
        
        await new Promise((resolve, reject) => {
            output.on('close', resolve);
            archive.on('error', reject);
            archive.pipe(output);
            
            // Add all QR codes and barcodes to ZIP
            for (const result of results) {
                const qrFile = path.join(qrDir, `${result.shortCode}.svg`);
                if (fs.existsSync(qrFile)) {
                    archive.file(qrFile, { name: `qr-codes/${result.shortCode}.svg` });
                }
                if (result.barcodeUrl) {
                    const barcodeFile = path.join(barcodeDir, `${result.shortCode}.png`);
                    if (fs.existsSync(barcodeFile)) {
                        archive.file(barcodeFile, { name: `barcodes/${result.shortCode}.png` });
                    }
                }
            }
            
            // Add CSV manifest
            let csvContent = 'Short Code,Destination URL,Barcode Value,QR Dark Color,QR Light Color,Barcode Color\n';
            for (const result of results) {
                csvContent += `${result.shortCode},${result.destinationUrl},${result.barcodeValue || ''},${qrDarkColor},${qrLightColor},${barcodeColor}\n`;
            }
            archive.append(csvContent, { name: 'manifest.csv' });
            
            // Add color info file
            const colorInfo = `Production Color Information
================================
Generated: ${new Date().toISOString()}
Total Labels: ${results.length}

QR Code Colors:
  Dark (modules): ${qrDarkColor}
  Light (background): ${qrLightColor}

Barcode Colors:
  Bars and Text: ${barcodeColor}

Barcode Type: ${barcodeType}

Note: High contrast is critical for scanning.
Recommend testing a sample before full production.
`;
            archive.append(colorInfo, { name: 'COLOR_INFO.txt' });
            
            archive.finalize();
        });
        
        console.log(`✅ Batch complete: ${results.length} labels generated, ${errors.length} errors`);
        
        res.json({
            success: true,
            total: results.length,
            errors: errors.length,
            codes: results.slice(0, 10), // Send first 10 for preview
            downloadZip: `/downloads/${zipName}`,
            colors: {
                qrDark: qrDarkColor,
                qrLight: qrLightColor,
                barcode: barcodeColor
            }
        });
        
    } catch (error) {
        console.error('Batch error:', error);
        res.status(500).json({ error: error.message });
    }
});

// ============================================
// REDIRECT ENDPOINT (for QR code scanning)
// ============================================

app.get('/r/:shortCode', async (req, res) => {
    try {
        const { shortCode } = req.params;
        console.log(`📱 SCAN: ${shortCode} at ${new Date().toISOString()}`);
        
        const qrData = await db.getDestination(shortCode);
        
        if (!qrData) {
            return res.status(404).send(`
                <!DOCTYPE html>
                <html>
                <head><title>QR Code Not Found</title></head>
                <body style="font-family: Arial; text-align: center; padding: 50px;">
                    <h1>❌ QR Code Not Found</h1>
                    <p>The code "${shortCode}" is not active or does not exist.</p>
                    <p>Please check the QR code or contact support.</p>
                </body>
                </html>
            `);
        }
        
        // Log scan for analytics
        const ip = req.ip || req.connection.remoteAddress;
        const userAgent = req.headers['user-agent'] || 'Unknown';
        const referrer = req.headers['referer'] || 'Direct';
        
        await db.logScan(shortCode, ip, userAgent, referrer);
        await db.incrementScanCount(shortCode);
        
        console.log(`🔄 Redirecting ${shortCode} → ${qrData.destination_url}`);
        
        // Redirect to destination
        res.redirect(qrData.destination_url);
        
    } catch (error) {
        console.error('Redirect error:', error);
        res.status(500).send('Server error - please try again later');
    }
});

// ============================================
// MANAGEMENT ENDPOINTS
// ============================================

// Get all QR codes
app.get('/api/qr/list', async (req, res) => {
    try {
        const codes = await db.getAllQRCodes();
        res.json({ success: true, codes });
    } catch (error) {
        console.error('List error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Update destination URL
app.put('/api/qr/update/:shortCode', async (req, res) => {
    try {
        const { shortCode } = req.params;
        const { destinationUrl } = req.body;
        
        if (!destinationUrl) {
            return res.status(400).json({ error: 'Destination URL is required' });
        }
        
        await db.updateDestination(shortCode, destinationUrl);
        
        console.log(`✏️ UPDATED: ${shortCode} → ${destinationUrl}`);
        
        res.json({ 
            success: true, 
            message: `Updated ${shortCode} to redirect to ${destinationUrl}` 
        });
        
    } catch (error) {
        console.error('Update error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Delete QR code
app.delete('/api/qr/delete/:shortCode', async (req, res) => {
    try {
        const { shortCode } = req.params;
        
        await db.deleteQRCode(shortCode);
        
        // Delete associated files
        const qrPath = path.join(qrDir, `${shortCode}.svg`);
        const barcodePath = path.join(barcodeDir, `${shortCode}.png`);
        
        if (fs.existsSync(qrPath)) fs.unlinkSync(qrPath);
        if (fs.existsSync(barcodePath)) fs.unlinkSync(barcodePath);
        
        console.log(`🗑️ DELETED: ${shortCode}`);
        
        res.json({ success: true, message: `Deleted ${shortCode}` });
        
    } catch (error) {
        console.error('Delete error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get scan statistics
app.get('/api/qr/stats/:shortCode', async (req, res) => {
    try {
        const { shortCode } = req.params;
        const stats = await db.getStats(shortCode);
        
        // Get additional stats
        const totalScans = stats?.total_scans || 0;
        
        res.json({ 
            success: true, 
            stats: {
                total_scans: totalScans,
                short_code: shortCode
            }
        });
        
    } catch (error) {
        console.error('Stats error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get system health
app.get('/api/health', async (req, res) => {
    try {
        const codes = await db.getAllQRCodes();
        res.json({
            status: 'ok',
            timestamp: new Date().toISOString(),
            stats: {
                total_codes: codes.length,
                active_codes: codes.filter(c => c.status === 'active').length,
                qr_count: fs.readdirSync(qrDir).length,
                barcode_count: fs.readdirSync(barcodeDir).length
            }
        });
    } catch (error) {
        res.status(500).json({ status: 'error', error: error.message });
    }
});

// ============================================
// UTILITY FUNCTIONS
// ============================================

function generateShortCode(length = 8) {
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
        result += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    return result;
}

// ============================================
// START SERVER
// ============================================

app.listen(PORT, () => {
    console.log(`
╔═══════════════════════════════════════════════════════════════════════════╗
║                    🚀 PROFESSIONAL QR + BARCODE SYSTEM                     ║
╠═══════════════════════════════════════════════════════════════════════════╣
║                                                                           ║
║  Server: http://localhost:${PORT}                                          ║
║  Web App: http://localhost:${PORT}                                         ║
║                                                                           ║
║  ═══════════════════════════════════════════════════════════════════════  ║
║                                                                           ║
║  ✅ FEATURES ACTIVE:                                                      ║
║     • QR Codes with Custom Colors (HEX, RGB, CMYK)                       ║
║     • Barcodes with Custom Colors (HEX, RGB, CMYK)                       ║
║     • Batch Generation (1 - 50,000 labels)                               ║
║     • Dynamic Redirects (change destination anytime)                     ║
║     • Scan Analytics & Tracking                                          ║
║     • Professional Presets (Coffee Brown, Forest Green, etc.)            ║
║     • ZIP Download with Manifest                                         ║
║                                                                           ║
║  ═══════════════════════════════════════════════════════════════════════  ║
║                                                                           ║
║  📱 SCAN ENDPOINT: http://localhost:${PORT}/r/{CODE}                       ║
║  📊 API ENDPOINT: http://localhost:${PORT}/api                            ║
║                                                                           ║
╚═══════════════════════════════════════════════════════════════════════════╝
    `);
});

module.exports = app;