import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// In-memory session store for API keys (in production, use Supabase database with encryption)
const apiKeySessions = new Map<string, { keys: Record<string, string>; createdAt: number }>();

// Clean up expired sessions (24 hour expiry for API keys)
function cleanupSessions() {
  const now = Date.now();
  for (const [sessionId, data] of apiKeySessions.entries()) {
    if (now - data.createdAt > 86400000) {
      apiKeySessions.delete(sessionId);
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
    
    const { action, sessionId, provider, apiKey } = await req.json();
    
    console.log(`LLM Proxy: action=${action}, provider=${provider}, hasSessionId=${!!sessionId}`);

    // Action: Get or create session
    if (action === 'get_session') {
      let session = sessionId ? apiKeySessions.get(sessionId) : null;
      
      if (!session) {
        const newSessionId = generateSessionId();
        session = { keys: {}, createdAt: Date.now() };
        apiKeySessions.set(newSessionId, session);
        
        return new Response(
          JSON.stringify({ 
            sessionId: newSessionId, 
            providers: Object.keys(session.keys),
            expiresIn: 86400 
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      return new Response(
        JSON.stringify({ 
          sessionId, 
          providers: Object.keys(session.keys),
          expiresIn: Math.max(0, 86400 - Math.floor((Date.now() - session.createdAt) / 1000))
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Action: Set API key for a provider
    if (action === 'set_key') {
      if (!sessionId || !provider || !apiKey) {
        return new Response(
          JSON.stringify({ error: 'Session ID, provider, and API key are required' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      let session = apiKeySessions.get(sessionId);
      if (!session) {
        session = { keys: {}, createdAt: Date.now() };
        apiKeySessions.set(sessionId, session);
      }

      session.keys[provider] = apiKey;
      
      console.log(`LLM Proxy: API key set for provider ${provider}`);

      return new Response(
        JSON.stringify({ 
          success: true, 
          providers: Object.keys(session.keys) 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Action: Remove API key for a provider
    if (action === 'remove_key') {
      if (!sessionId || !provider) {
        return new Response(
          JSON.stringify({ error: 'Session ID and provider are required' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const session = apiKeySessions.get(sessionId);
      if (session) {
        delete session.keys[provider];
      }

      return new Response(
        JSON.stringify({ 
          success: true, 
          providers: session ? Object.keys(session.keys) : [] 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Action: Check if provider has key
    if (action === 'check_key') {
      if (!sessionId || !provider) {
        return new Response(
          JSON.stringify({ error: 'Session ID and provider are required' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const session = apiKeySessions.get(sessionId);
      const hasKey = session?.keys[provider] ? true : false;

      return new Response(
        JSON.stringify({ hasKey }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Action: Destroy session
    if (action === 'destroy_session') {
      if (sessionId) {
        apiKeySessions.delete(sessionId);
      }
      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ error: 'Invalid action' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('LLM Proxy Error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
