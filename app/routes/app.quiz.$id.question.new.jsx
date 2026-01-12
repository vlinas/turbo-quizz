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
  const { session, admin } = await authenticate.admin(request);
  const { id } = params;
  const formData = await request.formData();

  const question_text = formData.get("question_text");
  const metafield_key = formData.get("metafield_key") || null;

  // Parse dynamic answers from form data (supports 2-5 answers)
  const answers = [];
  for (let i = 0; i < 5; i++) {
    const text = formData.get(`answers[${i}][text]`);
    const actionType = formData.get(`answers[${i}][action_type]`);
    const actionData = formData.get(`answers[${i}][action_data]`);
    const customText = formData.get(`answers[${i}][custom_text]`);

    if (text && actionType) {
      answers.push({ text, actionType, actionData, customText });
    }
  }

  if (!question_text || answers.length < 2) {
    return json({
      success: false,
      error: "Question and at least 2 answers are required",
    }, { status: 400 });
  }

  if (answers.length > 5) {
    return json({
      success: false,
      error: "Maximum 5 answers allowed per question",
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

  // Build answer create data array
  const answerCreateData = answers.map((answer, index) => {
    let actionDataObj = {};

    if (answer.actionType === "show_text") {
      actionDataObj = { text: answer.actionData };
    } else if (answer.actionType === "show_html") {
      actionDataObj = { html: answer.actionData };
    } else if (answer.actionType === "show_products") {
      try {
        const parsed = JSON.parse(answer.actionData || "{}");
        actionDataObj = {
          products: parsed.products || [],
          custom_text: answer.customText || parsed.custom_text || "Based on your answers, we recommend these products:",
        };
      } catch {
        actionDataObj = { products: [], custom_text: answer.customText || "Based on your answers, we recommend these products:" };
      }
    } else if (answer.actionType === "show_collections") {
      try {
        const parsed = JSON.parse(answer.actionData || "{}");
        actionDataObj = {
          collections: parsed.collections || [],
          custom_text: answer.customText || parsed.custom_text || "Based on your answers, check out these collections:",
        };
      } catch {
        actionDataObj = { collections: [], custom_text: answer.customText || "Based on your answers, check out these collections:" };
      }
    }

    return {
      answer_text: answer.text,
      action_type: answer.actionType,
      action_data: actionDataObj,
      order: index + 1,
    };
  });

  try {
    // Get current question count for ordering
    const questionCount = await prisma.question.count({
      where: { quiz_id: id },
    });

    // Create question with answers in a single transaction
    const question = await prisma.question.create({
      data: {
        quiz_id: id,
        shop: session.shop,
        question_text,
        metafield_key,
        order: questionCount + 1,
        answers: {
          create: answerCreateData,
        },
      },
    });

    // Create metafield definition if metafield_key is provided
    if (metafield_key) {
      try {
        // Format the name nicely (e.g., "skin_type" -> "Quiz: Skin Type")
        const formattedName = `Quiz: ${metafield_key
          .split("_")
          .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
          .join(" ")}`;

        const response = await admin.graphql(`
          mutation CreateMetafieldDefinition($definition: MetafieldDefinitionInput!) {
            metafieldDefinitionCreate(definition: $definition) {
              createdDefinition {
                id
                name
              }
              userErrors {
                field
                message
              }
            }
          }
        `, {
          variables: {
            definition: {
              name: formattedName,
              namespace: "quiz",
              key: metafield_key,
              type: "single_line_text_field",
              ownerType: "CUSTOMER",
              pin: true,
            },
          },
        });

        const result = await response.json();
        if (result.data?.metafieldDefinitionCreate?.userErrors?.length > 0) {
          // Definition might already exist - that's okay
          console.log(`[Metafield Definition] Note: ${result.data.metafieldDefinitionCreate.userErrors[0].message}`);
        } else if (result.data?.metafieldDefinitionCreate?.createdDefinition) {
          console.log(`[Metafield Definition] Created: ${formattedName}`);
        }
      } catch (metafieldError) {
        // Don't fail the question save if metafield definition fails
        console.error("[Metafield Definition] Error creating definition:", metafieldError);
      }
    }

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
  const [metafieldKey, setMetafieldKey] = useState("");

  // Dynamic answers array (supports 2-5 answers)
  const createEmptyAnswer = () => ({
    text: "",
    actionType: "show_text",
    actionData: "",
    customText: "",
  });

  const [answers, setAnswers] = useState([createEmptyAnswer(), createEmptyAnswer()]);

  // Helper functions for managing dynamic answers
  const addAnswer = () => {
    if (answers.length < 5) {
      setAnswers([...answers, createEmptyAnswer()]);
    }
  };

  const removeAnswer = (index) => {
    if (answers.length > 2) {
      setAnswers(answers.filter((_, i) => i !== index));
    }
  };

  const updateAnswer = (index, field, value) => {
    setAnswers(answers.map((answer, i) =>
      i === index ? { ...answer, [field]: value } : answer
    ));
  };

  // Clear action data when action type changes
  const handleAnswerActionTypeChange = (index, newType) => {
    setAnswers(answers.map((answer, i) =>
      i === index ? { ...answer, actionType: newType, actionData: "", customText: "" } : answer
    ));
  };

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
    { label: "Show HTML", value: "show_html" },
  ];

  const handleSubmit = () => {
    setIsSubmitting(true);
    const formData = new FormData();
    formData.append("question_text", questionText);
    formData.append("metafield_key", metafieldKey);

    // Serialize answers array with indexed keys
    answers.forEach((answer, i) => {
      formData.append(`answers[${i}][text]`, answer.text);
      formData.append(`answers[${i}][action_type]`, answer.actionType);
      formData.append(`answers[${i}][action_data]`, answer.actionData);
      if (answer.actionType === "show_products" || answer.actionType === "show_collections") {
        formData.append(`answers[${i}][custom_text]`, answer.customText);
      }
    });

    submit(formData, { method: "post" });
  };

  const isValid = questionText && answers.length >= 2 && answers.every((a) => a.text && a.actionData);

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

              <TextField
                label="Metafield Key (optional)"
                value={metafieldKey}
                onChange={setMetafieldKey}
                placeholder="e.g., gender, skin_type, style_preference"
                autoComplete="off"
                helpText="Used for customer personalization. The selected answer will be saved as customer.metafields.quiz.[key]. Use lowercase with underscores."
              />
            </BlockStack>
          </Card>

          {/* Dynamic Answers (2-5) */}
          {answers.map((answer, index) => (
            <Card key={index}>
              <BlockStack gap="400">
                <InlineStack align="space-between" blockAlign="center">
                  <InlineStack gap="200" blockAlign="center">
                    <Badge tone={index === 0 ? "info" : "success"}>Answer {index + 1}</Badge>
                    <Text as="h2" variant="headingMd">
                      {index === 0 ? "First" : index === 1 ? "Second" : `Answer ${index + 1}`} Answer Option
                    </Text>
                  </InlineStack>
                  {answers.length > 2 && (
                    <Button variant="plain" tone="critical" onClick={() => removeAnswer(index)}>
                      Remove
                    </Button>
                  )}
                </InlineStack>

                <TextField
                  label="Answer text"
                  value={answer.text}
                  onChange={(value) => updateAnswer(index, "text", value)}
                  placeholder={index === 0 ? "e.g., Modern & Minimalist" : "e.g., Bold & Colorful"}
                  autoComplete="off"
                  requiredIndicator
                />

                <Select
                  label="What should happen when this answer is selected?"
                  options={actionTypeOptions}
                  value={answer.actionType}
                  onChange={(value) => handleAnswerActionTypeChange(index, value)}
                />

                {answer.actionType === "show_text" && (
                  <TextField
                    label="Message to show"
                    value={answer.actionData}
                    onChange={(value) => updateAnswer(index, "actionData", value)}
                    placeholder="Great choice! Here are some products we think you'll love..."
                    multiline={3}
                    autoComplete="off"
                    helpText="Enter the text message to show when this answer is selected"
                    requiredIndicator
                  />
                )}

                {answer.actionType === "show_html" && (
                  <TextField
                    label="HTML Content"
                    value={answer.actionData}
                    onChange={(value) => updateAnswer(index, "actionData", value)}
                    placeholder='<div class="result"><h2>Great choice!</h2><p>Perfect for your style.</p></div>'
                    multiline={6}
                    autoComplete="off"
                    helpText="HTML content to display (supports all HTML tags)"
                    requiredIndicator
                  />
                )}
              </BlockStack>
            </Card>
          ))}

          {/* Add Answer Button */}
          {answers.length < 5 && (
            <Card>
              <Button onClick={addAnswer} variant="plain" fullWidth>
                + Add another answer ({answers.length}/5)
              </Button>
            </Card>
          )}
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
