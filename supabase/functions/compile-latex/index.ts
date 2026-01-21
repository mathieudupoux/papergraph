// Supabase Edge Function: compile-latex
// Proxies LaTeX compilation requests to texlive.net to avoid CORS issues

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const TEXLIVE_API = 'https://texlive.net/cgi-bin/latexcgi';

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'content-type',
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
    const contentType = req.headers.get('content-type') || '';
    let latexParams: URLSearchParams;

    if (contentType.includes('application/json')) {
      // If JSON, convert to URLSearchParams
      const jsonData = await req.json();
      latexParams = new URLSearchParams(jsonData);
    } else if (contentType.includes('application/x-www-form-urlencoded')) {
      // Already URL-encoded form data
      const formData = await req.text();
      latexParams = new URLSearchParams(formData);
    } else {
      throw new Error('Unsupported content type. Use application/json or application/x-www-form-urlencoded');
    }

    console.log('📝 Proxying LaTeX compilation request to texlive.net');
    console.log('Document length:', latexParams.get('filecontents')?.length || 0, 'characters');

    // Forward the request to texlive.net
    const response = await fetch(TEXLIVE_API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: latexParams.toString()
    });

    console.log('✅ Response status:', response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ TeXLive compilation error:', errorText);

      return new Response(
        JSON.stringify({
          error: 'LaTeX compilation failed',
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

    // Get the PDF blob
    const pdfBlob = await response.blob();
    console.log('✅ PDF generated, size:', pdfBlob.size, 'bytes');

    // Return the PDF with proper CORS headers
    return new Response(pdfBlob, {
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
