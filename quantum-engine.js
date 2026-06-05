const FFT = require('fft-js').fft;
const FFTUtil = require('fft-js').util;

class QuantumLensEngine {
    constructor() {
        // Material database (Aalener Optik-Formelrechner)
        this.materials = {
            'cr39': { name: 'CR-39', n: 1.498, t0: 92.0, abbe: 58 },
            'poly': { name: 'Polycarbonate', n: 1.586, t0: 89.5, abbe: 30 },
            'high': { name: 'High-index', n: 1.670, t0: 98.5, abbe: 36 },
            'crown': { name: 'Crown Glass', n: 1.523, t0: 99.2, abbe: 59 },
            'flint': { name: 'Flint Glass', n: 1.805, t0: 97.0, abbe: 25 }
        };
        
        this.sampleRate = 44100;
        this.fftSize = 4096;
    }
    
    fresnelR(n1, n2) {
        const r = (n1 - n2) / (n1 + n2);
        return r * r;
    }
    
    materialT(t0Percent, dMm) {
        return Math.pow(t0Percent / 100, dMm / 10);
    }
    
    getTransmissionAtFrequency(freq, params) {
        const mat = this.materials[params.material];
        
        // Dispersion: n varies with frequency
        const fNorm = Math.min(1.0, freq / params.cutoff);
        const nDisp = mat.n * (1.0 - 0.06 * Math.sin(fNorm * Math.PI));
        
        // Surface 1 (air → lens)
        const R1 = this.fresnelR(1.0, nDisp);
        const coatFactor = 1.0 - params.coating / 100;
        const Tsurf = 1.0 - R1 * coatFactor;
        
        // Material absorption
        const Tmat = this.materialT(mat.t0, params.thickness);
        
        // Surface 2 (lens → air)
        const R2 = this.fresnelR(nDisp, 1.0);
        const Tsurf2 = 1.0 - R2 * coatFactor;
        
        const Toptics = Tsurf * Tmat * Tsurf2;
        
        if (params.mode === 'lens') {
            const rolloff = 1.0 / (1.0 + Math.pow(fNorm, 3.8));
            const resonance = 1.0 + 0.1 * Math.exp(-Math.pow((freq/params.cutoff - 0.78)/0.12, 2));
            return Math.min(0.99, Toptics * rolloff * resonance);
        } else {
            const df = Math.abs(freq - params.cutoff) / params.cutoff;
            const safeDf = Math.max(df, 0.0005);
            const barrier = Math.pow(1.0 / safeDf, params.sharpness);
            const maxBarrier = Math.pow(1.0 / 0.0005, params.sharpness);
            const Tbarrier = barrier / (1.0 + barrier / maxBarrier);
            return Math.min(0.99, Toptics * Tbarrier);
        }
    }
    
    getTransferFunctionPoints(params) {
        const points = [];
        for (let i = 0; i <= 200; i++) {
            const freq = (i / 200) * 20000;
            points.push({
                freq: freq,
                gain: this.getTransmissionAtFrequency(freq, params)
            });
        }
        return points;
    }
    
    async processBuffer(inputArray, params) {
        const nSamples = inputArray.length;
        const input = inputArray instanceof Float32Array ? inputArray : new Float32Array(inputArray);
        
        // Pad to power of 2
        const fftSize = Math.pow(2, Math.ceil(Math.log2(nSamples)));
        const padded = new Float32Array(fftSize);
        padded.set(input);
        
        // FFT
        const phasors = FFT(padded);
        const magnitudes = FFTUtil.fftMag(phasors);
        const frequencies = FFTUtil.fftFreq(phasors, this.sampleRate);
        
        // Apply transfer function
        for (let i = 0; i < magnitudes.length; i++) {
            const gain = this.getTransmissionAtFrequency(frequencies[i], params);
            phasors[i] = [phasors[i][0] * gain, phasors[i][1] * gain];
        }
        
        // Inverse FFT
        const inverted = FFTUtil.ifft(phasors);
        const output = new Float32Array(nSamples);
        
        for (let i = 0; i < nSamples; i++) {
            output[i] = inverted[i] / fftSize;
        }
        
        // Normalize
        let maxVal = 0;
        for (let i = 0; i < output.length; i++) {
            maxVal = Math.max(maxVal, Math.abs(output[i]));
        }
        if (maxVal > 0.95) {
            for (let i = 0; i < output.length; i++) {
                output[i] *= 0.9 / maxVal;
            }
        }
        
        return output;
    }
}

module.exports = new QuantumLensEngine();
