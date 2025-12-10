import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// In-memory session store (in production, use Supabase database)
const sessions = new Map<string, { token: string; tokenType: string; createdAt: number }>();

// Clean up expired sessions (1 hour expiry)
function cleanupSessions() {
  const now = Date.now();
  for (const [sessionId, data] of sessions.entries()) {
    if (now - data.createdAt > 3600000) {
      sessions.delete(sessionId);
    }
  }
}

// Generate secure session ID
function generateSessionId(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    cleanupSessions();
    
    const { action, token, tokenType, sessionId, endpoint, method, body } = await req.json();
    
    console.log(`GitHub Proxy: action=${action}, hasToken=${!!token}, hasSessionId=${!!sessionId}`);

    // Action: Create session with token
    if (action === 'create_session') {
      if (!token) {
        return new Response(
          JSON.stringify({ error: 'Token is required' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Verify token with GitHub
      const verifyResponse = await fetch('https://api.github.com/user', {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'Lovable-App',
        },
      });

      if (!verifyResponse.ok) {
        const error = await verifyResponse.text();
        console.error('GitHub token verification failed:', error);
        return new Response(
          JSON.stringify({ error: 'Invalid GitHub token' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const userData = await verifyResponse.json();
      const newSessionId = generateSessionId();
      
      // Store session server-side only
      sessions.set(newSessionId, {
        token,
        tokenType: tokenType || 'classic',
        createdAt: Date.now(),
      });

      console.log(`GitHub Proxy: Session created for user ${userData.login}`);

      return new Response(
        JSON.stringify({ 
          sessionId: newSessionId, 
          user: userData,
          expiresIn: 3600 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Action: Destroy session
    if (action === 'destroy_session') {
      if (sessionId) {
        sessions.delete(sessionId);
      }
      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Action: Proxy API request
    if (action === 'proxy') {
      if (!sessionId) {
        return new Response(
          JSON.stringify({ error: 'Session ID is required' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const session = sessions.get(sessionId);
      if (!session) {
        return new Response(
          JSON.stringify({ error: 'Invalid or expired session' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      if (!endpoint) {
        return new Response(
          JSON.stringify({ error: 'Endpoint is required' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Ensure endpoint starts with https://api.github.com
      const fullUrl = endpoint.startsWith('https://') 
        ? endpoint 
        : `https://api.github.com${endpoint.startsWith('/') ? endpoint : '/' + endpoint}`;

      console.log(`GitHub Proxy: Proxying ${method || 'GET'} to ${fullUrl}`);

      const proxyResponse = await fetch(fullUrl, {
        method: method || 'GET',
        headers: {
          'Authorization': `Bearer ${session.token}`,
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'Lovable-App',
          ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });

      const responseData = await proxyResponse.json().catch(() => ({}));
      
      // Extract rate limit headers
      const rateLimit = {
        limit: proxyResponse.headers.get('x-ratelimit-limit'),
        remaining: proxyResponse.headers.get('x-ratelimit-remaining'),
        reset: proxyResponse.headers.get('x-ratelimit-reset'),
      };

      return new Response(
        JSON.stringify({ 
          data: responseData, 
          status: proxyResponse.status,
          rateLimit 
        }),
        { 
          status: proxyResponse.ok ? 200 : proxyResponse.status,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    return new Response(
      JSON.stringify({ error: 'Invalid action' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('GitHub Proxy Error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
