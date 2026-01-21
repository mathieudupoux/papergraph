// Supabase Edge Function: compile-latex
// Scrapes/proxies University of Halle LaTeX compiler to avoid CORS issues

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const LATEX_API = 'https://latex.informatik.uni-halle.de/latex-online/latex.php';

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'content-type, authorization, x-client-info, apikey',
      }
    })
  }

  try {
    // Only allow POST requests
    if (req.method !== 'POST') {
      return new Response(
        JSON.stringify({ error: 'Method not allowed' }),
        {
          status: 405,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          }
        }
      )
    }

    // ============================================================================
    // STEP 1: Parse incoming request from frontend
    // ============================================================================
    const jsonData = await req.json();
    console.log('📝 Received LaTeX compilation request');
    console.log('Parameters:', Object.keys(jsonData));

    // Extract LaTeX content from frontend
    const latexContent = jsonData.content || jsonData.filecontents || jsonData.code || jsonData.latex || '';
    const compiler = jsonData.compiler || jsonData.engine || 'pdflatex';
    const filename = jsonData.filename || 'main.tex';

    if (!latexContent) {
      throw new Error('Missing LaTeX content');
    }

    console.log('Document length:', latexContent.length, 'characters');
    console.log('Compiler:', compiler);
    console.log('Filename:', filename);

    // ============================================================================
    // STEP 2: Submit LaTeX content to University of Halle (scrape HTML response)
    // ============================================================================
    console.log('🚀 Submitting to University of Halle...');

    // Try multiple FormData configurations (University of Halle uses array notation)
    const formData = new FormData();
    formData.append('filecontents[]', latexContent);
    formData.append('filename[]', filename);
    formData.append('engine', compiler);
    formData.append('return', 'pdf');

    const response = await fetch(LATEX_API, {
      method: 'POST',
      body: formData
    });

    console.log('✅ Response status:', response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ University of Halle HTTP error:', errorText.substring(0, 500));

      return new Response(
        JSON.stringify({
          error: 'LaTeX service returned an error',
          details: errorText.substring(0, 500),
          status: response.status
        }),
        {
          status: response.status,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          }
        }
      );
    }

    // ============================================================================
    // STEP 3: Parse HTML response to extract PDF download link
    // ============================================================================
    const htmlResponse = await response.text();
    console.log('📄 Received HTML response (length:', htmlResponse.length, 'chars)');
    console.log('First 200 chars:', htmlResponse.substring(0, 200));

    // Try multiple regex patterns to find PDF link
    let pdfUrl = null;

    // Pattern 1: Look for href="...pdf"
    const pattern1 = htmlResponse.match(/href=["']([^"']*\.pdf)["']/i);
    if (pattern1) {
      pdfUrl = pattern1[1];
      console.log('✓ Found PDF link (pattern 1):', pdfUrl);
    }

    // Pattern 2: Look for window.location or location.href redirect
    if (!pdfUrl) {
      const pattern2 = htmlResponse.match(/(?:window\.)?location(?:\.href)?\s*=\s*["']([^"']*\.pdf)["']/i);
      if (pattern2) {
        pdfUrl = pattern2[1];
        console.log('✓ Found PDF link (pattern 2):', pdfUrl);
      }
    }

    // Pattern 3: Look for any .pdf URL in the HTML
    if (!pdfUrl) {
      const pattern3 = htmlResponse.match(/["']((?:https?:)?\/\/[^"']*\.pdf)["']/i);
      if (pattern3) {
        pdfUrl = pattern3[1];
        console.log('✓ Found PDF link (pattern 3):', pdfUrl);
      }
    }

    if (!pdfUrl) {
      console.error('❌ Could not find PDF link in HTML response');
      console.error('HTML Response (first 1000 chars):', htmlResponse.substring(0, 1000));

      return new Response(
        JSON.stringify({
          error: 'PDF link not found in HTML response',
          details: 'The LaTeX service returned HTML but no PDF download link was found',
          htmlSample: htmlResponse.substring(0, 800)
        }),
        {
          status: 500,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          }
        }
      );
    }

    // ============================================================================
    // STEP 4: Construct absolute URL for PDF download
    // ============================================================================
    // Make URL absolute if it's relative
    let absolutePdfUrl = pdfUrl;

    if (pdfUrl.startsWith('//')) {
      // Protocol-relative URL
      absolutePdfUrl = 'https:' + pdfUrl;
    } else if (pdfUrl.startsWith('/')) {
      // Absolute path
      absolutePdfUrl = 'https://latex.informatik.uni-halle.de' + pdfUrl;
    } else if (!pdfUrl.startsWith('http')) {
      // Relative path
      absolutePdfUrl = 'https://latex.informatik.uni-halle.de/latex-online/' + pdfUrl;
    }

    console.log('🔗 Absolute PDF URL:', absolutePdfUrl);

    // ============================================================================
    // STEP 5: Download the actual PDF file
    // ============================================================================
    console.log('⬇️ Downloading PDF...');

    const pdfResponse = await fetch(absolutePdfUrl);

    if (!pdfResponse.ok) {
      console.error('❌ Failed to download PDF (HTTP', pdfResponse.status, ')');

      return new Response(
        JSON.stringify({
          error: 'Failed to download PDF',
          pdfUrl: absolutePdfUrl,
          status: pdfResponse.status
        }),
        {
          status: pdfResponse.status,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          }
        }
      );
    }

    // Get the PDF as ArrayBuffer
    const pdfData = await pdfResponse.arrayBuffer();
    const uint8Array = new Uint8Array(pdfData);

    // ============================================================================
    // STEP 6: Validate PDF magic bytes (%PDF-)
    // ============================================================================
    const isPDF = uint8Array.length >= 4 &&
                  uint8Array[0] === 0x25 && // %
                  uint8Array[1] === 0x50 && // P
                  uint8Array[2] === 0x44 && // D
                  uint8Array[3] === 0x46;   // F

    console.log('PDF validation:', {
      isPDF,
      size: pdfData.byteLength,
      firstBytes: Array.from(uint8Array.slice(0, 8)).map(b => '0x' + b.toString(16).padStart(2, '0')).join(' ')
    });

    if (!isPDF) {
      // Downloaded file is not a valid PDF - might be an error page
      const errorText = new TextDecoder().decode(pdfData);
      console.error('❌ Downloaded file is not a PDF');
      console.error('Content (first 500 chars):', errorText.substring(0, 500));

      return new Response(
        JSON.stringify({
          error: 'Downloaded file is not a valid PDF',
          details: 'The file does not start with PDF magic bytes (%PDF-)',
          possibleError: errorText.substring(0, 500)
        }),
        {
          status: 422,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          }
        }
      );
    }

    // ============================================================================
    // STEP 7: Return PDF to frontend with CORS headers
    // ============================================================================
    console.log('✅ PDF successfully compiled and validated');
    console.log('   Size:', pdfData.byteLength, 'bytes');

    return new Response(pdfData, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Access-Control-Allow-Origin': '*',
        'Content-Disposition': 'inline; filename="document.pdf"',
        'Content-Length': pdfData.byteLength.toString(),
        'Cache-Control': 'no-cache'
      }
    });

  } catch (error) {
    console.error('❌ Fatal error in Edge Function:', error);

    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || 'Internal server error',
        stack: error.stack
      }),
      {
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
        status: 500
      }
    )
  }
})
