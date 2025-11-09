import { useState, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
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
  Modal,
  CalloutCard,
  ProgressBar,
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
} from "@shopify/polaris";
import {
  PlayIcon,
  CheckCircleIcon,
  ChartVerticalIcon,
  CashDollarIcon,
  EditIcon,
} from "@shopify/polaris-icons";

import { authenticate, PREMIUM_PLAN } from "../shopify.server";
import prisma from "../db.server";

export const action = async ({ request }) => {
  const { billing, admin } = await authenticate.admin(request);
  const result = await admin.graphql(
    `#graphql
    query Shop {
      app {
        installation {
          launchUrl
          activeSubscriptions {
            id
            name
            createdAt
            returnUrl
            status
            currentPeriodEnd
            trialDays
          }
        }
      }
    }`,
    { vaiables: {} }
  );
  const resultJson = await result.json();
  const { launchUrl, activeSubscriptions } = resultJson.data.app.installation;

  if (
    activeSubscriptions.length === 0 ||
    !activeSubscriptions ||
    activeSubscriptions.status != "ACTIVE"
  ) {
    await billing.require({
      plans: [PREMIUM_PLAN],
      isTest: true,
      onFailure: async () =>
        billing.request({
          plan: PREMIUM_PLAN,
          isTest: true,
          returnUrl: launchUrl,
        }),
    });
  } else {
    return activeSubscriptions;
  }
};

export const loader = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);

  // Get subscription info
  const result = await admin.graphql(
    `#graphql
    query Shop {
      app {
        installation {
          launchUrl
          activeSubscriptions {
            id
            name
            createdAt
            returnUrl
            status
            currentPeriodEnd
            trialDays
          }
        }
      }
    }`,
    { vaiables: {} }
  );
  const resultJson = await result.json();
  const { activeSubscriptions } = resultJson.data.app.installation;

  let limit = 3;
  let status = false;
  let planid = null;

  if (activeSubscriptions.length > 0) {
    activeSubscriptions.forEach((plan, index) => {
      if (plan.status == "ACTIVE") {
        status = plan.status;
        planid = index;
      }
    });
    if (status == "ACTIVE") {
      limit = -1;
    }
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
    limit: limit,
    plan: activeSubscriptions.length > 0 ? activeSubscriptions : [],
    planid: planid,
  };
};

export default function Index() {
  const submit = useSubmit();
  const navigate = useNavigate();
  const { quizzes, limit, planid } = useLoaderData();

  // State
  const [modalActive, setModalActive] = useState(false);
  const [queryValue, setQueryValue] = useState("");

  const { mode, setMode} = useSetIndexFiltersMode();

  const totalCount = quizzes.length;
  const totalSet = limit;
  const percentage = totalSet > 0 ? (totalCount / totalSet) * 100 : 0;

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

  const handleUpgradePlan = () => setModalActive(true);
  const handleApprove = () => {
    setModalActive(false);
    submit(1, { replace: true, method: "POST" });
  };
  const handleModalClose = () => setModalActive(false);

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
            <Badge
              tone={
                completionRate >= 70
                  ? "success"
                  : completionRate >= 40
                  ? "info"
                  : "attention"
              }
            >
              {completionRate}%
            </Badge>
          </Box>
        </IndexTable.Cell>
        <IndexTable.Cell>
          <Box paddingBlockStart="300" paddingBlockEnd="300">
            <Text as="span">${attributedRevenue.toFixed(2)}</Text>
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
            ${metrics.totalAttributedRevenue.toFixed(2)}
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
          content: "Settings",
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
                      onClick={
                        totalSet == -1
                          ? () => navigate("/app/quiz/new")
                          : totalCount < totalSet
                          ? () => navigate("/app/quiz/new")
                          : handleUpgradePlan
                      }
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

      {/* Upgrade modal */}
      <Modal
        open={modalActive}
        onClose={handleModalClose}
        title="Upgrade to Pro Plan"
        primaryAction={{
          content: "Approve charges",
          onAction: handleApprove,
        }}
        secondaryActions={[
          {
            content: "Cancel",
            onAction: handleModalClose,
          },
        ]}
      >
        <Modal.Section>
          <BlockStack gap="400">
            <Text variant="bodyMd" as="p">
              Unlock the full potential of your store with Simple Product Page Quiz Premium.
              Create unlimited quizzes and track revenue with advanced analytics.
            </Text>
            <BlockStack gap="200">
              <Text variant="headingMd" as="h3">
                Premium Plan includes:
              </Text>
              <ul>
                <li>Unlimited quizzes</li>
                <li>Advanced analytics and reporting</li>
                <li>Priority support</li>
                <li>Custom quiz styling</li>
              </ul>
            </BlockStack>
            <Text variant="bodyMd" as="p" fontWeight="semibold">
              Price: $19.99 USD per month (7-day free trial)
            </Text>
          </BlockStack>
        </Modal.Section>
      </Modal>
    </Page>
  );
}
