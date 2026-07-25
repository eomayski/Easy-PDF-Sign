import type { User } from '@prisma/client';
import { prisma } from '../db/prisma';

export const SIGNUP_BONUS_CREDITS = 5;

/**
 * Returns the local User row for a Supabase-authenticated user, creating it
 * with the signup bonus on first sight. Idempotent under concurrent calls:
 * the id is the primary key, so a parallel create loses with P2002 and we
 * re-read the winner's row.
 */
export async function ensureUser(userId: string, email: string): Promise<User> {
  const existing = await prisma.user.findUnique({ where: { id: userId } });
  if (existing) return existing;

  try {
    return await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: { id: userId, email, credits: SIGNUP_BONUS_CREDITS },
      });
      await tx.creditTransaction.create({
        data: { userId, delta: SIGNUP_BONUS_CREDITS, reason: 'signup_bonus' },
      });
      return user;
    });
  } catch (err) {
    const race = await prisma.user.findUnique({ where: { id: userId } });
    if (race) return race;
    throw err;
  }
}

export function hasActiveBusinessSubscription(user: User): boolean {
  return user.accountType === 'business' && user.subscriptionStatus === 'active';
}

/**
 * Atomically debits 1 credit for a download. Returns the remaining balance,
 * or null if the balance was insufficient. Business accounts must be handled
 * by the caller (no debit) — see hasActiveBusinessSubscription().
 */
export async function debitCreditForDownload(
  userId: string,
  jobId: string,
): Promise<number | null> {
  return prisma.$transaction(async (tx) => {
    // Conditional decrement: with credits >= 1 in the WHERE, two parallel
    // requests holding a balance of 1 cannot both succeed.
    const updated = await tx.user.updateMany({
      where: { id: userId, credits: { gte: 1 } },
      data: { credits: { decrement: 1 } },
    });
    if (updated.count === 0) return null;

    await tx.creditTransaction.create({
      data: { userId, delta: -1, reason: 'download_debit', jobId },
    });

    const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });
    return user.credits;
  });
}

/**
 * Atomically debits the size fee for an oversized upload (see
 * config/uploadPolicy.ts). Returns the remaining balance, or null if the
 * balance was insufficient. Same conditional-decrement guard as
 * debitCreditForDownload(), so parallel uploads cannot overdraw. Business
 * accounts must be handled by the caller (no fee).
 */
export async function debitCreditsForUploadSize(
  userId: string,
  credits: number,
  jobId: string,
): Promise<number | null> {
  if (credits <= 0) throw new Error('debitCreditsForUploadSize called with a non-positive amount');

  return prisma.$transaction(async (tx) => {
    const updated = await tx.user.updateMany({
      where: { id: userId, credits: { gte: credits } },
      data: { credits: { decrement: credits } },
    });
    if (updated.count === 0) return null;

    await tx.creditTransaction.create({
      data: { userId, delta: -credits, reason: 'upload_size_fee', jobId },
    });

    const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });
    return user.credits;
  });
}

/**
 * Compensating credit for a size fee that was charged but whose upload then
 * failed. Jobs live in memory (store/jobs.ts), so the debit and the upload
 * cannot share one transaction — this refund is the error-handling half of
 * that pair. Returns the restored balance.
 */
export async function refundUploadSizeFee(
  userId: string,
  credits: number,
  jobId: string,
): Promise<number> {
  return prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: userId },
      data: { credits: { increment: credits } },
    });
    await tx.creditTransaction.create({
      data: { userId, delta: credits, reason: 'upload_size_refund', jobId },
    });
    const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });
    return user.credits;
  });
}
