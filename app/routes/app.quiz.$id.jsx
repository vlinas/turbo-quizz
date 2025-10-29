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
  Divider,
  Box,
  Badge,
  Icon,
  ButtonGroup,
} from "@shopify/polaris";
import {
  DeleteIcon,
  PlusIcon,
  EditIcon,
} from "@shopify/polaris-icons";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

export const loader = async ({ request, params }) => {
  const { session } = await authenticate.admin(request);
  const { id } = params;

  // Fetch quiz with questions and answers
  const quiz = await prisma.quiz.findFirst({
    where: {
      quiz_id: id,
      shop: session.shop,
      deleted_at: null,
    },
    include: {
      questions: {
        include: {
          answers: {
            orderBy: {
              order: 'asc',
            },
          },
        },
        orderBy: {
          order: 'asc',
        },
      },
    },
  });

  if (!quiz) {
    throw new Response("Quiz not found", { status: 404 });
  }

  return json({ quiz });
};

export const action = async ({ request, params }) => {
  const { session } = await authenticate.admin(request);
  const { id } = params;
  const formData = await request.formData();
  const actionType = formData.get("_action");

  // Verify quiz exists and belongs to this shop
  const quiz = await prisma.quiz.findFirst({
    where: {
      quiz_id: id,
      shop: session.shop,
      deleted_at: null,
    },
  });

  if (!quiz) {
    return json({
      success: false,
      error: "Quiz not found",
    }, { status: 404 });
  }

  if (actionType === "update_quiz") {
    const title = formData.get("title");
    const description = formData.get("description");
    const status = formData.get("status");

    try {
      await prisma.quiz.update({
        where: { id: quiz.id },
        data: {
          title,
          description,
          status,
        },
      });

      return json({ success: true });
    } catch (error) {
      console.error("Error updating quiz:", error);
      return json({
        success: false,
        error: "Failed to update quiz",
      }, { status: 500 });
    }
  }

  if (actionType === "delete_quiz") {
    try {
      await prisma.quiz.update({
        where: { id: quiz.id },
        data: {
          deleted_at: new Date(),
        },
      });

      return redirect("/app");
    } catch (error) {
      console.error("Error deleting quiz:", error);
      return json({
        success: false,
        error: "Failed to delete quiz",
      }, { status: 500 });
    }
  }

  return json({ success: false, error: "Invalid action" });
};

export default function QuizBuilder() {
  const { quiz } = useLoaderData();
  const navigate = useNavigate();
  const submit = useSubmit();
  const actionData = useActionData();

  const [title, setTitle] = useState(quiz.title);
  const [description, setDescription] = useState(quiz.description || "");
  const [status, setStatus] = useState(quiz.status);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  const handleSave = () => {
    setIsSubmitting(true);
    const formData = new FormData();
    formData.append("_action", "update_quiz");
    formData.append("title", title);
    formData.append("description", description);
    formData.append("status", status);
    submit(formData, { method: "post" });
    setTimeout(() => setIsSubmitting(false), 1000);
  };

  const handleDelete = () => {
    const formData = new FormData();
    formData.append("_action", "delete_quiz");
    submit(formData, { method: "post" });
  };

  const handleAddQuestion = () => {
    navigate(`/app/quiz/${quiz.quiz_id}/question/new`);
  };

  const statusOptions = [
    { label: "Draft", value: "draft" },
    { label: "Active", value: "active" },
    { label: "Inactive", value: "inactive" },
  ];

  return (
    <Page
      title={quiz.title}
      backAction={{ content: "Quizzes", onAction: () => navigate("/app") }}
      titleMetadata={
        <Badge tone={status === "active" ? "success" : status === "draft" ? "info" : "default"}>
          {status.charAt(0).toUpperCase() + status.slice(1)}
        </Badge>
      }
      primaryAction={{
        content: "Save",
        onAction: handleSave,
        disabled: !title || isSubmitting,
        loading: isSubmitting,
      }}
      secondaryActions={[
        {
          content: "View analytics",
          onAction: () => navigate(`/app/quiz/${quiz.quiz_id}/analytics`),
        },
        {
          content: "Delete quiz",
          destructive: true,
          onAction: () => setShowDeleteModal(true),
        },
      ]}
    >
      <Layout>
        <Layout.Section>
          {actionData?.success && (
            <Banner tone="success" onDismiss={() => {}}>
              <p>Quiz updated successfully!</p>
            </Banner>
          )}

          {actionData?.error && (
            <Banner tone="critical" onDismiss={() => {}}>
              <p>{actionData.error}</p>
            </Banner>
          )}

          {/* Quiz Details */}
          <Card>
            <BlockStack gap="400">
              <Text as="h2" variant="headingMd">
                Quiz Details
              </Text>

              <TextField
                label="Quiz Title"
                value={title}
                onChange={setTitle}
                placeholder="e.g., Find Your Perfect Product"
                autoComplete="off"
                requiredIndicator
              />

              <TextField
                label="Description"
                value={description}
                onChange={setDescription}
                placeholder="e.g., Answer a few questions to discover products that match your style"
                multiline={3}
                autoComplete="off"
              />

              <Select
                label="Status"
                options={statusOptions}
                value={status}
                onChange={setStatus}
                helpText="Active quizzes are visible to customers"
              />
            </BlockStack>
          </Card>

          {/* Questions */}
          <Card>
            <BlockStack gap="400">
              <InlineStack align="space-between" blockAlign="center">
                <Text as="h2" variant="headingMd">
                  Questions
                </Text>
                <Button
                  icon={PlusIcon}
                  onClick={handleAddQuestion}
                >
                  Add question
                </Button>
              </InlineStack>

              {quiz.questions.length === 0 ? (
                <Box padding="400">
                  <BlockStack gap="200" inlineAlign="center">
                    <Text as="p" tone="subdued" alignment="center">
                      No questions yet. Add your first question to get started.
                    </Text>
                    <Button onClick={handleAddQuestion}>
                      Add question
                    </Button>
                  </BlockStack>
                </Box>
              ) : (
                <BlockStack gap="400">
                  {quiz.questions.map((question, index) => (
                    <Card key={question.id} background="bg-surface-secondary">
                      <BlockStack gap="300">
                        <InlineStack align="space-between" blockAlign="start">
                          <BlockStack gap="100">
                            <Text as="h3" variant="headingSm">
                              Question {index + 1}
                            </Text>
                            <Text as="p">{question.question_text}</Text>
                          </BlockStack>
                          <ButtonGroup>
                            <Button
                              icon={EditIcon}
                              onClick={() => navigate(`/app/quiz/${quiz.quiz_id}/question/${question.question_id}`)}
                            />
                            <Button
                              icon={DeleteIcon}
                              tone="critical"
                              onClick={() => {
                                // TODO: Add delete confirmation
                              }}
                            />
                          </ButtonGroup>
                        </InlineStack>

                        <Divider />

                        {/* Answers */}
                        <BlockStack gap="200">
                          {question.answers.map((answer, answerIndex) => (
                            <Box key={answer.id} padding="300" background="bg-surface">
                              <BlockStack gap="200">
                                <InlineStack gap="200" blockAlign="center">
                                  <Badge tone={answerIndex === 0 ? "info" : "success"}>
                                    Answer {answerIndex + 1}
                                  </Badge>
                                  <Text as="span" fontWeight="semibold">
                                    {answer.answer_text}
                                  </Text>
                                </InlineStack>
                                <Text as="p" variant="bodySm" tone="subdued">
                                  Action: {answer.action_type === "show_text" ? "Show text" : answer.action_type === "show_products" ? "Show products" : "Show collections"}
                                </Text>
                              </BlockStack>
                            </Box>
                          ))}
                        </BlockStack>
                      </BlockStack>
                    </Card>
                  ))}
                </BlockStack>
              )}
            </BlockStack>
          </Card>
        </Layout.Section>

        <Layout.Section variant="oneThird">
          {/* Quiz Stats */}
          <Card>
            <BlockStack gap="300">
              <Text as="h3" variant="headingSm">
                Quiz Stats
              </Text>
              <BlockStack gap="200">
                <InlineStack align="space-between">
                  <Text as="span" tone="subdued">Questions</Text>
                  <Text as="span" fontWeight="semibold">{quiz.questions.length}</Text>
                </InlineStack>
                <InlineStack align="space-between">
                  <Text as="span" tone="subdued">Status</Text>
                  <Badge tone={status === "active" ? "success" : status === "draft" ? "info" : "default"}>
                    {status.charAt(0).toUpperCase() + status.slice(1)}
                  </Badge>
                </InlineStack>
              </BlockStack>
            </BlockStack>
          </Card>

          {/* Help Card */}
          <Card>
            <BlockStack gap="200">
              <Text as="h3" variant="headingSm">
                Tips
              </Text>
              <Text as="p" variant="bodySm" tone="subdued">
                • Each question should have exactly 2 answer options
              </Text>
              <Text as="p" variant="bodySm" tone="subdued">
                • Configure actions to show products, collections, or custom text based on answers
              </Text>
              <Text as="p" variant="bodySm" tone="subdued">
                • Set status to "Active" when ready to publish
              </Text>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>

      {/* Delete Confirmation Modal - TODO: Implement with Modal component */}
    </Page>
  );
}
