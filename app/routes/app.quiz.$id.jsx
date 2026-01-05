import { json, redirect } from "@remix-run/node";
import { useLoaderData, useNavigate, useSubmit, useActionData } from "@remix-run/react";
import { useState, useCallback, useEffect } from "react";
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
  ChatIcon,
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

  const query = `#graphql
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
    const response = await admin.graphql(query, {
      variables: { ids: gids },
    });
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
  const { session, admin } = await authenticate.admin(request);
  const { id } = params;
  const url = new URL(request.url);

  // Get date range from query params (default to last 30 days)
  const daysParam = url.searchParams.get("days") || "30";
  const days = parseInt(daysParam, 10);

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

  // Fetch analytics data
  const dateThreshold = new Date();
  dateThreshold.setDate(dateThreshold.getDate() - days);
  dateThreshold.setHours(0, 0, 0, 0);

  const quizSessions = await prisma.quizSession.findMany({
    where: {
      quiz_id: quizId,
      shop: session.shop,
      started_at: { gte: dateThreshold }
    },
    include: {
      order_attributions: true,
    },
  });

  const totalSessions = quizSessions.length;
  const completedSessions = quizSessions.filter((s) => s.is_completed).length;

  const totalRevenue = quizSessions.reduce((sum, session) => {
    const revenue = session.order_attributions.reduce(
      (orderSum, order) => orderSum + parseFloat(order.total_price), 0
    );
    return sum + revenue;
  }, 0);

  const totalOrders = quizSessions.reduce(
    (sum, session) => sum + session.order_attributions.length, 0
  );

  // Fetch answer statistics for each question
  // NOTE: Answer stats should show ALL-TIME counts, not filtered by date range
  // This prevents answer clicks from showing as 0 when viewing different time periods
  const answerStats = {};
  for (const question of quiz.questions) {
    for (const answer of question.answers) {
      const selectionCount = await prisma.answerSelection.count({
        where: {
          answer_id: answer.answer_id,
          quiz_id: quizId,
          shop: session.shop,
          // Don't filter by selected_at - show all-time answer click counts
        },
      });
      answerStats[answer.answer_id] = selectionCount;
    }
  }

  // Calculate percentages for each answer within its question
  const answerStatsWithPercentages = {};
  for (const question of quiz.questions) {
    const totalSelectionsForQuestion = question.answers.reduce(
      (sum, answer) => sum + (answerStats[answer.answer_id] || 0), 0
    );

    for (const answer of question.answers) {
      const clicks = answerStats[answer.answer_id] || 0;
      const percentage = totalSelectionsForQuestion > 0
        ? ((clicks / totalSelectionsForQuestion) * 100).toFixed(1)
        : "0.0";

      answerStatsWithPercentages[answer.answer_id] = {
        clicks,
        percentage,
      };
    }
  }

  const analytics = {
    starts: totalSessions,
    completions: completedSessions,
    completionRate: totalSessions > 0 ? ((completedSessions / totalSessions) * 100).toFixed(1) : "0.0",
    totalRevenue: totalRevenue.toFixed(2),
    totalOrders,
    conversionRate: completedSessions > 0 ? ((totalOrders / completedSessions) * 100).toFixed(1) : "0.0",
    days,
  };

  return json({ quiz, analytics, answerStats: answerStatsWithPercentages });
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

    // Validate: minimum 2, maximum 5 answers
    if (!question_text) {
      return json({
        success: false,
        error: "Question text is required",
      }, { status: 400 });
    }

    if (answers.length < 2) {
      return json({
        success: false,
        error: "At least 2 answers are required",
      }, { status: 400 });
    }

    if (answers.length > 5) {
      return json({
        success: false,
        error: "Maximum 5 answers allowed",
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

      // Build action data for each answer
      const answerCreateData = [];
      for (let i = 0; i < answers.length; i++) {
        const answer = answers[i];
        let actionDataObj = {};

        if (answer.actionType === "show_text") {
          actionDataObj = { text: answer.actionData };
        } else if (answer.actionType === "show_html") {
          actionDataObj = { html: answer.actionData };
        } else if (answer.actionType === "show_products" || answer.actionType === "show_collections") {
          try {
            const parsed = JSON.parse(answer.actionData || "{}");
            if (answer.actionType === "show_products") {
              const ids = (parsed.products || []).map((p) => p.id || p).slice(0, 3);
              const nodes = await fetchNodesByIds(toGids(ids), admin);
              actionDataObj = { products: nodes, custom_text: (answer.customText || parsed.custom_text || "Based on your answers, we recommend these products:") };
            } else {
              const ids = (parsed.collections || []).map((c) => c.id || c).slice(0, 3);
              const nodes = await fetchNodesByIds(toCollectionGids(ids), admin);
              actionDataObj = { collections: nodes, custom_text: (answer.customText || parsed.custom_text || "Based on your answers, check out these collections:") };
            }
          } catch (e) {
            console.error(`[Add Question Answer ${i + 1}] Error parsing/fetching:`, e);
            actionDataObj = answer.actionType === "show_products" ? {
              products: [],
              custom_text: "Based on your answers, we recommend these products:"
            } : {
              collections: [],
              custom_text: "Based on your answers, check out these collections:"
            };
          }
        }

        answerCreateData.push({
          answer_text: answer.text,
          action_type: answer.actionType,
          action_data: actionDataObj,
          order: i + 1,
        });
      }

      // Create question with answers
      await prisma.question.create({
        data: {
          quiz_id: quizId,
          shop: session.shop,
          question_text,
          metafield_key,
          order: 1,
          answers: {
            create: answerCreateData,
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
    const metafield_key = formData.get("metafield_key") || null;

    // Parse dynamic answers from form data (supports 2-5 answers)
    const answers = [];
    for (let i = 0; i < 5; i++) {
      const text = formData.get(`answers[${i}][text]`);
      const answerActionType = formData.get(`answers[${i}][action_type]`);
      const actionData = formData.get(`answers[${i}][action_data]`);
      const customText = formData.get(`answers[${i}][custom_text]`);

      if (text && answerActionType) {
        answers.push({ text, actionType: answerActionType, actionData, customText });
      }
    }

    // Validate
    if (!question_id || !question_text) {
      return json({
        success: false,
        error: "Question ID and text are required",
      }, { status: 400 });
    }

    if (answers.length < 2) {
      return json({
        success: false,
        error: "At least 2 answers are required",
      }, { status: 400 });
    }

    if (answers.length > 5) {
      return json({
        success: false,
        error: "Maximum 5 answers allowed",
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

      // Build action data for each answer
      const answerCreateData = [];
      for (let i = 0; i < answers.length; i++) {
        const answer = answers[i];
        let actionDataObj = {};

        if (answer.actionType === "show_text") {
          actionDataObj = { text: answer.actionData };
        } else if (answer.actionType === "show_html") {
          actionDataObj = { html: answer.actionData };
        } else if (answer.actionType === "show_products" || answer.actionType === "show_collections") {
          try {
            const parsed = JSON.parse(answer.actionData || "{}");
            if (answer.actionType === "show_products") {
              const ids = (parsed.products || []).map((p) => p.id || p).slice(0, 3);
              const nodes = await fetchNodesByIds(toGids(ids), admin);
              actionDataObj = { products: nodes, custom_text: (answer.customText || parsed.custom_text || "Based on your answers, we recommend these products:") };
            } else {
              const ids = (parsed.collections || []).map((c) => c.id || c).slice(0, 3);
              const nodes = await fetchNodesByIds(toCollectionGids(ids), admin);
              actionDataObj = { collections: nodes, custom_text: (answer.customText || parsed.custom_text || "Based on your answers, check out these collections:") };
            }
          } catch (e) {
            console.error(`[Update Question Answer ${i + 1}] Error parsing/fetching:`, e);
            actionDataObj = answer.actionType === "show_products" ? {
              products: [],
              custom_text: "Based on your answers, we recommend these products:"
            } : {
              collections: [],
              custom_text: "Based on your answers, check out these collections:"
            };
          }
        }

        answerCreateData.push({
          answer_text: answer.text,
          action_type: answer.actionType,
          action_data: actionDataObj,
          order: i + 1,
        });
      }

      // Smart update: preserve answer IDs when possible to keep analytics
      const existingAnswers = existingQuestion.answers.sort((a, b) => a.order - b.order);
      const newAnswerCount = answerCreateData.length;
      const existingAnswerCount = existingAnswers.length;

      // Build transaction operations
      const operations = [
        // Update question text and metafield_key
        prisma.question.update({
          where: { question_id },
          data: { question_text, metafield_key },
        }),
      ];

      // Update existing answers that have a matching position
      const answersToUpdate = Math.min(existingAnswerCount, newAnswerCount);
      for (let i = 0; i < answersToUpdate; i++) {
        operations.push(
          prisma.answer.update({
            where: { answer_id: existingAnswers[i].answer_id },
            data: {
              answer_text: answerCreateData[i].answer_text,
              action_type: answerCreateData[i].action_type,
              action_data: answerCreateData[i].action_data,
              order: answerCreateData[i].order,
            },
          })
        );
      }

      // If we have more new answers than existing, create new ones
      if (newAnswerCount > existingAnswerCount) {
        for (let i = existingAnswerCount; i < newAnswerCount; i++) {
          operations.push(
            prisma.answer.create({
              data: {
                question_id,
                ...answerCreateData[i],
              },
            })
          );
        }
      }

      // If we have fewer new answers than existing, delete extras
      if (newAnswerCount < existingAnswerCount) {
        const answerIdsToDelete = existingAnswers
          .slice(newAnswerCount)
          .map((a) => a.answer_id);
        operations.push(
          prisma.answer.deleteMany({
            where: { answer_id: { in: answerIdsToDelete } },
          })
        );
      }

      await prisma.$transaction(operations);

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
  const { quiz, analytics, answerStats } = useLoaderData();
  const navigate = useNavigate();
  const submit = useSubmit();
  const actionData = useActionData();

  const [title, setTitle] = useState(quiz.title);
  const [description, setDescription] = useState(quiz.description || "");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showImageModal, setShowImageModal] = useState(false);
  const [showQuestionModal, setShowQuestionModal] = useState(false);
  const [editingQuestionId, setEditingQuestionId] = useState(null);
  const [dateRange, setDateRange] = useState(String(analytics.days));

  // Toast state
  const [toastActive, setToastActive] = useState(false);
  const [toastContent, setToastContent] = useState("");
  const [toastError, setToastError] = useState(false);

  // Show toast when actionData changes
  useEffect(() => {
    if (actionData?.success) {
      setToastContent("Quiz updated successfully!");
      setToastError(false);
      setToastActive(true);
    } else if (actionData?.error) {
      setToastContent(actionData.error);
      setToastError(true);
      setToastActive(true);
    }
  }, [actionData]);

  // New/Edit question form state
  const [newQuestionText, setNewQuestionText] = useState("");
  const [newMetafieldKey, setNewMetafieldKey] = useState("");

  // Dynamic answers array (supports 2-5 answers)
  const createEmptyAnswer = () => ({
    text: "",
    actionType: "show_text",
    actionData: "",
    previewItems: [],
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

  // Clear preview items when action type changes
  const handleAnswerActionTypeChange = (index, newType) => {
    setAnswers(answers.map((answer, i) =>
      i === index ? { ...answer, actionType: newType, actionData: "", previewItems: [], customText: "" } : answer
    ));
  };

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

  const handlePickProductsForAnswer = async (index) => {
    // Get currently selected items from answers array
    const currentItems = answers[index]?.previewItems || [];
    const currentIds = currentItems.map((item) => item.id);

    // Open resource picker with current selection
    const selection = await openResourcePicker("product", true, currentIds);
    if (!selection.length) return;

    // Cap to 3 items
    const capped = selection.slice(0, 3);
    const products = capped.map((s) => ({ id: s.id }));
    const defaultText = "Based on your answers, we recommend these products:";
    const customText = answers[index]?.customText || defaultText;
    const jsonString = JSON.stringify({ products, custom_text: customText }, null, 2);
    const items = capped.map((s) => ({ id: s.id, title: s.title, image: s?.images?.[0]?.originalSrc || s?.image?.originalSrc }));

    setAnswers(answers.map((answer, i) =>
      i === index ? { ...answer, actionData: jsonString, previewItems: items } : answer
    ));
  };

  const handlePickCollectionsForAnswer = async (index) => {
    // Get currently selected items from answers array
    const currentItems = answers[index]?.previewItems || [];
    const currentIds = currentItems.map((item) => item.id);

    // Open resource picker with current selection
    const selection = await openResourcePicker("collection", true, currentIds);
    if (!selection.length) return;

    // Cap to 3 items
    const capped = selection.slice(0, 3);
    const collections = capped.map((s) => ({ id: s.id }));
    const defaultText = "Based on your answers, check out these collections:";
    const customText = answers[index]?.customText || defaultText;
    const jsonString = JSON.stringify({ collections, custom_text: customText }, null, 2);
    const items = capped.map((s) => ({ id: s.id, title: s.title, image: s?.image?.originalSrc }));

    setAnswers(answers.map((answer, i) =>
      i === index ? { ...answer, actionData: jsonString, previewItems: items } : answer
    ));
  };

  const handleRemoveItem = (index, itemId, type) => {
    const currentItems = answers[index]?.previewItems || [];
    const updatedItems = currentItems.filter((item) => item.id !== itemId);

    // Update JSON data
    const customText = answers[index]?.customText || "";
    const key = type === "products" ? "products" : "collections";
    const defaultText = type === "products"
      ? "Based on your answers, we recommend these products:"
      : "Based on your answers, check out these collections:";

    const items = updatedItems.map((item) => ({ id: item.id }));
    const jsonString = JSON.stringify({ [key]: items, custom_text: customText || defaultText }, null, 2);

    setAnswers(answers.map((answer, i) =>
      i === index ? { ...answer, actionData: jsonString, previewItems: updatedItems } : answer
    ));
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
    setShowQuestionModal(true);
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
    formData.append("metafield_key", newMetafieldKey);

    // Serialize answers array with indexed keys
    answers.forEach((answer, i) => {
      formData.append(`answers[${i}][text]`, answer.text);
      formData.append(`answers[${i}][action_type]`, answer.actionType);
      formData.append(`answers[${i}][action_data]`, answer.actionData || "");
      if (answer.actionType === "show_products" || answer.actionType === "show_collections") {
        formData.append(`answers[${i}][custom_text]`, answer.customText);
      }
    });

    submit(formData, { method: "post" });

    // Reset form
    setNewQuestionText("");
    setNewMetafieldKey("");
    setAnswers([createEmptyAnswer(), createEmptyAnswer()]);
    setShowQuestionModal(false);
    setEditingQuestionId(null);
  };

  const handleCloseQuestionModal = () => {
    setShowQuestionModal(false);
    setNewQuestionText("");
    setNewMetafieldKey("");
    setAnswers([createEmptyAnswer(), createEmptyAnswer()]);
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
    setNewMetafieldKey(question.metafield_key || "");

    // Map existing answers to answers array format
    const mappedAnswers = question.answers.map((answer) => {
      let actionData = "";
      let previewItems = [];
      let customText = "";

      if (answer.action_type === "show_text") {
        actionData = answer.action_data?.text || "";
      } else if (answer.action_type === "show_html") {
        actionData = answer.action_data?.html || "";
      } else if (answer.action_type === "show_products") {
        actionData = JSON.stringify(answer.action_data, null, 2);
        customText = answer.action_data?.custom_text || "Based on your answers, we recommend these products:";
        const products = answer.action_data?.products || [];
        previewItems = products.map((p) => ({
          id: p.id,
          title: p.title,
          image: p.images?.[0]?.originalSrc,
        }));
      } else if (answer.action_type === "show_collections") {
        actionData = JSON.stringify(answer.action_data, null, 2);
        customText = answer.action_data?.custom_text || "Based on your answers, check out these collections:";
        const collections = answer.action_data?.collections || [];
        previewItems = collections.map((c) => ({
          id: c.id,
          title: c.title,
          image: c.image?.originalSrc,
        }));
      }

      return {
        text: answer.answer_text,
        actionType: answer.action_type,
        actionData,
        previewItems,
        customText,
      };
    });

    setAnswers(mappedAnswers);
    setEditingQuestionId(question.question_id);
    setShowQuestionModal(true);
  };

  const toastMarkup = toastActive ? (
    <Toast
      content={toastContent}
      onDismiss={() => setToastActive(false)}
      error={toastError}
      duration={4500}
    />
  ) : null;

  return (
    <Frame>
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
            content: "Delete quiz",
            destructive: true,
            onAction: () => setShowDeleteModal(true),
          },
        ]}
      >
        <Layout>
          <Layout.Section>
            <BlockStack gap="500">
              {/* Analytics Section */}
              <Card>
                <BlockStack gap="400">
                  <InlineStack align="space-between" blockAlign="center">
                    <Text as="h2" variant="headingMd">
                      Analytics
                    </Text>
                    <Select
                      label=""
                      labelHidden
                      options={[
                        { label: "Last 7 days", value: "7" },
                        { label: "Last 30 days", value: "30" },
                        { label: "Last 90 days", value: "90" },
                        { label: "Last 365 days", value: "365" },
                      ]}
                      value={dateRange}
                      onChange={(value) => {
                        setDateRange(value);
                        navigate(`/app/quiz/${quiz.quiz_id}?days=${value}`);
                      }}
                    />
                  </InlineStack>

                  <InlineGrid columns={{ xs: 1, sm: 2, md: 4 }} gap="400">
                    <Card background="bg-surface-secondary">
                      <BlockStack gap="200">
                        <Text as="p" variant="bodyMd" tone="subdued">Impressions</Text>
                        <Text as="p" variant="heading2xl">{analytics.starts.toLocaleString()}</Text>
                      </BlockStack>
                    </Card>
                    <Card background="bg-surface-secondary">
                      <BlockStack gap="200">
                        <Text as="p" variant="bodyMd" tone="subdued">Completions</Text>
                        <Text as="p" variant="heading2xl">{analytics.completions.toLocaleString()}</Text>
                        <Text as="p" variant="bodySm" tone="subdued">
                          {analytics.completionRate}% completion rate
                        </Text>
                      </BlockStack>
                    </Card>
                    <Card background="bg-surface-secondary">
                      <BlockStack gap="200">
                        <Text as="p" variant="bodyMd" tone="subdued">Revenue</Text>
                        <Text as="p" variant="heading2xl">${analytics.totalRevenue}</Text>
                        <Text as="p" variant="bodySm" tone="subdued">
                          {analytics.totalOrders} {analytics.totalOrders === 1 ? 'order' : 'orders'}
                        </Text>
                      </BlockStack>
                    </Card>
                    <Card background="bg-surface-secondary">
                      <BlockStack gap="200">
                        <Text as="p" variant="bodyMd" tone="subdued">Conversion</Text>
                        <Text as="p" variant="heading2xl">{analytics.conversionRate}%</Text>
                        <Text as="p" variant="bodySm" tone="subdued">
                          of completions led to orders
                        </Text>
                      </BlockStack>
                    </Card>
                  </InlineGrid>
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
                      {quiz.questions.map((question) => (
                        <Card key={question.id} background="bg-surface-secondary">
                          <BlockStack gap="300">
                            <InlineStack align="space-between" blockAlign="start">
                              <Text as="h3" variant="headingMd">
                                {question.question_text}
                              </Text>
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
                            <BlockStack gap="100">
                              {question.answers.map((answer) => {
                                const stats = answerStats[answer.answer_id] || { clicks: 0, percentage: "0.0" };
                                return (
                                  <Box key={answer.id} paddingBlock="200">
                                    <InlineStack align="space-between" blockAlign="center">
                                      <Text as="span" variant="bodyMd">
                                        {answer.answer_text}
                                      </Text>
                                      <InlineStack gap="300" blockAlign="center">
                                        <Text as="span" variant="bodySm" tone="subdued">
                                          {stats.clicks} clicks
                                        </Text>
                                        <Badge>{stats.percentage}%</Badge>
                                      </InlineStack>
                                    </InlineStack>
                                  </Box>
                                );
                              })}
                            </BlockStack>
                          </BlockStack>
                        </Card>
                      ))}
                    </BlockStack>
                  )}
                </BlockStack>
              </Card>
            </BlockStack>
          </Layout.Section>

          <Layout.Section variant="oneThird">
            <BlockStack gap="500">
              {/* Setup Instructions Card */}
              <Card>
                <BlockStack gap="400">
                  <Text as="h2" variant="headingMd">
                    Setup Instructions
                  </Text>
                  <Text as="p" variant="bodySm" tone="subdued">
                    Follow these steps to add this quiz to your store
                  </Text>

                  <Divider />

                  {/* Step 1: Copy Quiz ID */}
                  <BlockStack gap="200">
                    <Box width="fit-content">
                      <Box background="bg-surface-secondary" padding="200" borderRadius="100">
                        <Text as="span" variant="bodySm" fontWeight="semibold">
                          Step 1
                        </Text>
                      </Box>
                    </Box>
                    <Text as="p" variant="bodyMd" fontWeight="semibold">
                      Copy your Quiz ID
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
                            navigator.clipboard.writeText(String(quiz.quiz_id));
                            setToastContent("Quiz ID copied!");
                            setToastError(false);
                            setToastActive(true);
                          }}
                        >
                          Copy ID
                        </Button>
                      </InlineStack>
                    </Box>
                  </BlockStack>

                  <Divider />

                  {/* Step 2: Open Theme Editor */}
                  <BlockStack gap="200">
                    <Box width="fit-content">
                      <Box background="bg-surface-secondary" padding="200" borderRadius="100">
                        <Text as="span" variant="bodySm" fontWeight="semibold">
                          Step 2
                        </Text>
                      </Box>
                    </Box>
                    <Text as="p" variant="bodyMd" fontWeight="semibold">
                      Add Quiz Widget to your theme
                    </Text>
                    <Text as="p" variant="bodySm" tone="subdued">
                      Click below to open the Theme Editor, then add the "Quiz Widget" app block to any page
                    </Text>
                    <Button
                      onClick={() => {
                        window.open('https://admin.shopify.com/themes/current/editor', '_top');
                      }}
                      variant="primary"
                    >
                      Open Theme Editor
                    </Button>
                  </BlockStack>

                  <Divider />

                  {/* Step 3: Configure Block */}
                  <BlockStack gap="200">
                    <Box width="fit-content">
                      <Box background="bg-surface-secondary" padding="200" borderRadius="100">
                        <Text as="span" variant="bodySm" fontWeight="semibold">
                          Step 3
                        </Text>
                      </Box>
                    </Box>
                    <Text as="p" variant="bodyMd" fontWeight="semibold">
                      Paste Quiz ID in block settings
                    </Text>
                    <Text as="p" variant="bodySm" tone="subdued">
                      In the Theme Editor, find the Quiz Widget block settings and paste your Quiz ID
                    </Text>
                    {/* Screenshot */}
                    <Box
                      background="bg-surface-secondary"
                      padding="400"
                      borderRadius="200"
                    >
                      <BlockStack gap="200" inlineAlign="center">
                        <div
                          onClick={() => setShowImageModal(true)}
                          style={{ cursor: "pointer" }}
                        >
                          <img
                            src="/quiz-setup-guide.jpg"
                            alt="Setup instructions - Click to enlarge"
                            style={{
                              width: "100%",
                              maxWidth: "300px",
                              height: "auto",
                              border: "1px solid #e0e0e0",
                              borderRadius: "8px",
                              transition: "transform 0.2s",
                            }}
                            onMouseOver={(e) => e.currentTarget.style.transform = "scale(1.02)"}
                            onMouseOut={(e) => e.currentTarget.style.transform = "scale(1)"}
                          />
                        </div>
                        <Text as="p" variant="bodySm" tone="subdued" alignment="center">
                          Click image to enlarge
                        </Text>
                      </BlockStack>
                    </Box>
                  </BlockStack>
                </BlockStack>
              </Card>

              {/* Help & Support */}
              <Card>
                <BlockStack gap="400">
                  <InlineStack gap="200" blockAlign="start">
                    <Box minWidth="20px">
                      <Icon source={ChatIcon} tone="base" />
                    </Box>
                    <Text as="h3" variant="headingMd">
                      Help & Support
                    </Text>
                  </InlineStack>
                  <Divider />
                  <BlockStack gap="300">
                    <Text as="p" variant="bodyMd">
                      Need help with setup or have technical questions?
                    </Text>
                    <Text as="p" variant="bodyMd" tone="subdued">
                      Our team is here to help with all technical questions, setup assistance, and feature requests.
                    </Text>
                    <Box paddingBlockStart="200">
                      <BlockStack gap="200">
                        <Text as="p" variant="bodySm" fontWeight="semibold">
                          Contact us:
                        </Text>
                        <Text as="p" variant="bodyLg" fontWeight="bold">
                          info@quizza.app
                        </Text>
                      </BlockStack>
                    </Box>
                  </BlockStack>
                </BlockStack>
              </Card>
            </BlockStack>
          </Layout.Section>
        </Layout>

        {/* Bottom spacing */}
        <Box paddingBlockEnd="800" />

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

        {/* Image Modal */}
        <Modal
          open={showImageModal}
          onClose={() => setShowImageModal(false)}
          title="Setup Guide"
          size="large"
        >
          <Modal.Section>
            <img
              src="/quiz-setup-guide.jpg"
              alt="Setup instructions"
              style={{
                width: "100%",
                height: "auto",
              }}
            />
          </Modal.Section>
        </Modal>

        {/* Question Add/Edit Modal */}
        <Modal
          open={showQuestionModal}
          onClose={handleCloseQuestionModal}
          title={editingQuestionId ? "Edit Question" : "Add Question"}
          size="large"
          primaryAction={{
            content: "Save Question",
            onAction: handleSaveNewQuestion,
            disabled: !newQuestionText || answers.length < 2 || answers.some((a) => !a.text || !a.actionData),
          }}
          secondaryActions={[
            {
              content: "Cancel",
              onAction: handleCloseQuestionModal,
            },
          ]}
        >
          <Modal.Section>
            <BlockStack gap="400">
              <TextField
                label="Question text"
                value={newQuestionText}
                onChange={setNewQuestionText}
                placeholder="e.g., What's your preferred style?"
                autoComplete="off"
                requiredIndicator
              />

              <TextField
                label="Metafield Key (optional)"
                value={newMetafieldKey}
                onChange={setNewMetafieldKey}
                placeholder="e.g., gender, skin_type, style_preference"
                autoComplete="off"
                helpText="Used for customer personalization. The selected answer will be saved as customer.metafields.quiz.[key]. Use lowercase with underscores."
              />
            </BlockStack>
          </Modal.Section>

          <Modal.Section>
            <BlockStack gap="400">
              <Text as="h3" variant="headingMd">Answers</Text>

              {answers.map((answer, index) => (
                <Card key={index} background="bg-surface-secondary">
                  <BlockStack gap="300">
                    <InlineStack align="space-between" blockAlign="center">
                      <Text as="h4" variant="headingSm">
                        Answer {index + 1}
                      </Text>
                      {answers.length > 2 && (
                        <Button
                          icon={DeleteIcon}
                          variant="plain"
                          tone="critical"
                          onClick={() => removeAnswer(index)}
                          accessibilityLabel="Remove answer"
                        />
                      )}
                    </InlineStack>

                    <TextField
                      label="Answer text"
                      value={answer.text}
                      onChange={(value) => updateAnswer(index, "text", value)}
                      placeholder={index === 0 ? "e.g., Modern & Minimalist" : "e.g., Bold & Colorful"}
                      autoComplete="off"
                    />

                    <Select
                      label="Action type"
                      options={[
                        { label: "Show text message", value: "show_text" },
                        { label: "Show HTML", value: "show_html" },
                      ]}
                      value={answer.actionType}
                      onChange={(value) => handleAnswerActionTypeChange(index, value)}
                    />

                    {answer.actionType === "show_text" && (
                      <TextField
                        label="Message"
                        value={answer.actionData}
                        onChange={(value) => updateAnswer(index, "actionData", value)}
                        placeholder="Great choice!"
                        multiline={3}
                        autoComplete="off"
                        helpText="Plain text message to show"
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
                      />
                    )}

                    {answer.actionType === "show_products" && (
                      <BlockStack gap="200">
                        <InlineStack gap="200" blockAlign="center">
                          <Button onClick={() => handlePickProductsForAnswer(index)}>
                            {answer.previewItems?.length ? "Change products" : "Pick products"}
                          </Button>
                          <Text as="span" tone="subdued">
                            {answer.previewItems?.length || 0} / 3 selected
                          </Text>
                        </InlineStack>
                        <TextField
                          label="Custom text"
                          value={answer.customText}
                          onChange={(value) => updateAnswer(index, "customText", value)}
                          placeholder="Based on your answers, we recommend these products:"
                        />
                        {answer.previewItems?.length ? (
                          <BlockStack gap="200">
                            {answer.previewItems.map((p) => (
                              <Box key={p.id} padding="300" background="bg-surface" borderRadius="200">
                                <InlineStack gap="300" blockAlign="center" wrap={false}>
                                  {p.image ? (
                                    <img src={p.image} alt={p.title || p.id} style={{ width: 40, height: 40, objectFit: "cover", borderRadius: 6, flexShrink: 0 }} />
                                  ) : (
                                    <Box style={{ width: 40, height: 40, background: "#e0e0e0", borderRadius: 6, flexShrink: 0 }} />
                                  )}
                                  <Box style={{ flex: 1, minWidth: 0 }}>
                                    <Text as="span" variant="bodySm" truncate>
                                      {p.title || p.id}
                                    </Text>
                                  </Box>
                                  <Button
                                    icon={DeleteIcon}
                                    variant="plain"
                                    tone="critical"
                                    size="slim"
                                    onClick={() => handleRemoveItem(index, p.id, "products")}
                                  />
                                </InlineStack>
                              </Box>
                            ))}
                          </BlockStack>
                        ) : null}
                      </BlockStack>
                    )}

                    {answer.actionType === "show_collections" && (
                      <BlockStack gap="200">
                        <InlineStack gap="200" blockAlign="center">
                          <Button onClick={() => handlePickCollectionsForAnswer(index)}>
                            {answer.previewItems?.length ? "Change collections" : "Pick collections"}
                          </Button>
                          <Text as="span" tone="subdued">
                            {answer.previewItems?.length || 0} / 3 selected
                          </Text>
                        </InlineStack>
                        <TextField
                          label="Custom text"
                          value={answer.customText}
                          onChange={(value) => updateAnswer(index, "customText", value)}
                          placeholder="Based on your answers, check out these collections:"
                        />
                        {answer.previewItems?.length ? (
                          <BlockStack gap="200">
                            {answer.previewItems.map((c) => (
                              <Box key={c.id} padding="300" background="bg-surface" borderRadius="200">
                                <InlineStack gap="300" blockAlign="center" wrap={false}>
                                  {c.image ? (
                                    <img src={c.image} alt={c.title || c.id} style={{ width: 40, height: 40, objectFit: "cover", borderRadius: 6, flexShrink: 0 }} />
                                  ) : (
                                    <Box style={{ width: 40, height: 40, background: "#e0e0e0", borderRadius: 6, flexShrink: 0 }} />
                                  )}
                                  <Box style={{ flex: 1, minWidth: 0 }}>
                                    <Text as="span" variant="bodySm" truncate>
                                      {c.title || c.id}
                                    </Text>
                                  </Box>
                                  <Button
                                    icon={DeleteIcon}
                                    variant="plain"
                                    tone="critical"
                                    size="slim"
                                    onClick={() => handleRemoveItem(index, c.id, "collections")}
                                  />
                                </InlineStack>
                              </Box>
                            ))}
                          </BlockStack>
                        ) : null}
                      </BlockStack>
                    )}
                  </BlockStack>
                </Card>
              ))}

              {answers.length < 5 && (
                <Button onClick={addAnswer} icon={PlusIcon} variant="primary">
                  Add answer
                </Button>
              )}
            </BlockStack>
          </Modal.Section>
        </Modal>

        {toastMarkup}
      </Page>
    </Frame>
  );
}
