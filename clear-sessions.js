import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function clearSessions() {
  try {
    // Delete ALL sessions from database to force fresh OAuth
    const result = await prisma.session.deleteMany({});
    console.log(`Deleted ${result.count} sessions from database`);
  } catch (error) {
    console.error('Error clearing sessions:', error);
  } finally {
    await prisma.$disconnect();
  }
}

clearSessions();
