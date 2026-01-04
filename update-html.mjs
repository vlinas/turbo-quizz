import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

const html = `<div class="row">
    <a class="card" href="#one">
      <div class="img-box">
        <img src="https://via.placeholder.com/600" alt="Box 1" />
      </div>
      <div class="title">Title One</div>
    </a>

    <a class="card" href="#two">
      <div class="img-box">
        <img src="https://via.placeholder.com/600" alt="Box 2" />
      </div>
      <div class="title">Title Two</div>
    </a>

    <a class="card" href="#three">
      <div class="img-box">
        <img src="https://via.placeholder.com/600" alt="Box 3" />
      </div>
      <div class="title">Title Three</div>
    </a>
  </div>`;

// Update answer fc680194-2aa1-435d-a1e3-635c41a505b0 (Answer 1 of quiz 8654)
const result = await prisma.answer.update({
  where: { answer_id: 'fc680194-2aa1-435d-a1e3-635c41a505b0' },
  data: {
    action_data: { html: html }
  }
});
console.log('Updated answer:', result.answer_id);
console.log('HTML length in DB:', result.action_data.html.length);

await prisma.$disconnect();
