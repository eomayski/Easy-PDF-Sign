import type { CloudSignerProvider } from './CloudSignerProvider';

/**
 * MockCloudProvider — auto-resolves without a real provider.
 * Used in development and tests.
 */
export class MockCloudProvider implements CloudSignerProvider {
  private pending = new Map<string, boolean>();

  async startSigning(jobId: string): Promise<{ status: string }> {
    // Simulate async approval with a 2-second delay
    setTimeout(() => this.pending.set(jobId, true), 2000);
    this.pending.set(jobId, false);
    return { status: 'pending' };
  }

  async pollStatus(jobId: string): Promise<{ ready: boolean; cms?: Uint8Array }> {
    const ready = this.pending.get(jobId) ?? false;
    if (!ready) return { ready: false };
    // Return empty CMS — real provider would return actual CMS bytes
    return { ready: true, cms: new Uint8Array(0) };
  }
}
