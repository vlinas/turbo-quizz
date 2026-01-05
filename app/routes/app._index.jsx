import { useState, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { json } from "@remix-run/node";
import { useLoaderData, useSubmit } from "@remix-run/react";
import {
  Page,
  Layout,
  Text,
  Card,
  Button,
  BlockStack,
  InlineStack,
  InlineGrid,
  EmptyState,
  Badge,
  IndexTable,
  useIndexResourceState,
  Icon,
  TextField,
  ChoiceList,
  Filters,
  useSetIndexFiltersMode,
  SkeletonBodyText,
  SkeletonDisplayText,
  Box,
  Divider,
  Modal,
} from "@shopify/polaris";
import {
  PlayIcon,
  CheckCircleIcon,
  ChartVerticalIcon,
  CashDollarIcon,
  EditIcon,
} from "@shopify/polaris-icons";

import { authenticate } from "../shopify.server";
import prisma from "../db.server";

export const loader = async ({ request }) => {
  const { session, admin } = await authenticate.admin(request);

  // Get shop currency from Shopify API
  let shopCurrency = "USD";
  try {
    const response = await admin.graphql(`
      query {
        shop {
          currencyCode
        }
      }
    `);
    const data = await response.json();
    shopCurrency = data.data?.shop?.currencyCode || "USD";
  } catch (e) {
    console.error("Failed to fetch shop currency:", e);
  }

  // Fetch quizzes with stats
  const quizzes = await prisma.quiz.findMany({
    where: {
      shop: session.shop,
      deleted_at: null,
    },
    include: {
      questions: {
        include: {
          answers: true,
        },
        orderBy: {
          order: 'asc',
        },
      },
      _count: {
        select: {
          quiz_sessions: true,
        },
      },
    },
    orderBy: {
      created_at: 'desc',
    },
  });

  // Calculate stats for each quiz
  const quizzesWithStats = await Promise.all(
    quizzes.map(async (quiz) => {
      const sessions = await prisma.quizSession.findMany({
        where: { quiz_id: quiz.quiz_id },
        select: { is_completed: true },
      });

      // Get attributed revenue for this quiz
      const orderAttributions = await prisma.quizOrderAttribution.findMany({
        where: {
          quiz_id: quiz.quiz_id,
          shop: session.shop,
        },
        select: {
          total_price: true,
        },
      });

      const attributedRevenue = orderAttributions.reduce(
        (sum, order) => sum + parseFloat(order.total_price), 0
      );

      const totalSessions = sessions.length;
      const completedSessions = sessions.filter((s) => s.is_completed).length;
      const completionRate = totalSessions > 0
        ? Math.round((completedSessions / totalSessions) * 100)
        : 0;

      return {
        ...quiz,
        stats: {
          totalSessions,
          completedSessions,
          completionRate,
          attributedRevenue,
        },
      };
    })
  );

  return {
    quizzes: quizzesWithStats,
    shopCurrency,
  };
};

// Currency symbol mapping
const currencySymbols = {
  USD: "$",
  EUR: "€",
  GBP: "£",
  CAD: "CA$",
  AUD: "A$",
  JPY: "¥",
  CNY: "¥",
  INR: "₹",
  BRL: "R$",
  MXN: "MX$",
  KRW: "₩",
  SEK: "kr",
  NOK: "kr",
  DKK: "kr",
  CHF: "CHF",
  NZD: "NZ$",
  SGD: "S$",
  HKD: "HK$",
  PLN: "zł",
  CZK: "Kč",
};

const getCurrencySymbol = (currencyCode) => {
  return currencySymbols[currencyCode] || currencyCode + " ";
};

export default function Index() {
  const navigate = useNavigate();
  const { quizzes, shopCurrency } = useLoaderData();
  const currencySymbol = getCurrencySymbol(shopCurrency);

  // State
  const [showImageModal, setShowImageModal] = useState(false);
  const [queryValue, setQueryValue] = useState("");

  const { mode, setMode } = useSetIndexFiltersMode();

  const totalCount = quizzes.length;

  // Calculate metrics
  const metrics = useMemo(() => {
    const totalImpressions = quizzes.reduce((sum, q) => sum + q.stats.totalSessions, 0);
    const totalCompletions = quizzes.reduce((sum, q) => sum + q.stats.completedSessions, 0);
    const totalAttributedRevenue = quizzes.reduce((sum, q) => sum + q.stats.attributedRevenue, 0);
    const avgCompletionRate = totalImpressions > 0
      ? Math.round((totalCompletions / totalImpressions) * 100)
      : 0;

    return {
      totalImpressions,
      totalCompletions,
      totalAttributedRevenue,
      avgCompletionRate,
    };
  }, [quizzes]);

  // Process quizzes for table
  const processedQuizzes = useMemo(() => {
    return quizzes.map((quiz) => {
      const formattedDate = new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      }).format(new Date(quiz.created_at));

      return {
        id: quiz.id,
        quiz_id: quiz.quiz_id,
        title: quiz.title,
        description: quiz.description || "No description",
        questionCount: quiz.questions.length,
        date: formattedDate,
        impressions: quiz.stats.totalSessions,
        completions: quiz.stats.completedSessions,
        completionRate: quiz.stats.completionRate,
        attributedRevenue: quiz.stats.attributedRevenue,
      };
    });
  }, [quizzes]);

  // Filtering
  const filteredQuizzes = useMemo(() => {
    let filtered = [...processedQuizzes];

    // Text search
    if (queryValue) {
      filtered = filtered.filter((quiz) =>
        quiz.title.toLowerCase().includes(queryValue.toLowerCase())
      );
    }

    return filtered;
  }, [processedQuizzes, queryValue]);

  // IndexTable setup
  const resourceName = {
    singular: "quiz",
    plural: "quizzes",
  };

  const { selectedResources, allResourcesSelected, handleSelectionChange } =
    useIndexResourceState(filteredQuizzes);

  // Handlers
  const handleQueryChange = useCallback((value) => setQueryValue(value), []);
  const handleQueryClear = useCallback(() => setQueryValue(""), []);
  const handleFiltersClearAll = useCallback(() => {
    handleQueryClear();
  }, [handleQueryClear]);

  // Filters
  const filters = [];
  const appliedFilters = [];

  // Row markup
  const rowMarkup = filteredQuizzes.map(
    (
      {
        id,
        quiz_id,
        title,
        description,
        questionCount,
        date,
        impressions,
        completions,
        completionRate,
        attributedRevenue,
      },
      index
    ) => (
      <IndexTable.Row
        id={id}
        key={id}
        selected={selectedResources.includes(id)}
        position={index}
        onClick={() => navigate(`/app/quiz/${quiz_id}`)}
      >
        <IndexTable.Cell>
          <Box paddingBlockStart="300" paddingBlockEnd="300">
            <Text variant="bodyMd" fontWeight="semibold" as="span">
              {title}
            </Text>
          </Box>
        </IndexTable.Cell>
        <IndexTable.Cell>
          <Box paddingBlockStart="300" paddingBlockEnd="300">
            <Text as="span" tone="subdued">
              {date}
            </Text>
          </Box>
        </IndexTable.Cell>
        <IndexTable.Cell>
          <Box paddingBlockStart="300" paddingBlockEnd="300">
            <Text as="span">{impressions}</Text>
          </Box>
        </IndexTable.Cell>
        <IndexTable.Cell>
          <Box paddingBlockStart="300" paddingBlockEnd="300">
            <Text as="span">{completions}</Text>
          </Box>
        </IndexTable.Cell>
        <IndexTable.Cell>
          <Box paddingBlockStart="300" paddingBlockEnd="300">
            <Badge>
              {completionRate}%
            </Badge>
          </Box>
        </IndexTable.Cell>
        <IndexTable.Cell>
          <Box paddingBlockStart="300" paddingBlockEnd="300">
            <Text as="span">{currencySymbol}{attributedRevenue.toFixed(2)}</Text>
          </Box>
        </IndexTable.Cell>
        <IndexTable.Cell>
          <Box paddingBlockStart="200" paddingBlockEnd="200">
            <Button
              icon={EditIcon}
              onClick={(e) => {
                e.stopPropagation();
                navigate(`/app/quiz/${quiz_id}`);
              }}
            >
              Edit
            </Button>
          </Box>
        </IndexTable.Cell>
      </IndexTable.Row>
    )
  );

  // Empty state
  const emptyStateMarkup = (
    <BlockStack gap="500">
      <EmptyState
        heading="Create your first quiz"
        action={{
          content: "Create quiz",
          onAction: () => navigate("/app/quiz/new"),
        }}
        image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
      >
        <p>
          Build interactive quizzes to engage customers and guide them to the perfect products.
        </p>
      </EmptyState>

      {/* Setup Guide */}
      <Card>
        <BlockStack gap="400">
          <Text as="h2" variant="headingMd">
            Quick Setup Guide
          </Text>
          <Text as="p" variant="bodySm" tone="subdued">
            After creating your quiz, follow these steps to add it to your store:
          </Text>

          <Divider />

          <InlineGrid columns={{ xs: 1, md: 3 }} gap="400">
            {/* Step 1 */}
            <BlockStack gap="200">
              <Box width="fit-content">
                <Box background="bg-surface-secondary" padding="200" borderRadius="100">
                  <Text as="span" variant="bodySm" fontWeight="semibold">
                    Step 1
                  </Text>
                </Box>
              </Box>
              <Text as="p" variant="bodyMd" fontWeight="semibold">
                Create a quiz
              </Text>
              <Text as="p" variant="bodySm" tone="subdued">
                Click "Create quiz" above to build your first quiz with questions and answers
              </Text>
            </BlockStack>

            {/* Step 2 */}
            <BlockStack gap="200">
              <Box width="fit-content">
                <Box background="bg-surface-secondary" padding="200" borderRadius="100">
                  <Text as="span" variant="bodySm" fontWeight="semibold">
                    Step 2
                  </Text>
                </Box>
              </Box>
              <Text as="p" variant="bodyMd" fontWeight="semibold">
                Copy the Quiz ID
              </Text>
              <Text as="p" variant="bodySm" tone="subdued">
                After creating your quiz, copy the Quiz ID from the quiz details page
              </Text>
            </BlockStack>

            {/* Step 3 */}
            <BlockStack gap="200">
              <Box width="fit-content">
                <Box background="bg-surface-secondary" padding="200" borderRadius="100">
                  <Text as="span" variant="bodySm" fontWeight="semibold">
                    Step 3
                  </Text>
                </Box>
              </Box>
              <Text as="p" variant="bodyMd" fontWeight="semibold">
                Add to your theme
              </Text>
              <Text as="p" variant="bodySm" tone="subdued">
                Open the Theme Editor, add the "Quiz Widget" block, and paste your Quiz ID
              </Text>
            </BlockStack>
          </InlineGrid>

          <Divider />

          {/* Screenshot */}
          <BlockStack gap="200">
            <Text as="p" variant="bodyMd" fontWeight="semibold">
              Visual Guide
            </Text>
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
                      maxWidth: "600px",
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
    </BlockStack>
  );

  // Metrics cards
  const metricsMarkup = (
    <InlineGrid columns={{ xs: 1, sm: 2, md: 2, lg: 4 }} gap="400">
      <Card>
        <BlockStack gap="200" inlineAlign="start">
          <InlineStack gap="200" blockAlign="center">
            <Box paddingInlineEnd="200">
              <Icon source={PlayIcon} tone="warning" />
            </Box>
            <Text as="h3" variant="headingSm" tone="subdued">
              Total Impressions
            </Text>
          </InlineStack>
          <Text as="p" variant="heading2xl">
            {metrics.totalImpressions}
          </Text>
          <Text as="p" variant="bodySm" tone="subdued">
            Quizzes started
          </Text>
        </BlockStack>
      </Card>

      <Card>
        <BlockStack gap="200" inlineAlign="start">
          <InlineStack gap="200" blockAlign="center">
            <Box paddingInlineEnd="200">
              <Icon source={CheckCircleIcon} tone="success" />
            </Box>
            <Text as="h3" variant="headingSm" tone="subdued">
              Completions
            </Text>
          </InlineStack>
          <Text as="p" variant="heading2xl">
            {metrics.totalCompletions}
          </Text>
          <Text as="p" variant="bodySm" tone="subdued">
            Quizzes finished
          </Text>
        </BlockStack>
      </Card>

      <Card>
        <BlockStack gap="200" inlineAlign="start">
          <InlineStack gap="200" blockAlign="center">
            <Box paddingInlineEnd="200">
              <Icon source={ChartVerticalIcon} tone="magic" />
            </Box>
            <Text as="h3" variant="headingSm" tone="subdued">
              Completion Rate
            </Text>
          </InlineStack>
          <Text as="p" variant="heading2xl">
            {metrics.avgCompletionRate}%
          </Text>
          <Text as="p" variant="bodySm" tone="subdued">
            Average across all quizzes
          </Text>
        </BlockStack>
      </Card>

      <Card>
        <BlockStack gap="200" inlineAlign="start">
          <InlineStack gap="200" blockAlign="center">
            <Box paddingInlineEnd="200">
              <Icon source={CashDollarIcon} tone="success" />
            </Box>
            <Text as="h3" variant="headingSm" tone="subdued">
              Attributed Revenue
            </Text>
          </InlineStack>
          <Text as="p" variant="heading2xl">
            {currencySymbol}{metrics.totalAttributedRevenue.toFixed(2)}
          </Text>
          <Text as="p" variant="bodySm" tone="subdued">
            Total from all quizzes
          </Text>
        </BlockStack>
      </Card>
    </InlineGrid>
  );

  return (
    <Page
      fullWidth
      secondaryActions={[
        {
          content: "Billing & Settings",
          onAction: () => navigate("/app/settings"),
        },
      ]}
    >
      <BlockStack gap="500">
        {totalCount === 0 ? (
          <Card>{emptyStateMarkup}</Card>
        ) : (
          <>
            {/* Metrics */}
            {metricsMarkup}

            {/* Quiz table */}
            <Card padding="0">
              <BlockStack gap="0">
                <Box padding="400" paddingBlockEnd="200">
                  <InlineStack align="space-between" blockAlign="center">
                    <Text variant="headingLg" as="h2">
                      Quizzes
                    </Text>
                    <Button
                      variant="primary"
                      onClick={() => navigate("/app/quiz/new")}
                    >
                      Create quiz
                    </Button>
                  </InlineStack>
                </Box>

                <Filters
                  queryValue={queryValue}
                  filters={filters}
                  appliedFilters={appliedFilters}
                  onQueryChange={handleQueryChange}
                  onQueryClear={handleQueryClear}
                  onClearAll={handleFiltersClearAll}
                  queryPlaceholder="Search quizzes..."
                />

                <IndexTable
                  resourceName={resourceName}
                  itemCount={filteredQuizzes.length}
                  selectedItemsCount={
                    allResourcesSelected ? "All" : selectedResources.length
                  }
                  onSelectionChange={handleSelectionChange}
                  headings={[
                    { title: "Quiz" },
                    { title: "Date created" },
                    { title: "Impressions" },
                    { title: "Completions" },
                    { title: "Completion rate" },
                    { title: "Attributed revenue" },
                    { title: "Actions" },
                  ]}
                  selectable={false}
                >
                  {rowMarkup}
                </IndexTable>
              </BlockStack>
            </Card>
          </>
        )}
      </BlockStack>

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
    </Page>
  );
}
