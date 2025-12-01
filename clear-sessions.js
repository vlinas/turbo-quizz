import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function clearSessions(shopDomain) {
  try {
    if (shopDomain) {
      // Delete sessions for specific shop
      console.log(`Clearing sessions for shop: ${shopDomain}`);

      const deletedSessions = await prisma.session.deleteMany({
        where: { shop: shopDomain }
      });
      console.log(`Deleted ${deletedSessions.count} session(s)`);

      // Also clear shop settings
      const deletedSettings = await prisma.shopSettings.deleteMany({
        where: { shop: shopDomain }
      });
      console.log(`Deleted ${deletedSettings.count} shop settings record(s)`);

      console.log('✅ Cleanup complete. You can now reinstall the app on', shopDomain);
    } else {
      // Delete ALL sessions from database to force fresh OAuth
      const result = await prisma.session.deleteMany({});
      console.log(`Deleted ${result.count} sessions from database`);
      console.log('✅ All sessions cleared');
    }
  } catch (error) {
    console.error('Error clearing sessions:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// Get shop domain from command line argument
const shopDomain = process.argv[2];

if (!shopDomain) {
  console.log('No shop specified - clearing ALL sessions');
}

clearSessions(shopDomain);
