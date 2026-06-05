// renderer.js - Fixed version without require

// DOM elements
const lensModeBtn = document.getElementById('lensModeBtn');
const barrierModeBtn = document.getElementById('barrierModeBtn');
const materialSelect = document.getElementById('materialSelect');
const openFileBtn = document.getElementById('openFileBtn');
const processBtn = document.getElementById('processBtn');
const exportBtn = document.getElementById('exportBtn');
const statusDiv = document.getElementById('status');
const playbackArea = document.getElementById('playbackArea');
const freqPlot = document.getElementById('freqPlot');
const waveformCanvas = document.getElementById('waveformCanvas');

// Preset groups from Aalener Optik-Formelrechner
const presetGroups = {
    'Ophthalmic Plastics': [
        { name: 'CR-39', material: 'cr39', cutoff: 4000, thickness: 2.0, coating: 1.0, note: 'Standard plastic lens' },
        { name: 'Polycarbonate', material: 'poly', cutoff: 4500, thickness: 2.2, coating: 1.5, note: 'Impact-resistant' },
        { name: 'Trivex', material: 'high', cutoff: 4200, thickness: 2.0, coating: 0.8, note: 'Premium clarity' }
    ],
    'Crown Glasses': [
        { name: 'BK7', material: 'crown', cutoff: 3800, thickness: 2.5, coating: 0.9, note: 'Classic optical glass' },
        { name: 'K5', material: 'crown', cutoff: 3600, thickness: 2.8, coating: 1.2, note: 'High transmission' }
    ],
    'Flint Glasses': [
        { name: 'F2', material: 'flint', cutoff: 3200, thickness: 3.0, coating: 1.8, note: 'High dispersion' },
        { name: 'SF11', material: 'flint', cutoff: 3000, thickness: 3.5, coating: 2.0, note: 'Very high refractive index' }
    ],
    'High-Index': [
        { name: '1.67 MR-10', material: 'high', cutoff: 5000, thickness: 1.8, coating: 0.5, note: 'Ultra-thin' },
        { name: '1.74 MR-174', material: 'high', cutoff: 5500, thickness: 1.5, coating: 0.4, note: 'Extreme high-index' }
    ]
};

// Populate presets
const presetContainer = document.getElementById('presetGroups');
for (const [groupName, presets] of Object.entries(presetGroups)) {
    const groupDiv = document.createElement('div');
    groupDiv.style.marginBottom = '8px';
    groupDiv.style.width = '100%';
    groupDiv.innerHTML = `<div style="font-size: 10px; color: #dd8800; margin-bottom: 4px;">${groupName}</div>`;
    presets.forEach(preset => {
        const btn = document.createElement('button');
        btn.textContent = preset.name;
        btn.style.margin = '2px';
        btn.style.padding = '2px 8px';
        btn.style.fontSize = '10px';
        btn.onclick = () => {
            params.material = preset.material;
            params.cutoff = preset.cutoff;
            params.thickness = preset.thickness;
            params.coating = preset.coating;
            document.getElementById('materialSelect').value = preset.material;
            document.getElementById('cutoffSlider').value = preset.cutoff;
            document.getElementById('thickSlider').value = preset.thickness;
            document.getElementById('coatingSlider').value = preset.coating;
            updateKnobs();
            updateTransferPlot();
            document.getElementById('presetInfo').innerHTML = `🔬 ${preset.name}: ${preset.note}`;
        };
        groupDiv.appendChild(btn);
    });
    presetContainer.appendChild(groupDiv);
}

// Toggle settings panel
document.getElementById('settingsToggleBtn').onclick = () => {
    const panel = document.getElementById('settingsPanel');
    panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
};

// App state
let currentMode = 'lens';
let currentAudioBuffer = null;
let currentAudioArray = null;
let currentSampleRate = 44100;
let processedArray = null;
let isProcessing = false;

let params = {
    cutoff: 3800,
    sharpness: 1.0,
    thickness: 2.2,
    coating: 0.8,
    material: 'high',
    mode: 'lens'
};

// ========== WAV Writer (Native, no require) ==========
function floatToWav(samples, sampleRate) {
    const buffer = new ArrayBuffer(44 + samples.length * 2);
    const view = new DataView(buffer);
    
    function writeString(offset, str) {
        for (let i = 0; i < str.length; i++) {
            view.setUint8(offset + i, str.charCodeAt(i));
        }
    }
    
    // WAV header
    writeString(0, 'RIFF');
    view.setUint32(4, 36 + samples.length * 2, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    writeString(36, 'data');
    view.setUint32(40, samples.length * 2, true);
    
    // Write samples
    let offset = 44;
    for (let i = 0; i < samples.length; i++) {
        let sample = Math.max(-1, Math.min(1, samples[i]));
        view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7FFF, true);
        offset += 2;
    }
    
    return buffer;
}

// ========== Knob Drawing ==========
function drawKnob(canvasId, value, min, max) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width, h = canvas.height;
    const angle = -Math.PI * 0.75 + (value - min) / (max - min) * Math.PI * 1.5;
    
    ctx.clearRect(0, 0, w, h);
    
    ctx.beginPath();
    ctx.arc(w/2, h/2, w*0.38, -Math.PI*0.75, Math.PI*0.75);
    ctx.strokeStyle = '#3a3a3a';
    ctx.lineWidth = 6;
    ctx.stroke();
    
    ctx.beginPath();
    ctx.arc(w/2, h/2, w*0.38, -Math.PI*0.75, angle);
    ctx.strokeStyle = '#dd8800';
    ctx.stroke();
    
    ctx.beginPath();
    ctx.arc(w/2, h/2, 6, 0, 2*Math.PI);
    ctx.fillStyle = '#dd8800';
    ctx.fill();
}

function updateKnobs() {
    drawKnob('cutoffKnob', params.cutoff, 200, 20000);
    drawKnob('sharpKnob', params.sharpness, 0.3, 2.2);
    drawKnob('thickKnob', params.thickness, 0.5, 15);
    drawKnob('coatKnob', params.coating, 0.1, 5);
    
    document.getElementById('cutoffVal').innerText = Math.round(params.cutoff) + ' Hz';
    document.getElementById('sharpVal').innerText = params.sharpness.toFixed(2);
    document.getElementById('thickVal').innerText = params.thickness.toFixed(1) + ' mm';
    document.getElementById('coatVal').innerText = params.coating.toFixed(1) + ' %';
    
    const sharpContainer = document.getElementById('sharpKnobContainer');
    if (sharpContainer) {
        sharpContainer.style.opacity = currentMode === 'lens' ? '0.5' : '1';
    }
}

// ========== Knob Dragging ==========
function makeKnob(knobId, param, min, max, updateCallback) {
    const canvas = document.getElementById(knobId);
    let dragging = false;
    
    canvas.onmousedown = (e) => {
        dragging = true;
        const rect = canvas.getBoundingClientRect();
        const update = (moveEvent) => {
            const y = moveEvent.clientY - rect.top;
            const norm = Math.min(1, Math.max(0, y / rect.height));
            const val = min + (1 - norm) * (max - min);
            params[param] = Math.min(max, Math.max(min, val));
            updateKnobs();
            if (updateCallback) updateCallback();
        };
        update(e);
        window.onmousemove = update;
        window.onmouseup = () => {
            dragging = false;
            window.onmousemove = null;
            updateTransferPlot();
        };
    };
}

// ========== Frequency Response Plot ==========
async function updateTransferPlot() {
    const ctx = freqPlot.getContext('2d');
    const w = freqPlot.width = 900;
    const h = freqPlot.height = 250;
    
    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(0, 0, w, h);
    
    try {
        const points = await window.electronAPI.getTransferPoints(params);
        
        if (!points || points.length === 0) return;
        
        ctx.beginPath();
        for (let i = 0; i < points.length; i++) {
            const x = (points[i].freq / 20000) * w;
            const y = h - 20 - (points[i].gain * (h - 40));
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }
        ctx.strokeStyle = currentMode === 'lens' ? '#88dd88' : '#dd8800';
        ctx.lineWidth = 2;
        ctx.stroke();
        
        // Cutoff line
        const cutoffX = (params.cutoff / 20000) * w;
        ctx.beginPath();
        ctx.moveTo(cutoffX, 0);
        ctx.lineTo(cutoffX, h);
        ctx.strokeStyle = '#dd8800';
        ctx.setLineDash([5, 5]);
        ctx.stroke();
        ctx.setLineDash([]);
        
        ctx.fillStyle = '#888';
        ctx.font = '10px monospace';
        ctx.fillText(`cutoff: ${Math.round(params.cutoff)} Hz`, cutoffX - 50, h - 15);
        ctx.fillText(`mode: ${currentMode}`, 10, h - 15);
    } catch (err) {
        console.error('Plot error:', err);
    }
}

// ========== Waveform Drawing ==========
function drawWaveform(data) {
    const ctx = waveformCanvas.getContext('2d');
    const w = waveformCanvas.width = 900;
    const h = waveformCanvas.height = 80;
    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(0, 0, w, h);
    
    if (!data || data.length === 0) return;
    
    ctx.beginPath();
    const step = Math.max(1, Math.floor(data.length / w));
    for (let i = 0; i < w; i++) {
        const idx = Math.min(data.length - 1, i * step);
        const sample = data[idx];
        const y = h/2 + sample * h/2;
        if (i === 0) ctx.moveTo(i, y);
        else ctx.lineTo(i, y);
    }
    ctx.strokeStyle = '#dd8800';
    ctx.lineWidth = 1.5;
    ctx.stroke();
}

// Add waveform with cursor function
function drawWaveformWithCursor(data, cursorPercent) {
    const ctx = waveformCanvas.getContext('2d');
    const w = waveformCanvas.width = 900;
    const h = waveformCanvas.height = 80;
    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(0, 0, w, h);
    
    if (!data || data.length === 0) return;
    
    ctx.beginPath();
    const step = Math.max(1, Math.floor(data.length / w));
    for (let i = 0; i < w; i++) {
        const idx = Math.min(data.length - 1, i * step);
        const sample = data[idx];
        const y = h/2 + sample * h/2;
        if (i === 0) ctx.moveTo(i, y);
        else ctx.lineTo(i, y);
    }
    ctx.strokeStyle = '#dd8800';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    
    // Draw cursor
    if (cursorPercent !== undefined) {
        const cursorX = cursorPercent * w;
        ctx.beginPath();
        ctx.moveTo(cursorX, 0);
        ctx.lineTo(cursorX, h);
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1;
        ctx.stroke();
    }
}

// ========== File Handling ==========
openFileBtn.onclick = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'audio/*';
    input.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

		//============== MAX_SIZE CHECK ===================
        const MAX_SIZE = 25 * 1024 * 1024; // 25MB
        if (file.size > MAX_SIZE) {
            statusDiv.innerText = `⚠️ File too large (${(file.size/1024/1024).toFixed(1)}MB). Use files under 25MB.`;
            return;
        }
		//=================================================
        
        statusDiv.innerText = `📂 Loading: ${file.name}...`;
        
        const arrayBuffer = await file.arrayBuffer();
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        currentAudioBuffer = await audioContext.decodeAudioData(arrayBuffer);
        currentAudioArray = currentAudioBuffer.getChannelData(0);
        currentSampleRate = currentAudioBuffer.sampleRate;
        
        statusDiv.innerText = `✅ Loaded: ${file.name} (${currentAudioBuffer.duration.toFixed(1)}s, ${currentSampleRate}Hz)`;
        drawWaveform(currentAudioArray);
        
        // fix:Replaced the playbackArea.innerHTML block:
        // fix: Added originalAudio.ontimeupdate
        
        const url = URL.createObjectURL(file);
        const audioId = `original_${Date.now()}`;
        playbackArea.innerHTML = `
            <div style="margin-top: 15px;" id="playerContainer_${audioId}">
                <div style="font-size: 10px; margin-bottom: 5px;">🎧 Original</div>
                <audio id="${audioId}" controls src="${url}" style="width: 100%;"></audio>
                <div class="playhead-cursor" style="height: 2px; background: #dd8800; width: 0%; margin-top: 2px;"></div>
            </div>
        `;
        
        const originalAudio = document.getElementById(audioId);
        const cursorDiv = document.querySelector(`#playerContainer_${audioId} .playhead-cursor`);
        
        originalAudio.ontimeupdate = () => {
            if (originalAudio.duration) {
                const percent = (originalAudio.currentTime / originalAudio.duration) * 100;
                cursorDiv.style.width = percent + '%';
                // Also update waveform cursor
                if (currentAudioArray) {
                    drawWaveformWithCursor(currentAudioArray, percent / 100);
                }
            }
        };
    };
    input.click();
};

// ========== Audio Processing ==========
// In renderer.js, replace the processBtn.onclick section

processBtn.onclick = async () => {
    if (!currentAudioArray) {
        statusDiv.innerText = '❌ Load an audio file first';
        return;
    }
    
    if (isProcessing) {
        statusDiv.innerText = '⏳ Already processing...';
        return;
    }
    
    isProcessing = true;
    processBtn.disabled = true;
    statusDiv.innerText = '🌀 Processing with quantum lens... (may take a moment)';
    
    try {
        const result = await window.electronAPI.processAudio(currentAudioArray, params);
        processedArray = new Float32Array(result);
        
        statusDiv.innerText = '✅ Processing complete! Click Export to save.';
        
        drawWaveform(processedArray);
        
        // Create WAV blob
        const wavBuffer = floatToWav(processedArray, currentSampleRate);
        const blob = new Blob([wavBuffer], { type: 'audio/wav' });
        const url = URL.createObjectURL(blob);
        
        // Create audio element with ID for playhead
        const audioId = `player_${Date.now()}`;
        playbackArea.innerHTML += `
            <div style="margin-top: 15px;" id="playerContainer_${audioId}">
                <div style="font-size: 10px; margin-bottom: 5px;">🌀 Processed (${currentMode.toUpperCase()} mode)</div>
                <audio id="${audioId}" controls src="${url}" style="width: 100%;"></audio>
            </div>
        `;
        
        // Add playhead tracking
        const audioElement = document.getElementById(audioId);
        const container = document.getElementById(`playerContainer_${audioId}`);
        
        // Create playhead indicator
        const playheadDiv = document.createElement('div');
        playheadDiv.style.cssText = 'height: 2px; background: #dd8800; width: 0%; margin-top: 4px; transition: width 0.1s linear;';
        container.appendChild(playheadDiv);
        
        // Update playhead on timeupdate
        audioElement.ontimeupdate = () => {
            if (audioElement.duration) {
                const percent = (audioElement.currentTime / audioElement.duration) * 100;
                playheadDiv.style.width = percent + '%';
            }
        };
        
        // Also update waveform cursor position
        audioElement.ontimeupdate = () => {
            if (audioElement.duration && waveformCanvas) {
                const percent = audioElement.currentTime / audioElement.duration;
                drawWaveformWithCursor(processedArray, percent);
            }
        };
        
        // Auto-play preview
        audioElement.play();
        
    } catch (err) {
        statusDiv.innerText = `❌ Error: ${err.message}`;
    }
    
    isProcessing = false;
    processBtn.disabled = false;
};

// ========== Export ==========
exportBtn.onclick = async () => {
    if (!processedArray) {
        statusDiv.innerText = '❌ Process audio first';
        return;
    }
    
    const wavData = floatToWav(processedArray, currentSampleRate);
    const filename = `quantum_lens_${currentMode}_${Date.now()}.wav`;
    const savedPath = await window.electronAPI.saveFile(wavData, filename);
    
    if (savedPath) {
        statusDiv.innerText = `✅ Exported to: ${savedPath}`;
    }
};

// ========== Mode Switching ==========
lensModeBtn.onclick = () => {
    currentMode = 'lens';
    params.mode = 'lens';
    lensModeBtn.classList.add('active');
    barrierModeBtn.classList.remove('active');
    updateKnobs();
    updateTransferPlot();
};

barrierModeBtn.onclick = () => {
    currentMode = 'barrier';
    params.mode = 'barrier';
    barrierModeBtn.classList.add('active');
    lensModeBtn.classList.remove('active');
    updateKnobs();
    updateTransferPlot();
};

// ========== Material Change ==========
materialSelect.onchange = (e) => {
    params.material = e.target.value;
    updateTransferPlot();
};

// ========== Knob Initialization ==========
makeKnob('cutoffKnob', 'cutoff', 200, 20000, updateTransferPlot);
makeKnob('sharpKnob', 'sharpness', 0.3, 2.2, updateTransferPlot);
makeKnob('thickKnob', 'thickness', 0.5, 15, updateTransferPlot);
makeKnob('coatKnob', 'coating', 0.1, 5, updateTransferPlot);

// ========== Menu Events ==========
if (window.electronAPI) {
    window.electronAPI.onMenuOpenFile(() => openFileBtn.click());
    window.electronAPI.onMenuExport(() => exportBtn.click());
    // fix: onModeSwitch handler
    window.electronAPI.onModeSwitch((event, mode) => {
        if (mode === 'lens') {
            lensModeBtn.click();
        } else {
            barrierModeBtn.click();
        }
        updateTransferPlot();  // Force plot refresh
    });
}

// ========== Initialization ==========
updateKnobs();
updateTransferPlot();
statusDiv.innerText = '✅ Quantum Lens ready. Load an audio file.';
