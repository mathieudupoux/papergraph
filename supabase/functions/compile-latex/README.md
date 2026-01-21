# compile-latex Edge Function

This Supabase Edge Function acts as a proxy for LaTeX compilation requests to avoid CORS issues.

## Purpose

When the frontend tries to compile LaTeX documents using `texlive.net` directly from the browser, CORS (Cross-Origin Resource Sharing) policies block the requests when running from `localhost` or other origins.

This edge function:
1. Receives LaTeX compilation requests from the frontend
2. Forwards them to `https://texlive.net/cgi-bin/latexcgi`
3. Returns the compiled PDF with proper CORS headers

## Deployment

Deploy this function using the Supabase CLI:

```bash
supabase functions deploy compile-latex
```

## Usage

The frontend calls this function via:

```javascript
const response = await fetch('https://lqbcatqdfsgvbwenqupq.supabase.co/functions/v1/compile-latex', {
    method: 'POST',
    headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
        filecontents: latexContent,
        filename: 'main.tex',
        engine: 'pdflatex',
        return: 'pdf'
    })
});
```

## Parameters

- `filecontents`: The LaTeX document content
- `filename`: Name of the file (default: 'main.tex')
- `engine`: LaTeX engine to use (default: 'pdflatex')
- `return`: Return format (default: 'pdf')

## Response

Returns a PDF blob with proper CORS headers, or an error JSON if compilation fails.
