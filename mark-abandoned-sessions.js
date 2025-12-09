/**
 * Mark abandoned quiz sessions as completed with a flag
 * Run this periodically (e.g., daily via cron or Heroku Scheduler)
 *
 * Sessions are considered abandoned if:
 * - Started more than 48 hours ago
 * - Not yet marked as completed
 * - No recent activity
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function markAbandonedSessions() {
  const hoursAgo = 48;
  const cutoffTime = new Date();
  cutoffTime.setHours(cutoffTime.getHours() - hoursAgo);

  console.log(`[Abandoned Sessions] Looking for sessions started before ${cutoffTime.toISOString()}`);

  try {
    // Find all incomplete sessions older than 48 hours
    const abandonedSessions = await prisma.quizSession.findMany({
      where: {
        is_completed: false,
        started_at: {
          lt: cutoffTime,
        },
      },
      select: {
        id: true,
        session_id: true,
        quiz_id: true,
        shop: true,
        started_at: true,
      },
    });

    console.log(`[Abandoned Sessions] Found ${abandonedSessions.length} abandoned sessions`);

    if (abandonedSessions.length === 0) {
      console.log('[Abandoned Sessions] No abandoned sessions to process');
      return;
    }

    // Mark them as abandoned (we use completed_at = started_at to indicate abandonment)
    // This way they don't skew completion rate calculations
    let processed = 0;
    for (const session of abandonedSessions) {
      await prisma.quizSession.update({
        where: { id: session.id },
        data: {
          // Note: We intentionally leave is_completed as false
          // This marks them as "abandoned" not "completed"
          // Queries should filter: is_completed = true for real completions
          completed_at: session.started_at, // Same as started = abandoned
        },
      });
      processed++;
    }

    console.log(`[Abandoned Sessions] Successfully marked ${processed} sessions as abandoned`);
    console.log('[Abandoned Sessions] These sessions will not count towards completion metrics');

  } catch (error) {
    console.error('[Abandoned Sessions] Error:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  markAbandonedSessions()
    .then(() => {
      console.log('[Abandoned Sessions] Script completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('[Abandoned Sessions] Script failed:', error);
      process.exit(1);
    });
}

export { markAbandonedSessions };
