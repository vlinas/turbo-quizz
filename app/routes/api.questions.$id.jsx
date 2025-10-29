import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

/**
 * PUT /api/questions/:id - Update a question and its answers
 * DELETE /api/questions/:id - Delete a question
 */

export async function action({ request, params }) {
  const { session } = await authenticate.admin(request);
  const { id } = params;

  // Verify question exists and belongs to this shop's quiz
  const question = await prisma.question.findFirst({
    where: {
      question_id: id,
    },
    include: {
      quiz: true,
    },
  });

  if (!question || question.quiz.shop !== session.shop) {
    return json({
      success: false,
      error: "Question not found"
    }, { status: 404 });
  }

  if (request.method === "PUT") {
    return handleUpdate(request, id);
  } else if (request.method === "DELETE") {
    return handleDelete(id);
  }

  return json({
    success: false,
    error: "Method not allowed"
  }, { status: 405 });
}

async function handleUpdate(request, questionId) {
  try {
    const data = await request.json();
    const { question_text, order, answers } = data;

    // If answers provided, validate them
    if (answers) {
      if (answers.length !== 2) {
        return json({
          success: false,
          error: "Each question must have exactly 2 answers"
        }, { status: 400 });
      }

      for (const answer of answers) {
        if (!answer.answer_text || !answer.action_type || !answer.action_data) {
          return json({
            success: false,
            error: "Each answer must have answer_text, action_type, and action_data"
          }, { status: 400 });
        }
      }
    }

    // Update question
    const updateData = {
      ...(question_text && { question_text }),
      ...(order !== undefined && { order }),
      updated_at: new Date(),
    };

    const updatedQuestion = await prisma.question.update({
      where: { question_id: questionId },
      data: updateData,
      include: {
        answers: {
          orderBy: {
            order: 'asc',
          },
        },
      },
    });

    // If answers provided, update them
    if (answers) {
      // Get existing answers
      const existingAnswers = await prisma.answer.findMany({
        where: { question_id: questionId },
        orderBy: { order: 'asc' },
      });

      // Update each answer
      for (let i = 0; i < answers.length; i++) {
        const answerData = answers[i];
        const existingAnswer = existingAnswers[i];

        if (existingAnswer) {
          // Update existing answer
          await prisma.answer.update({
            where: { answer_id: existingAnswer.answer_id },
            data: {
              answer_text: answerData.answer_text,
              action_type: answerData.action_type,
              action_data: answerData.action_data,
              order: i + 1,
              updated_at: new Date(),
            },
          });
        } else {
          // Create new answer if needed
          await prisma.answer.create({
            data: {
              question_id: questionId,
              answer_id: `a-${Date.now()}-${i}-${Math.random().toString(36).substr(2, 9)}`,
              answer_text: answerData.answer_text,
              order: i + 1,
              action_type: answerData.action_type,
              action_data: answerData.action_data,
            },
          });
        }
      }

      // Delete extra answers if any
      if (existingAnswers.length > answers.length) {
        const answersToDelete = existingAnswers.slice(answers.length);
        await prisma.answer.deleteMany({
          where: {
            answer_id: {
              in: answersToDelete.map((a) => a.answer_id),
            },
          },
        });
      }
    }

    // Fetch updated question with answers
    const finalQuestion = await prisma.question.findUnique({
      where: { question_id: questionId },
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
      question: finalQuestion,
      message: "Question updated successfully"
    });
  } catch (error) {
    console.error("Error updating question:", error);
    return json({
      success: false,
      error: "Failed to update question"
    }, { status: 500 });
  }
}

async function handleDelete(questionId) {
  try {
    // Delete question (cascade will delete answers and selections)
    await prisma.question.delete({
      where: { question_id: questionId },
    });

    return json({
      success: true,
      message: "Question deleted successfully"
    });
  } catch (error) {
    console.error("Error deleting question:", error);
    return json({
      success: false,
      error: "Failed to delete question"
    }, { status: 500 });
  }
}
