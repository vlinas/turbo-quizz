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
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

export const action = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  const title = formData.get("title");
  const description = formData.get("description");

  if (!title) {
    return json({
      success: false,
      error: "Title is required",
    }, { status: 400 });
  }

  try {
    // Get the next quiz_id for this shop
    const lastQuiz = await prisma.quiz.findFirst({
      where: { shop: session.shop },
      orderBy: { quiz_id: 'desc' },
      select: { quiz_id: true },
    });

    const nextQuizId = lastQuiz ? lastQuiz.quiz_id + 1 : 1;

    // Create quiz directly in database with integer ID
    const quiz = await prisma.quiz.create({
      data: {
        shop: session.shop,
        quiz_id: nextQuizId,
        title,
        description: description || "",
        display_on_pages: [],
      },
    });

    // Redirect to quiz builder
    return redirect(`/app/quiz/${quiz.quiz_id}`);
  } catch (error) {
    console.error("Error creating quiz:", error);
    return json({
      success: false,
      error: "Failed to create quiz. Please try again.",
    }, { status: 500 });
  }
};

export default function NewQuiz() {
  const navigate = useNavigate();
  const submit = useSubmit();
  const actionData = useActionData();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
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

  const handleSubmit = () => {
    setIsSubmitting(true);
    const formData = new FormData();
    formData.append("title", title);
    formData.append("description", description);
    submit(formData, { method: "post" });
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
      <Page
      title="Create Quiz"
      backAction={{ content: "Quizzes", onAction: () => navigate("/app") }}
      primaryAction={{
        content: "Create quiz",
        onAction: handleSubmit,
        disabled: !title || isSubmitting,
        loading: isSubmitting,
      }}
    >
      <Layout>
        <Layout.Section>
          <BlockStack gap="500">
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
                  helpText="A catchy title that describes your quiz"
                  requiredIndicator
                />

                <TextField
                  label="Description"
                  value={description}
                  onChange={setDescription}
                  placeholder="e.g., Answer a few questions to discover products that match your style"
                  multiline={3}
                  autoComplete="off"
                  helpText="Optional description shown to customers"
                />

                <InlineStack align="end" gap="300">
                  <Button onClick={() => navigate("/app")}>Cancel</Button>
                  <Button
                    variant="primary"
                    onClick={handleSubmit}
                    disabled={!title || isSubmitting}
                    loading={isSubmitting}
                  >
                    Create quiz
                  </Button>
                </InlineStack>
              </BlockStack>
            </Card>
          </BlockStack>
        </Layout.Section>

        <Layout.Section variant="oneThird">
          <BlockStack gap="500">
            <Card>
              <BlockStack gap="300">
                <Text as="h3" variant="headingSm">
                  Next Steps
                </Text>
                <Text as="p" variant="bodySm" tone="subdued">
                  After creating your quiz, you'll be able to:
                </Text>
                <BlockStack gap="200">
                  <Text as="p" variant="bodySm">• Add questions and answers</Text>
                  <Text as="p" variant="bodySm">• Configure product recommendations</Text>
                  <Text as="p" variant="bodySm">• Customize the quiz appearance</Text>
                  <Text as="p" variant="bodySm">• Publish to your storefront</Text>
                </BlockStack>
              </BlockStack>
            </Card>
          </BlockStack>
        </Layout.Section>
      </Layout>
      {toastMarkup}
    </Page>
    </Frame>
  );
}
