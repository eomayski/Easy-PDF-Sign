/**
 * CloudSignerProvider — interface for remote (cloud) QES providers.
 * Implemented by EvrotrustProvider (Phase 3) and BtrustProvider (Phase 4).
 */
export interface CloudSignerProvider {
  /**
   * Initiates a signing request for the given hash.
   * The provider sends a push notification to the user's mobile app.
   */
  startSigning(
    jobId: string,
    hash: Uint8Array,
    userIdentifier: string,
  ): Promise<{ status: string }>;

  /**
   * Polls the provider for the signing result.
   * Returns { ready: false } while the user hasn't confirmed yet.
   * Returns { ready: true, cms } once the CMS signature is available.
   */
  pollStatus(jobId: string): Promise<{ ready: boolean; cms?: Uint8Array }>;
}

// TODO Phase 3: implement EvrotrustProvider
// TODO Phase 4: implement BtrustProvider
