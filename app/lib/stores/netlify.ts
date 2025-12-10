import { atom } from 'nanostores';
import type { NetlifyConnection, NetlifyUser } from '~/types/netlify';
import { logStore } from './logs';
import { toast } from 'react-toastify';
import { supabase } from '~/integrations/supabase/client';

// Session ID stored client-side (not the actual token)
let netlifySessionId: string | null = null;

// Initialize with stored user data (not token)
const storedUserData = typeof window !== 'undefined' ? sessionStorage.getItem('netlify_user_data') : null;
const storedSessionId = typeof window !== 'undefined' ? sessionStorage.getItem('netlify_session_id') : null;

if (storedSessionId) {
  netlifySessionId = storedSessionId;
}

const initialConnection: NetlifyConnection = storedUserData
  ? {
      ...JSON.parse(storedUserData),
      token: '', // Token is server-side only
    }
  : {
      user: null,
      token: '',
      stats: undefined,
    };

export const netlifyConnection = atom<NetlifyConnection>(initialConnection);
export const isConnecting = atom<boolean>(false);
export const isFetchingStats = atom<boolean>(false);

// Function to initialize Netlify connection with environment token (via edge function)
export async function initializeNetlifyConnection() {
  const currentState = netlifyConnection.get();
  const envToken = import.meta.env?.VITE_NETLIFY_ACCESS_TOKEN;

  // If we already have a connection or no token, don't try to connect
  if (currentState.user || !envToken) {
    console.log('Netlify: Skipping auto-connect - user exists or no env token');
    return;
  }

  console.log('Netlify: Attempting auto-connection with env token via edge function');

  try {
    isConnecting.set(true);

    // Create session via edge function
    const { data, error } = await supabase.functions.invoke('netlify-proxy', {
      body: {
        action: 'create_session',
        token: envToken,
      },
    });

    if (error) {
      throw new Error(error.message || 'Failed to connect to Netlify');
    }

    if (!data.sessionId || !data.user) {
      throw new Error(data.error || 'Invalid response from server');
    }

    // Store session ID (not token) client-side
    netlifySessionId = data.sessionId;
    sessionStorage.setItem('netlify_session_id', data.sessionId);

    // Update the connection state (without token)
    const connectionData: Partial<NetlifyConnection> = {
      user: data.user as NetlifyUser,
      token: '', // Token is server-side only
    };

    // Store user data (not token) in sessionStorage
    sessionStorage.setItem('netlify_user_data', JSON.stringify(connectionData));

    // Update the store
    updateNetlifyConnection(connectionData);

    // Fetch initial stats
    await fetchNetlifyStats();
  } catch (error) {
    console.error('Error initializing Netlify connection:', error);
    logStore.logError('Failed to initialize Netlify connection', { error });
  } finally {
    isConnecting.set(false);
  }
}

export const updateNetlifyConnection = (updates: Partial<NetlifyConnection>) => {
  const currentState = netlifyConnection.get();
  const newState = { ...currentState, ...updates, token: '' }; // Never store token
  netlifyConnection.set(newState);

  // Persist user data (not token) to sessionStorage
  if (typeof window !== 'undefined') {
    sessionStorage.setItem('netlify_user_data', JSON.stringify({
      user: newState.user,
      stats: newState.stats,
    }));
  }
};

export async function fetchNetlifyStats() {
  if (!netlifySessionId) {
    throw new Error('Not connected to Netlify');
  }

  try {
    isFetchingStats.set(true);

    // Use edge function proxy for API call
    const { data, error } = await supabase.functions.invoke('netlify-proxy', {
      body: {
        action: 'proxy',
        sessionId: netlifySessionId,
        endpoint: '/sites',
      },
    });

    if (error) {
      throw new Error(error.message || 'Failed to fetch sites');
    }

    if (data.status === 401) {
      // Session expired
      logStore.logError('Netlify session expired', {
        type: 'system',
        message: 'Netlify session has expired. Please reconnect your account.',
      });
      await disconnectNetlify();
      throw new Error('Session expired');
    }

    const sites = data.data;

    const currentState = netlifyConnection.get();
    updateNetlifyConnection({
      ...currentState,
      stats: {
        sites,
        totalSites: Array.isArray(sites) ? sites.length : 0,
      },
    });
  } catch (error) {
    console.error('Netlify API Error:', error);
    logStore.logError('Failed to fetch Netlify stats', { error });
    toast.error('Failed to fetch Netlify statistics');
  } finally {
    isFetchingStats.set(false);
  }
}

export async function connectNetlify(token: string): Promise<void> {
  if (isConnecting.get()) {
    throw new Error('Connection already in progress');
  }

  isConnecting.set(true);

  try {
    // Create session via edge function
    const { data, error } = await supabase.functions.invoke('netlify-proxy', {
      body: {
        action: 'create_session',
        token,
      },
    });

    if (error) {
      throw new Error(error.message || 'Failed to connect to Netlify');
    }

    if (!data.sessionId || !data.user) {
      throw new Error(data.error || 'Invalid response from server');
    }

    // Store session ID (not token) client-side
    netlifySessionId = data.sessionId;
    sessionStorage.setItem('netlify_session_id', data.sessionId);

    // Update connection (without token)
    const connectionData: Partial<NetlifyConnection> = {
      user: data.user as NetlifyUser,
      token: '', // Token is server-side only
    };

    sessionStorage.setItem('netlify_user_data', JSON.stringify(connectionData));
    updateNetlifyConnection(connectionData);

    toast.success('Connected to Netlify successfully');

    // Fetch initial stats
    await fetchNetlifyStats();
  } catch (error) {
    console.error('Failed to connect to Netlify:', error);
    logStore.logError('Failed to connect to Netlify', { error });
    toast.error(error instanceof Error ? error.message : 'Failed to connect to Netlify');
    throw error;
  } finally {
    isConnecting.set(false);
  }
}

export async function disconnectNetlify(): Promise<void> {
  // Destroy session on server
  if (netlifySessionId) {
    try {
      await supabase.functions.invoke('netlify-proxy', {
        body: {
          action: 'destroy_session',
          sessionId: netlifySessionId,
        },
      });
    } catch (error) {
      console.error('Error destroying Netlify session:', error);
    }
  }

  // Clear client-side data
  netlifySessionId = null;
  sessionStorage.removeItem('netlify_session_id');
  sessionStorage.removeItem('netlify_user_data');

  netlifyConnection.set({
    user: null,
    token: '',
    stats: undefined,
  });

  logStore.logInfo('Disconnected from Netlify', {
    type: 'system',
    message: 'Disconnected from Netlify',
  });
}

// Helper to make proxied API calls
export async function netlifyProxyRequest(endpoint: string, method = 'GET', body?: unknown): Promise<unknown> {
  if (!netlifySessionId) {
    throw new Error('Not connected to Netlify');
  }

  const { data, error } = await supabase.functions.invoke('netlify-proxy', {
    body: {
      action: 'proxy',
      sessionId: netlifySessionId,
      endpoint,
      method,
      body,
    },
  });

  if (error) {
    throw new Error(error.message || 'API request failed');
  }

  if (data.status === 401) {
    await disconnectNetlify();
    throw new Error('Session expired');
  }

  return data.data;
}
