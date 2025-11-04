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
  Modal,
  ResourceList,
  ResourceItem,
  Thumbnail,
} from "@shopify/polaris";
import {
  DeleteIcon,
  PlusIcon,
  EditIcon,
  ImageIcon,
} from "@shopify/polaris-icons";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

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
  const { session } = await authenticate.admin(request);
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

  // Products/Collections state for Answer 1
  const [newAnswer1Products, setNewAnswer1Products] = useState([]);
  const [newAnswer1ProductsText, setNewAnswer1ProductsText] = useState("Based on your answers, we recommend these products:");
  const [newAnswer1Collections, setNewAnswer1Collections] = useState([]);
  const [newAnswer1CollectionsText, setNewAnswer1CollectionsText] = useState("Based on your answers, check out these collections:");

  const [newAnswer2Text, setNewAnswer2Text] = useState("");
  const [newAnswer2ActionType, setNewAnswer2ActionType] = useState("show_text");
  const [newAnswer2ActionData, setNewAnswer2ActionData] = useState("");

  // Products/Collections state for Answer 2
  const [newAnswer2Products, setNewAnswer2Products] = useState([]);
  const [newAnswer2ProductsText, setNewAnswer2ProductsText] = useState("Based on your answers, we recommend these products:");
  const [newAnswer2Collections, setNewAnswer2Collections] = useState([]);
  const [newAnswer2CollectionsText, setNewAnswer2CollectionsText] = useState("Based on your answers, check out these collections:");

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

    // Build answer 1 action data
    let answer1FinalData = newAnswer1ActionData;
    if (newAnswer1ActionType === "show_products") {
      answer1FinalData = JSON.stringify({
        products: newAnswer1Products,
        custom_text: newAnswer1ProductsText
      });
    } else if (newAnswer1ActionType === "show_collections") {
      answer1FinalData = JSON.stringify({
        collections: newAnswer1Collections,
        custom_text: newAnswer1CollectionsText
      });
    }
    formData.append("answer1_action_data", answer1FinalData);

    formData.append("answer2_text", newAnswer2Text);
    formData.append("answer2_action_type", newAnswer2ActionType);

    // Build answer 2 action data
    let answer2FinalData = newAnswer2ActionData;
    if (newAnswer2ActionType === "show_products") {
      answer2FinalData = JSON.stringify({
        products: newAnswer2Products,
        custom_text: newAnswer2ProductsText
      });
    } else if (newAnswer2ActionType === "show_collections") {
      answer2FinalData = JSON.stringify({
        collections: newAnswer2Collections,
        custom_text: newAnswer2CollectionsText
      });
    }
    formData.append("answer2_action_data", answer2FinalData);

    submit(formData, { method: "post" });

    // Reset form
    setNewQuestionText("");
    setNewAnswer1Text("");
    setNewAnswer1ActionType("show_text");
    setNewAnswer1ActionData("");
    setNewAnswer1Products([]);
    setNewAnswer1ProductsText("Based on your answers, we recommend these products:");
    setNewAnswer1Collections([]);
    setNewAnswer1CollectionsText("Based on your answers, check out these collections:");
    setNewAnswer2Text("");
    setNewAnswer2ActionType("show_text");
    setNewAnswer2ActionData("");
    setNewAnswer2Products([]);
    setNewAnswer2ProductsText("Based on your answers, we recommend these products:");
    setNewAnswer2Collections([]);
    setNewAnswer2CollectionsText("Based on your answers, check out these collections:");
    setShowAddQuestion(false);
    setEditingQuestionId(null);
  };

  const handleCancelNewQuestion = () => {
    setShowAddQuestion(false);
    setNewQuestionText("");
    setNewAnswer1Text("");
    setNewAnswer1ActionType("show_text");
    setNewAnswer1ActionData("");
    setNewAnswer1Products([]);
    setNewAnswer1ProductsText("Based on your answers, we recommend these products:");
    setNewAnswer1Collections([]);
    setNewAnswer1CollectionsText("Based on your answers, check out these collections:");
    setNewAnswer2Text("");
    setNewAnswer2ActionType("show_text");
    setNewAnswer2ActionData("");
    setNewAnswer2Products([]);
    setNewAnswer2ProductsText("Based on your answers, we recommend these products:");
    setNewAnswer2Collections([]);
    setNewAnswer2CollectionsText("Based on your answers, check out these collections:");
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

    // Set answer 1 action data based on type
    if (answer1.action_type === "show_text") {
      setNewAnswer1ActionData(answer1.action_data.text || "");
    } else if (answer1.action_type === "show_html") {
      setNewAnswer1ActionData(answer1.action_data.html || "");
    } else if (answer1.action_type === "show_products") {
      setNewAnswer1Products(answer1.action_data.products || []);
      setNewAnswer1ProductsText(answer1.action_data.custom_text || "Based on your answers, we recommend these products:");
    } else if (answer1.action_type === "show_collections") {
      setNewAnswer1Collections(answer1.action_data.collections || []);
      setNewAnswer1CollectionsText(answer1.action_data.custom_text || "Based on your answers, check out these collections:");
    }

    // Answer 2
    const answer2 = question.answers[1];
    setNewAnswer2Text(answer2.answer_text);
    setNewAnswer2ActionType(answer2.action_type);

    // Set answer 2 action data based on type
    if (answer2.action_type === "show_text") {
      setNewAnswer2ActionData(answer2.action_data.text || "");
    } else if (answer2.action_type === "show_html") {
      setNewAnswer2ActionData(answer2.action_data.html || "");
    } else if (answer2.action_type === "show_products") {
      setNewAnswer2Products(answer2.action_data.products || []);
      setNewAnswer2ProductsText(answer2.action_data.custom_text || "Based on your answers, we recommend these products:");
    } else if (answer2.action_type === "show_collections") {
      setNewAnswer2Collections(answer2.action_data.collections || []);
      setNewAnswer2CollectionsText(answer2.action_data.custom_text || "Based on your answers, check out these collections:");
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
                        <BlockStack gap="300">
                          <TextField
                            label="Custom result text"
                            value={newAnswer1ProductsText}
                            onChange={setNewAnswer1ProductsText}
                            placeholder="Based on your answers, we recommend these products:"
                            autoComplete="off"
                            helpText="Text shown above the product recommendations"
                          />

                          <Box>
                            <Text as="p" variant="bodyMd" fontWeight="semibold">
                              Products (max 3)
                            </Text>
                            <Box paddingBlockStart="200">
                              <Button onClick={handleSelectAnswer1Products}>
                                {newAnswer1Products.length > 0 ? "Change products" : "Select products"}
                              </Button>
                            </Box>
                          </Box>

                          {newAnswer1Products.length > 0 && (
                            <BlockStack gap="200">
                              {newAnswer1Products.map((product) => (
                                <Box
                                  key={product.id}
                                  padding="300"
                                  background="bg-surface-secondary"
                                  borderRadius="200"
                                >
                                  <InlineStack align="space-between" blockAlign="center" gap="300">
                                    <InlineStack gap="300" blockAlign="center">
                                      {product.images?.[0]?.originalSrc && (
                                        <Thumbnail
                                          source={product.images[0].originalSrc}
                                          alt={product.title}
                                          size="small"
                                        />
                                      )}
                                      <BlockStack gap="100">
                                        <Text as="p" variant="bodyMd" fontWeight="semibold">
                                          {product.title}
                                        </Text>
                                        {product.variants?.[0]?.price && (
                                          <Text as="p" variant="bodySm" tone="subdued">
                                            ${product.variants[0].price}
                                          </Text>
                                        )}
                                      </BlockStack>
                                    </InlineStack>
                                    <Button
                                      icon={DeleteIcon}
                                      variant="plain"
                                      tone="critical"
                                      onClick={() => handleRemoveAnswer1Product(product.id)}
                                    />
                                  </InlineStack>
                                </Box>
                              ))}
                            </BlockStack>
                          )}
                        </BlockStack>
                      )}

                      {newAnswer1ActionType === "show_collections" && (
                        <BlockStack gap="300">
                          <TextField
                            label="Custom result text"
                            value={newAnswer1CollectionsText}
                            onChange={setNewAnswer1CollectionsText}
                            placeholder="Based on your answers, check out these collections:"
                            autoComplete="off"
                            helpText="Text shown above the collection recommendations"
                          />

                          <Box>
                            <Text as="p" variant="bodyMd" fontWeight="semibold">
                              Collections (max 3)
                            </Text>
                            <Box paddingBlockStart="200">
                              <Button onClick={handleSelectAnswer1Collections}>
                                {newAnswer1Collections.length > 0 ? "Change collections" : "Select collections"}
                              </Button>
                            </Box>
                          </Box>

                          {newAnswer1Collections.length > 0 && (
                            <BlockStack gap="200">
                              {newAnswer1Collections.map((collection) => (
                                <Box
                                  key={collection.id}
                                  padding="300"
                                  background="bg-surface-secondary"
                                  borderRadius="200"
                                >
                                  <InlineStack align="space-between" blockAlign="center" gap="300">
                                    <InlineStack gap="300" blockAlign="center">
                                      {collection.image?.originalSrc && (
                                        <Thumbnail
                                          source={collection.image.originalSrc}
                                          alt={collection.title}
                                          size="small"
                                        />
                                      )}
                                      <Text as="p" variant="bodyMd" fontWeight="semibold">
                                        {collection.title}
                                      </Text>
                                    </InlineStack>
                                    <Button
                                      icon={DeleteIcon}
                                      variant="plain"
                                      tone="critical"
                                      onClick={() => handleRemoveAnswer1Collection(collection.id)}
                                    />
                                  </InlineStack>
                                </Box>
                              ))}
                            </BlockStack>
                          )}
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
                        <BlockStack gap="300">
                          <TextField
                            label="Custom result text"
                            value={newAnswer2ProductsText}
                            onChange={setNewAnswer2ProductsText}
                            placeholder="Based on your answers, we recommend these products:"
                            autoComplete="off"
                            helpText="Text shown above the product recommendations"
                          />

                          <Box>
                            <Text as="p" variant="bodyMd" fontWeight="semibold">
                              Products (max 3)
                            </Text>
                            <Box paddingBlockStart="200">
                              <Button onClick={handleSelectAnswer2Products}>
                                {newAnswer2Products.length > 0 ? "Change products" : "Select products"}
                              </Button>
                            </Box>
                          </Box>

                          {newAnswer2Products.length > 0 && (
                            <BlockStack gap="200">
                              {newAnswer2Products.map((product) => (
                                <Box
                                  key={product.id}
                                  padding="300"
                                  background="bg-surface-secondary"
                                  borderRadius="200"
                                >
                                  <InlineStack align="space-between" blockAlign="center" gap="300">
                                    <InlineStack gap="300" blockAlign="center">
                                      {product.images?.[0]?.originalSrc && (
                                        <Thumbnail
                                          source={product.images[0].originalSrc}
                                          alt={product.title}
                                          size="small"
                                        />
                                      )}
                                      <BlockStack gap="100">
                                        <Text as="p" variant="bodyMd" fontWeight="semibold">
                                          {product.title}
                                        </Text>
                                        {product.variants?.[0]?.price && (
                                          <Text as="p" variant="bodySm" tone="subdued">
                                            ${product.variants[0].price}
                                          </Text>
                                        )}
                                      </BlockStack>
                                    </InlineStack>
                                    <Button
                                      icon={DeleteIcon}
                                      variant="plain"
                                      tone="critical"
                                      onClick={() => handleRemoveAnswer2Product(product.id)}
                                    />
                                  </InlineStack>
                                </Box>
                              ))}
                            </BlockStack>
                          )}
                        </BlockStack>
                      )}

                      {newAnswer2ActionType === "show_collections" && (
                        <BlockStack gap="300">
                          <TextField
                            label="Custom result text"
                            value={newAnswer2CollectionsText}
                            onChange={setNewAnswer2CollectionsText}
                            placeholder="Based on your answers, check out these collections:"
                            autoComplete="off"
                            helpText="Text shown above the collection recommendations"
                          />

                          <Box>
                            <Text as="p" variant="bodyMd" fontWeight="semibold">
                              Collections (max 3)
                            </Text>
                            <Box paddingBlockStart="200">
                              <Button onClick={handleSelectAnswer2Collections}>
                                {newAnswer2Collections.length > 0 ? "Change collections" : "Select collections"}
                              </Button>
                            </Box>
                          </Box>

                          {newAnswer2Collections.length > 0 && (
                            <BlockStack gap="200">
                              {newAnswer2Collections.map((collection) => (
                                <Box
                                  key={collection.id}
                                  padding="300"
                                  background="bg-surface-secondary"
                                  borderRadius="200"
                                >
                                  <InlineStack align="space-between" blockAlign="center" gap="300">
                                    <InlineStack gap="300" blockAlign="center">
                                      {collection.image?.originalSrc && (
                                        <Thumbnail
                                          source={collection.image.originalSrc}
                                          alt={collection.title}
                                          size="small"
                                        />
                                      )}
                                      <Text as="p" variant="bodyMd" fontWeight="semibold">
                                        {collection.title}
                                      </Text>
                                    </InlineStack>
                                    <Button
                                      icon={DeleteIcon}
                                      variant="plain"
                                      tone="critical"
                                      onClick={() => handleRemoveAnswer2Collection(collection.id)}
                                    />
                                  </InlineStack>
                                </Box>
                              ))}
                            </BlockStack>
                          )}
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
                          (newAnswer1ActionType === "show_text" && !newAnswer1ActionData) ||
                          (newAnswer1ActionType === "show_html" && !newAnswer1ActionData) ||
                          (newAnswer1ActionType === "show_products" && newAnswer1Products.length === 0) ||
                          (newAnswer1ActionType === "show_collections" && newAnswer1Collections.length === 0) ||
                          (newAnswer2ActionType === "show_text" && !newAnswer2ActionData) ||
                          (newAnswer2ActionType === "show_html" && !newAnswer2ActionData) ||
                          (newAnswer2ActionType === "show_products" && newAnswer2Products.length === 0) ||
                          (newAnswer2ActionType === "show_collections" && newAnswer2Collections.length === 0)
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
