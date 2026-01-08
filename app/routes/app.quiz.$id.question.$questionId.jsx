import { json, redirect } from "@remix-run/node";
import { useLoaderData, useNavigate, useSubmit, useActionData, Form } from "@remix-run/react";
import { useState, useCallback, useEffect, useRef } from "react";
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
} from "@shopify/polaris";
import { DeleteIcon } from "@shopify/polaris-icons";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

export const loader = async ({ request, params }) => {
  const { session } = await authenticate.admin(request);
  const { id, questionId } = params;
  const quizId = parseInt(id, 10);

  // Fetch quiz
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

  return json({ quiz, question });
};

export const action = async ({ request, params }) => {
  const { session, admin } = await authenticate.admin(request);
  const { id, questionId } = params;
  const formData = await request.formData();
  const actionType = formData.get("_action");

  if (actionType === "update") {
    const question_text = formData.get("question_text");
    const metafield_key = formData.get("metafield_key") || null;
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

    // Build normalized action_data with full objects and custom text
    const toGids = (ids) => ids.map((id) => (String(id).startsWith("gid://") ? id : `gid://shopify/Product/${String(id)}`));
    const toCollectionGids = (ids) => ids.map((id) => (String(id).startsWith("gid://") ? id : `gid://shopify/Collection/${String(id)}`));
    const fetchNodesByIds = async (ids) => {
      if (!ids || ids.length === 0) return [];
      const query = `#graphql\n        query Nodes($ids: [ID!]!) {\n          nodes(ids: $ids) {\n            __typename\n            ... on Product { id title handle images(first: 1) { edges { node { originalSrc url } } } variants(first: 1) { edges { node { price } } } }\n            ... on Collection { id title handle image { originalSrc url } }\n          }\n        }`;
      const res = await admin.graphql(query, { variables: { ids } });
      const json = await res.json();
      return Array.isArray(json?.data?.nodes) ? json.data.nodes.filter(Boolean) : [];
    };

    const answer1_custom_text = formData.get("answer1_custom_text") || "";
    const answer2_custom_text = formData.get("answer2_custom_text") || "";

    const buildData = async (type, raw, customTextDefault) => {
      if (type === "show_text") return { text: raw };
      if (type === "show_products") {
        const ids = (raw || "").split(",").map((s) => s.trim()).filter(Boolean).slice(0, 3);
        const gids = toGids(ids);
        const nodes = await fetchNodesByIds(gids);
        return { products: nodes, custom_text: customTextDefault || "Based on your answers, we recommend these products:" };
      }
      if (type === "show_collections") {
        const ids = (raw || "").split(",").map((s) => s.trim()).filter(Boolean).slice(0, 3);
        const gids = toCollectionGids(ids);
        const nodes = await fetchNodesByIds(gids);
        return { collections: nodes, custom_text: customTextDefault || "Based on your answers, check out these collections:" };
      }
      return {};
    };

    const answer1Data = await buildData(answer1_action_type, answer1_action_data, answer1_custom_text);
    const answer2Data = await buildData(answer2_action_type, answer2_action_data, answer2_custom_text);

    try {
      // Update question and answers in transaction
      await prisma.question.update({
        where: { question_id: questionId },
        data: {
          question_text,
          metafield_key,
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
  const formRef = useRef(null);

  const [questionText, setQuestionText] = useState(question.question_text);
  const [metafieldKey, setMetafieldKey] = useState(question.metafield_key || "");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showAdvancedJson1, setShowAdvancedJson1] = useState(false);
  const [showAdvancedJson2, setShowAdvancedJson2] = useState(false);

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

  // Resource pickers (uses App Bridge picker if available)
  const openResourcePicker = async (type, multiple = true, initialSelection = []) => {
    try {
      if (typeof window !== "undefined" && window.shopify && typeof window.shopify.resourcePicker === "function") {
        const config = {
          type,
          multiple,
          action: "select"
        };

        // Add selection IDs if provided
        if (initialSelection && initialSelection.length > 0) {
          config.selectionIds = initialSelection;
        }

        const result = await window.shopify.resourcePicker(config);

        // Handle both old and new API response formats
        const selection = result?.selection || result || [];
        return Array.isArray(selection) ? selection : [];
      }
    } catch (e) {
      console.error("Resource picker error:", e);
    }
    return [];
  };

  const handlePickProducts = async (which) => {
    // Get current selection to pass as initial selection
    const currentData = which === 1 ? answer1ActionData : answer2ActionData;
    const currentIds = currentData ? currentData.split(",").filter(Boolean) : [];

    const selection = await openResourcePicker("product", true, currentIds);
    if (!selection.length) return;

    // Cap at 3 products
    const capped = selection.slice(0, 3);
    const idsCsv = capped.map((s) => s.id).join(",");

    // Extract items for preview
    const items = capped.map((s) => ({
      id: s.id,
      title: s.title,
      image: s?.images?.[0]?.originalSrc || s?.images?.[0]?.url || s?.image?.originalSrc || s?.image?.url || ""
    }));

    if (which === 1) {
      setAnswer1ActionData(idsCsv);
      setAnswer1PreviewItems(items);
    } else if (which === 2) {
      setAnswer2ActionData(idsCsv);
      setAnswer2PreviewItems(items);
    }
  };

  const handlePickCollections = async (which) => {
    // Get current selection to pass as initial selection
    const currentData = which === 1 ? answer1ActionData : answer2ActionData;
    const currentIds = currentData ? currentData.split(",").filter(Boolean) : [];

    const selection = await openResourcePicker("collection", true, currentIds);
    if (!selection.length) return;

    // Cap at 3 collections
    const capped = selection.slice(0, 3);
    const idsCsv = capped.map((s) => s.id).join(",");

    // Extract items for preview
    const items = capped.map((s) => ({
      id: s.id,
      title: s.title,
      image: s?.image?.originalSrc || s?.image?.url || ""
    }));

    if (which === 1) {
      setAnswer1ActionData(idsCsv);
      setAnswer1PreviewItems(items);
    } else if (which === 2) {
      setAnswer2ActionData(idsCsv);
      setAnswer2PreviewItems(items);
    }
  };

  const parseCount = (raw, type) => {
    try {
      const parsed = JSON.parse(raw || "{}");
      if (type === "show_products") return (parsed.products || []).length;
      if (type === "show_collections") return (parsed.collections || []).length;
      // CSV fallback
      if (type === "show_products" || type === "show_collections") return (raw || "").split(",").filter(Boolean).length;
      return 0;
    } catch (_) {
      return (raw || "").split(",").filter(Boolean).length;
    }
  };

  // Extract initial data and preview items from stored answer data
  const extractInitialData = (answer) => {
    const actionData = answer.action_data;
    const actionType = answer.action_type;

    if (actionType === "show_text") {
      return { data: actionData.text || "", customText: "", previewItems: [] };
    }

    if (actionType === "show_products") {
      const products = actionData.products || [];
      const ids = products.map(p => p.id).join(",");
      const previewItems = products.map(p => ({
        id: p.id,
        title: p.title,
        image: p.images?.[0]?.originalSrc || p.images?.[0]?.url || ""
      }));
      return {
        data: ids,
        customText: actionData.custom_text || "",
        previewItems
      };
    }

    if (actionType === "show_collections") {
      const collections = actionData.collections || [];
      const ids = collections.map(c => c.id).join(",");
      const previewItems = collections.map(c => ({
        id: c.id,
        title: c.title,
        image: c.image?.originalSrc || c.image?.url || ""
      }));
      return {
        data: ids,
        customText: actionData.custom_text || "",
        previewItems
      };
    }

    return { data: "", customText: "", previewItems: [] };
  };

  // Answer 1
  const answer1Initial = extractInitialData(question.answers[0]);
  const [answer1Text, setAnswer1Text] = useState(question.answers[0].answer_text);
  const [answer1ActionType, setAnswer1ActionType] = useState(question.answers[0].action_type);
  const [answer1ActionData, setAnswer1ActionData] = useState(answer1Initial.data);
  const [answer1CustomText, setAnswer1CustomText] = useState(answer1Initial.customText);
  const [answer1PreviewItems, setAnswer1PreviewItems] = useState(answer1Initial.previewItems);

  // Answer 2
  const answer2Initial = extractInitialData(question.answers[1]);
  const [answer2Text, setAnswer2Text] = useState(question.answers[1].answer_text);
  const [answer2ActionType, setAnswer2ActionType] = useState(question.answers[1].action_type);
  const [answer2ActionData, setAnswer2ActionData] = useState(answer2Initial.data);
  const [answer2CustomText, setAnswer2CustomText] = useState(answer2Initial.customText);
  const [answer2PreviewItems, setAnswer2PreviewItems] = useState(answer2Initial.previewItems);

  const actionTypeOptions = [
    { label: "Show Text Message", value: "show_text" },
    // Products and collections temporarily disabled - coming soon
    // { label: "Show Products", value: "show_products" },
    // { label: "Show Collections", value: "show_collections" },
  ];

  const handleSave = useCallback(() => {
    setIsSubmitting(true);
    // Submit the hidden form which has the correct action attribute
    if (formRef.current) {
      formRef.current.requestSubmit();
    }
  }, []);

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
      {/* Hidden form with explicit action for proper routing */}
      <Form
        ref={formRef}
        method="post"
        action={`/app/quiz/${quiz.quiz_id}/question/${question.question_id}`}
        style={{ display: 'none' }}
      >
        <input type="hidden" name="_action" value="update" />
        <input type="hidden" name="question_text" value={questionText} />
        <input type="hidden" name="metafield_key" value={metafieldKey} />
        <input type="hidden" name="answer1_id" value={question.answers[0].answer_id} />
        <input type="hidden" name="answer1_text" value={answer1Text} />
        <input type="hidden" name="answer1_action_type" value={answer1ActionType} />
        <input type="hidden" name="answer1_action_data" value={answer1ActionData} />
        <input type="hidden" name="answer1_custom_text" value={answer1CustomText} />
        <input type="hidden" name="answer2_id" value={question.answers[1].answer_id} />
        <input type="hidden" name="answer2_text" value={answer2Text} />
        <input type="hidden" name="answer2_action_type" value={answer2ActionType} />
        <input type="hidden" name="answer2_action_data" value={answer2ActionData} />
        <input type="hidden" name="answer2_custom_text" value={answer2CustomText} />
      </Form>

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

              {answer1ActionType === "show_products" && (
                <BlockStack gap="300">
                  <InlineStack gap="200" blockAlign="center">
                    <Button onClick={() => handlePickProducts(1)}>
                      {answer1PreviewItems.length > 0 ? "Change products" : "Pick products"} (max 3)
                    </Button>
                    {answer1PreviewItems.length > 0 && (
                      <Badge tone="success">{answer1PreviewItems.length} selected</Badge>
                    )}
                  </InlineStack>
                </BlockStack>
              )}
              {answer1ActionType === "show_products" && (
                <TextField label="Custom text" value={answer1CustomText} onChange={setAnswer1CustomText} placeholder="Based on your answers, we recommend these products:" />
              )}

              {answer1ActionType === "show_products" && answer1PreviewItems?.length ? (
                <InlineGrid columns={{xs: 3, sm: 4}} gap="200">
                  {answer1PreviewItems.map((p) => (
                    <Box key={p.id} padding="150" background="bg-surface-secondary" borderRadius="100">
                      <BlockStack gap="100" inlineAlign="center">
                        {p.image ? (
                          <img src={p.image} alt={p.title || p.id} style={{ width: 48, height: 48, objectFit: "cover", borderRadius: 8 }} />
                        ) : null}
                        <Text as="span" variant="bodySm" truncate>
                          {p.title || p.id}
                        </Text>
                      </BlockStack>
                    </Box>
                  ))}
                </InlineGrid>
              ) : null}

              {answer1ActionType === "show_collections" && (
                <BlockStack gap="300">
                  <InlineStack gap="200" blockAlign="center">
                    <Button onClick={() => handlePickCollections(1)}>
                      {answer1PreviewItems.length > 0 ? "Change collections" : "Pick collections"} (max 3)
                    </Button>
                    {answer1PreviewItems.length > 0 && (
                      <Badge tone="success">{answer1PreviewItems.length} selected</Badge>
                    )}
                  </InlineStack>
                </BlockStack>
              )}
              {answer1ActionType === "show_collections" && (
                <TextField label="Custom text" value={answer1CustomText} onChange={setAnswer1CustomText} placeholder="Based on your answers, check out these collections:" />
              )}

              {answer1ActionType === "show_collections" && answer1PreviewItems?.length ? (
                <InlineGrid columns={{xs: 3, sm: 4}} gap="200">
                  {answer1PreviewItems.map((c) => (
                    <Box key={c.id} padding="150" background="bg-surface-secondary" borderRadius="100">
                      <BlockStack gap="100" inlineAlign="center">
                        {c.image ? (
                          <img src={c.image} alt={c.title || c.id} style={{ width: 48, height: 48, objectFit: "cover", borderRadius: 8 }} />
                        ) : null}
                        <Text as="span" variant="bodySm" truncate>
                          {c.title || c.id}
                        </Text>
                      </BlockStack>
                    </Box>
                  ))}
                </InlineGrid>
              ) : null}

              {answer1ActionType === "show_text" ? (
                <TextField
                  label="Action Data"
                  value={answer1ActionData}
                  onChange={setAnswer1ActionData}
                  placeholder={getActionDataPlaceholder(answer1ActionType)}
                  autoComplete="off"
                  multiline={answer1ActionType === "show_text" ? 3 : false}
                  helpText={getActionDataHelpText(answer1ActionType)}
                />
              ) : null}
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

              {answer2ActionType === "show_products" && (
                <BlockStack gap="300">
                  <InlineStack gap="200" blockAlign="center">
                    <Button onClick={() => handlePickProducts(2)}>
                      {answer2PreviewItems.length > 0 ? "Change products" : "Pick products"} (max 3)
                    </Button>
                    {answer2PreviewItems.length > 0 && (
                      <Badge tone="success">{answer2PreviewItems.length} selected</Badge>
                    )}
                  </InlineStack>
                </BlockStack>
              )}
              {answer2ActionType === "show_products" && (
                <TextField label="Custom text" value={answer2CustomText} onChange={setAnswer2CustomText} placeholder="Based on your answers, we recommend these products:" />
              )}

              {answer2ActionType === "show_products" && answer2PreviewItems?.length ? (
                <InlineGrid columns={{xs: 3, sm: 4}} gap="200">
                  {answer2PreviewItems.map((p) => (
                    <Box key={p.id} padding="150" background="bg-surface-secondary" borderRadius="100">
                      <BlockStack gap="100" inlineAlign="center">
                        {p.image ? (
                          <img src={p.image} alt={p.title || p.id} style={{ width: 48, height: 48, objectFit: "cover", borderRadius: 8 }} />
                        ) : null}
                        <Text as="span" variant="bodySm" truncate>
                          {p.title || p.id}
                        </Text>
                      </BlockStack>
                    </Box>
                  ))}
                </InlineGrid>
              ) : null}

              {answer2ActionType === "show_collections" && (
                <BlockStack gap="300">
                  <InlineStack gap="200" blockAlign="center">
                    <Button onClick={() => handlePickCollections(2)}>
                      {answer2PreviewItems.length > 0 ? "Change collections" : "Pick collections"} (max 3)
                    </Button>
                    {answer2PreviewItems.length > 0 && (
                      <Badge tone="success">{answer2PreviewItems.length} selected</Badge>
                    )}
                  </InlineStack>
                </BlockStack>
              )}
              {answer2ActionType === "show_collections" && (
                <TextField label="Custom text" value={answer2CustomText} onChange={setAnswer2CustomText} placeholder="Based on your answers, check out these collections:" />
              )}

              {answer2ActionType === "show_collections" && answer2PreviewItems?.length ? (
                <InlineGrid columns={{xs: 3, sm: 4}} gap="200">
                  {answer2PreviewItems.map((c) => (
                    <Box key={c.id} padding="150" background="bg-surface-secondary" borderRadius="100">
                      <BlockStack gap="100" inlineAlign="center">
                        {c.image ? (
                          <img src={c.image} alt={c.title || c.id} style={{ width: 48, height: 48, objectFit: "cover", borderRadius: 8 }} />
                        ) : null}
                        <Text as="span" variant="bodySm" truncate>
                          {c.title || c.id}
                        </Text>
                      </BlockStack>
                    </Box>
                  ))}
                </InlineGrid>
              ) : null}

              {answer2ActionType === "show_text" ? (
                <TextField
                  label="Action Data"
                  value={answer2ActionData}
                  onChange={setAnswer2ActionData}
                  placeholder={getActionDataPlaceholder(answer2ActionType)}
                  autoComplete="off"
                  multiline={answer2ActionType === "show_text" ? 3 : false}
                  helpText={getActionDataHelpText(answer2ActionType)}
                />
              ) : null}
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
      {toastMarkup}
    </Page>
    </Frame>
  );
}
