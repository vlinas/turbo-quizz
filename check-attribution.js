import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkAttribution() {
  // Get recent quiz sessions
  const sessions = await prisma.quizSession.findMany({
    where: {
      is_completed: true,
    },
    orderBy: { completed_at: 'desc' },
    take: 5,
  });

  console.log('\n=== Recent Completed Quiz Sessions ===');
  sessions.forEach(session => {
    console.log(`Session ID: ${session.session_id}`);
    console.log(`Quiz ID: ${session.quiz_id}`);
    console.log(`Shop: ${session.shop}`);
    console.log(`Customer ID: ${session.customer_id || 'N/A'}`);
    console.log(`Completed: ${session.completed_at}`);
    console.log('---');
  });

  // Get order attributions
  const attributions = await prisma.quizOrderAttribution.findMany({
    orderBy: { attributed_at: 'desc' },
    take: 10,
  });

  console.log('\n=== Order Attributions ===');
  if (attributions.length === 0) {
    console.log('No order attributions found yet.');
    console.log('\nTo test attribution:');
    console.log('1. Complete a quiz on your product page');
    console.log('2. Add product to cart');
    console.log('3. Complete checkout and pay for the order');
    console.log('4. The ORDERS_PAID webhook should fire and create an attribution');
  } else {
    attributions.forEach(attr => {
      console.log(`Order: ${attr.order_number || attr.order_id}`);
      console.log(`Session ID: ${attr.session_id}`);
      console.log(`Quiz ID: ${attr.quiz_id}`);
      console.log(`Revenue: ${attr.currency} ${attr.total_price}`);
      console.log(`Customer: ${attr.customer_email || attr.customer_id || 'N/A'}`);
      console.log(`Order Date: ${attr.order_created_at}`);
      console.log(`Attributed: ${attr.attributed_at}`);
      console.log('---');
    });
  }

  await prisma.$disconnect();
}

checkAttribution().catch(console.error);
