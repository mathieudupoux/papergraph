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
    const { arxivId } = await req.json()
    
    if (!arxivId) {
      throw new Error('Missing arxivId parameter')
    }

    console.log('Fetching arXiv ID:', arxivId)

    // Fetch from arXiv API
    const arxivUrl = `http://export.arxiv.org/api/query?id_list=${arxivId}`
    const response = await fetch(arxivUrl)
    
    if (!response.ok) {
      throw new Error(`arXiv API responded with status ${response.status}`)
    }

    const xmlText = await response.text()
    
    console.log('Successfully fetched arXiv metadata, length:', xmlText.length)

    // Return the XML text
    return new Response(JSON.stringify(xmlText), {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      status: 200,
    })

  } catch (error) {
    console.error('Error fetching arXiv:', error)
    
    return new Response(
      JSON.stringify({
        error: error.message || 'Failed to fetch arXiv metadata'
      }),
      {
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
        status: 400,
      }
    )
  }
})
