// quantum-engine.js - Complete working version
// Using native FFT implementation (no external dependencies)

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

    // Fresnel reflection (from Aalener Java code)
    fresnelR(n1, n2) {
        const r = (n1 - n2) / (n1 + n2);
        return r * r;
    }

    // Material transmission: T = (T0/100)^(d/10)
    materialT(t0Percent, dMm) {
        if (t0Percent <= 0) return 0;
        return Math.pow(t0Percent / 100, dMm / 10);
    }

    // Get transmission at specific frequency
    // fix:  Replaced getTransmissionAtFrequency()    
    getTransmissionAtFrequency(freq, params) {
        const mat = this.materials[params.material];
        if (!mat) return 0.5;
    
        const fNorm = Math.min(1.0, freq / params.cutoff);
        const nDisp = mat.n * (1.0 - 0.06 * Math.sin(fNorm * Math.PI));
    
        // Optical transmission (same for both modes)
        const R1 = this.fresnelR(1.0, nDisp);
        const coatFactor = 1.0 - (params.coating || 0.8) / 100;
        const Tsurf = 1.0 - R1 * coatFactor;
        const Tmat = this.materialT(mat.t0, params.thickness || 2.2);
        const R2 = this.fresnelR(nDisp, 1.0);
        const Tsurf2 = 1.0 - R2 * coatFactor;
        const Toptics = Tsurf * Tmat * Tsurf2;
    
        if (params.mode === 'lens') {
            // ========== LENS MODE ==========
            // Smooth, gentle rolloff — DENOISER
            // Removes high-frequency hiss, preserves transients
            
            // Gentle low-pass (12dB/octave)
            let gain = 1.0 / (1.0 + Math.pow(fNorm, 2.5));
            
            // Add gentle presence boost around 2-4kHz (clarity)
            const presence = 1.0 + 0.15 * Math.exp(-Math.pow((freq / 3000 - 1.0) / 0.5, 2));
            
            // No resonance — clean!
            gain = gain * presence;
            
            // Apply optical transmission as subtle shaping
            gain = gain * (0.7 + 0.3 * Toptics);
            
            return Math.min(0.98, Math.max(0.02, gain));
            
        } else {
            // ========== BARRIER MODE ==========
            // Divergent barrier — COMPRESSOR / RESONATOR
            // Creates infinite slope at cutoff (p=1.0 = ∫1/|x|dx = ∞)
            
            const df = Math.abs(freq - params.cutoff) / params.cutoff;
            const safeDf = Math.max(df, 0.003);
            const p = params.sharpness || 1.0;
            
            // Divergent barrier: 1/|Δf|^p
            let barrier = Math.pow(1.0 / safeDf, p);
            
            // Normalize to 0-1 range
            const maxBarrier = Math.pow(1.0 / 0.003, p);
            barrier = barrier / (1.0 + barrier / maxBarrier);
            
            // Add resonance peak exactly at cutoff
            const resonance = 1.0 + 0.5 * Math.exp(-Math.pow((freq / params.cutoff - 1.0) / 0.05, 2));
            
            // Combine: barrier cuts, resonance boosts, optical shapes
            let gain = barrier * resonance * Toptics;
            
            // Clamp
            return Math.min(0.99, Math.max(0.01, gain));
        }
    }

    // Get transfer function points for plotting
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

    // Simple FFT (real-valued, Cooley-Tukey)
    fftReal(input) {
        const n = input.length;
        if (n <= 1) return [{ re: input[0], im: 0 }];
        
        // Check if power of two
        if ((n & (n - 1)) !== 0) {
            // Not power of two — use zero padding
            const nextPower = Math.pow(2, Math.ceil(Math.log2(n)));
            const padded = new Array(nextPower).fill(0);
            for (let i = 0; i < n; i++) padded[i] = input[i];
            return this.fftReal(padded);
        }
        
        // Split even and odd
        const even = new Array(n / 2);
        const odd = new Array(n / 2);
        for (let i = 0; i < n / 2; i++) {
            even[i] = input[2 * i];
            odd[i] = input[2 * i + 1];
        }
        
        // Recursive FFT
        const evenFFT = this.fftReal(even);
        const oddFFT = this.fftReal(odd);
        
        // Combine
        const result = new Array(n);
        for (let k = 0; k < n / 2; k++) {
            const angle = -2 * Math.PI * k / n;
            const tRe = oddFFT[k].re * Math.cos(angle) - oddFFT[k].im * Math.sin(angle);
            const tIm = oddFFT[k].re * Math.sin(angle) + oddFFT[k].im * Math.cos(angle);
            
            result[k] = {
                re: evenFFT[k].re + tRe,
                im: evenFFT[k].im + tIm
            };
            result[k + n / 2] = {
                re: evenFFT[k].re - tRe,
                im: evenFFT[k].im - tIm
            };
        }
        return result;
    }
    
    // Simple inverse FFT
    ifft(complexArray) {
        const n = complexArray.length;
        // Conjugate
        const conjugated = complexArray.map(c => ({ re: c.re, im: -c.im }));
        // Forward FFT
        const fftResult = this.fftReal(conjugated.map(c => c.re));
        // Conjugate and divide by n
        const result = new Array(n);
        for (let i = 0; i < n; i++) {
            result[i] = { re: fftResult[i].re / n, im: -fftResult[i].im / n };
        }
        return result;
    }
    
    // Get magnitude from complex
    getMagnitude(complex) {
        return Math.sqrt(complex.re * complex.re + complex.im * complex.im);
    }

    // Process audio buffer
    async processBuffer(inputArray, params) {
        const nSamples = inputArray.length;
        const input = inputArray instanceof Float32Array ? inputArray : new Float32Array(inputArray);
        
        // Find next power of two for FFT
        const fftSize = Math.pow(2, Math.ceil(Math.log2(nSamples)));
        const padded = new Array(fftSize).fill(0);
        for (let i = 0; i < nSamples; i++) padded[i] = input[i];
        
        try {
            // FFT
            const spectrum = this.fftReal(padded);
            const magnitudes = spectrum.map(c => this.getMagnitude(c));
            
            // Apply transfer function
            for (let i = 0; i < spectrum.length; i++) {
                const freq = (i / fftSize) * this.sampleRate;
                const gain = this.getTransmissionAtFrequency(freq, params);
                spectrum[i].re *= gain;
                spectrum[i].im *= gain;
            }
            
            // Inverse FFT
            const inverted = this.ifft(spectrum);
            
            // Extract real part and trim to original length
            const output = new Float32Array(nSamples);
            for (let i = 0; i < nSamples; i++) {
                output[i] = inverted[i].re;
            }
            
            // Normalize to avoid clipping
            let maxVal = 0;
            for (let i = 0; i < output.length; i++) {
                maxVal = Math.max(maxVal, Math.abs(output[i]));
            }
            if (maxVal > 0.95) {
                const gain = 0.9 / maxVal;
                for (let i = 0; i < output.length; i++) {
                    output[i] *= gain;
                }
            }
            
            return output;
            
        } catch (err) {
            console.error('FFT error:', err);
            // Fallback: return original (no processing)
            return input;
        }
    }
}

module.exports = new QuantumLensEngine();
