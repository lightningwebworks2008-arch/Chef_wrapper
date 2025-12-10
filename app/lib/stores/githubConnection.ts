import { atom, computed } from 'nanostores';
import { logStore } from '~/lib/stores/logs';
import { gitHubApiService } from '~/lib/services/githubApiService';
import { calculateStatsSummary } from '~/utils/githubStats';
import type { GitHubConnection } from '~/types/GitHub';
import { supabase } from '~/integrations/supabase/client';

// Session ID stored client-side (not the actual token)
let githubSessionId: string | null = null;

const githubConnectionAtom = atom<GitHubConnection>({
  user: null,
  token: '', // No longer stored client-side, just for backwards compatibility
  tokenType: 'classic',
});

// Initialize connection from sessionStorage (only session ID, not token)
function initializeConnection() {
  try {
    const savedSessionId = sessionStorage.getItem('github_session_id');
    const savedUserData = sessionStorage.getItem('github_user_data');

    if (savedSessionId && savedUserData) {
      githubSessionId = savedSessionId;
      const userData = JSON.parse(savedUserData);
      githubConnectionAtom.set({
        user: userData.user,
        token: '', // Token is server-side only
        tokenType: userData.tokenType || 'classic',
        rateLimit: userData.rateLimit,
        stats: userData.stats,
      });
    }
  } catch (error) {
    console.error('Error initializing GitHub connection:', error);
    sessionStorage.removeItem('github_session_id');
    sessionStorage.removeItem('github_user_data');
  }
}

// Initialize on module load (client-side only)
if (typeof window !== 'undefined') {
  initializeConnection();
}

// Computed store for checking if connected
export const isGitHubConnected = computed(githubConnectionAtom, (connection) => !!connection.user);

// Computed store for GitHub stats summary
export const githubStatsSummary = computed(githubConnectionAtom, (connection) => {
  if (!connection.stats) {
    return null;
  }

  return calculateStatsSummary(connection.stats);
});

// Connection status atoms
export const isGitHubConnecting = atom(false);
export const isGitHubLoadingStats = atom(false);

// GitHub connection store methods
export const githubConnectionStore = {
  // Get current connection
  get: () => githubConnectionAtom.get(),

  // Get session ID (for API calls)
  getSessionId: () => githubSessionId,

  // Connect to GitHub via secure edge function
  async connect(token: string, tokenType: 'classic' | 'fine-grained' = 'classic'): Promise<void> {
    if (isGitHubConnecting.get()) {
      throw new Error('Connection already in progress');
    }

    isGitHubConnecting.set(true);

    try {
      // Create session via edge function - token is sent once and stored server-side
      const { data, error } = await supabase.functions.invoke('github-proxy', {
        body: {
          action: 'create_session',
          token,
          tokenType,
        },
      });

      if (error) {
        throw new Error(error.message || 'Failed to connect to GitHub');
      }

      if (!data.sessionId || !data.user) {
        throw new Error(data.error || 'Invalid response from server');
      }

      // Store session ID client-side (not the token!)
      githubSessionId = data.sessionId;
      sessionStorage.setItem('github_session_id', data.sessionId);

      // Create connection object (without token)
      const connection: GitHubConnection = {
        user: data.user,
        token: '', // Token is server-side only
        tokenType,
        rateLimit: data.rateLimit,
      };

      // Store user data (not token) in sessionStorage
      sessionStorage.setItem('github_user_data', JSON.stringify({
        user: data.user,
        tokenType,
        rateLimit: data.rateLimit,
      }));

      // Update atom
      githubConnectionAtom.set(connection);

      logStore.logInfo('Connected to GitHub', {
        type: 'system',
        message: `Connected to GitHub as ${data.user.login}`,
      });

      // Fetch stats in background
      this.fetchStats().catch((error) => {
        console.error('Failed to fetch initial GitHub stats:', error);
      });
    } catch (error) {
      console.error('Failed to connect to GitHub:', error);
      logStore.logError(`GitHub authentication failed: ${error instanceof Error ? error.message : 'Unknown error'}`, {
        type: 'system',
        message: 'GitHub authentication failed',
      });
      throw error;
    } finally {
      isGitHubConnecting.set(false);
    }
  },

  // Disconnect from GitHub
  async disconnect(): Promise<void> {
    // Destroy session on server
    if (githubSessionId) {
      try {
        await supabase.functions.invoke('github-proxy', {
          body: {
            action: 'destroy_session',
            sessionId: githubSessionId,
          },
        });
      } catch (error) {
        console.error('Error destroying GitHub session:', error);
      }
    }

    // Clear atoms
    githubConnectionAtom.set({
      user: null,
      token: '',
      tokenType: 'classic',
    });

    // Clear session storage
    githubSessionId = null;
    sessionStorage.removeItem('github_session_id');
    sessionStorage.removeItem('github_user_data');

    // Clear API service cache
    gitHubApiService.clearCache();

    logStore.logInfo('Disconnected from GitHub', {
      type: 'system',
      message: 'Disconnected from GitHub',
    });
  },

  // Make authenticated GitHub API request via proxy
  async proxyRequest(endpoint: string, method = 'GET', body?: unknown): Promise<unknown> {
    if (!githubSessionId) {
      throw new Error('Not connected to GitHub');
    }

    const { data, error } = await supabase.functions.invoke('github-proxy', {
      body: {
        action: 'proxy',
        sessionId: githubSessionId,
        endpoint,
        method,
        body,
      },
    });

    if (error) {
      throw new Error(error.message || 'API request failed');
    }

    if (data.status === 401) {
      // Session expired, disconnect
      logStore.logError('GitHub session expired', {
        type: 'system',
        message: 'GitHub session has expired. Please reconnect your account.',
      });
      await this.disconnect();
      throw new Error('Session expired');
    }

    return data.data;
  },

  // Fetch GitHub stats
  async fetchStats(): Promise<void> {
    const connection = githubConnectionAtom.get();

    if (!connection.user || !githubSessionId) {
      throw new Error('Not connected to GitHub');
    }

    if (isGitHubLoadingStats.get()) {
      return; // Already loading
    }

    isGitHubLoadingStats.set(true);

    try {
      // Fetch stats via proxy
      const [repos, gists] = await Promise.all([
        this.proxyRequest('/user/repos?per_page=100&sort=updated'),
        this.proxyRequest('/gists?per_page=100'),
      ]);

      const stats = {
        repos: repos as any[],
        gists: gists as any[],
        totalRepos: (repos as any[]).length,
        totalGists: (gists as any[]).length,
      };

      // Update connection with stats
      const updatedConnection: GitHubConnection = {
        ...connection,
        stats,
      };

      // Update sessionStorage
      const savedUserData = sessionStorage.getItem('github_user_data');
      if (savedUserData) {
        const userData = JSON.parse(savedUserData);
        userData.stats = stats;
        sessionStorage.setItem('github_user_data', JSON.stringify(userData));
      }

      // Update atom
      githubConnectionAtom.set(updatedConnection);

      logStore.logInfo('GitHub stats refreshed', {
        type: 'system',
        message: 'Successfully refreshed GitHub statistics',
      });
    } catch (error) {
      console.error('Failed to fetch GitHub stats:', error);
      throw error;
    } finally {
      isGitHubLoadingStats.set(false);
    }
  },

  // Update token type
  updateTokenType(tokenType: 'classic' | 'fine-grained'): void {
    const connection = githubConnectionAtom.get();
    const updatedConnection = {
      ...connection,
      tokenType,
    };

    githubConnectionAtom.set(updatedConnection);
    
    const savedUserData = sessionStorage.getItem('github_user_data');
    if (savedUserData) {
      const userData = JSON.parse(savedUserData);
      userData.tokenType = tokenType;
      sessionStorage.setItem('github_user_data', JSON.stringify(userData));
    }
  },

  // Clear stats cache
  clearCache(): void {
    gitHubApiService.clearCache();
  },

  // Subscribe to connection changes
  subscribe: githubConnectionAtom.subscribe.bind(githubConnectionAtom),
};

// Export the atom for direct access
export { githubConnectionAtom };
