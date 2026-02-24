// Supabase Edge Function: fetch-arxiv
// Fetches arXiv metadata to bypass CORS restrictions

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

serve(async (req) => {
  // CORS headers
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      }
    })
  }

  try {
    // Parse request body
    let arxivId;
    try {
      const body = await req.json()
      arxivId = body.arxivId
      console.log('Received request for arXiv ID:', arxivId)
    } catch (parseError) {
      console.error('Failed to parse request body:', parseError)
      return new Response(
        JSON.stringify({ error: 'Invalid request body' }),
        {
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
          status: 400,
        }
      )
    }
    
    if (!arxivId) {
      console.error('Missing arxivId in request')
      return new Response(
        JSON.stringify({ error: 'Missing arxivId parameter' }),
        {
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
          status: 400,
        }
      )
    }

    console.log('Fetching arXiv ID:', arxivId)

    // Fetch from arXiv API with retry logic
    const arxivUrl = `https://export.arxiv.org/api/query?id_list=${arxivId}`
    console.log('Fetching from URL:', arxivUrl)
    
    let response;
    let retries = 0;
    const maxRetries = 2;
    
    while (retries <= maxRetries) {
      try {
        response = await fetch(arxivUrl, {
          headers: {
            'User-Agent': 'PaperGraph/1.0 (https://papergraph.net)',
          }
        })
        
        if (response.ok) {
          break; // Success!
        }
        
        console.log(`arXiv API returned status ${response.status}, attempt ${retries + 1}/${maxRetries + 1}`)
        
        if (response.status === 429 && retries < maxRetries) {
          // Rate limited, wait before retry
          await new Promise(resolve => setTimeout(resolve, 1000 * (retries + 1)))
          retries++
          continue
        }
        
        break // Don't retry for other errors
      } catch (fetchError) {
        console.error('Fetch error:', fetchError)
        if (retries < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, 1000))
          retries++
          continue
        }
        throw fetchError
      }
    }
    
    if (!response || !response.ok) {
      const status = response?.status || 'unknown'
      console.error(`arXiv API request failed with status ${status}`)
      return new Response(
        JSON.stringify({ error: `arXiv API responded with status ${status}` }),
        {
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
          status: 502,
        }
      )
    }

    const xmlText = await response.text()
    
    console.log('Successfully fetched arXiv metadata, length:', xmlText.length)

    // Return the XML text as JSON
    return new Response(
      JSON.stringify(xmlText),
      {
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
        status: 200,
      }
    )

  } catch (error) {
    console.error('Unhandled error in fetch-arxiv:', error)
    
    return new Response(
      JSON.stringify({
        error: error.message || 'Failed to fetch arXiv metadata',
        details: error.toString()
      }),
      {
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
        status: 500,
      }
    )
  }
})
