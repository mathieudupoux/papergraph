// Supabase Edge Function: fetch-arxiv
// Fetches arXiv metadata to bypass CORS restrictions

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
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
    const format = body?.format || 'xml'

    // If requesting BibTeX, fetch from arxiv.org/bibtex endpoint
    if (format === 'bibtex') {
      try {
        const bibtexUrl = `https://arxiv.org/bibtex/${sanitizedId}`
        const bibtexResponse = await fetch(bibtexUrl)
        if (bibtexResponse.ok) {
          const bibtexText = await bibtexResponse.text()
          return new Response(
            JSON.stringify(bibtexText),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
          )
        }
        return new Response(
          JSON.stringify({ error: `BibTeX fetch failed with status ${bibtexResponse.status}` }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 502 }
        )
      } catch (err) {
        return new Response(
          JSON.stringify({ error: `BibTeX fetch failed: ${String(err)}` }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 502 }
        )
      }
    }

    const arxivUrl = `https://export.arxiv.org/api/query?search_query=id:${sanitizedId}&start=0&max_results=1`

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
        const altUrl = `https://export.arxiv.org/api/query?id_list=${sanitizedId}`
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
