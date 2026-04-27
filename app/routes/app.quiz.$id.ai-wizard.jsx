import { json, redirect } from "@remix-run/node";
import { useLoaderData, useNavigate, useFetcher } from "@remix-run/react";
import { useState, useEffect } from "react";
import {
  Page,
  Card,
  BlockStack,
  InlineStack,
  Text,
  Button,
  ProgressBar,
  Badge,
  Divider,
  Box,
  Spinner,
  Banner,
  TextField,
  Thumbnail,
  Frame,
  Toast,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

export async function loader({ params, request }) {
  const { session } = await authenticate.admin(request);
  const quizId = parseInt(params.id, 10);

  if (isNaN(quizId)) {
    throw redirect("/app");
  }

  const quiz = await prisma.quiz.findFirst({
    where: { quiz_id: quizId, shop: session.shop, deleted_at: null },
  });

  if (!quiz) {
    throw redirect("/app");
  }

  const hasPool =
    quiz.pool_type &&
    ((quiz.pool_type === "products" &&
      Array.isArray(quiz.product_pool) &&
      quiz.product_pool.length > 0) ||
      (quiz.pool_type === "collections" &&
        Array.isArray(quiz.collection_pool) &&
        quiz.collection_pool.length > 0));

  if (!hasPool) {
    throw redirect(`/app/quiz/${quizId}`);
  }

  const pool =
    quiz.pool_type === "products" ? quiz.product_pool : quiz.collection_pool;

  return json({
    quizId: quiz.quiz_id,
    quizTitle: quiz.title,
    poolType: quiz.pool_type,
    pool,
  });
}

// Steps: generating | review | summary | applying | error
export default function AiWizard() {
  const { quizId, quizTitle, poolType, pool } = useLoaderData();
  const navigate = useNavigate();
  const applyFetcher = useFetcher();

  const [step, setStep] = useState("generating");
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [loadingMessage, setLoadingMessage] = useState("");
  const [catalogAnalysis, setCatalogAnalysis] = useState("");
  const [allQuestions, setAllQuestions] = useState([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [keptQuestions, setKeptQuestions] = useState([]);
  const [editingQuestion, setEditingQuestion] = useState(null);
  const [error, setError] = useState(null);
  const [toastActive, setToastActive] = useState(false);

  const itemLabel = poolType === "collections" ? "collections" : "products";

  // Start generation on mount
  useEffect(() => {
    runGeneration();
  }, []);

  // Progress animation while generating
  useEffect(() => {
    if (step !== "generating") return;
    const steps = [
      { p: 8, msg: `Reading your ${pool.length} ${itemLabel}...` },
      { p: 20, msg: "Reviewing product images..." },
      { p: 35, msg: "Analyzing descriptions and tags..." },
      { p: 50, msg: "Identifying key differences..." },
      { p: 65, msg: "Mapping customer preferences..." },
      { p: 78, msg: "Drafting quiz questions..." },
      { p: 88, msg: "Crafting answer options..." },
      { p: 94, msg: "Almost ready..." },
    ];
    let i = 0;
    setLoadingProgress(steps[0].p);
    setLoadingMessage(steps[0].msg);
    const interval = setInterval(() => {
      i++;
      if (i < steps.length) {
        setLoadingProgress(steps[i].p);
        setLoadingMessage(steps[i].msg);
      } else {
        clearInterval(interval);
      }
    }, 2800);
    return () => clearInterval(interval);
  }, [step, pool.length, itemLabel]);

  // Redirect after successful apply
  useEffect(() => {
    if (applyFetcher.data?.success === false) {
      setToastActive(true);
      setStep("summary");
    }
    // On success the action redirects, no need to handle here
  }, [applyFetcher.data]);

  const runGeneration = async () => {
    setStep("generating");
    setError(null);
    setAllQuestions([]);
    setKeptQuestions([]);
    setCurrentIdx(0);
    setCatalogAnalysis("");

    try {
      const response = await fetch("/api/ai/quiz-wizard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pool, poolType }),
      });

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop();

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const raw = line.slice(6).trim();
          if (raw === "[DONE]") continue;
          try {
            const msg = JSON.parse(raw);
            if (msg.type === "analysis") {
              setCatalogAnalysis(msg.text);
            } else if (msg.type === "result") {
              setLoadingProgress(100);
              setLoadingMessage("Done!");
              setAllQuestions(msg.quiz.questions || []);
              setTimeout(() => {
                setStep("review");
                setCurrentIdx(0);
              }, 500);
            } else if (msg.type === "error") {
              setError(msg.error);
              setStep("error");
            }
          } catch {}
        }
      }
    } catch (err) {
      setError("Connection failed. Please try again.");
      setStep("error");
    }
  };

  const keepCurrent = () => {
    const q = editingQuestion ?? allQuestions[currentIdx];
    setKeptQuestions((prev) => [...prev, q]);
    setEditingQuestion(null);
    advance();
  };

  const skipCurrent = () => {
    setEditingQuestion(null);
    advance();
  };

  const advance = () => {
    if (currentIdx < allQuestions.length - 1) {
      setCurrentIdx((i) => i + 1);
    } else {
      setStep("summary");
    }
  };

  const applyQuestions = () => {
    if (keptQuestions.length === 0) return;
    const formData = new FormData();
    formData.append("_action", "apply_ai_questions");
    formData.append("questionsJson", JSON.stringify(keptQuestions));
    applyFetcher.submit(formData, {
      method: "post",
      action: `/app/quiz/${quizId}`,
    });
    setStep("applying");
  };

  // ── STEP: generating ────────────────────────────────────────────────────────
  if (step === "generating") {
    return (
      <Frame>
        <Page
          backAction={{ content: "Back to quiz", url: `/app/quiz/${quizId}` }}
          title="AI Quiz Wizard"
          subtitle={quizTitle}
        >
          <BlockStack gap="500">
            <Card>
              <BlockStack gap="500">
                <BlockStack gap="200">
                  <InlineStack gap="300" blockAlign="center">
                    <Spinner size="small" />
                    <Text as="h2" variant="headingLg">
                      Analyzing your {itemLabel}
                    </Text>
                  </InlineStack>
                  <Text as="p" tone="subdued">
                    {loadingMessage}
                  </Text>
                </BlockStack>

                <ProgressBar
                  progress={loadingProgress}
                  size="medium"
                  tone="highlight"
                  animated
                />

                {catalogAnalysis && (
                  <Box
                    padding="300"
                    background="bg-surface-secondary"
                    borderRadius="200"
                  >
                    <BlockStack gap="100">
                      <Text as="p" variant="bodySm" fontWeight="semibold">
                        What AI found so far
                      </Text>
                      <Text as="p" variant="bodySm" tone="subdued">
                        {catalogAnalysis}
                      </Text>
                    </BlockStack>
                  </Box>
                )}
              </BlockStack>
            </Card>

            {/* Pool thumbnails */}
            <Card>
              <BlockStack gap="300">
                <Text as="p" variant="bodySm" fontWeight="semibold" tone="subdued">
                  {pool.length} {itemLabel} being analyzed
                </Text>
                <InlineStack gap="300" wrap>
                  {pool.map((item) => (
                    <Box
                      key={item.id}
                      borderWidth="025"
                      borderColor="border"
                      borderRadius="200"
                      padding="200"
                    >
                      <InlineStack gap="200" blockAlign="center">
                        {item.image ? (
                          <Thumbnail
                            source={item.image}
                            alt={item.title}
                            size="small"
                          />
                        ) : (
                          <Box
                            width="40px"
                            minHeight="40px"
                            background="bg-surface-secondary"
                            borderRadius="100"
                          />
                        )}
                        <Text as="span" variant="bodySm">
                          {item.title}
                        </Text>
                      </InlineStack>
                    </Box>
                  ))}
                </InlineStack>
              </BlockStack>
            </Card>
          </BlockStack>
        </Page>
      </Frame>
    );
  }

  // ── STEP: review ────────────────────────────────────────────────────────────
  if (step === "review") {
    const question = allQuestions[currentIdx];
    if (!question) return null;
    const displayQ = editingQuestion ?? question;
    const isLast = currentIdx === allQuestions.length - 1;
    const progressPct = Math.round(((currentIdx) / allQuestions.length) * 100);

    return (
      <Frame>
        <Page
          backAction={{ content: "Cancel wizard", url: `/app/quiz/${quizId}` }}
          title="AI Quiz Wizard"
          subtitle={`${quizTitle} · Question ${currentIdx + 1} of ${allQuestions.length}`}
        >
          <BlockStack gap="400">
            {/* Progress bar */}
            <ProgressBar progress={progressPct} size="small" />

            {/* Analysis banner — show only on first question */}
            {catalogAnalysis && currentIdx === 0 && (
              <Banner title="AI catalog analysis" tone="info">
                <Text as="p">{catalogAnalysis}</Text>
              </Banner>
            )}

            {/* Main question card */}
            <Card>
              <BlockStack gap="500">
                {/* Header */}
                <InlineStack align="space-between" blockAlign="start">
                  <Badge tone="info">
                    Question {currentIdx + 1} of {allQuestions.length}
                  </Badge>
                  <Text as="span" variant="bodySm" tone="subdued">
                    {keptQuestions.length} kept
                  </Text>
                </InlineStack>

                {/* Question text — editable or display */}
                {editingQuestion ? (
                  <TextField
                    label="Question text"
                    value={editingQuestion.question_text}
                    onChange={(val) =>
                      setEditingQuestion((prev) => ({
                        ...prev,
                        question_text: val,
                      }))
                    }
                    autoComplete="off"
                    autoFocus
                  />
                ) : (
                  <Text as="h2" variant="headingXl">
                    {displayQ.question_text}
                  </Text>
                )}

                {/* AI reasoning */}
                {question.reasoning && (
                  <Box
                    padding="400"
                    background="bg-surface-secondary"
                    borderRadius="200"
                  >
                    <InlineStack gap="200" blockAlign="start" wrap={false}>
                      <Text as="span" variant="bodyMd">💡</Text>
                      <BlockStack gap="100">
                        <Text as="p" variant="bodySm" fontWeight="semibold">
                          Why AI chose this question
                        </Text>
                        <Text as="p" variant="bodySm" tone="subdued">
                          {question.reasoning}
                        </Text>
                      </BlockStack>
                    </InlineStack>
                  </Box>
                )}

                {/* Answers */}
                <BlockStack gap="200">
                  <Text as="p" variant="bodyMd" fontWeight="semibold">
                    Answer options
                  </Text>
                  {editingQuestion ? (
                    <TextField
                      label="Answers (one per line)"
                      labelHidden
                      value={editingQuestion.answers
                        .map((a) => a.answer_text)
                        .join("\n")}
                      onChange={(val) => {
                        const texts = val
                          .split("\n")
                          .map((t) => t.trimStart())
                          .filter((t) => t.length > 0);
                        setEditingQuestion((prev) => ({
                          ...prev,
                          answers: texts.map((text, i) => ({
                            ...(prev.answers[i] || {
                              action_type: "show_text",
                              action_data: "",
                            }),
                            answer_text: text,
                          })),
                        }));
                      }}
                      multiline={5}
                      autoComplete="off"
                      helpText="One answer per line. Min 2, max 4."
                    />
                  ) : (
                    <InlineStack gap="200" wrap>
                      {displayQ.answers.map((a, i) => (
                        <Badge key={i} size="large">
                          {a.answer_text}
                        </Badge>
                      ))}
                    </InlineStack>
                  )}
                </BlockStack>

                <Divider />

                {/* Actions */}
                <InlineStack align="space-between" blockAlign="center">
                  <Button
                    variant="plain"
                    tone="critical"
                    onClick={skipCurrent}
                  >
                    Skip
                  </Button>
                  <InlineStack gap="200">
                    {editingQuestion ? (
                      <>
                        <Button onClick={() => setEditingQuestion(null)}>
                          Cancel edit
                        </Button>
                        <Button
                          variant="primary"
                          onClick={keepCurrent}
                          disabled={
                            !editingQuestion.question_text.trim() ||
                            editingQuestion.answers.filter((a) =>
                              a.answer_text.trim()
                            ).length < 2
                          }
                        >
                          {isLast ? "Keep & finish" : "Keep →"}
                        </Button>
                      </>
                    ) : (
                      <>
                        <Button
                          onClick={() =>
                            setEditingQuestion({ ...question })
                          }
                        >
                          Edit
                        </Button>
                        <Button variant="primary" onClick={keepCurrent}>
                          {isLast ? "Keep & finish" : "Keep →"}
                        </Button>
                      </>
                    )}
                  </InlineStack>
                </InlineStack>
              </BlockStack>
            </Card>

            {/* Mini-map of all questions */}
            <Card>
              <BlockStack gap="200">
                <Text as="p" variant="bodySm" fontWeight="semibold" tone="subdued">
                  Overview
                </Text>
                {allQuestions.map((q, i) => {
                  const isKept = keptQuestions.some(
                    (k) => k.question_text === q.question_text
                  );
                  const isPast = i < currentIdx;
                  const isCurrent = i === currentIdx;
                  return (
                    <InlineStack
                      key={i}
                      align="space-between"
                      blockAlign="center"
                    >
                      <Text
                        as="span"
                        variant="bodySm"
                        tone={isCurrent ? undefined : "subdued"}
                      >
                        {i + 1}. {q.question_text}
                      </Text>
                      {isPast && (
                        <Badge tone={isKept ? "success" : undefined}>
                          {isKept ? "Kept" : "Skipped"}
                        </Badge>
                      )}
                      {isCurrent && (
                        <Badge tone="attention">Reviewing</Badge>
                      )}
                    </InlineStack>
                  );
                })}
              </BlockStack>
            </Card>
          </BlockStack>
        </Page>
      </Frame>
    );
  }

  // ── STEP: summary / applying ─────────────────────────────────────────────
  if (step === "summary" || step === "applying") {
    const isApplying = step === "applying";
    return (
      <Frame>
        {toastActive && (
          <Toast
            content="Failed to apply questions. Please try again."
            error
            onDismiss={() => setToastActive(false)}
          />
        )}
        <Page
          backAction={
            !isApplying
              ? { content: "Back to quiz", url: `/app/quiz/${quizId}` }
              : undefined
          }
          title="AI Quiz Wizard"
          subtitle="Summary"
        >
          <BlockStack gap="400">
            <Card>
              <BlockStack gap="500">
                {keptQuestions.length === 0 ? (
                  <>
                    <Text as="h2" variant="headingLg">
                      No questions kept
                    </Text>
                    <Banner tone="warning">
                      You skipped all questions. Go back to review or regenerate.
                    </Banner>
                  </>
                ) : (
                  <>
                    <Text as="h2" variant="headingLg">
                      {keptQuestions.length} question
                      {keptQuestions.length !== 1 ? "s" : ""} ready to apply
                    </Text>
                    <BlockStack gap="300">
                      {keptQuestions.map((q, i) => (
                        <Box
                          key={i}
                          padding="400"
                          background="bg-surface-secondary"
                          borderRadius="200"
                        >
                          <BlockStack gap="200">
                            <Text as="h4" variant="headingSm">
                              {i + 1}. {q.question_text}
                            </Text>
                            <InlineStack gap="100" wrap>
                              {q.answers.map((a, ai) => (
                                <Badge key={ai}>{a.answer_text}</Badge>
                              ))}
                            </InlineStack>
                          </BlockStack>
                        </Box>
                      ))}
                    </BlockStack>
                  </>
                )}

                <Divider />

                <InlineStack align="space-between" blockAlign="center">
                  <InlineStack gap="200">
                    <Button
                      onClick={runGeneration}
                      disabled={isApplying}
                    >
                      Regenerate
                    </Button>
                    {keptQuestions.length > 0 && (
                      <Button
                        onClick={() => {
                          setStep("review");
                          setCurrentIdx(0);
                          setKeptQuestions([]);
                        }}
                        disabled={isApplying}
                      >
                        Review again
                      </Button>
                    )}
                  </InlineStack>
                  <Button
                    variant="primary"
                    onClick={applyQuestions}
                    disabled={keptQuestions.length === 0 || isApplying}
                    loading={isApplying}
                  >
                    Apply to quiz
                  </Button>
                </InlineStack>
              </BlockStack>
            </Card>
          </BlockStack>
        </Page>
      </Frame>
    );
  }

  // ── STEP: error ─────────────────────────────────────────────────────────────
  return (
    <Frame>
      <Page
        backAction={{ content: "Back to quiz", url: `/app/quiz/${quizId}` }}
        title="AI Quiz Wizard"
      >
        <Banner
          tone="critical"
          title="Analysis failed"
          action={{ content: "Try again", onAction: runGeneration }}
        >
          {error || "Something went wrong. Please try again."}
        </Banner>
      </Page>
    </Frame>
  );
}
