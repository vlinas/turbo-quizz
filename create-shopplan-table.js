const { PrismaClient } = require('@prisma/client');

async function createShopPlanTable() {
  const prisma = new PrismaClient();

  try {
    // Create the ShopPlan table if it doesn't exist
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "ShopPlan" (
        id SERIAL PRIMARY KEY,
        shop TEXT UNIQUE NOT NULL,
        plan TEXT DEFAULT 'free' NOT NULL,
        updated_at TIMESTAMP DEFAULT NOW() NOT NULL
      );
    `);

    console.log('ShopPlan table created successfully!');

    // Verify by checking if table exists
    const result = await prisma.$queryRaw`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'ShopPlan';
    `;
    console.log('Table check result:', result);

  } catch (error) {
    console.error('Error creating table:', error);
  } finally {
    await prisma.$disconnect();
  }
}

createShopPlanTable();
