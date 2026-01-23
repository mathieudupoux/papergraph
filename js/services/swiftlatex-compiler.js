/**
 * LaTeX Online Compiler Service
 * HTTP-based LaTeX compilation using latex-online server
 * Based on aslushnikov/latex-online API
 */

class LaTeXOnlineCompiler {
    constructor() {
        // Default to public latex-online instance
        this.serverUrl = 'https://latex.ytotech.com';
        this.isReady = true; // Always ready, no initialization needed
        console.log('📦 LaTeX Online compiler created');
    }

    /**
     * Initialize compiler (no-op for HTTP-based compilation)
     */
    async initialize() {
        console.log('✅ LaTeX Online compiler ready');
        return true;
    }

    /**
     * Compile LaTeX to PDF via latex-online server
     * @param {string} mainTexContent - Main LaTeX document
     * @param {Object} options - Compilation options
     * @param {string} options.bibContent - BibTeX content (optional)
     * @returns {Promise<Blob>} PDF blob
     */
    async compileToPDF(mainTexContent, options = {}) {
        const { bibContent } = options;

        try {
            console.log('📄 Starting LaTeX compilation via latex-online...');
            console.log(`   Document length: ${mainTexContent.length} chars`);
            console.log(`   First 200 chars: ${mainTexContent.substring(0, 200)}`);

            if (bibContent && bibContent.trim()) {
                console.log(`   Bibliography: ${bibContent.length} chars`);
            }

            // Create tar.gz archive
            console.log('📦 Creating tar.gz archive...');
            const tarGzData = await this.createTarGz(mainTexContent, bibContent);
            console.log(`✅ Archive created (${tarGzData.length} bytes)`);

            // Upload to latex-online server
            console.log(`📤 Uploading to ${this.serverUrl}/data?target=main.tex`);
            console.log('⏳ Waiting for compilation (this may take 10-60 seconds)...');

            const startTime = performance.now();

            const response = await fetch(`${this.serverUrl}/data?target=main.tex`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-tar',
                    'Accept': 'application/pdf',
                },
                body: tarGzData
            });

            const endTime = performance.now();
            console.log(`✅ Server responded in ${(endTime - startTime).toFixed(2)}ms`);

            if (!response.ok) {
                const errorText = await response.text();
                console.error('❌ Server error:', response.status, response.statusText);
                console.error('❌ Error details:', errorText);
                throw new Error(`Server error: ${response.status} ${response.statusText}\n${errorText}`);
            }

            // Get PDF
            console.log('📥 Downloading PDF...');
            const pdfData = await response.arrayBuffer();

            // Verify it's actually a PDF
            const uint8Array = new Uint8Array(pdfData);
            const isPDF = uint8Array[0] === 0x25 && // %
                          uint8Array[1] === 0x50 && // P
                          uint8Array[2] === 0x44 && // D
                          uint8Array[3] === 0x46;   // F

            if (!isPDF) {
                const text = new TextDecoder().decode(uint8Array.slice(0, 500));
                console.error('❌ Response is not a PDF:', text);
                throw new Error('Server returned invalid PDF: ' + text);
            }

            const pdfBlob = new Blob([pdfData], { type: 'application/pdf' });
            console.log(`✅ PDF generated successfully (${pdfBlob.size} bytes)`);

            return pdfBlob;

        } catch (error) {
            console.error('❌ Compilation failed with error:', error);
            console.error('❌ Error stack:', error.stack);
            throw new Error(`Compilation failed: ${error.message}`);
        }
    }

    /**
     * Create tar.gz archive with LaTeX files
     * @param {string} mainTexContent - Main LaTeX content
     * @param {string} bibContent - BibTeX content (optional)
     * @returns {Promise<Uint8Array>} tar.gz data
     */
    async createTarGz(mainTexContent, bibContent) {
        const files = [
            { name: 'main.tex', content: mainTexContent }
        ];

        if (bibContent && bibContent.trim()) {
            files.push({ name: 'references.bib', content: bibContent });
        }

        console.log(`📝 Creating tar archive with ${files.length} file(s):`);
        files.forEach(f => console.log(`   - ${f.name} (${f.content.length} bytes)`));

        // Create tar archive
        const tarData = this.createTar(files);
        console.log(`✅ Tar archive created (${tarData.length} bytes)`);

        // Gzip compression
        const gzipData = await this.gzip(tarData);
        console.log(`✅ Gzip compressed (${gzipData.length} bytes)`);

        return gzipData;
    }

    /**
     * Create tar archive from files
     * @param {Array} files - Array of {name, content} objects
     * @returns {Uint8Array} tar data
     */
    createTar(files) {
        const blocks = [];

        for (const file of files) {
            const content = new TextEncoder().encode(file.content);
            const header = this.createTarHeader(file.name, content.length);

            blocks.push(header);
            blocks.push(content);

            // Padding to 512-byte boundary
            const padding = 512 - (content.length % 512);
            if (padding < 512) {
                blocks.push(new Uint8Array(padding));
            }
        }

        // End of archive (two empty 512-byte blocks)
        blocks.push(new Uint8Array(512));
        blocks.push(new Uint8Array(512));

        // Concatenate all blocks
        const totalLength = blocks.reduce((sum, block) => sum + block.length, 0);
        const result = new Uint8Array(totalLength);
        let offset = 0;
        for (const block of blocks) {
            result.set(block, offset);
            offset += block.length;
        }

        return result;
    }

    /**
     * Create tar header (512 bytes)
     * @param {string} filename - File name
     * @param {number} size - File size in bytes
     * @returns {Uint8Array} tar header
     */
    createTarHeader(filename, size) {
        const header = new Uint8Array(512);

        // File name (100 bytes, offset 0)
        this.writeString(header, 0, filename, 100);

        // File mode (8 bytes, offset 100) - "0000644\0"
        this.writeString(header, 100, '0000644\0', 8);

        // Owner ID (8 bytes, offset 108) - "0000000\0"
        this.writeString(header, 108, '0000000\0', 8);

        // Group ID (8 bytes, offset 116) - "0000000\0"
        this.writeString(header, 116, '0000000\0', 8);

        // File size (12 bytes, offset 124) - octal + null
        this.writeString(header, 124, this.toOctal(size, 11) + '\0', 12);

        // Modification time (12 bytes, offset 136) - octal + null
        const mtime = Math.floor(Date.now() / 1000);
        this.writeString(header, 136, this.toOctal(mtime, 11) + '\0', 12);

        // Checksum placeholder (8 bytes, offset 148) - spaces initially
        this.writeString(header, 148, '        ', 8);

        // Type flag (1 byte, offset 156) - '0' for regular file
        header[156] = 0x30;

        // Link name (100 bytes, offset 157) - unused
        // Magic (6 bytes, offset 257) - "ustar\0"
        this.writeString(header, 257, 'ustar\0', 6);

        // Version (2 bytes, offset 263) - "00"
        this.writeString(header, 263, '00', 2);

        // Calculate checksum (sum of all bytes)
        let checksum = 0;
        for (let i = 0; i < 512; i++) {
            checksum += header[i];
        }

        // Write checksum (6 octal digits + null + space, offset 148)
        this.writeString(header, 148, this.toOctal(checksum, 6) + '\0 ', 8);

        return header;
    }

    /**
     * Write string to buffer at offset
     * @param {Uint8Array} buffer - Target buffer
     * @param {number} offset - Start offset
     * @param {string} str - String to write
     * @param {number} maxLength - Maximum length
     */
    writeString(buffer, offset, str, maxLength) {
        const bytes = new TextEncoder().encode(str);
        const length = Math.min(maxLength, bytes.length);
        for (let i = 0; i < length; i++) {
            buffer[offset + i] = bytes[i];
        }
    }

    /**
     * Convert number to octal string with padding
     * @param {number} num - Number to convert
     * @param {number} length - Target length
     * @returns {string} Octal string
     */
    toOctal(num, length) {
        return num.toString(8).padStart(length, '0');
    }

    /**
     * Gzip compress data
     * @param {Uint8Array} data - Data to compress
     * @returns {Promise<Uint8Array>} Compressed data
     */
    async gzip(data) {
        // Use CompressionStream API if available (modern browsers)
        if (typeof CompressionStream !== 'undefined') {
            try {
                const stream = new Blob([data]).stream();
                const compressedStream = stream.pipeThrough(new CompressionStream('gzip'));
                const blob = await new Response(compressedStream).blob();
                return new Uint8Array(await blob.arrayBuffer());
            } catch (error) {
                console.warn('⚠️ CompressionStream failed:', error);
            }
        }

        // Fallback: return uncompressed
        // latex-online server should accept uncompressed tar
        console.warn('⚠️ Gzip compression not available, sending uncompressed tar');
        return data;
    }

    /**
     * Reset compiler state (no-op for HTTP-based compilation)
     */
    async reset() {
        console.log('🧹 Compiler reset (no-op for HTTP-based compilation)');
    }

    /**
     * Set custom server URL
     * @param {string} url - Server URL (e.g., 'https://latex.ytotech.com')
     */
    setServerUrl(url) {
        this.serverUrl = url.replace(/\/$/, ''); // Remove trailing slash
        console.log(`🔧 Server URL set to: ${this.serverUrl}`);
    }
}

// Create and export singleton
const latexOnlineCompiler = new LaTeXOnlineCompiler();

// Make globally available (maintain compatibility with existing code)
window.swiftLatexCompiler = latexOnlineCompiler; // Keep old name for compatibility
window.latexOnlineCompiler = latexOnlineCompiler;

// Also export for modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = latexOnlineCompiler;
}
