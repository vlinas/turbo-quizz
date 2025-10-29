import { json, redirect } from "@remix-run/node";
import { useNavigate, useSubmit, useActionData } from "@remix-run/react";
import { useState } from "react";
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
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";

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

  // Call API to create quiz
  const response = await fetch(`${process.env.SHOPIFY_APP_URL}/api/quizzes`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      title,
      description,
      status: "draft",
    }),
  });

  const result = await response.json();

  if (result.success) {
    // Redirect to quiz builder
    return redirect(`/app/quiz/${result.quiz.quiz_id}`);
  }

  return json({
    success: false,
    error: result.error || "Failed to create quiz",
  });
};

export default function NewQuiz() {
  const navigate = useNavigate();
  const submit = useSubmit();
  const actionData = useActionData();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = () => {
    setIsSubmitting(true);
    const formData = new FormData();
    formData.append("title", title);
    formData.append("description", description);
    submit(formData, { method: "post" });
  };

  return (
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
          {actionData?.error && (
            <Banner tone="critical" onDismiss={() => {}}>
              <p>{actionData.error}</p>
            </Banner>
          )}

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

              <InlineStack align="end">
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
        </Layout.Section>

        <Layout.Section variant="oneThird">
          <Card>
            <BlockStack gap="200">
              <Text as="h3" variant="headingSm">
                Next Steps
              </Text>
              <Text as="p" variant="bodySm" tone="subdued">
                After creating your quiz, you'll be able to:
              </Text>
              <ul style={{ paddingLeft: "20px", margin: "8px 0" }}>
                <li>Add questions and answers</li>
                <li>Configure product recommendations</li>
                <li>Customize the quiz appearance</li>
                <li>Publish to your storefront</li>
              </ul>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
