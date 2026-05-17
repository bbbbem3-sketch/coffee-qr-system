const API_URL = '';
let currentResult = null;
let currentBatchData = null;

async function showTab(tabName) {
    document.querySelectorAll('.tab-content').forEach(tab => tab.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    document.getElementById(`${tabName}-tab`).classList.add('active');
    event.target.classList.add('active');
    if (tabName === 'manage') loadCodes();
    if (tabName === 'stats') loadStatsSelect();
}

// Preset colors
document.querySelectorAll('.preset-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        const dark = btn.getAttribute('data-dark');
        const light = btn.getAttribute('data-light');
        const barcode = btn.getAttribute('data-barcode');
        document.getElementById('qr-dark').value = dark;
        document.getElementById('qr-light').value = light;
        document.getElementById('barcode-color').value = barcode;
    });
});

async function generateSingle() {
    const destinationUrl = document.getElementById('dest-url').value;
    const shortCode = document.getElementById('short-code').value;
    const barcodeValue = document.getElementById('barcode-value').value;
    const qrDark = document.getElementById('qr-dark').value;
    const qrLight = document.getElementById('qr-light').value;
    const barcodeColor = document.getElementById('barcode-color').value;
    
    if (!destinationUrl) {
        alert('Please enter a destination URL');
        return;
    }
    
    try {
        const response = await fetch('/api/qr/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                destinationUrl, shortCode: shortCode || undefined,
                barcodeValue: barcodeValue || undefined,
                qrDarkColor: qrDark, qrLightColor: qrLight, barcodeColor
            })
        });
        
        const data = await response.json();
        if (data.error) { alert(data.error); return; }
        
        currentResult = data;
        
        document.getElementById('result-content').innerHTML = `
            <div style="display: flex; gap: 30px; justify-content: center;">
                <div><strong>QR Code</strong><br><img src="${data.qrImage}" style="max-width: 200px;"></div>
                ${data.barcodeImage ? `<div><strong>Barcode</strong><br><img src="${data.barcodeImage}" style="max-width: 250px;"></div>` : ''}
            </div>
            <p style="margin-top: 15px;"><strong>Short Code:</strong> ${data.shortCode}</p>
            <p><strong>Destination:</strong> ${data.destinationUrl}</p>
        `;
        document.getElementById('result').style.display = 'block';
        
    } catch (error) {
        alert('Error: ' + error.message);
    }
}

function downloadQR() {
    if (currentResult?.qrImage) {
        const link = document.createElement('a');
        link.download = `${currentResult.shortCode}.png`;
        link.href = currentResult.qrImage;
        link.click();
    }
}

function downloadBarcode() {
    if (currentResult?.barcodeImage) {
        const link = document.createElement('a');
        link.download = `${currentResult.shortCode}_barcode.png`;
        link.href = currentResult.barcodeImage;
        link.click();
    }
}

async function generateBatch() {
    const prefix = document.getElementById('batch-prefix').value;
    const start = parseInt(document.getElementById('batch-start').value);
    const end = parseInt(document.getElementById('batch-end').value);
    const barcodePrefix = document.getElementById('batch-barcode-prefix').value;
    const qrDark = document.getElementById('batch-qr-dark').value;
    const qrLight = document.getElementById('batch-qr-light').value;
    const barcodeColor = document.getElementById('batch-barcode-color').value;
    
    if (!prefix || start >= end) { alert('Invalid values'); return; }
    
    document.getElementById('batch-progress').style.display = 'block';
    
    const results = [];
    for (let i = start; i <= end; i++) {
        const padded = String(i).padStart(String(end).length, '0');
        const shortCode = `${prefix}${padded}`;
        const barcodeVal = barcodePrefix ? `${barcodePrefix}${padded}` : shortCode;
        
        const response = await fetch('/api/qr/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                destinationUrl: `https://yourcoffee.com/promo/${shortCode}`,
                shortCode, barcodeValue: barcodeVal,
                qrDarkColor: qrDark, qrLightColor: qrLight, barcodeColor
            })
        });
        const data = await response.json();
        results.push(data);
        
        const percent = ((i - start + 1) / (end - start + 1)) * 100;
        document.getElementById('progress-fill').style.width = `${percent}%`;
        document.getElementById('progress-text').textContent = `Generated ${i - start + 1} of ${end - start + 1}`;
    }
    
    currentBatchData = results;
    document.getElementById('batch-result').style.display = 'block';
    document.getElementById('batch-progress').style.display = 'none';
    document.getElementById('download-batch-zip').onclick = downloadBatchZip;
    alert(`✅ Generated ${results.length} QR codes!`);
}

function downloadBatchZip() {
    if (!currentBatchData) return;
    // Simple download - for production, create actual ZIP
    alert('In production, this would download a ZIP file with all QR codes');
}

async function loadCodes() {
    try {
        const response = await fetch('/api/qr/list');
        const data = await response.json();
        if (!data.codes?.length) { document.getElementById('codes-list').innerHTML = '<p>No codes yet</p>'; return; }
        
        let html = '';
        for (const code of data.codes) {
            html += `<div class="code-item">
                <div><strong>${code.short_code}</strong><br><small>${code.destination_url}</small><br>📊 ${code.scan_count} scans</div>
                <div><input type="text" id="edit-${code.short_code}" placeholder="New URL"><button onclick="updateCode('${code.short_code}')">Update</button>
                <button onclick="deleteCode('${code.short_code}')" style="background:#dc3545;color:white;">Delete</button></div>
            </div>`;
        }
        document.getElementById('codes-list').innerHTML = html;
    } catch (error) { document.getElementById('codes-list').innerHTML = '<p>Error loading</p>'; }
}

async function updateCode(shortCode) {
    const newUrl = document.getElementById(`edit-${shortCode}`).value;
    if (!newUrl) { alert('Enter URL'); return; }
    await fetch(`/api/qr/update/${shortCode}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ destinationUrl: newUrl }) });
    alert('Updated!'); loadCodes();
}

async function deleteCode(shortCode) {
    if (!confirm('Delete?')) return;
    await fetch(`/api/qr/delete/${shortCode}`, { method: 'DELETE' });
    loadCodes();
}

async function loadStatsSelect() {
    try {
        const response = await fetch('/api/qr/list');
        const data = await response.json();
        let html = '<option>-- Select --</option>';
        data.codes?.forEach(c => html += `<option value="${c.short_code}">${c.short_code} (${c.scan_count} scans)</option>`);
        document.getElementById('stats-select').innerHTML = html;
    } catch (error) {}
}

async function loadStats() {
    const shortCode = document.getElementById('stats-select').value;
    if (!shortCode || shortCode === '-- Select --') return;
    try {
        const response = await fetch(`/api/qr/stats/${shortCode}`);
        const data = await response.json();
        document.getElementById('stats-content').innerHTML = `<div class="stats-grid"><div class="stat-card"><div class="stat-number">${data.stats?.total_scans || 0}</div><div class="stat-label">Total Scans</div></div></div>`;
    } catch (error) {}
}

console.log('✅ QR System Ready');