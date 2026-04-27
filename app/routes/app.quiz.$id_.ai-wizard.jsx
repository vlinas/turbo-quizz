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

// ── ProductChips ─────────────────────────────────────────────────────────────
function ProductChips({ products }) {
  if (!products || products.length === 0) return null;
  return (
    <InlineStack gap="100" wrap>
      {products.map((p, i) => (
        <Box
          key={p.id || i}
          padding="100"
          borderWidth="025"
          borderColor="border"
          borderRadius="100"
          background="bg-surface"
        >
          <InlineStack gap="100" blockAlign="center" wrap={false}>
            {p.image ? (
              <img
                src={p.image}
                alt={p.title}
                style={{
                  width: 20,
                  height: 20,
                  objectFit: "cover",
                  borderRadius: 3,
                  flexShrink: 0,
                }}
              />
            ) : (
              <div
                style={{
                  width: 20,
                  height: 20,
                  background: "#e8e8e8",
                  borderRadius: 3,
                  flexShrink: 0,
                }}
              />
            )}
            <Text as="span" variant="bodySm">
              {p.title}
            </Text>
          </InlineStack>
        </Box>
      ))}
    </InlineStack>
  );
}

// ── Loader ───────────────────────────────────────────────────────────────────
export async function loader({ params, request }) {
  const { session } = await authenticate.admin(request);
  const quizId = parseInt(params.id, 10);

  if (isNaN(quizId)) throw redirect("/app");

  const quiz = await prisma.quiz.findFirst({
    where: { quiz_id: quizId, shop: session.shop, deleted_at: null },
  });

  if (!quiz) throw redirect("/app");

  return json({ quizId: quiz.quiz_id, quizTitle: quiz.title });
}

// ── Component ────────────────────────────────────────────────────────────────
export default function AiWizard() {
  const { quizId, quizTitle } = useLoaderData();
  const navigate = useNavigate();
  const applyFetcher = useFetcher();

  // Pool selection state
  const [poolType, setPoolType] = useState("products");
  const [poolItems, setPoolItems] = useState([]);

  // Wizard steps: pool-select | generating | review | summary | applying | error
  const [step, setStep] = useState("pool-select");
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

  // ── Resource picker helpers ───────────────────────────────────────────────
  const handlePickProducts = async () => {
    const currentIds = poolItems.map((p) => p.id);
    try {
      if (
        typeof window !== "undefined" &&
        window.shopify &&
        typeof window.shopify.resourcePicker === "function"
      ) {
        const result = await window.shopify.resourcePicker({
          type: "product",
          multiple: true,
          selectionIds: currentIds,
        });
        if (result?.selection?.length) {
          const capped = result.selection.slice(0, 20);
          setPoolItems(
            capped.map((s) => ({
              id: s.id,
              title: s.title,
              handle: s.handle || "",
              description:
                s.descriptionHtml
                  ?.replace(/<[^>]*>/g, "")
                  .substring(0, 300) || "",
              tags: s.tags || [],
              image:
                s.images?.[0]?.originalSrc || s.images?.[0]?.url || null,
              price: s.variants?.[0]?.price || "0",
            }))
          );
        }
      }
    } catch (e) {
      console.error("Resource picker error:", e);
    }
  };

  const handlePickCollections = async () => {
    const currentIds = poolItems.map((c) => c.id);
    try {
      if (
        typeof window !== "undefined" &&
        window.shopify &&
        typeof window.shopify.resourcePicker === "function"
      ) {
        const result = await window.shopify.resourcePicker({
          type: "collection",
          multiple: true,
          selectionIds: currentIds,
        });
        if (result?.selection?.length) {
          const capped = result.selection.slice(0, 10);
          setPoolItems(
            capped.map((s) => ({
              id: s.id,
              title: s.title,
              handle: s.handle || "",
              description: "",
              image: s.image?.originalSrc || s.image?.url || null,
            }))
          );
        }
      }
    } catch (e) {
      console.error("Resource picker error:", e);
    }
  };

  const handleRemovePoolItem = (id) => {
    setPoolItems((prev) => prev.filter((i) => i.id !== id));
  };

  const handlePoolTypeChange = (type) => {
    setPoolType(type);
    setPoolItems([]);
  };

  // ── Progress animation ────────────────────────────────────────────────────
  useEffect(() => {
    if (step !== "generating") return;
    const steps = [
      { p: 8, msg: `Reading your ${poolItems.length} ${itemLabel}...` },
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
  }, [step]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Apply redirect watcher ────────────────────────────────────────────────
  useEffect(() => {
    if (applyFetcher.data?.success === false) {
      setToastActive(true);
      setStep("summary");
    }
  }, [applyFetcher.data]);

  // ── Generation ────────────────────────────────────────────────────────────
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
        body: JSON.stringify({ pool: poolItems, poolType }),
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

  // ── Review step actions ───────────────────────────────────────────────────
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

  // ── Apply to quiz ─────────────────────────────────────────────────────────
  const applyQuestions = () => {
    if (keptQuestions.length === 0) return;
    const formData = new FormData();
    formData.append("_action", "apply_ai_questions");
    formData.append("questionsJson", JSON.stringify(keptQuestions));
    formData.append("poolType", poolType);
    formData.append("poolJson", JSON.stringify(poolItems));
    applyFetcher.submit(formData, {
      method: "post",
      action: `/app/quiz/${quizId}`,
    });
    setStep("applying");
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // STEP: pool-select
  // ═══════════════════════════════════════════════════════════════════════════
  if (step === "pool-select") {
    const maxItems = poolType === "products" ? 20 : 10;
    return (
      <Frame>
        <Page
          backAction={{ content: "Back to quiz", url: `/app/quiz/${quizId}` }}
          title="AI Quiz Wizard"
          subtitle={quizTitle}
        >
          <BlockStack gap="500">
            <Card>
              <BlockStack gap="400">
                <BlockStack gap="100">
                  <Text as="h2" variant="headingMd">
                    Step 1: Select your {itemLabel}
                  </Text>
                  <Text as="p" variant="bodySm" tone="subdued">
                    Choose the {itemLabel} for this quiz. AI will analyze their
                    images, descriptions, and tags to create personalized quiz
                    questions. Each answer will recommend specific {itemLabel}{" "}
                    based on the customer's choices.
                  </Text>
                </BlockStack>

                {/* Products / Collections toggle */}
                <InlineStack gap="200">
                  <Button
                    variant={poolType === "products" ? "primary" : "secondary"}
                    onClick={() =>
                      poolType !== "products" && handlePoolTypeChange("products")
                    }
                    size="slim"
                  >
                    Products
                  </Button>
                  <Button
                    variant={
                      poolType === "collections" ? "primary" : "secondary"
                    }
                    onClick={() =>
                      poolType !== "collections" &&
                      handlePoolTypeChange("collections")
                    }
                    size="slim"
                  >
                    Collections
                  </Button>
                </InlineStack>

                {/* Picker button */}
                <Button
                  onClick={
                    poolType === "products"
                      ? handlePickProducts
                      : handlePickCollections
                  }
                  disabled={poolItems.length >= maxItems}
                >
                  {poolItems.length === 0
                    ? `Select ${itemLabel}`
                    : `Edit ${itemLabel} (${poolItems.length}/${maxItems} selected)`}
                </Button>

                {/* Selected items list */}
                {poolItems.length > 0 && (
                  <BlockStack gap="200">
                    <Text as="p" variant="bodySm" tone="subdued">
                      {poolItems.length} {itemLabel} selected
                    </Text>
                    {poolItems.map((item) => (
                      <InlineStack
                        key={item.id}
                        align="space-between"
                        blockAlign="center"
                      >
                        <InlineStack gap="200" blockAlign="center">
                          {item.image ? (
                            <img
                              src={item.image}
                              alt={item.title}
                              style={{
                                width: 32,
                                height: 32,
                                objectFit: "cover",
                                borderRadius: 4,
                              }}
                            />
                          ) : (
                            <div
                              style={{
                                width: 32,
                                height: 32,
                                background: "#e8e8e8",
                                borderRadius: 4,
                              }}
                            />
                          )}
                          <Text as="span" variant="bodyMd">
                            {item.title}
                          </Text>
                        </InlineStack>
                        <Button
                          variant="plain"
                          tone="critical"
                          size="slim"
                          onClick={() => handleRemovePoolItem(item.id)}
                        >
                          Remove
                        </Button>
                      </InlineStack>
                    ))}
                  </BlockStack>
                )}

                <Divider />

                <InlineStack align="space-between" blockAlign="center">
                  {poolItems.length < 2 ? (
                    <Text as="p" variant="bodySm" tone="subdued">
                      Select at least 2 {itemLabel} to continue.
                    </Text>
                  ) : (
                    <Text as="p" variant="bodySm" tone="subdued">
                      {poolItems.length} {itemLabel} ready for analysis
                    </Text>
                  )}
                  <Button
                    variant="primary"
                    onClick={runGeneration}
                    disabled={poolItems.length < 2}
                  >
                    Analyze &amp; generate quiz →
                  </Button>
                </InlineStack>
              </BlockStack>
            </Card>
          </BlockStack>
        </Page>
      </Frame>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // STEP: generating
  // ═══════════════════════════════════════════════════════════════════════════
  if (step === "generating") {
    return (
      <Frame>
        <Page
          backAction={{ content: "Cancel", url: `/app/quiz/${quizId}` }}
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
                <Text
                  as="p"
                  variant="bodySm"
                  fontWeight="semibold"
                  tone="subdued"
                >
                  {poolItems.length} {itemLabel} being analyzed
                </Text>
                <InlineStack gap="300" wrap>
                  {poolItems.map((item) => (
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

  // ═══════════════════════════════════════════════════════════════════════════
  // STEP: review
  // ═══════════════════════════════════════════════════════════════════════════
  if (step === "review") {
    const question = allQuestions[currentIdx];
    if (!question) return null;
    const displayQ = editingQuestion ?? question;
    const isLast = currentIdx === allQuestions.length - 1;
    const progressPct = Math.round(
      (currentIdx / allQuestions.length) * 100
    );

    return (
      <Frame>
        <Page
          backAction={{ content: "Cancel wizard", url: `/app/quiz/${quizId}` }}
          title="AI Quiz Wizard"
          subtitle={`${quizTitle} · Question ${currentIdx + 1} of ${
            allQuestions.length
          }`}
        >
          <BlockStack gap="400">
            <ProgressBar progress={progressPct} size="small" />

            {catalogAnalysis && currentIdx === 0 && (
              <Banner title="AI catalog analysis" tone="info">
                <Text as="p">{catalogAnalysis}</Text>
              </Banner>
            )}

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

                {/* Question text */}
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
                      <Text as="span" variant="bodyMd">
                        💡
                      </Text>
                      <BlockStack gap="100">
                        <Text
                          as="p"
                          variant="bodySm"
                          fontWeight="semibold"
                        >
                          Why AI chose this question
                        </Text>
                        <Text as="p" variant="bodySm" tone="subdued">
                          {question.reasoning}
                        </Text>
                      </BlockStack>
                    </InlineStack>
                  </Box>
                )}

                {/* Answers — each with editable text + locked product chips */}
                <BlockStack gap="200">
                  <Text as="p" variant="bodyMd" fontWeight="semibold">
                    Answer options
                  </Text>
                  <BlockStack gap="200">
                    {displayQ.answers.map((a, i) => (
                      <Box
                        key={i}
                        padding="300"
                        background="bg-surface-secondary"
                        borderRadius="200"
                      >
                        <BlockStack gap="200">
                          {editingQuestion ? (
                            <TextField
                              label={`Answer ${i + 1}`}
                              value={
                                editingQuestion.answers[i]?.answer_text || ""
                              }
                              onChange={(val) =>
                                setEditingQuestion((prev) => ({
                                  ...prev,
                                  answers: prev.answers.map((ans, j) =>
                                    j === i
                                      ? { ...ans, answer_text: val }
                                      : ans
                                  ),
                                }))
                              }
                              autoComplete="off"
                            />
                          ) : (
                            <Text
                              as="p"
                              variant="bodyMd"
                              fontWeight="semibold"
                            >
                              {a.answer_text}
                            </Text>
                          )}
                          {/* Product chips — always locked/read-only */}
                          {a.action_data?.products?.length > 0 && (
                            <BlockStack gap="100">
                              <Text
                                as="span"
                                variant="bodySm"
                                tone="subdued"
                              >
                                Recommends:
                              </Text>
                              <ProductChips
                                products={a.action_data.products}
                              />
                            </BlockStack>
                          )}
                        </BlockStack>
                      </Box>
                    ))}
                  </BlockStack>
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

            {/* Mini-map */}
            <Card>
              <BlockStack gap="200">
                <Text
                  as="p"
                  variant="bodySm"
                  fontWeight="semibold"
                  tone="subdued"
                >
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

  // ═══════════════════════════════════════════════════════════════════════════
  // STEP: summary | applying
  // ═══════════════════════════════════════════════════════════════════════════
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
                      You skipped all questions. Go back to review or
                      regenerate.
                    </Banner>
                  </>
                ) : (
                  <>
                    <Text as="h2" variant="headingLg">
                      {keptQuestions.length} question
                      {keptQuestions.length !== 1 ? "s" : ""} ready to apply
                    </Text>
                    <BlockStack gap="300">
                      {keptQuestions.map((q, qi) => (
                        <Box
                          key={qi}
                          padding="400"
                          background="bg-surface-secondary"
                          borderRadius="200"
                        >
                          <BlockStack gap="300">
                            <Text as="h4" variant="headingSm">
                              {qi + 1}. {q.question_text}
                            </Text>
                            <BlockStack gap="200">
                              {q.answers.map((a, ai) => (
                                <BlockStack key={ai} gap="100">
                                  <Text
                                    as="p"
                                    variant="bodySm"
                                    fontWeight="semibold"
                                  >
                                    {a.answer_text}
                                  </Text>
                                  {a.action_data?.products?.length > 0 && (
                                    <ProductChips
                                      products={a.action_data.products}
                                    />
                                  )}
                                </BlockStack>
                              ))}
                            </BlockStack>
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
                      onClick={() => setStep("pool-select")}
                      disabled={isApplying}
                    >
                      Change pool
                    </Button>
                    {allQuestions.length > 0 && (
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

  // ═══════════════════════════════════════════════════════════════════════════
  // STEP: error
  // ═══════════════════════════════════════════════════════════════════════════
  return (
    <Frame>
      <Page
        backAction={{ content: "Back to quiz", url: `/app/quiz/${quizId}` }}
        title="AI Quiz Wizard"
      >
        <Banner
          tone="critical"
          title="Analysis failed"
          action={{
            content: "Try again",
            onAction: () => setStep("pool-select"),
          }}
        >
          {error || "Something went wrong. Please try again."}
        </Banner>
      </Page>
    </Frame>
  );
}
