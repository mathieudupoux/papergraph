// Supabase Edge Function: compile-latex
// Proxies LaTeX compilation requests to University of Halle to avoid CORS issues

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

    // Parse the incoming request
    const jsonData = await req.json();
    console.log('📝 Received LaTeX compilation request');
    console.log('Parameters:', Object.keys(jsonData));

    // Extract parameters with proper mapping
    // Frontend sends: content, compiler
    const latexContent = jsonData.content || jsonData.filecontents || '';
    const compiler = jsonData.compiler || jsonData.engine || 'pdflatex';
    const filename = jsonData.filename || 'main.tex';

    if (!latexContent) {
      throw new Error('Missing LaTeX content (expected "content" or "filecontents" parameter)');
    }

    console.log('Document length:', latexContent.length, 'characters');
    console.log('Compiler:', compiler);

    // Step 1: Prepare form data for University of Halle
    // Note: Using array notation for filecontents[] and filename[]
    const formData = new FormData();
    formData.append('filecontents[]', latexContent);
    formData.append('filename[]', filename);
    formData.append('engine', compiler);
    formData.append('return', 'pdf');

    console.log('🚀 Forwarding to University of Halle...');

    // Step 2: Submit to University of Halle
    const response = await fetch(LATEX_API, {
      method: 'POST',
      body: formData
    });

    console.log('✅ Response status:', response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ University of Halle request error:', errorText);

      return new Response(
        JSON.stringify({
          error: 'LaTeX compilation request failed',
          details: errorText,
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

    // Step 3: Parse HTML response to find PDF download link
    const htmlResponse = await response.text();
    console.log('📄 Received HTML response, parsing for PDF link...');

    // Look for PDF download link in the response
    const pdfLinkMatch = htmlResponse.match(/href=["']([^"']*\.pdf)["']/i);

    let pdfUrl = null;

    if (!pdfLinkMatch) {
      // Try alternative patterns
      const alternativeMatch = htmlResponse.match(/location\.href\s*=\s*["']([^"']*\.pdf)["']/i);
      if (alternativeMatch) {
        pdfUrl = alternativeMatch[1];
      }
    } else {
      pdfUrl = pdfLinkMatch[1];
    }

    if (!pdfUrl) {
      console.error('❌ Could not find PDF link in HTML response');
      console.error('HTML Response (first 1000 chars):', htmlResponse.substring(0, 1000));

      return new Response(
        JSON.stringify({
          error: 'PDF link not found in response',
          details: 'The service returned HTML but no PDF download link was found',
          htmlSample: htmlResponse.substring(0, 500)
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

    // Step 4: Make URL absolute if it's relative
    if (pdfUrl.startsWith('/')) {
      pdfUrl = 'https://latex.informatik.uni-halle.de' + pdfUrl;
    } else if (!pdfUrl.startsWith('http')) {
      pdfUrl = 'https://latex.informatik.uni-halle.de/latex-online/' + pdfUrl;
    }

    console.log('🔗 Found PDF URL:', pdfUrl);

    // Step 5: Fetch the actual PDF
    const pdfResponse = await fetch(pdfUrl);

    if (!pdfResponse.ok) {
      console.error('❌ Failed to download PDF');

      return new Response(
        JSON.stringify({
          error: 'Failed to download PDF',
          pdfUrl: pdfUrl,
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

    // Check if response is actually a PDF (starts with %PDF-)
    const isPDF = uint8Array[0] === 0x25 && // %
                  uint8Array[1] === 0x50 && // P
                  uint8Array[2] === 0x44 && // D
                  uint8Array[3] === 0x46;   // F

    console.log('✅ Response is PDF:', isPDF, 'Size:', pdfData.byteLength, 'bytes');

    if (!isPDF) {
      // Response might be an error page
      const errorText = new TextDecoder().decode(pdfData);
      console.error('❌ Downloaded file is not a PDF:', errorText.substring(0, 500));

      return new Response(
        JSON.stringify({
          error: 'Downloaded file is not a PDF',
          details: 'The downloaded file does not appear to be a valid PDF',
          content: errorText.substring(0, 500)
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

    console.log('✅ PDF generated and downloaded successfully');

    // Return the PDF with proper CORS headers
    return new Response(pdfData, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Access-Control-Allow-Origin': '*',
        'Content-Disposition': 'inline; filename="document.pdf"',
        'Cache-Control': 'no-cache'
      }
    });

  } catch (error) {
    console.error('❌ Proxy error:', error);

    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || 'Internal server error'
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
