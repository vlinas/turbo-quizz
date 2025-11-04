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
  InlineGrid,
  Select,
  Divider,
  Box,
  Badge,
  Icon,
  ButtonGroup,
  Modal,
  ResourceList,
  ResourceItem,
} from "@shopify/polaris";
import {
  DeleteIcon,
  PlusIcon,
  EditIcon,
  ImageIcon,
} from "@shopify/polaris-icons";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

// Helper functions for Shopify GraphQL
function toGids(ids) {
  return ids.map((id) => {
    if (typeof id === "string" && id.startsWith("gid://")) return id;
    const numId = typeof id === "string" ? id.replace(/\D/g, "") : id;
    return `gid://shopify/Product/${numId}`;
  });
}

function toCollectionGids(ids) {
  return ids.map((id) => {
    if (typeof id === "string" && id.startsWith("gid://")) return id;
    const numId = typeof id === "string" ? id.replace(/\D/g, "") : id;
    return `gid://shopify/Collection/${numId}`;
  });
}

// Note: This function needs to be called from within the action handler where admin context is available
// For now, we'll just return the IDs as-is and let the frontend/widget handle the full data fetch
async function fetchNodesByIds(gids, admin) {
  if (!gids || gids.length === 0) return [];

  const query = `
    query getNodes($ids: [ID!]!) {
      nodes(ids: $ids) {
        ... on Product {
          id
          title
          handle
          images(first: 1) {
            edges {
              node {
                originalSrc
              }
            }
          }
          variants(first: 1) {
            edges {
              node {
                price
              }
            }
          }
        }
        ... on Collection {
          id
          title
          handle
          image {
            originalSrc
          }
        }
      }
    }
  `;

  try {
    const response = await admin.graphql(query, { variables: { ids: gids } });
    const result = await response.json();

    if (result.errors) {
      console.error("GraphQL errors:", result.errors);
      return [];
    }

    // Transform the nodes to the format expected by the frontend
    return (result.data?.nodes || []).filter(Boolean).map((node) => {
      if (node.__typename === "Product" || node.images) {
        return {
          id: node.id,
          title: node.title,
          handle: node.handle,
          images: node.images?.edges?.map((e) => ({ originalSrc: e.node.originalSrc })) || [],
          variants: node.variants?.edges?.map((e) => ({ price: e.node.price })) || [],
        };
      } else {
        return {
          id: node.id,
          title: node.title,
          handle: node.handle,
          image: node.image,
        };
      }
    });
  } catch (error) {
    console.error("Error fetching nodes:", error);
    return [];
  }
}

export const loader = async ({ request, params }) => {
  const { session } = await authenticate.admin(request);
  const { id } = params;

  // Convert id to integer
  const quizId = parseInt(id, 10);
  if (isNaN(quizId)) {
    throw new Response("Invalid quiz ID", { status: 400 });
  }

  // Fetch quiz with questions and answers
  const quiz = await prisma.quiz.findFirst({
    where: {
      quiz_id: quizId,
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
  const { session, admin } = await authenticate.admin(request);
  const { id } = params;
  const formData = await request.formData();
  const actionType = formData.get("_action");

  // Convert id to integer
  const quizId = parseInt(id, 10);
  if (isNaN(quizId)) {
    return json({
      success: false,
      error: "Invalid quiz ID",
    }, { status: 400 });
  }

  // Verify quiz exists and belongs to this shop
  const quiz = await prisma.quiz.findFirst({
    where: {
      quiz_id: quizId,
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

    try {
      await prisma.quiz.update({
        where: { id: quiz.id },
        data: {
          title,
          description,
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

  if (actionType === "add_question") {
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

    try {
      // Enforce one-question-per-quiz rule
      const questionCount = await prisma.question.count({
        where: {
          quiz_id: quizId,
          shop: session.shop,
        },
      });

      if (questionCount >= 1) {
        return json({
          success: false,
          error: "Only one question is allowed per quiz. Please edit or delete the existing question.",
        }, { status: 400 });
      }

      // Build action data objects
      let answer1Data = {};
      let answer2Data = {};

      if (answer1_action_type === "show_text") {
        answer1Data = { text: answer1_action_data };
      } else if (answer1_action_type === "show_html") {
        answer1Data = { html: answer1_action_data };
      } else if (answer1_action_type === "show_products" || answer1_action_type === "show_collections") {
        // Resolve IDs to full nodes and cap to 3
        try {
          const parsed = JSON.parse(answer1_action_data || "{}");
          if (answer1_action_type === "show_products") {
            const ids = (parsed.products || []).map((p) => p.id || p).slice(0, 3);
            const nodes = await fetchNodesByIds(toGids(ids), admin);
            answer1Data = { products: nodes, custom_text: (formData.get("answer1_custom_text") || parsed.custom_text || "Based on your answers, we recommend these products:") };
          } else {
            const ids = (parsed.collections || []).map((c) => c.id || c).slice(0, 3);
            const nodes = await fetchNodesByIds(toCollectionGids(ids), admin);
            answer1Data = { collections: nodes, custom_text: (formData.get("answer1_custom_text") || parsed.custom_text || "Based on your answers, check out these collections:") };
          }
        } catch (e) {
          answer1Data = answer1_action_type === "show_products" ? {
            products: [],
            custom_text: "Based on your answers, we recommend these products:"
          } : {
            collections: [],
            custom_text: "Based on your answers, check out these collections:"
          };
        }
      }

      if (answer2_action_type === "show_text") {
        answer2Data = { text: answer2_action_data };
      } else if (answer2_action_type === "show_html") {
        answer2Data = { html: answer2_action_data };
      } else if (answer2_action_type === "show_products" || answer2_action_type === "show_collections") {
        try {
          const parsed = JSON.parse(answer2_action_data || "{}");
          if (answer2_action_type === "show_products") {
            const ids = (parsed.products || []).map((p) => p.id || p).slice(0, 3);
            const nodes = await fetchNodesByIds(toGids(ids), admin);
            answer2Data = { products: nodes, custom_text: (formData.get("answer2_custom_text") || parsed.custom_text || "Based on your answers, we recommend these products:") };
          } else {
            const ids = (parsed.collections || []).map((c) => c.id || c).slice(0, 3);
            const nodes = await fetchNodesByIds(toCollectionGids(ids), admin);
            answer2Data = { collections: nodes, custom_text: (formData.get("answer2_custom_text") || parsed.custom_text || "Based on your answers, check out these collections:") };
          }
        } catch (e) {
          answer2Data = answer2_action_type === "show_products" ? {
            products: [],
            custom_text: "Based on your answers, we recommend these products:"
          } : {
            collections: [],
            custom_text: "Based on your answers, check out these collections:"
          };
        }
      }

      // Create question with answers
      await prisma.question.create({
        data: {
          quiz_id: quizId,
          shop: session.shop,
          question_text,
          order: 1,
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

      return json({ success: true, message: "Question added successfully" });
    } catch (error) {
      console.error("Error adding question:", error);
      return json({
        success: false,
        error: "Failed to add question",
      }, { status: 500 });
    }
  }

  if (actionType === "update_question") {
    const question_id = formData.get("question_id");
    const question_text = formData.get("question_text");
    const answer1_text = formData.get("answer1_text");
    const answer1_action_type = formData.get("answer1_action_type");
    const answer1_action_data = formData.get("answer1_action_data");
    const answer2_text = formData.get("answer2_text");
    const answer2_action_type = formData.get("answer2_action_type");
    const answer2_action_data = formData.get("answer2_action_data");

    if (!question_id || !question_text || !answer1_text || !answer2_text) {
      return json({
        success: false,
        error: "All fields are required",
      }, { status: 400 });
    }

    try {
      // Get existing question to update
      const existingQuestion = await prisma.question.findUnique({
        where: { question_id },
        include: { answers: true },
      });

      if (!existingQuestion) {
        return json({
          success: false,
          error: "Question not found",
        }, { status: 404 });
      }

      // Build action data objects
      let answer1Data = {};
      let answer2Data = {};

      if (answer1_action_type === "show_text") {
        answer1Data = { text: answer1_action_data };
      } else if (answer1_action_type === "show_html") {
        answer1Data = { html: answer1_action_data };
      } else if (answer1_action_type === "show_products" || answer1_action_type === "show_collections") {
        // Parse JSON data from form
        try {
          answer1Data = JSON.parse(answer1_action_data || "{}");
        } catch (e) {
          // Fallback to old format if JSON parse fails
          answer1Data = answer1_action_type === "show_products" ? {
            products: [],
            custom_text: "Based on your answers, we recommend these products:"
          } : {
            collections: [],
            custom_text: "Based on your answers, check out these collections:"
          };
        }
      }

      if (answer2_action_type === "show_text") {
        answer2Data = { text: answer2_action_data };
      } else if (answer2_action_type === "show_html") {
        answer2Data = { html: answer2_action_data };
      } else if (answer2_action_type === "show_products" || answer2_action_type === "show_collections") {
        // Parse JSON data from form
        try {
          answer2Data = JSON.parse(answer2_action_data || "{}");
        } catch (e) {
          // Fallback to old format if JSON parse fails
          answer2Data = answer2_action_type === "show_products" ? {
            products: [],
            custom_text: "Based on your answers, we recommend these products:"
          } : {
            collections: [],
            custom_text: "Based on your answers, check out these collections:"
          };
        }
      }

      // Update question and answers in a transaction
      await prisma.$transaction([
        // Update question text
        prisma.question.update({
          where: { question_id },
          data: { question_text },
        }),
        // Update answer 1
        prisma.answer.update({
          where: { answer_id: existingQuestion.answers[0].answer_id },
          data: {
            answer_text: answer1_text,
            action_type: answer1_action_type,
            action_data: answer1Data,
          },
        }),
        // Update answer 2
        prisma.answer.update({
          where: { answer_id: existingQuestion.answers[1].answer_id },
          data: {
            answer_text: answer2_text,
            action_type: answer2_action_type,
            action_data: answer2Data,
          },
        }),
      ]);

      return json({ success: true, message: "Question updated successfully" });
    } catch (error) {
      console.error("Error updating question:", error);
      return json({
        success: false,
        error: "Failed to update question",
      }, { status: 500 });
    }
  }

  if (actionType === "delete_question") {
    const question_id = formData.get("question_id");

    if (!question_id) {
      return json({
        success: false,
        error: "Question ID is required",
      }, { status: 400 });
    }

    try {
      // Delete question (answers will be deleted automatically via cascade)
      await prisma.question.delete({
        where: { question_id },
      });

      return json({ success: true, message: "Question deleted successfully" });
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

export default function QuizBuilder() {
  const { quiz } = useLoaderData();
  const navigate = useNavigate();
  const submit = useSubmit();
  const actionData = useActionData();

  const [title, setTitle] = useState(quiz.title);
  const [description, setDescription] = useState(quiz.description || "");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showAddQuestion, setShowAddQuestion] = useState(false);
  const [editingQuestionId, setEditingQuestionId] = useState(null);

  // New/Edit question form state
  const [newQuestionText, setNewQuestionText] = useState("");
  const [newAnswer1Text, setNewAnswer1Text] = useState("");
  const [newAnswer1ActionType, setNewAnswer1ActionType] = useState("show_text");
  const [newAnswer1ActionData, setNewAnswer1ActionData] = useState("");

  const [newAnswer2Text, setNewAnswer2Text] = useState("");
  const [newAnswer2ActionType, setNewAnswer2ActionType] = useState("show_text");
  const [newAnswer2ActionData, setNewAnswer2ActionData] = useState("");
  const [showAdvancedJson1, setShowAdvancedJson1] = useState(false);
  const [showAdvancedJson2, setShowAdvancedJson2] = useState(false);
  const [answer1PreviewItems, setAnswer1PreviewItems] = useState([]);
  const [answer2PreviewItems, setAnswer2PreviewItems] = useState([]);
  const [answer1CustomText, setAnswer1CustomText] = useState("");
  const [answer2CustomText, setAnswer2CustomText] = useState("");

  // Resource pickers (uses App Bridge picker if available)
  const openResourcePicker = async (type, multiple = true, initialSelection = []) => {
    try {
      // App Bridge v3 global picker (guarded)
      if (typeof window !== "undefined" && window.shopify && typeof window.shopify.resourcePicker === "function") {
        const result = await window.shopify.resourcePicker({ type, multiple, selectionIds: initialSelection });
        return result && Array.isArray(result.selection) ? result.selection : [];
      }
    } catch (e) {
      console.error("Resource picker error:", e);
    }
    return [];
  };

  const handlePickProductsForAnswer = async (which) => {
    // Get currently selected items
    const currentItems = which === 1 ? answer1PreviewItems : answer2PreviewItems;
    const currentIds = currentItems.map((item) => item.id);

    // Open resource picker with current selection
    const selection = await openResourcePicker("product", true, currentIds);
    if (!selection.length) return;

    // Cap to 3 items
    const capped = selection.slice(0, 3);
    const products = capped.map((s) => ({ id: s.id }));
    const defaultText = "Based on your answers, we recommend these products:";
    const jsonString = JSON.stringify({ products, custom_text: which === 1 ? (answer1CustomText || defaultText) : (answer2CustomText || defaultText) }, null, 2);
    if (which === 1) setNewAnswer1ActionData(jsonString);
    if (which === 2) setNewAnswer2ActionData(jsonString);
    const items = capped.map((s) => ({ id: s.id, title: s.title, image: s?.images?.[0]?.originalSrc || s?.image?.originalSrc }));
    if (which === 1) setAnswer1PreviewItems(items);
    if (which === 2) setAnswer2PreviewItems(items);
  };

  const handlePickCollectionsForAnswer = async (which) => {
    // Get currently selected items
    const currentItems = which === 1 ? answer1PreviewItems : answer2PreviewItems;
    const currentIds = currentItems.map((item) => item.id);

    // Open resource picker with current selection
    const selection = await openResourcePicker("collection", true, currentIds);
    if (!selection.length) return;

    // Cap to 3 items
    const capped = selection.slice(0, 3);
    const collections = capped.map((s) => ({ id: s.id }));
    const defaultText = "Based on your answers, check out these collections:";
    const jsonString = JSON.stringify({ collections, custom_text: which === 1 ? (answer1CustomText || defaultText) : (answer2CustomText || defaultText) }, null, 2);
    if (which === 1) setNewAnswer1ActionData(jsonString);
    if (which === 2) setNewAnswer2ActionData(jsonString);
    const items = capped.map((s) => ({ id: s.id, title: s.title, image: s?.image?.originalSrc }));
    if (which === 1) setAnswer1PreviewItems(items);
    if (which === 2) setAnswer2PreviewItems(items);
  };

  const handleRemoveItem = (which, itemId, type) => {
    const currentItems = which === 1 ? answer1PreviewItems : answer2PreviewItems;
    const updatedItems = currentItems.filter((item) => item.id !== itemId);

    // Update preview items
    if (which === 1) setAnswer1PreviewItems(updatedItems);
    if (which === 2) setAnswer2PreviewItems(updatedItems);

    // Update JSON data
    const customText = which === 1 ? answer1CustomText : answer2CustomText;
    const key = type === "products" ? "products" : "collections";
    const defaultText = type === "products"
      ? "Based on your answers, we recommend these products:"
      : "Based on your answers, check out these collections:";

    const items = updatedItems.map((item) => ({ id: item.id }));
    const jsonString = JSON.stringify({ [key]: items, custom_text: customText || defaultText }, null, 2);

    if (which === 1) setNewAnswer1ActionData(jsonString);
    if (which === 2) setNewAnswer2ActionData(jsonString);
  };

  const parsePreview = (jsonString, type) => {
    try {
      const parsed = JSON.parse(jsonString || "{}");
      if (type === "show_products") return (parsed.products || []).map((p) => (p.id || p));
      if (type === "show_collections") return (parsed.collections || []).map((c) => (c.id || c));
      return [];
    } catch (_) {
      return [];
    }
  };

  const handleSave = () => {
    setIsSubmitting(true);
    const formData = new FormData();
    formData.append("_action", "update_quiz");
    formData.append("title", title);
    formData.append("description", description);
    submit(formData, { method: "post" });
    setTimeout(() => setIsSubmitting(false), 1000);
  };

  const handleDelete = () => {
    const formData = new FormData();
    formData.append("_action", "delete_quiz");
    submit(formData, { method: "post" });
  };

  const handleAddQuestion = () => {
    setShowAddQuestion(true);
  };

  const handleSaveNewQuestion = () => {
    const formData = new FormData();

    if (editingQuestionId) {
      // Editing existing question - delete old and create new
      formData.append("_action", "update_question");
      formData.append("question_id", editingQuestionId);
    } else {
      // Adding new question
      formData.append("_action", "add_question");
    }

    formData.append("question_text", newQuestionText);
    formData.append("answer1_text", newAnswer1Text);
    formData.append("answer1_action_type", newAnswer1ActionType);
    formData.append("answer1_action_data", newAnswer1ActionData);
    if (newAnswer1ActionType === "show_products" || newAnswer1ActionType === "show_collections") {
      formData.append("answer1_custom_text", answer1CustomText);
    }

    formData.append("answer2_text", newAnswer2Text);
    formData.append("answer2_action_type", newAnswer2ActionType);
    formData.append("answer2_action_data", newAnswer2ActionData);
    if (newAnswer2ActionType === "show_products" || newAnswer2ActionType === "show_collections") {
      formData.append("answer2_custom_text", answer2CustomText);
    }

    submit(formData, { method: "post" });

    // Reset form
    setNewQuestionText("");
    setNewAnswer1Text("");
    setNewAnswer1ActionType("show_text");
    setNewAnswer1ActionData("");
    setNewAnswer2Text("");
    setNewAnswer2ActionType("show_text");
    setNewAnswer2ActionData("");
    setShowAddQuestion(false);
    setEditingQuestionId(null);
  };

  const handleCancelNewQuestion = () => {
    setShowAddQuestion(false);
    setNewQuestionText("");
    setNewAnswer1Text("");
    setNewAnswer1ActionType("show_text");
    setNewAnswer1ActionData("");
    setNewAnswer2Text("");
    setNewAnswer2ActionType("show_text");
    setNewAnswer2ActionData("");
    setEditingQuestionId(null);
  };

  const handleDeleteQuestion = (questionId) => {
    if (confirm("Are you sure you want to delete this question? This cannot be undone.")) {
      const formData = new FormData();
      formData.append("_action", "delete_question");
      formData.append("question_id", questionId);
      submit(formData, { method: "post" });
    }
  };

  const handleEditQuestion = (question) => {
    // Populate form with existing question data
    setNewQuestionText(question.question_text);

    // Answer 1
    const answer1 = question.answers[0];
    setNewAnswer1Text(answer1.answer_text);
    setNewAnswer1ActionType(answer1.action_type);

    // Set answer 1 action data - store as JSON string for products/collections
    if (answer1.action_type === "show_text") {
      setNewAnswer1ActionData(answer1.action_data.text || "");
      setAnswer1PreviewItems([]);
    } else if (answer1.action_type === "show_html") {
      setNewAnswer1ActionData(answer1.action_data.html || "");
      setAnswer1PreviewItems([]);
    } else if (answer1.action_type === "show_products") {
      setNewAnswer1ActionData(JSON.stringify(answer1.action_data, null, 2));
      setAnswer1CustomText(answer1.action_data.custom_text || "Based on your answers, we recommend these products:");
      // Extract preview items from products array
      const products = answer1.action_data.products || [];
      const previewItems = products.map((p) => ({
        id: p.id,
        title: p.title,
        image: p.images?.[0]?.originalSrc,
      }));
      setAnswer1PreviewItems(previewItems);
    } else if (answer1.action_type === "show_collections") {
      setNewAnswer1ActionData(JSON.stringify(answer1.action_data, null, 2));
      setAnswer1CustomText(answer1.action_data.custom_text || "Based on your answers, check out these collections:");
      // Extract preview items from collections array
      const collections = answer1.action_data.collections || [];
      const previewItems = collections.map((c) => ({
        id: c.id,
        title: c.title,
        image: c.image?.originalSrc,
      }));
      setAnswer1PreviewItems(previewItems);
    }

    // Answer 2
    const answer2 = question.answers[1];
    setNewAnswer2Text(answer2.answer_text);
    setNewAnswer2ActionType(answer2.action_type);

    // Set answer 2 action data - store as JSON string for products/collections
    if (answer2.action_type === "show_text") {
      setNewAnswer2ActionData(answer2.action_data.text || "");
      setAnswer2PreviewItems([]);
    } else if (answer2.action_type === "show_html") {
      setNewAnswer2ActionData(answer2.action_data.html || "");
      setAnswer2PreviewItems([]);
    } else if (answer2.action_type === "show_products") {
      setNewAnswer2ActionData(JSON.stringify(answer2.action_data, null, 2));
      setAnswer2CustomText(answer2.action_data.custom_text || "Based on your answers, we recommend these products:");
      // Extract preview items from products array
      const products = answer2.action_data.products || [];
      const previewItems = products.map((p) => ({
        id: p.id,
        title: p.title,
        image: p.images?.[0]?.originalSrc,
      }));
      setAnswer2PreviewItems(previewItems);
    } else if (answer2.action_type === "show_collections") {
      setNewAnswer2ActionData(JSON.stringify(answer2.action_data, null, 2));
      setAnswer2CustomText(answer2.action_data.custom_text || "Based on your answers, check out these collections:");
      // Extract preview items from collections array
      const collections = answer2.action_data.collections || [];
      const previewItems = collections.map((c) => ({
        id: c.id,
        title: c.title,
        image: c.image?.originalSrc,
      }));
      setAnswer2PreviewItems(previewItems);
    }

    setEditingQuestionId(question.question_id);
    setShowAddQuestion(true);
  };

  return (
    <Page
      title={quiz.title}
      backAction={{ content: "Quizzes", onAction: () => navigate("/app") }}
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

          {/* Quiz ID Card */}
          <Card>
            <BlockStack gap="300">
              <Text as="h2" variant="headingMd">
                Quiz ID
              </Text>
              <Text as="p" variant="bodySm" tone="subdued">
                Use this ID to embed the quiz in your theme using the Quiz Widget app block
              </Text>
              <Box
                background="bg-surface-secondary"
                padding="400"
                borderRadius="200"
              >
                <InlineStack align="space-between" blockAlign="center">
                  <Text as="p" variant="headingLg" fontWeight="bold">
                    {quiz.quiz_id}
                  </Text>
                  <Button
                    onClick={() => {
                      navigator.clipboard.writeText(quiz.quiz_id);
                    }}
                  >
                    Copy ID
                  </Button>
                </InlineStack>
              </Box>
            </BlockStack>
          </Card>

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

            </BlockStack>
          </Card>

          {/* Questions */}
          <Card>
            <BlockStack gap="400">
              <InlineStack align="space-between" blockAlign="center">
                <Text as="h2" variant="headingMd">
                  Questions
                </Text>
                {quiz.questions.length === 0 && (
                  <Button
                    icon={PlusIcon}
                    onClick={handleAddQuestion}
                  >
                    Add question
                  </Button>
                )}
              </InlineStack>

              {/* Inline Add/Edit Question Form */}
              {showAddQuestion && (
                <Card background="bg-surface-warning-subdued">
                  <BlockStack gap="400">
                    <Text as="h3" variant="headingMd">
                      {editingQuestionId ? "Edit Question" : "New Question"}
                    </Text>

                    <TextField
                      label="Question text"
                      value={newQuestionText}
                      onChange={setNewQuestionText}
                      placeholder="e.g., What's your preferred style?"
                      autoComplete="off"
                      requiredIndicator
                    />

                    <Divider />

                    <BlockStack gap="300">
                      <Text as="h4" variant="headingSm">
                        Answer 1
                      </Text>
                      <TextField
                        label="Answer text"
                        value={newAnswer1Text}
                        onChange={setNewAnswer1Text}
                        placeholder="e.g., Modern & Minimalist"
                        autoComplete="off"
                      />
                      <Select
                        label="Action type"
                        options={[
                          { label: "Show text message", value: "show_text" },
                          { label: "Show HTML", value: "show_html" },
                          { label: "Show products", value: "show_products" },
                          { label: "Show collections", value: "show_collections" },
                        ]}
                        value={newAnswer1ActionType}
                        onChange={setNewAnswer1ActionType}
                      />

                      {newAnswer1ActionType === "show_text" && (
                        <TextField
                          label="Message"
                          value={newAnswer1ActionData}
                          onChange={setNewAnswer1ActionData}
                          placeholder="Great choice!"
                          multiline={4}
                          autoComplete="off"
                          helpText="Plain text message to show"
                        />
                      )}

                      {newAnswer1ActionType === "show_html" && (
                        <TextField
                          label="HTML Content"
                          value={newAnswer1ActionData}
                          onChange={setNewAnswer1ActionData}
                          placeholder='<div class="result"><h2>Great choice!</h2><p>Perfect for your style.</p></div>'
                          multiline={6}
                          autoComplete="off"
                          helpText="HTML content to display (supports all HTML tags)"
                        />
                      )}

                      {newAnswer1ActionType === "show_products" && (
                        <BlockStack gap="200">
                          <InlineStack gap="200" blockAlign="center">
                            <Button onClick={() => handlePickProductsForAnswer(1)}>
                              {answer1PreviewItems?.length ? "Change products" : "Pick products"}
                            </Button>
                            <Text as="span" tone="subdued">
                              {answer1PreviewItems?.length || 0} / 3 selected
                            </Text>
                          </InlineStack>
                          <TextField label="Custom text" value={answer1CustomText} onChange={setAnswer1CustomText} placeholder="Based on your answers, we recommend these products:" />
                          {answer1PreviewItems?.length ? (
                            <BlockStack gap="200">
                              {answer1PreviewItems.map((p) => (
                                <Box key={p.id} padding="300" background="bg-surface-secondary" borderRadius="200">
                                  <InlineStack gap="300" blockAlign="center" wrap={false}>
                                    {p.image ? (
                                      <img src={p.image} alt={p.title || p.id} style={{ width: 48, height: 48, objectFit: "cover", borderRadius: 8, flexShrink: 0 }} />
                                    ) : (
                                      <Box style={{ width: 48, height: 48, background: "#e0e0e0", borderRadius: 8, flexShrink: 0 }} />
                                    )}
                                    <Box style={{ flex: 1, minWidth: 0 }}>
                                      <Text as="span" variant="bodyMd" truncate>
                                        {p.title || p.id}
                                      </Text>
                                    </Box>
                                    <Button
                                      icon={DeleteIcon}
                                      variant="plain"
                                      tone="critical"
                                      onClick={() => handleRemoveItem(1, p.id, "products")}
                                    />
                                  </InlineStack>
                                </Box>
                              ))}
                            </BlockStack>
                          ) : null}
                        </BlockStack>
                      )}

                      {newAnswer1ActionType === "show_collections" && (
                        <BlockStack gap="200">
                          <InlineStack gap="200" blockAlign="center">
                            <Button onClick={() => handlePickCollectionsForAnswer(1)}>
                              {answer1PreviewItems?.length ? "Change collections" : "Pick collections"}
                            </Button>
                            <Text as="span" tone="subdued">
                              {answer1PreviewItems?.length || 0} / 3 selected
                            </Text>
                          </InlineStack>
                          <TextField label="Custom text" value={answer1CustomText} onChange={setAnswer1CustomText} placeholder="Based on your answers, check out these collections:" />
                          {answer1PreviewItems?.length ? (
                            <BlockStack gap="200">
                              {answer1PreviewItems.map((c) => (
                                <Box key={c.id} padding="300" background="bg-surface-secondary" borderRadius="200">
                                  <InlineStack gap="300" blockAlign="center" wrap={false}>
                                    {c.image ? (
                                      <img src={c.image} alt={c.title || c.id} style={{ width: 48, height: 48, objectFit: "cover", borderRadius: 8, flexShrink: 0 }} />
                                    ) : (
                                      <Box style={{ width: 48, height: 48, background: "#e0e0e0", borderRadius: 8, flexShrink: 0 }} />
                                    )}
                                    <Box style={{ flex: 1, minWidth: 0 }}>
                                      <Text as="span" variant="bodyMd" truncate>
                                        {c.title || c.id}
                                      </Text>
                                    </Box>
                                    <Button
                                      icon={DeleteIcon}
                                      variant="plain"
                                      tone="critical"
                                      onClick={() => handleRemoveItem(1, c.id, "collections")}
                                    />
                                  </InlineStack>
                                </Box>
                              ))}
                            </BlockStack>
                          ) : null}
                        </BlockStack>
                      )}
                    </BlockStack>

                    <Divider />

                    <BlockStack gap="300">
                      <Text as="h4" variant="headingSm">
                        Answer 2
                      </Text>
                      <TextField
                        label="Answer text"
                        value={newAnswer2Text}
                        onChange={setNewAnswer2Text}
                        placeholder="e.g., Bold & Colorful"
                        autoComplete="off"
                      />
                      <Select
                        label="Action type"
                        options={[
                          { label: "Show text message", value: "show_text" },
                          { label: "Show HTML", value: "show_html" },
                          { label: "Show products", value: "show_products" },
                          { label: "Show collections", value: "show_collections" },
                        ]}
                        value={newAnswer2ActionType}
                        onChange={setNewAnswer2ActionType}
                      />

                      {newAnswer2ActionType === "show_text" && (
                        <TextField
                          label="Message"
                          value={newAnswer2ActionData}
                          onChange={setNewAnswer2ActionData}
                          placeholder="Excellent choice!"
                          multiline={4}
                          autoComplete="off"
                          helpText="Plain text message to show"
                        />
                      )}

                      {newAnswer2ActionType === "show_html" && (
                        <TextField
                          label="HTML Content"
                          value={newAnswer2ActionData}
                          onChange={setNewAnswer2ActionData}
                          placeholder='<div class="result"><h2>Excellent choice!</h2><p>Bold and beautiful.</p></div>'
                          multiline={6}
                          autoComplete="off"
                          helpText="HTML content to display (supports all HTML tags)"
                        />
                      )}

                      {newAnswer2ActionType === "show_products" && (
                        <BlockStack gap="200">
                          <InlineStack gap="200" blockAlign="center">
                            <Button onClick={() => handlePickProductsForAnswer(2)}>
                              {answer2PreviewItems?.length ? "Change products" : "Pick products"}
                            </Button>
                            <Text as="span" tone="subdued">
                              {answer2PreviewItems?.length || 0} / 3 selected
                            </Text>
                          </InlineStack>
                          <TextField label="Custom text" value={answer2CustomText} onChange={setAnswer2CustomText} placeholder="Based on your answers, we recommend these products:" />
                          {answer2PreviewItems?.length ? (
                            <BlockStack gap="200">
                              {answer2PreviewItems.map((p) => (
                                <Box key={p.id} padding="300" background="bg-surface-secondary" borderRadius="200">
                                  <InlineStack gap="300" blockAlign="center" wrap={false}>
                                    {p.image ? (
                                      <img src={p.image} alt={p.title || p.id} style={{ width: 48, height: 48, objectFit: "cover", borderRadius: 8, flexShrink: 0 }} />
                                    ) : (
                                      <Box style={{ width: 48, height: 48, background: "#e0e0e0", borderRadius: 8, flexShrink: 0 }} />
                                    )}
                                    <Box style={{ flex: 1, minWidth: 0 }}>
                                      <Text as="span" variant="bodyMd" truncate>
                                        {p.title || p.id}
                                      </Text>
                                    </Box>
                                    <Button
                                      icon={DeleteIcon}
                                      variant="plain"
                                      tone="critical"
                                      onClick={() => handleRemoveItem(2, p.id, "products")}
                                    />
                                  </InlineStack>
                                </Box>
                              ))}
                            </BlockStack>
                          ) : null}
                        </BlockStack>
                      )}

                      {newAnswer2ActionType === "show_collections" && (
                        <BlockStack gap="200">
                          <InlineStack gap="200" blockAlign="center">
                            <Button onClick={() => handlePickCollectionsForAnswer(2)}>
                              {answer2PreviewItems?.length ? "Change collections" : "Pick collections"}
                            </Button>
                            <Text as="span" tone="subdued">
                              {answer2PreviewItems?.length || 0} / 3 selected
                            </Text>
                          </InlineStack>
                          <TextField label="Custom text" value={answer2CustomText} onChange={setAnswer2CustomText} placeholder="Based on your answers, check out these collections:" />
                          {answer2PreviewItems?.length ? (
                            <BlockStack gap="200">
                              {answer2PreviewItems.map((c) => (
                                <Box key={c.id} padding="300" background="bg-surface-secondary" borderRadius="200">
                                  <InlineStack gap="300" blockAlign="center" wrap={false}>
                                    {c.image ? (
                                      <img src={c.image} alt={c.title || c.id} style={{ width: 48, height: 48, objectFit: "cover", borderRadius: 8, flexShrink: 0 }} />
                                    ) : (
                                      <Box style={{ width: 48, height: 48, background: "#e0e0e0", borderRadius: 8, flexShrink: 0 }} />
                                    )}
                                    <Box style={{ flex: 1, minWidth: 0 }}>
                                      <Text as="span" variant="bodyMd" truncate>
                                        {c.title || c.id}
                                      </Text>
                                    </Box>
                                    <Button
                                      icon={DeleteIcon}
                                      variant="plain"
                                      tone="critical"
                                      onClick={() => handleRemoveItem(2, c.id, "collections")}
                                    />
                                  </InlineStack>
                                </Box>
                              ))}
                            </BlockStack>
                          ) : null}
                        </BlockStack>
                      )}
                    </BlockStack>

                    <InlineStack gap="200">
                      <Button
                        variant="primary"
                        onClick={handleSaveNewQuestion}
                        disabled={
                          !newQuestionText ||
                          !newAnswer1Text ||
                          !newAnswer2Text ||
                          !newAnswer1ActionData ||
                          !newAnswer2ActionData
                        }
                      >
                        Save question
                      </Button>
                      <Button onClick={handleCancelNewQuestion}>
                        Cancel
                      </Button>
                    </InlineStack>
                  </BlockStack>
                </Card>
              )}

              {quiz.questions.length === 0 && !showAddQuestion ? (
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
              ) : !showAddQuestion ? (
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
                          <InlineStack gap="200">
                            <Button
                              icon={EditIcon}
                              onClick={() => handleEditQuestion(question)}
                            >
                              Edit
                            </Button>
                            <Button
                              icon={DeleteIcon}
                              tone="critical"
                              onClick={() => handleDeleteQuestion(question.question_id)}
                            >
                              Delete
                            </Button>
                          </InlineStack>
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
                                  Action: {answer.action_type === "show_text" ? "Show text" : answer.action_type === "show_html" ? "Show HTML" : answer.action_type === "show_products" ? "Show products" : "Show collections"}
                                </Text>
                              </BlockStack>
                            </Box>
                          ))}
                        </BlockStack>
                      </BlockStack>
                    </Card>
                  ))}
                </BlockStack>
              ) : null}
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
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>

      {/* Delete Confirmation Modal */}
      <Modal
        open={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        title="Delete quiz?"
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
          <BlockStack gap="400">
            <Text as="p">
              Are you sure you want to delete this quiz? This action cannot be undone.
            </Text>
            <Text as="p" tone="subdued">
              All questions, answers, and analytics data associated with this quiz will be permanently deleted.
            </Text>
          </BlockStack>
        </Modal.Section>
      </Modal>
    </Page>
  );
}
