import { json, redirect } from "@remix-run/node";
import { useLoaderData, useNavigate, useSubmit, useActionData } from "@remix-run/react";
import { useState, useCallback } from "react";
import {
  Page,
  Layout,
  Card,
  Button,
  BlockStack,
  TextField,
  Text,
  Banner,
  InlineStack,
  Select,
  Box,
  Badge,
  Divider,
  Modal,
} from "@shopify/polaris";
import { DeleteIcon } from "@shopify/polaris-icons";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

export const loader = async ({ request, params }) => {
  const { session } = await authenticate.admin(request);
  const { id, questionId } = params;

  // Fetch quiz
  const quiz = await prisma.quiz.findFirst({
    where: {
      quiz_id: id,
      shop: session.shop,
      deleted_at: null,
    },
  });

  if (!quiz) {
    throw new Response("Quiz not found", { status: 404 });
  }

  // Fetch question with answers
  const question = await prisma.question.findFirst({
    where: {
      question_id: questionId,
      quiz_id: id,
    },
    include: {
      answers: {
        orderBy: {
          order: "asc",
        },
      },
    },
  });

  if (!question) {
    throw new Response("Question not found", { status: 404 });
  }

  return json({ quiz, question });
};

export const action = async ({ request, params }) => {
  const { session } = await authenticate.admin(request);
  const { id, questionId } = params;
  const formData = await request.formData();
  const actionType = formData.get("_action");

  if (actionType === "update") {
    const question_text = formData.get("question_text");
    const answer1_id = formData.get("answer1_id");
    const answer1_text = formData.get("answer1_text");
    const answer1_action_type = formData.get("answer1_action_type");
    const answer1_action_data = formData.get("answer1_action_data");
    const answer2_id = formData.get("answer2_id");
    const answer2_text = formData.get("answer2_text");
    const answer2_action_type = formData.get("answer2_action_type");
    const answer2_action_data = formData.get("answer2_action_data");

    if (!question_text || !answer1_text || !answer2_text) {
      return json({
        success: false,
        error: "Question and both answers are required",
      }, { status: 400 });
    }

    // Build action data objects
    const answer1Data = {
      type: answer1_action_type,
      ...(answer1_action_type === "show_text" && {
        text: answer1_action_data
      }),
      ...(answer1_action_type === "show_products" && {
        product_ids: answer1_action_data ? answer1_action_data.split(",").filter(Boolean) : [],
        display_style: "grid"
      }),
      ...(answer1_action_type === "show_collections" && {
        collection_ids: answer1_action_data ? answer1_action_data.split(",").filter(Boolean) : [],
        display_style: "grid"
      }),
    };

    const answer2Data = {
      type: answer2_action_type,
      ...(answer2_action_type === "show_text" && {
        text: answer2_action_data
      }),
      ...(answer2_action_type === "show_products" && {
        product_ids: answer2_action_data ? answer2_action_data.split(",").filter(Boolean) : [],
        display_style: "grid"
      }),
      ...(answer2_action_type === "show_collections" && {
        collection_ids: answer2_action_data ? answer2_action_data.split(",").filter(Boolean) : [],
        display_style: "grid"
      }),
    };

    try {
      // Update question and answers in transaction
      await prisma.question.update({
        where: { question_id: questionId },
        data: {
          question_text,
          answers: {
            update: [
              {
                where: { answer_id: answer1_id },
                data: {
                  answer_text: answer1_text,
                  action_type: answer1_action_type,
                  action_data: answer1Data,
                },
              },
              {
                where: { answer_id: answer2_id },
                data: {
                  answer_text: answer2_text,
                  action_type: answer2_action_type,
                  action_data: answer2Data,
                },
              },
            ],
          },
        },
      });

      return redirect(`/app/quiz/${id}`);
    } catch (error) {
      console.error("Error updating question:", error);
      return json({
        success: false,
        error: "Failed to update question. Please try again.",
      }, { status: 500 });
    }
  }

  if (actionType === "delete") {
    try {
      // Delete question (cascade deletes answers)
      await prisma.question.delete({
        where: { question_id: questionId },
      });

      return redirect(`/app/quiz/${id}`);
    } catch (error) {
      console.error("Error deleting question:", error);
      return json({
        success: false,
        error: "Failed to delete question",
      }, { status: 500 });
    }
  }

  return json({ success: false, error: "Invalid action" });
};

export default function EditQuestion() {
  const { quiz, question } = useLoaderData();
  const navigate = useNavigate();
  const submit = useSubmit();
  const actionData = useActionData();

  const [questionText, setQuestionText] = useState(question.question_text);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  // Answer 1
  const [answer1Text, setAnswer1Text] = useState(question.answers[0].answer_text);
  const [answer1ActionType, setAnswer1ActionType] = useState(question.answers[0].action_type);
  const [answer1ActionData, setAnswer1ActionData] = useState(
    question.answers[0].action_type === "show_text"
      ? question.answers[0].action_data.text
      : question.answers[0].action_type === "show_products"
      ? question.answers[0].action_data.product_ids?.join(",") || ""
      : question.answers[0].action_data.collection_ids?.join(",") || ""
  );

  // Answer 2
  const [answer2Text, setAnswer2Text] = useState(question.answers[1].answer_text);
  const [answer2ActionType, setAnswer2ActionType] = useState(question.answers[1].action_type);
  const [answer2ActionData, setAnswer2ActionData] = useState(
    question.answers[1].action_type === "show_text"
      ? question.answers[1].action_data.text
      : question.answers[1].action_type === "show_products"
      ? question.answers[1].action_data.product_ids?.join(",") || ""
      : question.answers[1].action_data.collection_ids?.join(",") || ""
  );

  const actionTypeOptions = [
    { label: "Show Text Message", value: "show_text" },
    { label: "Show Products", value: "show_products" },
    { label: "Show Collections", value: "show_collections" },
  ];

  const handleSave = useCallback(() => {
    setIsSubmitting(true);
    const formData = new FormData();
    formData.append("_action", "update");
    formData.append("question_text", questionText);
    formData.append("answer1_id", question.answers[0].answer_id);
    formData.append("answer1_text", answer1Text);
    formData.append("answer1_action_type", answer1ActionType);
    formData.append("answer1_action_data", answer1ActionData);
    formData.append("answer2_id", question.answers[1].answer_id);
    formData.append("answer2_text", answer2Text);
    formData.append("answer2_action_type", answer2ActionType);
    formData.append("answer2_action_data", answer2ActionData);
    submit(formData, { method: "post" });
  }, [questionText, answer1Text, answer1ActionType, answer1ActionData, answer2Text, answer2ActionType, answer2ActionData, question.answers, submit]);

  const handleDelete = useCallback(() => {
    const formData = new FormData();
    formData.append("_action", "delete");
    submit(formData, { method: "post" });
    setShowDeleteModal(false);
  }, [submit]);

  const getActionDataPlaceholder = (actionType) => {
    if (actionType === "show_text") {
      return "e.g., We recommend this product for you!";
    } else if (actionType === "show_products") {
      return "e.g., 123456789,987654321 (comma-separated product IDs)";
    } else {
      return "e.g., shoes,accessories (comma-separated collection handles)";
    }
  };

  const getActionDataHelpText = (actionType) => {
    if (actionType === "show_text") {
      return "The text message to display when this answer is selected";
    } else if (actionType === "show_products") {
      return "Product IDs to display (find them in Products > [Product] > URL)";
    } else {
      return "Collection handles to display (find them in Collections > [Collection] > URL)";
    }
  };

  return (
    <Page
      title="Edit Question"
      backAction={{ content: quiz.title, onAction: () => navigate(`/app/quiz/${quiz.quiz_id}`) }}
      primaryAction={{
        content: "Save changes",
        onAction: handleSave,
        disabled: !questionText || !answer1Text || !answer2Text || isSubmitting,
        loading: isSubmitting,
      }}
      secondaryActions={[
        {
          content: "Delete",
          icon: DeleteIcon,
          destructive: true,
          onAction: () => setShowDeleteModal(true),
        },
      ]}
    >
      <Layout>
        <Layout.Section>
          {actionData?.error && (
            <Banner tone="critical" onDismiss={() => {}}>
              <p>{actionData.error}</p>
            </Banner>
          )}

          <Card>
            <BlockStack gap="400">
              <Text as="h2" variant="headingMd">
                Question Details
              </Text>

              <TextField
                label="Question Text"
                value={questionText}
                onChange={setQuestionText}
                placeholder="e.g., What's your favorite style?"
                autoComplete="off"
                helpText="The question to ask your customers"
                requiredIndicator
              />
            </BlockStack>
          </Card>

          <Card>
            <BlockStack gap="500">
              <Box>
                <InlineStack align="space-between" blockAlign="center">
                  <Text as="h2" variant="headingMd">
                    Answer 1
                  </Text>
                  <Badge tone="info">Option A</Badge>
                </InlineStack>
              </Box>

              <TextField
                label="Answer Text"
                value={answer1Text}
                onChange={setAnswer1Text}
                placeholder="e.g., Classic"
                autoComplete="off"
                requiredIndicator
              />

              <Select
                label="Action Type"
                options={actionTypeOptions}
                value={answer1ActionType}
                onChange={setAnswer1ActionType}
                helpText="What happens when customer selects this answer"
              />

              <TextField
                label="Action Data"
                value={answer1ActionData}
                onChange={setAnswer1ActionData}
                placeholder={getActionDataPlaceholder(answer1ActionType)}
                autoComplete="off"
                multiline={answer1ActionType === "show_text" ? 3 : false}
                helpText={getActionDataHelpText(answer1ActionType)}
              />
            </BlockStack>
          </Card>

          <Card>
            <BlockStack gap="500">
              <Box>
                <InlineStack align="space-between" blockAlign="center">
                  <Text as="h2" variant="headingMd">
                    Answer 2
                  </Text>
                  <Badge tone="success">Option B</Badge>
                </InlineStack>
              </Box>

              <TextField
                label="Answer Text"
                value={answer2Text}
                onChange={setAnswer2Text}
                placeholder="e.g., Modern"
                autoComplete="off"
                requiredIndicator
              />

              <Select
                label="Action Type"
                options={actionTypeOptions}
                value={answer2ActionType}
                onChange={setAnswer2ActionType}
                helpText="What happens when customer selects this answer"
              />

              <TextField
                label="Action Data"
                value={answer2ActionData}
                onChange={setAnswer2ActionData}
                placeholder={getActionDataPlaceholder(answer2ActionType)}
                autoComplete="off"
                multiline={answer2ActionType === "show_text" ? 3 : false}
                helpText={getActionDataHelpText(answer2ActionType)}
              />
            </BlockStack>
          </Card>
        </Layout.Section>

        <Layout.Section variant="oneThird">
          <Card>
            <BlockStack gap="400">
              <Text as="h3" variant="headingSm">
                Question Order
              </Text>
              <Text as="p" variant="bodySm" tone="subdued">
                Question #{question.order} in this quiz
              </Text>
              <Divider />
              <Text as="h3" variant="headingSm">
                Tips
              </Text>
              <Text as="p" variant="bodySm" tone="subdued">
                • Keep questions clear and concise
              </Text>
              <Text as="p" variant="bodySm" tone="subdued">
                • Make sure answers are distinct options
              </Text>
              <Text as="p" variant="bodySm" tone="subdued">
                • Test your quiz before making it live
              </Text>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>

      <Modal
        open={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        title="Delete Question"
        primaryAction={{
          content: "Delete",
          destructive: true,
          onAction: handleDelete,
        }}
        secondaryActions={[
          {
            content: "Cancel",
            onAction: () => setShowDeleteModal(false),
          },
        ]}
      >
        <Modal.Section>
          <BlockStack gap="200">
            <Text as="p">
              Are you sure you want to delete this question? This action cannot be undone.
            </Text>
            <Text as="p" tone="subdued">
              Question: "{question.question_text}"
            </Text>
          </BlockStack>
        </Modal.Section>
      </Modal>
    </Page>
  );
}
