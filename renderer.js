const WaveFile = require('wavefile').WaveFile;

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

// Knob drawing
function drawKnob(canvasId, value, min, max) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width, h = canvas.height;
    const angle = -Math.PI * 0.75 + (value - min) / (max - min) * Math.PI * 1.5;
    
    ctx.clearRect(0, 0, w, h);
    
    // Background
    ctx.beginPath();
    ctx.arc(w/2, h/2, w*0.38, -Math.PI*0.75, Math.PI*0.75);
    ctx.strokeStyle = '#3a3a3a';
    ctx.lineWidth = 6;
    ctx.stroke();
    
    // Value arc
    ctx.beginPath();
    ctx.arc(w/2, h/2, w*0.38, -Math.PI*0.75, angle);
    ctx.strokeStyle = '#dd8800';
    ctx.stroke();
    
    // Center
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

// Knob dragging
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

// Update frequency response plot
async function updateTransferPlot() {
    const ctx = freqPlot.getContext('2d');
    const w = freqPlot.width = 900;
    const h = freqPlot.height = 250;
    
    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(0, 0, w, h);
    
    const points = await window.electronAPI.getTransferPoints(params);
    
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
}

// Draw waveform
function drawWaveform(data, sr) {
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

// Load audio file
openFileBtn.onclick = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'audio/*';
    input.onchange = async (e) => {
        const file = e.target.files[0];
        statusDiv.innerText = `📂 Loading: ${file.name}...`;
        
        const arrayBuffer = await file.arrayBuffer();
        const audioContext = new AudioContext();
        currentAudioBuffer = await audioContext.decodeAudioData(arrayBuffer);
        currentAudioArray = currentAudioBuffer.getChannelData(0);
        currentSampleRate = currentAudioBuffer.sampleRate;
        
        statusDiv.innerText = `✅ Loaded: ${file.name} (${currentAudioBuffer.duration.toFixed(1)}s, ${currentSampleRate}Hz)`;
        drawWaveform(currentAudioArray);
        
        // Show original player
        const url = URL.createObjectURL(file);
        playbackArea.innerHTML = `
            <div style="margin-top: 15px;">
                <div style="font-size: 10px; margin-bottom: 5px;">🎧 Original</div>
                <audio controls src="${url}" style="width: 100%;"></audio>
            </div>
        `;
    };
    input.click();
};

// Process audio
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
        
        // Preview
        const audioContext = new AudioContext();
        const buffer = audioContext.createBuffer(1, processedArray.length, currentSampleRate);
        buffer.copyToChannel(processedArray, 0);
        const source = audioContext.createBufferSource();
        source.buffer = buffer;
        source.connect(audioContext.destination);
        source.start();
        
        drawWaveform(processedArray);
        
        playbackArea.innerHTML += `
            <div style="margin-top: 15px;">
                <div style="font-size: 10px; margin-bottom: 5px;">🌀 Processed (${currentMode.toUpperCase()} mode)</div>
                <audio controls src="${URL.createObjectURL(new Blob())}" style="width: 100%;" id="previewPlayer"></audio>
            </div>
        `;
        
        // Update preview player
        const wav = floatToWav(processedArray, currentSampleRate);
        const blob = new Blob([wav], { type: 'audio/wav' });
        const url = URL.createObjectURL(blob);
        document.getElementById('previewPlayer').src = url;
        
    } catch (err) {
        statusDiv.innerText = `❌ Error: ${err.message}`;
    }
    
    isProcessing = false;
    processBtn.disabled = false;
};

// Export
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

// Float32Array to WAV
function floatToWav(samples, sampleRate) {
    const wav = new WaveFile();
    const int16 = new Int16Array(samples.length);
    for (let i = 0; i < samples.length; i++) {
        int16[i] = Math.max(-32768, Math.min(32767, Math.floor(samples[i] * 32767)));
    }
    wav.fromScratch(1, sampleRate, '16', int16);
    return wav.toBuffer();
}

// Mode switching
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

// Material change
materialSelect.onchange = (e) => {
    params.material = e.target.value;
    updateTransferPlot();
};

// Range inputs for cutoff (as fallback if knobs not used)
// Also handle parameter changes
function setupParameterInputs() {
    const cutoffInput = document.createElement('input');
    cutoffInput.type = 'range';
    cutoffInput.min = 200;
    cutoffInput.max = 20000;
    cutoffInput.value = params.cutoff;
    cutoffInput.style.display = 'none';
    document.body.appendChild(cutoffInput);
    cutoffInput.oninput = (e) => {
        params.cutoff = parseFloat(e.target.value);
        updateKnobs();
        updateTransferPlot();
    };
}

// Knob initialization
makeKnob('cutoffKnob', 'cutoff', 200, 20000, updateTransferPlot);
makeKnob('sharpKnob', 'sharpness', 0.3, 2.2, updateTransferPlot);
makeKnob('thickKnob', 'thickness', 0.5, 15, updateTransferPlot);
makeKnob('coatKnob', 'coating', 0.1, 5, updateTransferPlot);

// Menu events
window.electronAPI.onMenuOpenFile(() => openFileBtn.click());
window.electronAPI.onMenuExport(() => exportBtn.click());
window.electronAPI.onModeSwitch((event, mode) => {
    if (mode === 'lens') lensModeBtn.click();
    else barrierModeBtn.click();
});

// Initialization
updateKnobs();
updateTransferPlot();
statusDiv.innerText = '✅ Quantum Lens ready. Load an audio file.';
