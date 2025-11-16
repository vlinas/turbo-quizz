import { json, redirect } from "@remix-run/node";
import { useLoaderData, useNavigate, useSubmit, useActionData } from "@remix-run/react";
import { useState, useEffect } from "react";
import {
  Page,
  Layout,
  Card,
  Button,
  BlockStack,
  TextField,
  Text,
  Toast,
  Frame,
  InlineStack,
  Select,
  Box,
  Badge,
  Divider,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

export const loader = async ({ request, params }) => {
  const { session } = await authenticate.admin(request);
  const { id } = params;

  // Verify quiz exists and belongs to this shop
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

  return json({ quiz });
};

export const action = async ({ request, params }) => {
  const { session } = await authenticate.admin(request);
  const { id } = params;
  const formData = await request.formData();

  const question_text = formData.get("question_text");
  const answer1_text = formData.get("answer1_text");
  const answer1_action_type = formData.get("answer1_action_type");
  const answer1_action_data = formData.get("answer1_action_data");
  const answer2_text = formData.get("answer2_text");
  const answer2_action_type = formData.get("answer2_action_type");
  const answer2_action_data = formData.get("answer2_action_data");

  if (!question_text || !answer1_text || !answer2_text) {
    return json({
      success: false,
      error: "Question and both answers are required",
    }, { status: 400 });
  }

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
    // Get current question count for ordering
    const questionCount = await prisma.question.count({
      where: { quiz_id: id },
    });

    // Create question with answers in a single transaction
    const question = await prisma.question.create({
      data: {
        quiz_id: id,
        question_text,
        order: questionCount + 1,
        answers: {
          create: [
            {
              answer_text: answer1_text,
              action_type: answer1_action_type,
              action_data: answer1Data,
              order: 1,
            },
            {
              answer_text: answer2_text,
              action_type: answer2_action_type,
              action_data: answer2Data,
              order: 2,
            },
          ],
        },
      },
    });

    return redirect(`/app/quiz/${id}`);
  } catch (error) {
    console.error("Error creating question:", error);
    return json({
      success: false,
      error: "Failed to create question. Please try again.",
    }, { status: 500 });
  }
};

export default function NewQuestion() {
  const { quiz } = useLoaderData();
  const navigate = useNavigate();
  const submit = useSubmit();
  const actionData = useActionData();

  const [questionText, setQuestionText] = useState("");

  // Answer 1
  const [answer1Text, setAnswer1Text] = useState("");
  const [answer1ActionType, setAnswer1ActionType] = useState("show_text");
  const [answer1ActionData, setAnswer1ActionData] = useState("");

  // Answer 2
  const [answer2Text, setAnswer2Text] = useState("");
  const [answer2ActionType, setAnswer2ActionType] = useState("show_text");
  const [answer2ActionData, setAnswer2ActionData] = useState("");

  const [isSubmitting, setIsSubmitting] = useState(false);

  // Toast state
  const [toastActive, setToastActive] = useState(false);
  const [toastContent, setToastContent] = useState("");

  // Show toast when there's an error
  useEffect(() => {
    if (actionData?.error) {
      setToastContent(actionData.error);
      setToastActive(true);
    }
  }, [actionData]);

  const actionTypeOptions = [
    { label: "Show text message", value: "show_text" },
    // Products and collections temporarily disabled - coming soon
    // { label: "Show products", value: "show_products" },
    // { label: "Show collections", value: "show_collections" },
  ];

  const handleSubmit = () => {
    setIsSubmitting(true);
    const formData = new FormData();
    formData.append("question_text", questionText);
    formData.append("answer1_text", answer1Text);
    formData.append("answer1_action_type", answer1ActionType);
    formData.append("answer1_action_data", answer1ActionData);
    formData.append("answer2_text", answer2Text);
    formData.append("answer2_action_type", answer2ActionType);
    formData.append("answer2_action_data", answer2ActionData);
    submit(formData, { method: "post" });
  };

  const getActionDataHelp = (actionType) => {
    switch (actionType) {
      case "show_text":
        return "Enter the text message to show when this answer is selected";
      case "show_products":
        return "Enter product IDs separated by commas (e.g., gid://shopify/Product/123,gid://shopify/Product/456)";
      case "show_collections":
        return "Enter collection IDs separated by commas (e.g., gid://shopify/Collection/789)";
      default:
        return "";
    }
  };

  const getActionDataPlaceholder = (actionType) => {
    switch (actionType) {
      case "show_text":
        return "Great choice! Here are some products we think you'll love...";
      case "show_products":
        return "gid://shopify/Product/123,gid://shopify/Product/456";
      case "show_collections":
        return "gid://shopify/Collection/789";
      default:
        return "";
    }
  };

  const isValid = questionText && answer1Text && answer2Text && answer1ActionData && answer2ActionData;

  const toastMarkup = toastActive ? (
    <Toast
      content={toastContent}
      onDismiss={() => setToastActive(false)}
      error={true}
      duration={4500}
    />
  ) : null;

  return (
    <Frame>
      <Page
      title="Add Question"
      backAction={{
        content: "Back to quiz",
        onAction: () => navigate(`/app/quiz/${quiz.quiz_id}`)
      }}
      primaryAction={{
        content: "Add question",
        onAction: handleSubmit,
        disabled: !isValid || isSubmitting,
        loading: isSubmitting,
      }}
    >
      <Layout>
        <Layout.Section>
          {/* Question */}
          <Card>
            <BlockStack gap="400">
              <Text as="h2" variant="headingMd">
                Question
              </Text>

              <TextField
                label="Question text"
                value={questionText}
                onChange={setQuestionText}
                placeholder="e.g., What's your preferred style?"
                autoComplete="off"
                helpText="Ask a clear question that will help guide customers"
                requiredIndicator
              />
            </BlockStack>
          </Card>

          {/* Answer 1 */}
          <Card>
            <BlockStack gap="400">
              <InlineStack gap="200" blockAlign="center">
                <Badge tone="info">Answer 1</Badge>
                <Text as="h2" variant="headingMd">
                  First Answer Option
                </Text>
              </InlineStack>

              <TextField
                label="Answer text"
                value={answer1Text}
                onChange={setAnswer1Text}
                placeholder="e.g., Modern & Minimalist"
                autoComplete="off"
                requiredIndicator
              />

              <Select
                label="What should happen when this answer is selected?"
                options={actionTypeOptions}
                value={answer1ActionType}
                onChange={setAnswer1ActionType}
              />

              <TextField
                label={answer1ActionType === "show_text" ? "Message to show" : "IDs"}
                value={answer1ActionData}
                onChange={setAnswer1ActionData}
                placeholder={getActionDataPlaceholder(answer1ActionType)}
                multiline={answer1ActionType === "show_text" ? 3 : 1}
                autoComplete="off"
                helpText={getActionDataHelp(answer1ActionType)}
                requiredIndicator
              />
            </BlockStack>
          </Card>

          {/* Answer 2 */}
          <Card>
            <BlockStack gap="400">
              <InlineStack gap="200" blockAlign="center">
                <Badge tone="success">Answer 2</Badge>
                <Text as="h2" variant="headingMd">
                  Second Answer Option
                </Text>
              </InlineStack>

              <TextField
                label="Answer text"
                value={answer2Text}
                onChange={setAnswer2Text}
                placeholder="e.g., Bold & Colorful"
                autoComplete="off"
                requiredIndicator
              />

              <Select
                label="What should happen when this answer is selected?"
                options={actionTypeOptions}
                value={answer2ActionType}
                onChange={setAnswer2ActionType}
              />

              <TextField
                label={answer2ActionType === "show_text" ? "Message to show" : "IDs"}
                value={answer2ActionData}
                onChange={setAnswer2ActionData}
                placeholder={getActionDataPlaceholder(answer2ActionType)}
                multiline={answer2ActionType === "show_text" ? 3 : 1}
                autoComplete="off"
                helpText={getActionDataHelp(answer2ActionType)}
                requiredIndicator
              />
            </BlockStack>
          </Card>
        </Layout.Section>

        <Layout.Section variant="oneThird">
          <Card>
            <BlockStack gap="200">
              <Text as="h3" variant="headingSm">
                Action Types
              </Text>

              <Box>
                <Text as="p" variant="bodyMd" fontWeight="semibold">
                  Show text
                </Text>
                <Text as="p" variant="bodySm" tone="subdued">
                  Display a custom message to the customer
                </Text>
              </Box>

              <Divider />

              <Box>
                <Text as="p" variant="bodyMd" fontWeight="semibold">
                  Show products
                </Text>
                <Text as="p" variant="bodySm" tone="subdued">
                  Display specific products from your store
                </Text>
              </Box>

              <Divider />

              <Box>
                <Text as="p" variant="bodyMd" fontWeight="semibold">
                  Show collections
                </Text>
                <Text as="p" variant="bodySm" tone="subdued">
                  Display products from specific collections
                </Text>
              </Box>
            </BlockStack>
          </Card>

          <Card>
            <BlockStack gap="200">
              <Text as="h3" variant="headingSm">
                Tips
              </Text>
              <Text as="p" variant="bodySm" tone="subdued">
                • Make answer options clear and distinct
              </Text>
              <Text as="p" variant="bodySm" tone="subdued">
                • Use engaging language that reflects customer needs
              </Text>
              <Text as="p" variant="bodySm" tone="subdued">
                • Test your quiz before publishing
              </Text>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
      {toastMarkup}
    </Page>
    </Frame>
  );
}
