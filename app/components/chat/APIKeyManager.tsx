import React, { useState, useEffect, useCallback } from 'react';
import { IconButton } from '~/components/ui/IconButton';
import type { ProviderInfo } from '~/types/model';
import { supabase } from '~/integrations/supabase/client';

interface APIKeyManagerProps {
  provider: ProviderInfo;
  apiKey: string;
  setApiKey: (key: string) => void;
  getApiKeyLink?: string;
  labelForGetApiKey?: string;
}

// cache which stores whether the provider's API key is set via environment variable
const providerEnvKeyStatusCache: Record<string, boolean> = {};

// Session ID for LLM proxy
let llmSessionId: string | null = null;

// Get or create LLM session
async function getOrCreateSession(): Promise<string> {
  if (llmSessionId) {
    return llmSessionId;
  }

  // Check sessionStorage for existing session
  const storedSessionId = sessionStorage.getItem('llm_session_id');
  if (storedSessionId) {
    llmSessionId = storedSessionId;
    return storedSessionId;
  }

  // Create new session via edge function
  const { data, error } = await supabase.functions.invoke('llm-proxy', {
    body: { action: 'get_session' },
  });

  if (error) {
    throw new Error(error.message || 'Failed to create LLM session');
  }

  llmSessionId = data.sessionId;
  sessionStorage.setItem('llm_session_id', data.sessionId);
  return data.sessionId;
}

// Check if provider has key set
async function checkProviderKey(provider: string): Promise<boolean> {
  try {
    const sessionId = await getOrCreateSession();
    const { data, error } = await supabase.functions.invoke('llm-proxy', {
      body: {
        action: 'check_key',
        sessionId,
        provider,
      },
    });

    if (error) {
      return false;
    }

    return data.hasKey;
  } catch {
    return false;
  }
}

// Set provider API key (server-side only)
async function setProviderKey(provider: string, apiKey: string): Promise<void> {
  const sessionId = await getOrCreateSession();
  const { error } = await supabase.functions.invoke('llm-proxy', {
    body: {
      action: 'set_key',
      sessionId,
      provider,
      apiKey,
    },
  });

  if (error) {
    throw new Error(error.message || 'Failed to save API key');
  }
}

// Remove provider API key
async function removeProviderKey(provider: string): Promise<void> {
  const sessionId = await getOrCreateSession();
  await supabase.functions.invoke('llm-proxy', {
    body: {
      action: 'remove_key',
      sessionId,
      provider,
    },
  });
}

// eslint-disable-next-line @typescript-eslint/naming-convention
export const APIKeyManager: React.FC<APIKeyManagerProps> = ({ provider, apiKey, setApiKey }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [tempKey, setTempKey] = useState('');
  const [isEnvKeySet, setIsEnvKeySet] = useState(false);
  const [hasServerKey, setHasServerKey] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // Check for server-side key when provider changes
  useEffect(() => {
    const checkKey = async () => {
      const hasKey = await checkProviderKey(provider.name);
      setHasServerKey(hasKey);
      if (hasKey) {
        setApiKey('[SERVER_STORED]'); // Indicate key is stored server-side
      }
    };
    checkKey();
    setTempKey('');
    setIsEditing(false);
  }, [provider.name, setApiKey]);

  const checkEnvApiKey = useCallback(async () => {
    // Check cache first
    if (providerEnvKeyStatusCache[provider.name] !== undefined) {
      setIsEnvKeySet(providerEnvKeyStatusCache[provider.name]);
      return;
    }

    try {
      const response = await fetch(`/api/check-env-key?provider=${encodeURIComponent(provider.name)}`);
      const data = await response.json();
      const isSet = (data as { isSet: boolean }).isSet;

      // Cache the result
      providerEnvKeyStatusCache[provider.name] = isSet;
      setIsEnvKeySet(isSet);
    } catch (error) {
      console.error('Failed to check environment API key:', error);
      setIsEnvKeySet(false);
    }
  }, [provider.name]);

  useEffect(() => {
    checkEnvApiKey();
  }, [checkEnvApiKey]);

  const handleSave = async () => {
    if (!tempKey.trim()) {
      return;
    }

    setIsLoading(true);
    try {
      // Save to server-side only via edge function
      await setProviderKey(provider.name, tempKey);
      
      // Update local state to indicate key is set (but don't store the actual key)
      setApiKey('[SERVER_STORED]');
      setHasServerKey(true);
      setIsEditing(false);
      setTempKey('');
    } catch (error) {
      console.error('Failed to save API key:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRemove = async () => {
    setIsLoading(true);
    try {
      await removeProviderKey(provider.name);
      setApiKey('');
      setHasServerKey(false);
    } catch (error) {
      console.error('Failed to remove API key:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const isKeySet = hasServerKey || apiKey === '[SERVER_STORED]';

  return (
    <div className="flex items-center justify-between py-3 px-1">
      <div className="flex items-center gap-2 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-bolt-elements-textSecondary">{provider?.name} API Key:</span>
          {!isEditing && (
            <div className="flex items-center gap-2">
              {isKeySet ? (
                <>
                  <div className="i-ph:check-circle-fill text-green-500 w-4 h-4" />
                  <span className="text-xs text-green-500">Set (stored securely)</span>
                </>
              ) : isEnvKeySet ? (
                <>
                  <div className="i-ph:check-circle-fill text-green-500 w-4 h-4" />
                  <span className="text-xs text-green-500">Set via environment variable</span>
                </>
              ) : (
                <>
                  <div className="i-ph:x-circle-fill text-red-500 w-4 h-4" />
                  <span className="text-xs text-red-500">Not Set (Please set via UI or ENV_VAR)</span>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        {isEditing ? (
          <div className="flex items-center gap-2">
            <input
              type="password"
              value={tempKey}
              placeholder="Enter API Key"
              onChange={(e) => setTempKey(e.target.value)}
              className="w-[300px] px-3 py-1.5 text-sm rounded border border-bolt-elements-borderColor 
                        bg-bolt-elements-prompt-background text-bolt-elements-textPrimary 
                        focus:outline-none focus:ring-2 focus:ring-bolt-elements-focus"
              disabled={isLoading}
            />
            <IconButton
              onClick={handleSave}
              title="Save API Key"
              className="bg-green-500/10 hover:bg-green-500/20 text-green-500"
              disabled={isLoading || !tempKey.trim()}
            >
              <div className="i-ph:check w-4 h-4" />
            </IconButton>
            <IconButton
              onClick={() => {
                setIsEditing(false);
                setTempKey('');
              }}
              title="Cancel"
              className="bg-red-500/10 hover:bg-red-500/20 text-red-500"
              disabled={isLoading}
            >
              <div className="i-ph:x w-4 h-4" />
            </IconButton>
          </div>
        ) : (
          <>
            {isKeySet && (
              <IconButton
                onClick={handleRemove}
                title="Remove API Key"
                className="bg-red-500/10 hover:bg-red-500/20 text-red-500"
                disabled={isLoading}
              >
                <div className="i-ph:trash w-4 h-4" />
              </IconButton>
            )}
            <IconButton
              onClick={() => setIsEditing(true)}
              title={isKeySet ? "Update API Key" : "Add API Key"}
              className="bg-blue-500/10 hover:bg-blue-500/20 text-blue-500"
              disabled={isLoading}
            >
              <div className="i-ph:pencil-simple w-4 h-4" />
            </IconButton>
            {provider?.getApiKeyLink && !isKeySet && (
              <IconButton
                onClick={() => window.open(provider?.getApiKeyLink)}
                title="Get API Key"
                className="bg-purple-500/10 hover:bg-purple-500/20 text-purple-500 flex items-center gap-2"
              >
                <span className="text-xs whitespace-nowrap">{provider?.labelForGetApiKey || 'Get API Key'}</span>
                <div className={`${provider?.icon || 'i-ph:key'} w-4 h-4`} />
              </IconButton>
            )}
          </>
        )}
      </div>
    </div>
  );
};

// Export function to get API keys from server session (for use in API calls)
export async function getApiKeyForProvider(provider: string): Promise<string | null> {
  try {
    const sessionId = await getOrCreateSession();
    const hasKey = await checkProviderKey(provider);
    if (hasKey) {
      // Return a marker that indicates key should be fetched from server
      // The actual API call should be made through the LLM proxy
      return '[SERVER_STORED]';
    }
    return null;
  } catch {
    return null;
  }
}

// Export the session getter for use in LLM API calls
export { getOrCreateSession as getLLMSessionId };
