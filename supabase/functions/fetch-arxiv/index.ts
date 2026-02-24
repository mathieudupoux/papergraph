// Supabase Edge Function: fetch-arxiv
// Fetches arXiv metadata to bypass CORS restrictions

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Parse request body
    const body = await req.json().catch(() => null)
    const arxivId = body?.arxivId

    if (!arxivId) {
      return new Response(
        JSON.stringify({ error: 'Missing arxivId parameter' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      )
    }

    // Sanitize arXiv ID (only allow valid characters: digits, dots, slashes, hyphens, v+digits)
    const sanitizedId = String(arxivId).replace(/[^a-zA-Z0-9.\-\/]/g, '')

    // arXiv API uses http:// per their official documentation
    // See: https://info.arxiv.org/help/api/user-manual.html
    const arxivUrl = `http://export.arxiv.org/api/query?search_query=id:${sanitizedId}&start=0&max_results=1`

    let xmlText = ''
    let lastError = ''

    // Try fetching with retries (arXiv can rate-limit with 429)
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        if (attempt > 0) {
          // Wait 3 seconds between retries as recommended by arXiv
          await new Promise(r => setTimeout(r, 3000))
        }

        const response = await fetch(arxivUrl)

        if (response.status === 429) {
          lastError = 'Rate limited by arXiv (429)'
          continue
        }

        if (!response.ok) {
          lastError = `arXiv returned HTTP ${response.status}`
          continue 
        }

        xmlText = await response.text()
        break // Success
      } catch (fetchErr) {
        lastError = `Fetch failed: ${String(fetchErr)}`
      }
    }

    // If all retries failed and we still have no XML, try the id_list variant
    if (!xmlText) {
      try {
        const altUrl = `http://export.arxiv.org/api/query?id_list=${sanitizedId}`
        const altResponse = await fetch(altUrl)
        if (altResponse.ok) {
          xmlText = await altResponse.text()
        }
      } catch (_) {
        // ignore
      }
    }

    if (!xmlText) {
      return new Response(
        JSON.stringify({ error: `Failed to fetch arXiv after retries. Last error: ${lastError}` }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 502 }
      )
    }

    // Return the XML text as a JSON string
    return new Response(
      JSON.stringify(xmlText),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    )

  } catch (error) {
    return new Response(
      JSON.stringify({ error: String(error) }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }
})
