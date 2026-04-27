import { json, redirect } from "@remix-run/node";
import { useNavigate, useSubmit, useActionData } from "@remix-run/react";
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
  Box,
  Divider,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

export const action = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  const title = formData.get("title");
  const description = formData.get("description");
  const flow = formData.get("_flow") || "manual"; // "ai" | "manual"

  if (!title) {
    return json({ success: false, error: "Title is required" }, { status: 400 });
  }

  try {
    let quizId;
    let isUnique = false;

    while (!isUnique) {
      quizId = Math.floor(1000 + Math.random() * 9000);
      const existing = await prisma.quiz.findFirst({ where: { quiz_id: quizId } });
      isUnique = !existing;
    }

    const quiz = await prisma.quiz.create({
      data: {
        shop: session.shop,
        quiz_id: quizId,
        title,
        description: description || "",
        display_on_pages: [],
      },
    });

    if (flow === "ai") {
      return redirect(`/app/quiz/${quiz.quiz_id}/ai-wizard`);
    }
    return redirect(`/app/quiz/${quiz.quiz_id}`);
  } catch (error) {
    console.error("Error creating quiz:", error);
    return json({ success: false, error: "Failed to create quiz. Please try again." }, { status: 500 });
  }
};

export default function NewQuiz() {
  const navigate = useNavigate();
  const submit = useSubmit();
  const actionData = useActionData();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [submittingFlow, setSubmittingFlow] = useState(null); // "ai" | "manual" | null

  const [toastActive, setToastActive] = useState(false);
  const [toastContent, setToastContent] = useState("");

  useEffect(() => {
    if (actionData?.error) {
      setToastContent(actionData.error);
      setToastActive(true);
      setSubmittingFlow(null);
    }
  }, [actionData]);

  const handleSubmit = (flow) => {
    if (!title.trim()) return;
    setSubmittingFlow(flow);
    const formData = new FormData();
    formData.append("title", title);
    formData.append("description", description);
    formData.append("_flow", flow);
    submit(formData, { method: "post" });
  };

  const isSubmitting = submittingFlow !== null;

  return (
    <Frame>
      <Page
        title="Create Quiz"
        backAction={{ content: "Quizzes", onAction: () => navigate("/app") }}
      >
        <Layout>
          <Layout.Section>
            <BlockStack gap="500">
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
                    helpText="For internal use only - not shown to customers"
                    requiredIndicator
                  />

                  <TextField
                    label="Description"
                    value={description}
                    onChange={setDescription}
                    placeholder="e.g., Brief notes about this quiz"
                    multiline={3}
                    autoComplete="off"
                    helpText="For internal use only - not shown to customers"
                  />
                </BlockStack>
              </Card>

              {/* Two creation paths */}
              <Card>
                <BlockStack gap="400">
                  <Text as="h2" variant="headingMd">
                    How do you want to build this quiz?
                  </Text>

                  <InlineStack gap="400" wrap={false}>
                    {/* AI path */}
                    <Box
                      borderWidth="025"
                      borderColor="border-brand"
                      borderRadius="300"
                      padding="400"
                      background="bg-surface-success"
                      width="50%"
                    >
                      <BlockStack gap="300">
                        <BlockStack gap="100">
                          <Text as="h3" variant="headingSm">
                            ✨ Generate with AI
                          </Text>
                          <Text as="p" variant="bodySm" tone="subdued">
                            Pick your products or collections. AI analyzes images,
                            descriptions and tags — then builds quiz questions with
                            hard-assigned recommendations for each answer.
                          </Text>
                        </BlockStack>
                        <Button
                          variant="primary"
                          tone="success"
                          onClick={() => handleSubmit("ai")}
                          disabled={!title.trim() || isSubmitting}
                          loading={submittingFlow === "ai"}
                          fullWidth
                        >
                          Create quiz with AI
                        </Button>
                      </BlockStack>
                    </Box>

                    {/* Manual path */}
                    <Box
                      borderWidth="025"
                      borderColor="border"
                      borderRadius="300"
                      padding="400"
                      width="50%"
                    >
                      <BlockStack gap="300">
                        <BlockStack gap="100">
                          <Text as="h3" variant="headingSm">
                            Build manually
                          </Text>
                          <Text as="p" variant="bodySm" tone="subdued">
                            Write your own questions and answers. Assign text,
                            HTML, or product results to each answer yourself.
                            Full control over every detail.
                          </Text>
                        </BlockStack>
                        <Button
                          variant="primary"
                          onClick={() => handleSubmit("manual")}
                          disabled={!title.trim() || isSubmitting}
                          loading={submittingFlow === "manual"}
                          fullWidth
                        >
                          Create quiz manually
                        </Button>
                      </BlockStack>
                    </Box>
                  </InlineStack>

                  {!title.trim() && (
                    <Text as="p" variant="bodySm" tone="subdued">
                      Enter a quiz title above to continue.
                    </Text>
                  )}

                  <Divider />

                  <InlineStack align="start">
                    <Button variant="plain" onClick={() => navigate("/app")}>
                      Cancel
                    </Button>
                  </InlineStack>
                </BlockStack>
              </Card>
            </BlockStack>
          </Layout.Section>

          <Layout.Section variant="oneThird">
            <Card>
              <BlockStack gap="300">
                <Text as="h3" variant="headingSm">
                  Which path is right for me?
                </Text>
                <Divider />
                <BlockStack gap="200">
                  <Text as="p" variant="bodySm" fontWeight="semibold">
                    ✨ AI Wizard — best for:
                  </Text>
                  <Text as="p" variant="bodySm" tone="subdued">
                    • You have 2–20 products to recommend
                  </Text>
                  <Text as="p" variant="bodySm" tone="subdued">
                    • You want automatic question generation
                  </Text>
                  <Text as="p" variant="bodySm" tone="subdued">
                    • Each answer should recommend specific products
                  </Text>
                </BlockStack>
                <Divider />
                <BlockStack gap="200">
                  <Text as="p" variant="bodySm" fontWeight="semibold">
                    Manual — best for:
                  </Text>
                  <Text as="p" variant="bodySm" tone="subdued">
                    • You want full control over every question
                  </Text>
                  <Text as="p" variant="bodySm" tone="subdued">
                    • Answers show custom text or HTML
                  </Text>
                  <Text as="p" variant="bodySm" tone="subdued">
                    • You already know exactly what to ask
                  </Text>
                </BlockStack>
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>

        {toastActive && (
          <Toast
            content={toastContent}
            onDismiss={() => setToastActive(false)}
            error
            duration={4500}
          />
        )}
      </Page>
    </Frame>
  );
}
