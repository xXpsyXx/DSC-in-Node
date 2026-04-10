import axios from 'axios';

/**
 * Public key entry with key ID (kid) identifier.
 * Used for JWT verification with key rotation support.
 * @since 2.0.0
 */
interface PublicKeyEntry {
  kid: string;
  publicKey: string;
}

/**
 * Public Key Management Service
 * Handles fetching, caching, and refreshing public keys from backend.
 * Supports JWT verification with automatic key rotation.
 *
 * @class PublicKeyService
 * @since 2.0.0
 */
export class PublicKeyService {
  private publicKeys: Map<string, string> = new Map();
  private lastFetchTime: number = 0;
  private refreshInterval: number;
  private publicKeyUrl: string;
  private isRefreshing: boolean = false;
  private refreshPromise: Promise<void> | null = null;

  /**
   * Initialize the Public Key Service.
   * Sets up configuration from environment variables.
   * @access public
   * @since 2.0.0
   */
  constructor() {
    this.publicKeyUrl =
      process.env.PUBLIC_KEY_URL || 'http://localhost:5000/auth/public-keys';
    this.refreshInterval = parseInt(
      process.env.KEY_REFRESH_INTERVAL || '600000',
      10,
    ); // 10 minutes default
  }

  /**
   * Get a public key by its key ID (kid).
   * Returns cached key if available, otherwise fetches from backend.
   *
   * @access public
   * @param {string} kid The key ID to retrieve
   * @returns {Promise<string | null>} The public key (PEM format) or null if not found
   * @throws {Error} If key fetch fails
   * @since 2.0.0
   */
  async getPublicKey(kid: string): Promise<string | null> {
    // Return cached key if available and fresh
    if (this.publicKeys.has(kid) && !this.isKeysCacheStale()) {
      return this.publicKeys.get(kid) || null;
    }

    // Refresh keys if cache is stale
    if (this.isKeysCacheStale()) {
      await this.refreshPublicKeys();
    }

    return this.publicKeys.get(kid) || null;
  }

  /**
   * Refresh public keys from backend.
   * Fetches latest keys and updates internal cache.
   * Implements locking to prevent concurrent refresh requests.
   *
   * @access public
   * @returns {Promise<void>}
   * @throws {Error} If key fetch fails
   * @since 2.0.0
   */
  async refreshPublicKeys(): Promise<void> {
    // Prevent concurrent refresh requests
    if (this.isRefreshing && this.refreshPromise) {
      return this.refreshPromise;
    }

    this.isRefreshing = true;
    this.refreshPromise = this.performKeyFetch();

    try {
      await this.refreshPromise;
    } finally {
      this.isRefreshing = false;
      this.refreshPromise = null;
    }
  }

  /**
   * Perform the actual key fetch from backend.
   * @access private
   * @returns {Promise<void>}
   * @throws {Error} If HTTP request fails
   * @since 2.0.0
   */
  private async performKeyFetch(): Promise<void> {
    try {
      console.log(`[PublicKeyService] Fetching keys from ${this.publicKeyUrl}`);
      const response = await axios.get<{ keys: PublicKeyEntry[] }>(
        this.publicKeyUrl,
        {
          timeout: 10000, // 10 second timeout
        },
      );

      if (!response.data.keys || !Array.isArray(response.data.keys)) {
        throw new Error('Invalid response format: missing keys array');
      }

      // Clear old keys and populate with new ones
      this.publicKeys.clear();
      response.data.keys.forEach((entry: PublicKeyEntry) => {
        this.publicKeys.set(entry.kid, entry.publicKey);
      });

      this.lastFetchTime = Date.now();
      console.log(
        `[PublicKeyService] Successfully refreshed ${this.publicKeys.size} keys`,
      );
    } catch (error) {
      const errorMsg =
        error instanceof Error
          ? error.message
          : 'Unknown error during key fetch';
      console.error(
        `[PublicKeyService] Failed to fetch public keys: ${errorMsg}`,
      );
      throw new Error(`Failed to fetch public keys: ${errorMsg}`);
    }
  }

  /**
   * Check if public keys cache is stale.
   * @access private
   * @returns {boolean} True if cache needs refresh
   * @since 2.0.0
   */
  private isKeysCacheStale(): boolean {
    if (this.publicKeys.size === 0) {
      return true;
    }
    return Date.now() - this.lastFetchTime > this.refreshInterval;
  }

  /**
   * Get all cached public keys.
   * Useful for debugging and cache inspection.
   *
   * @access public
   * @returns {Map<string, string>} Map of kid -> publicKey
   * @since 2.0.0
   */
  getCachedKeys(): Map<string, string> {
    return new Map(this.publicKeys);
  }

  /**
   * Force immediate key refresh.
   * @access public
   * @returns {Promise<void>}
   * @since 2.0.0
   */
  async forceRefresh(): Promise<void> {
    this.lastFetchTime = 0;
    await this.refreshPublicKeys();
  }
}

// Singleton instance
let publicKeyService: PublicKeyService | null = null;

/**
 * Get or create the Public Key Service singleton.
 * @access public
 * @returns {PublicKeyService} The service instance
 * @since 2.0.0
 */
export function getPublicKeyService(): PublicKeyService {
  if (!publicKeyService) {
    publicKeyService = new PublicKeyService();
  }
  return publicKeyService;
}
