import { json, redirect } from "@remix-run/node";
import { useLoaderData, useNavigate, useSubmit, useActionData, Form } from "@remix-run/react";
import { useState, useCallback, useEffect, useRef, useMemo } from "react";
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
  InlineGrid,
  Select,
  Box,
  Badge,
  Divider,
  Modal,
  Collapsible,
  Icon,
  ButtonGroup,
  RadioButton,
  Thumbnail,
  Banner,
} from "@shopify/polaris";
import {
  DeleteIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  PlusIcon,
  ImageIcon,
} from "@shopify/polaris-icons";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

// Helper functions for GraphQL
const toGids = (ids) => ids.map((id) => (String(id).startsWith("gid://") ? id : `gid://shopify/Product/${String(id)}`));
const toCollectionGids = (ids) => ids.map((id) => (String(id).startsWith("gid://") ? id : `gid://shopify/Collection/${String(id)}`));

const fetchNodesByIds = async (ids, admin) => {
  if (!ids || ids.length === 0) return [];
  const query = `#graphql
    query Nodes($ids: [ID!]!) {
      nodes(ids: $ids) {
        __typename
        ... on Product { id title handle images(first: 1) { edges { node { originalSrc url } } } variants(first: 1) { edges { node { price } } } }
        ... on Collection { id title handle image { originalSrc url } }
      }
    }`;
  const res = await admin.graphql(query, { variables: { ids } });
  const json = await res.json();
  return Array.isArray(json?.data?.nodes) ? json.data.nodes.filter(Boolean) : [];
};

export const loader = async ({ request, params }) => {
  const { session } = await authenticate.admin(request);
  const { id, questionId } = params;
  const quizId = parseInt(id, 10);

  // Fetch quiz with theme settings
  const quiz = await prisma.quiz.findFirst({
    where: {
      quiz_id: quizId,
      shop: session.shop,
      deleted_at: null,
    },
  });

  if (!quiz) {
    throw new Response("Quiz not found", { status: 404 });
  }

  // Handle "new" question creation
  if (questionId === "new") {
    return json({
      quiz,
      question: null,
      isNew: true,
    });
  }

  // Fetch question with answers
  const question = await prisma.question.findFirst({
    where: {
      question_id: questionId,
      quiz_id: quizId,
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

  return json({ quiz, question, isNew: false });
};

export const action = async ({ request, params }) => {
  const { session, admin } = await authenticate.admin(request);
  const { id, questionId } = params;
  const quizId = parseInt(id, 10);
  const formData = await request.formData();
  const actionType = formData.get("_action");

  if (actionType === "create" || actionType === "update") {
    const question_text = formData.get("question_text");
    const metafield_key = formData.get("metafield_key") || null;
    const answersJson = formData.get("answers");

    if (!question_text) {
      return json({ success: false, error: "Question text is required" }, { status: 400 });
    }

    let answers;
    try {
      answers = JSON.parse(answersJson);
    } catch (e) {
      return json({ success: false, error: "Invalid answers data" }, { status: 400 });
    }

    if (!answers || answers.length < 2) {
      return json({ success: false, error: "At least 2 answers are required" }, { status: 400 });
    }

    // Build action_data for each answer
    const buildActionData = async (answer) => {
      const { actionType, actionData, customText, gridColumns } = answer;

      if (actionType === "show_text") {
        return { text: actionData || "" };
      }

      if (actionType === "show_html") {
        return { html: actionData || "" };
      }

      if (actionType === "show_products") {
        const ids = (actionData || "").split(",").map((s) => s.trim()).filter(Boolean).slice(0, 3);
        const gids = toGids(ids);
        const nodes = await fetchNodesByIds(gids, admin);
        return {
          products: nodes,
          custom_text: customText || "Based on your answers, we recommend these products:",
          grid_columns: gridColumns || 2,
        };
      }

      if (actionType === "show_collections") {
        const ids = (actionData || "").split(",").map((s) => s.trim()).filter(Boolean).slice(0, 3);
        const gids = toCollectionGids(ids);
        const nodes = await fetchNodesByIds(gids, admin);
        return {
          collections: nodes,
          custom_text: customText || "Based on your answers, check out these collections:",
          grid_columns: gridColumns || 2,
        };
      }

      return {};
    };

    try {
      if (actionType === "create") {
        // Get the next question order
        const existingQuestions = await prisma.question.count({
          where: { quiz_id: quizId },
        });

        // Create question with answers
        await prisma.question.create({
          data: {
            quiz_id: quizId,
            shop: session.shop,
            question_text,
            metafield_key,
            order: existingQuestions + 1,
            answers: {
              create: await Promise.all(
                answers.map(async (answer, index) => ({
                  answer_id: `answer-${Date.now()}-${index}`,
                  answer_text: answer.text,
                  action_type: answer.actionType,
                  action_data: await buildActionData(answer),
                  order: index + 1,
                }))
              ),
            },
          },
        });

        return redirect(`/app/quiz/${id}`);
      } else {
        // Update existing question
        const existingQuestion = await prisma.question.findFirst({
          where: { question_id: questionId },
          include: { answers: true },
        });

        if (!existingQuestion) {
          return json({ success: false, error: "Question not found" }, { status: 404 });
        }

        // Update question
        await prisma.question.update({
          where: { question_id: questionId },
          data: {
            question_text,
            metafield_key,
          },
        });

        // Smart update answers - preserve IDs where possible for analytics continuity
        const existingAnswerIds = existingQuestion.answers.map((a) => a.answer_id);
        const newAnswerCount = answers.length;

        for (let i = 0; i < newAnswerCount; i++) {
          const answer = answers[i];
          const actionDataBuilt = await buildActionData(answer);

          if (i < existingAnswerIds.length) {
            // Update existing answer
            await prisma.answer.update({
              where: { answer_id: existingAnswerIds[i] },
              data: {
                answer_text: answer.text,
                action_type: answer.actionType,
                action_data: actionDataBuilt,
                order: i + 1,
              },
            });
          } else {
            // Create new answer
            await prisma.answer.create({
              data: {
                answer_id: `answer-${Date.now()}-${i}`,
                question_id: questionId,
                answer_text: answer.text,
                action_type: answer.actionType,
                action_data: actionDataBuilt,
                order: i + 1,
              },
            });
          }
        }

        // Delete extra answers if we have fewer now
        if (existingAnswerIds.length > newAnswerCount) {
          const idsToDelete = existingAnswerIds.slice(newAnswerCount);
          await prisma.answer.deleteMany({
            where: { answer_id: { in: idsToDelete } },
          });
        }

        return redirect(`/app/quiz/${id}`);
      }
    } catch (error) {
      console.error("Error saving question:", error);
      return json({ success: false, error: "Failed to save question. Please try again." }, { status: 500 });
    }
  }

  if (actionType === "delete") {
    try {
      await prisma.question.delete({
        where: { question_id: questionId },
      });
      return redirect(`/app/quiz/${id}`);
    } catch (error) {
      console.error("Error deleting question:", error);
      return json({ success: false, error: "Failed to delete question" }, { status: 500 });
    }
  }

  return json({ success: false, error: "Invalid action" });
};

// Extract initial answer data from stored format
const extractAnswerData = (answer) => {
  if (!answer) return { text: "", actionType: "show_text", actionData: "", customText: "", gridColumns: 2, previewItems: [] };

  const { answer_text, action_type, action_data } = answer;

  if (action_type === "show_text") {
    return {
      text: answer_text,
      actionType: action_type,
      actionData: action_data?.text || "",
      customText: "",
      gridColumns: 2,
      previewItems: [],
    };
  }

  if (action_type === "show_html") {
    return {
      text: answer_text,
      actionType: action_type,
      actionData: action_data?.html || "",
      customText: "",
      gridColumns: 2,
      previewItems: [],
    };
  }

  if (action_type === "show_products") {
    const products = action_data?.products || [];
    return {
      text: answer_text,
      actionType: action_type,
      actionData: products.map((p) => p.id).join(","),
      customText: action_data?.custom_text || "",
      gridColumns: action_data?.grid_columns || 2,
      previewItems: products.map((p) => ({
        id: p.id,
        title: p.title,
        image: p.images?.edges?.[0]?.node?.originalSrc || p.images?.edges?.[0]?.node?.url || p.images?.[0]?.originalSrc || "",
        price: p.variants?.edges?.[0]?.node?.price || "",
      })),
    };
  }

  if (action_type === "show_collections") {
    const collections = action_data?.collections || [];
    return {
      text: answer_text,
      actionType: action_type,
      actionData: collections.map((c) => c.id).join(","),
      customText: action_data?.custom_text || "",
      gridColumns: action_data?.grid_columns || 2,
      previewItems: collections.map((c) => ({
        id: c.id,
        title: c.title,
        image: c.image?.originalSrc || c.image?.url || "",
      })),
    };
  }

  return { text: answer_text, actionType: "show_text", actionData: "", customText: "", gridColumns: 2, previewItems: [] };
};

// Default answer template
const defaultAnswer = () => ({
  text: "",
  actionType: "show_text",
  actionData: "",
  customText: "",
  gridColumns: 2,
  previewItems: [],
});

export default function EditQuestionPage() {
  const { quiz, question, isNew } = useLoaderData();
  const navigate = useNavigate();
  const submit = useSubmit();
  const actionData = useActionData();
  const formRef = useRef(null);

  // Question state
  const [questionText, setQuestionText] = useState(question?.question_text || "");
  const [metafieldKey, setMetafieldKey] = useState(question?.metafield_key || "");

  // Initialize answers from question or create 2 defaults
  const initialAnswers = question?.answers?.length
    ? question.answers.map(extractAnswerData)
    : [defaultAnswer(), defaultAnswer()];

  const [answers, setAnswers] = useState(initialAnswers);
  const [expandedAnswers, setExpandedAnswers] = useState(
    initialAnswers.map((_, i) => i === 0) // First answer expanded by default
  );

  // Preview state
  const [previewAnswerIndex, setPreviewAnswerIndex] = useState(null);

  // UI state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [toastActive, setToastActive] = useState(false);
  const [toastContent, setToastContent] = useState("");

  // Show toast on error
  useEffect(() => {
    if (actionData?.error) {
      setToastContent(actionData.error);
      setToastActive(true);
      setIsSubmitting(false);
    }
  }, [actionData]);

  // Toggle answer section expansion
  const toggleAnswerExpanded = (index) => {
    setExpandedAnswers((prev) => {
      const newState = [...prev];
      newState[index] = !newState[index];
      return newState;
    });
  };

  // Update a specific answer field
  const updateAnswer = (index, field, value) => {
    setAnswers((prev) => {
      const newAnswers = [...prev];
      newAnswers[index] = { ...newAnswers[index], [field]: value };
      return newAnswers;
    });
  };

  // Add a new answer (max 5)
  const addAnswer = () => {
    if (answers.length >= 5) return;
    setAnswers((prev) => [...prev, defaultAnswer()]);
    setExpandedAnswers((prev) => [...prev, true]);
  };

  // Remove an answer (min 2)
  const removeAnswer = (index) => {
    if (answers.length <= 2) return;
    setAnswers((prev) => prev.filter((_, i) => i !== index));
    setExpandedAnswers((prev) => prev.filter((_, i) => i !== index));
    if (previewAnswerIndex === index) setPreviewAnswerIndex(null);
    else if (previewAnswerIndex > index) setPreviewAnswerIndex(previewAnswerIndex - 1);
  };

  // Resource picker
  const openResourcePicker = async (type, multiple = true, initialSelection = []) => {
    try {
      if (typeof window !== "undefined" && window.shopify && typeof window.shopify.resourcePicker === "function") {
        const config = { type, multiple, action: "select" };
        if (initialSelection?.length > 0) {
          config.selectionIds = initialSelection;
        }
        const result = await window.shopify.resourcePicker(config);
        const selection = result?.selection || result || [];
        return Array.isArray(selection) ? selection : [];
      }
    } catch (e) {
      console.error("Resource picker error:", e);
    }
    return [];
  };

  const handlePickProducts = async (index) => {
    const currentIds = answers[index].actionData ? answers[index].actionData.split(",").filter(Boolean) : [];
    const selection = await openResourcePicker("product", true, currentIds);
    if (!selection.length) return;

    const capped = selection.slice(0, 3);
    const idsCsv = capped.map((s) => s.id).join(",");
    const items = capped.map((s) => ({
      id: s.id,
      title: s.title,
      image: s?.images?.[0]?.originalSrc || s?.images?.[0]?.url || "",
      price: s?.variants?.[0]?.price || "",
    }));

    updateAnswer(index, "actionData", idsCsv);
    updateAnswer(index, "previewItems", items);
  };

  const handlePickCollections = async (index) => {
    const currentIds = answers[index].actionData ? answers[index].actionData.split(",").filter(Boolean) : [];
    const selection = await openResourcePicker("collection", true, currentIds);
    if (!selection.length) return;

    const capped = selection.slice(0, 3);
    const idsCsv = capped.map((s) => s.id).join(",");
    const items = capped.map((s) => ({
      id: s.id,
      title: s.title,
      image: s?.image?.originalSrc || s?.image?.url || "",
    }));

    updateAnswer(index, "actionData", idsCsv);
    updateAnswer(index, "previewItems", items);
  };

  // Handle save
  const handleSave = useCallback(() => {
    if (!questionText.trim()) {
      setToastContent("Question text is required");
      setToastActive(true);
      return;
    }

    const hasEmptyAnswers = answers.some((a) => !a.text.trim());
    if (hasEmptyAnswers) {
      setToastContent("All answers must have text");
      setToastActive(true);
      return;
    }

    setIsSubmitting(true);
    const formData = new FormData();
    formData.append("_action", isNew ? "create" : "update");
    formData.append("question_text", questionText);
    formData.append("metafield_key", metafieldKey);
    formData.append("answers", JSON.stringify(answers));
    submit(formData, { method: "post" });
  }, [questionText, metafieldKey, answers, isNew, submit]);

  // Handle delete
  const handleDelete = useCallback(() => {
    const formData = new FormData();
    formData.append("_action", "delete");
    submit(formData, { method: "post" });
    setShowDeleteModal(false);
  }, [submit]);

  // Theme settings (default values)
  const themeSettings = useMemo(() => ({
    primaryColor: quiz.theme_settings?.primaryColor || "#000000",
    secondaryColor: quiz.theme_settings?.secondaryColor || "#f5f5f5",
    buttonStyle: quiz.theme_settings?.buttonStyle || "rounded",
    fontSize: quiz.theme_settings?.fontSize || "medium",
  }), [quiz.theme_settings]);

  // Get button border radius based on style
  const getButtonRadius = (style) => {
    if (style === "square") return "0";
    if (style === "pill") return "9999px";
    return "8px"; // rounded
  };

  // Get font size based on setting
  const getFontSize = (size) => {
    if (size === "small") return "14px";
    if (size === "large") return "18px";
    return "16px"; // medium
  };

  const actionTypeOptions = [
    { label: "Show Text Message", value: "show_text" },
    { label: "Show HTML Content", value: "show_html" },
    { label: "Show Products or Collections", value: "show_products_collections" },
  ];

  const toastMarkup = toastActive ? (
    <Toast content={toastContent} onDismiss={() => setToastActive(false)} error duration={4500} />
  ) : null;

  return (
    <Frame>
      <Page
        title={isNew ? "Add Question" : "Edit Question"}
        backAction={{ content: quiz.title, onAction: () => navigate(`/app/quiz/${quiz.quiz_id}`) }}
        primaryAction={{
          content: isNew ? "Create Question" : "Save Changes",
          onAction: handleSave,
          loading: isSubmitting,
          disabled: isSubmitting,
        }}
        secondaryActions={
          !isNew
            ? [{ content: "Delete", icon: DeleteIcon, destructive: true, onAction: () => setShowDeleteModal(true) }]
            : []
        }
      >
        <div style={{ display: "flex", gap: "24px", minHeight: "calc(100vh - 180px)" }}>
          {/* Left Panel - Settings */}
          <div style={{ flex: "0 0 420px", maxWidth: "420px" }}>
            <BlockStack gap="400">
              {/* Question Section */}
              <Card>
                <BlockStack gap="400">
                  <Text as="h2" variant="headingMd">Question</Text>
                  <TextField
                    label="Question Text"
                    value={questionText}
                    onChange={setQuestionText}
                    placeholder="e.g., What's your style preference?"
                    autoComplete="off"
                    requiredIndicator
                  />
                  <TextField
                    label="Metafield Key (optional)"
                    value={metafieldKey}
                    onChange={setMetafieldKey}
                    placeholder="e.g., style_preference"
                    autoComplete="off"
                    helpText="Saves answer to customer.metafields.quiz.[key]"
                  />
                </BlockStack>
              </Card>

              {/* Answers */}
              {answers.map((answer, index) => (
                <Card key={index}>
                  <BlockStack gap="300">
                    {/* Answer Header - Collapsible Toggle */}
                    <div
                      style={{ cursor: "pointer", userSelect: "none" }}
                      onClick={() => toggleAnswerExpanded(index)}
                    >
                      <InlineStack align="space-between" blockAlign="center">
                        <InlineStack gap="200" blockAlign="center">
                          <Icon source={expandedAnswers[index] ? ChevronUpIcon : ChevronDownIcon} />
                          <Text as="h3" variant="headingSm">
                            Answer {index + 1}
                          </Text>
                          {answer.text && (
                            <Text as="span" variant="bodySm" tone="subdued">
                              - {answer.text.substring(0, 20)}{answer.text.length > 20 ? "..." : ""}
                            </Text>
                          )}
                        </InlineStack>
                        {answers.length > 2 && (
                          <Button
                            icon={DeleteIcon}
                            tone="critical"
                            variant="plain"
                            onClick={(e) => {
                              e.stopPropagation();
                              removeAnswer(index);
                            }}
                            accessibilityLabel="Remove answer"
                          />
                        )}
                      </InlineStack>
                    </div>

                    <Collapsible open={expandedAnswers[index]} id={`answer-${index}`}>
                      <BlockStack gap="300">
                        <Divider />
                        <TextField
                          label="Answer Text"
                          value={answer.text}
                          onChange={(val) => updateAnswer(index, "text", val)}
                          placeholder="e.g., Classic"
                          autoComplete="off"
                          requiredIndicator
                        />

                        <Select
                          label="Result Type"
                          options={actionTypeOptions}
                          value={
                            answer.actionType === "show_products" || answer.actionType === "show_collections"
                              ? "show_products_collections"
                              : answer.actionType
                          }
                          onChange={(val) => {
                            if (val === "show_products_collections") {
                              updateAnswer(index, "actionType", "show_products");
                            } else {
                              updateAnswer(index, "actionType", val);
                            }
                            updateAnswer(index, "actionData", "");
                            updateAnswer(index, "previewItems", []);
                          }}
                        />

                        {/* Show Text Config */}
                        {answer.actionType === "show_text" && (
                          <TextField
                            label="Message"
                            value={answer.actionData}
                            onChange={(val) => updateAnswer(index, "actionData", val)}
                            placeholder="e.g., Great choice! Here's what we recommend..."
                            multiline={3}
                            autoComplete="off"
                          />
                        )}

                        {/* Show HTML Config */}
                        {answer.actionType === "show_html" && (
                          <TextField
                            label="HTML Content"
                            value={answer.actionData}
                            onChange={(val) => updateAnswer(index, "actionData", val)}
                            placeholder="<div>Your custom HTML here</div>"
                            multiline={4}
                            autoComplete="off"
                            helpText="Enter valid HTML to display"
                          />
                        )}

                        {/* Show Products/Collections Config */}
                        {(answer.actionType === "show_products" || answer.actionType === "show_collections") && (
                          <BlockStack gap="300">
                            {/* Type Toggle */}
                            <BlockStack gap="200">
                              <Text as="span" variant="bodyMd">Display Type</Text>
                              <InlineStack gap="400">
                                <RadioButton
                                  label="Products"
                                  checked={answer.actionType === "show_products"}
                                  id={`products-${index}`}
                                  name={`type-${index}`}
                                  onChange={() => {
                                    updateAnswer(index, "actionType", "show_products");
                                    updateAnswer(index, "actionData", "");
                                    updateAnswer(index, "previewItems", []);
                                  }}
                                />
                                <RadioButton
                                  label="Collections"
                                  checked={answer.actionType === "show_collections"}
                                  id={`collections-${index}`}
                                  name={`type-${index}`}
                                  onChange={() => {
                                    updateAnswer(index, "actionType", "show_collections");
                                    updateAnswer(index, "actionData", "");
                                    updateAnswer(index, "previewItems", []);
                                  }}
                                />
                              </InlineStack>
                            </BlockStack>

                            {/* Picker Button */}
                            <InlineStack gap="200" blockAlign="center">
                              <Button
                                onClick={() =>
                                  answer.actionType === "show_products"
                                    ? handlePickProducts(index)
                                    : handlePickCollections(index)
                                }
                              >
                                {answer.previewItems?.length > 0
                                  ? `Change ${answer.actionType === "show_products" ? "products" : "collections"}`
                                  : `Pick ${answer.actionType === "show_products" ? "products" : "collections"}`}
                              </Button>
                              <Text as="span" variant="bodySm" tone="subdued">
                                {answer.previewItems?.length || 0} / 3 selected
                              </Text>
                            </InlineStack>

                            {/* Preview Items */}
                            {answer.previewItems?.length > 0 && (
                              <InlineStack gap="200" wrap={false}>
                                {answer.previewItems.map((item) => (
                                  <Box key={item.id} padding="200" background="bg-surface-secondary" borderRadius="200">
                                    <BlockStack gap="100" inlineAlign="center">
                                      {item.image ? (
                                        <img
                                          src={item.image}
                                          alt={item.title}
                                          style={{ width: 48, height: 48, objectFit: "cover", borderRadius: 4 }}
                                        />
                                      ) : (
                                        <div style={{ width: 48, height: 48, background: "#eee", borderRadius: 4, display: "flex", alignItems: "center", justifyContent: "center" }}>
                                          <Icon source={ImageIcon} tone="subdued" />
                                        </div>
                                      )}
                                      <Text as="span" variant="bodySm" truncate>
                                        {item.title?.substring(0, 12) || "Item"}
                                      </Text>
                                    </BlockStack>
                                  </Box>
                                ))}
                              </InlineStack>
                            )}

                            {/* Grid Columns */}
                            <BlockStack gap="200">
                              <Text as="span" variant="bodyMd">Grid Layout</Text>
                              <ButtonGroup variant="segmented">
                                {[1, 2, 3].map((cols) => (
                                  <Button
                                    key={cols}
                                    pressed={answer.gridColumns === cols}
                                    onClick={() => updateAnswer(index, "gridColumns", cols)}
                                  >
                                    {cols} {cols === 1 ? "Column" : "Columns"}
                                  </Button>
                                ))}
                              </ButtonGroup>
                            </BlockStack>

                            {/* Custom Header Text */}
                            <TextField
                              label="Header Text"
                              value={answer.customText}
                              onChange={(val) => updateAnswer(index, "customText", val)}
                              placeholder="Based on your answers, we recommend:"
                              autoComplete="off"
                            />
                          </BlockStack>
                        )}

                        {/* Preview Button */}
                        <Button
                          variant="plain"
                          onClick={() => setPreviewAnswerIndex(previewAnswerIndex === index ? null : index)}
                        >
                          {previewAnswerIndex === index ? "Hide result preview" : "Show result preview"}
                        </Button>
                      </BlockStack>
                    </Collapsible>
                  </BlockStack>
                </Card>
              ))}

              {/* Add Answer Button */}
              {answers.length < 5 && (
                <Button icon={PlusIcon} onClick={addAnswer} fullWidth>
                  Add Answer ({answers.length}/5)
                </Button>
              )}
            </BlockStack>
          </div>

          {/* Right Panel - Live Preview */}
          <div style={{ flex: 1, position: "sticky", top: "20px", alignSelf: "flex-start" }}>
            <Card>
              <BlockStack gap="400">
                <InlineStack align="space-between" blockAlign="center">
                  <Text as="h2" variant="headingMd">Live Preview</Text>
                  <Badge tone="info">Preview</Badge>
                </InlineStack>

                <Divider />

                {/* Quiz Preview Container */}
                <div
                  style={{
                    padding: "24px",
                    background: themeSettings.secondaryColor,
                    borderRadius: "8px",
                    minHeight: "400px",
                  }}
                >
                  {/* Question Preview */}
                  <div style={{ marginBottom: "20px" }}>
                    <h2
                      style={{
                        fontSize: getFontSize(themeSettings.fontSize),
                        fontWeight: 600,
                        margin: "0 0 16px 0",
                        lineHeight: 1.4,
                      }}
                    >
                      {questionText || "Your question will appear here..."}
                    </h2>

                    {/* Answer Buttons */}
                    <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                      {answers.map((answer, index) => (
                        <button
                          key={index}
                          onClick={() => setPreviewAnswerIndex(previewAnswerIndex === index ? null : index)}
                          style={{
                            width: "100%",
                            padding: "12px 16px",
                            background: previewAnswerIndex === index ? themeSettings.primaryColor : "transparent",
                            color: previewAnswerIndex === index ? "#fff" : "inherit",
                            border: `1px solid ${themeSettings.primaryColor}`,
                            borderRadius: getButtonRadius(themeSettings.buttonStyle),
                            fontSize: getFontSize(themeSettings.fontSize),
                            textAlign: "left",
                            cursor: "pointer",
                            transition: "all 0.2s",
                            fontWeight: previewAnswerIndex === index ? 600 : 400,
                          }}
                        >
                          {answer.text || `Answer ${index + 1}`}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Result Preview */}
                  {previewAnswerIndex !== null && answers[previewAnswerIndex] && (
                    <div
                      style={{
                        marginTop: "24px",
                        paddingTop: "24px",
                        borderTop: "1px solid rgba(0,0,0,0.1)",
                      }}
                    >
                      <Text as="h3" variant="headingSm" tone="subdued">
                        Result Preview
                      </Text>
                      <div style={{ marginTop: "12px" }}>
                        {answers[previewAnswerIndex].actionType === "show_text" && (
                          <p style={{ lineHeight: 1.6 }}>
                            {answers[previewAnswerIndex].actionData || "Your message will appear here..."}
                          </p>
                        )}

                        {answers[previewAnswerIndex].actionType === "show_html" && (
                          <div
                            dangerouslySetInnerHTML={{
                              __html: answers[previewAnswerIndex].actionData || "<p>Your HTML content will appear here...</p>",
                            }}
                          />
                        )}

                        {(answers[previewAnswerIndex].actionType === "show_products" ||
                          answers[previewAnswerIndex].actionType === "show_collections") && (
                          <div>
                            <p style={{ marginBottom: "16px", fontSize: "1.1em" }}>
                              {answers[previewAnswerIndex].customText || "Based on your answers, we recommend:"}
                            </p>
                            <div
                              style={{
                                display: "grid",
                                gridTemplateColumns: `repeat(${answers[previewAnswerIndex].gridColumns || 2}, 1fr)`,
                                gap: "16px",
                              }}
                            >
                              {(answers[previewAnswerIndex].previewItems?.length > 0
                                ? answers[previewAnswerIndex].previewItems
                                : [{ id: 1, title: "Sample Item", image: "" }, { id: 2, title: "Sample Item 2", image: "" }]
                              ).map((item, i) => (
                                <div
                                  key={item.id || i}
                                  style={{
                                    border: "1px solid rgba(0,0,0,0.1)",
                                    borderRadius: "8px",
                                    overflow: "hidden",
                                    background: "#fff",
                                  }}
                                >
                                  <div
                                    style={{
                                      height: "120px",
                                      background: item.image ? `url(${item.image}) center/cover` : "#f0f0f0",
                                      display: "flex",
                                      alignItems: "center",
                                      justifyContent: "center",
                                    }}
                                  >
                                    {!item.image && <Icon source={ImageIcon} tone="subdued" />}
                                  </div>
                                  <div style={{ padding: "12px", textAlign: "center" }}>
                                    <p style={{ fontWeight: 600, margin: "0 0 8px 0", fontSize: "14px" }}>
                                      {item.title}
                                    </p>
                                    {item.price && (
                                      <p style={{ fontWeight: 700, margin: "0 0 8px 0" }}>${item.price}</p>
                                    )}
                                    <span
                                      style={{
                                        display: "inline-block",
                                        padding: "8px 16px",
                                        background: themeSettings.primaryColor,
                                        color: "#fff",
                                        borderRadius: "4px",
                                        fontSize: "13px",
                                        fontWeight: 600,
                                      }}
                                    >
                                      Shop Now
                                    </span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* Style Info */}
                <Banner tone="info">
                  <p>
                    Style settings can be customized from the quiz overview page. This preview uses current quiz
                    theme settings.
                  </p>
                </Banner>
              </BlockStack>
            </Card>
          </div>
        </div>

        {/* Delete Modal */}
        <Modal
          open={showDeleteModal}
          onClose={() => setShowDeleteModal(false)}
          title="Delete Question"
          primaryAction={{ content: "Delete", destructive: true, onAction: handleDelete }}
          secondaryActions={[{ content: "Cancel", onAction: () => setShowDeleteModal(false) }]}
        >
          <Modal.Section>
            <BlockStack gap="200">
              <Text as="p">Are you sure you want to delete this question? This action cannot be undone.</Text>
              {question?.question_text && (
                <Text as="p" tone="subdued">Question: "{question.question_text}"</Text>
              )}
            </BlockStack>
          </Modal.Section>
        </Modal>

        {toastMarkup}
      </Page>
    </Frame>
  );
}
