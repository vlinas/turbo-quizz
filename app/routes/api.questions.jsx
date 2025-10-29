import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

/**
 * POST /api/questions - Create a question with answers
 * This creates a question and its 2 answers in a single transaction
 */

export async function action({ request }) {
  const { session } = await authenticate.admin(request);

  if (request.method !== "POST") {
    return json({
      success: false,
      error: "Method not allowed"
    }, { status: 405 });
  }

  try {
    const data = await request.json();
    const { quiz_id, question_text, order, answers } = data;

    // Validate required fields
    if (!quiz_id || !question_text) {
      return json({
        success: false,
        error: "quiz_id and question_text are required"
      }, { status: 400 });
    }

    // Validate quiz belongs to this shop
    const quiz = await prisma.quiz.findFirst({
      where: {
        quiz_id,
        shop: session.shop,
        deleted_at: null,
      },
    });

    if (!quiz) {
      return json({
        success: false,
        error: "Quiz not found"
      }, { status: 404 });
    }

    // Validate answers (must have exactly 2)
    if (!answers || answers.length !== 2) {
      return json({
        success: false,
        error: "Each question must have exactly 2 answers"
      }, { status: 400 });
    }

    // Validate each answer has required fields
    for (const answer of answers) {
      if (!answer.answer_text || !answer.action_type || !answer.action_data) {
        return json({
          success: false,
          error: "Each answer must have answer_text, action_type, and action_data"
        }, { status: 400 });
      }

      // Validate action_type
      if (!['show_text', 'show_products', 'show_collections'].includes(answer.action_type)) {
        return json({
          success: false,
          error: "action_type must be 'show_text', 'show_products', or 'show_collections'"
        }, { status: 400 });
      }
    }

    // If no order specified, put it at the end
    let questionOrder = order;
    if (questionOrder === undefined) {
      const maxOrder = await prisma.question.findFirst({
        where: { quiz_id },
        orderBy: { order: 'desc' },
        select: { order: true },
      });
      questionOrder = maxOrder ? maxOrder.order + 1 : 1;
    }

    // Create question with answers in a transaction
    const question = await prisma.question.create({
      data: {
        quiz_id,
        question_id: `q-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        question_text,
        order: questionOrder,
        answers: {
          create: answers.map((answer, index) => ({
            answer_id: `a-${Date.now()}-${index}-${Math.random().toString(36).substr(2, 9)}`,
            answer_text: answer.answer_text,
            order: index + 1,
            action_type: answer.action_type,
            action_data: answer.action_data,
          })),
        },
      },
      include: {
        answers: {
          orderBy: {
            order: 'asc',
          },
        },
      },
    });

    return json({
      success: true,
      question,
      message: "Question created successfully"
    }, { status: 201 });
  } catch (error) {
    console.error("Error creating question:", error);
    return json({
      success: false,
      error: "Failed to create question"
    }, { status: 500 });
  }
}
