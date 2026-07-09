-- AlterTable
ALTER TABLE "CreditTransaction" ADD COLUMN     "stripeEventId" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "stripeCustomerId" TEXT,
ADD COLUMN     "stripeSubscriptionId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "CreditTransaction_stripeEventId_key" ON "CreditTransaction"("stripeEventId");

-- CreateIndex
CREATE UNIQUE INDEX "User_stripeCustomerId_key" ON "User"("stripeCustomerId");

