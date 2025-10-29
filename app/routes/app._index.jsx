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
  QuestionCircleIcon,
  PlayIcon,
  CheckCircleIcon,
  ChartVerticalIcon,
} from "@shopify/polaris-icons";

import { authenticate, PRO_PLAN } from "../shopify.server";
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
      plans: [PRO_PLAN],
      isTest: true,
      onFailure: async () =>
        billing.request({
          plan: PRO_PLAN,
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
  const [statusFilter, setStatusFilter] = useState([]);

  const { mode, setMode } = useSetIndexFiltersMode();

  const totalCount = quizzes.length;
  const totalSet = limit;
  const percentage = totalSet > 0 ? (totalCount / totalSet) * 100 : 0;

  // Calculate metrics
  const metrics = useMemo(() => {
    const totalQuizzes = quizzes.length;
    const activeQuizzes = quizzes.filter((q) => q.status === "active").length;
    const totalSessions = quizzes.reduce((sum, q) => sum + q.stats.totalSessions, 0);
    const totalCompletions = quizzes.reduce((sum, q) => sum + q.stats.completedSessions, 0);
    const avgCompletionRate = totalSessions > 0
      ? Math.round((totalCompletions / totalSessions) * 100)
      : 0;

    return {
      totalQuizzes,
      activeQuizzes,
      totalSessions,
      totalCompletions,
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
        sessions: quiz.stats.totalSessions,
        completions: quiz.stats.completedSessions,
        completionRate: quiz.stats.completionRate,
        status: quiz.status,
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

    // Status filter
    if (statusFilter.length > 0) {
      filtered = filtered.filter((quiz) =>
        statusFilter.includes(quiz.status)
      );
    }

    return filtered;
  }, [processedQuizzes, queryValue, statusFilter]);

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
  const handleStatusFilterChange = useCallback(
    (value) => setStatusFilter(value),
    []
  );
  const handleFiltersClearAll = useCallback(() => {
    handleQueryClear();
    setStatusFilter([]);
  }, [handleQueryClear]);

  const handleUpgradePlan = () => setModalActive(true);
  const handleApprove = () => {
    setModalActive(false);
    submit(1, { replace: true, method: "POST" });
  };
  const handleModalClose = () => setModalActive(false);

  // Filters
  const filters = [
    {
      key: "status",
      label: "Status",
      filter: (
        <ChoiceList
          title="Status"
          titleHidden
          choices={[
            { label: "Active", value: "active" },
            { label: "Draft", value: "draft" },
            { label: "Inactive", value: "inactive" },
          ]}
          selected={statusFilter}
          onChange={handleStatusFilterChange}
          allowMultiple
        />
      ),
      shortcut: true,
    },
  ];

  const appliedFilters = [];
  if (statusFilter.length > 0) {
    appliedFilters.push({
      key: "status",
      label: `Status: ${statusFilter.join(", ")}`,
      onRemove: () => setStatusFilter([]),
    });
  }

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
        sessions,
        completions,
        completionRate,
        status,
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
          <BlockStack gap="100">
            <Text variant="bodyMd" fontWeight="semibold" as="span">
              {title}
            </Text>
            <Text variant="bodySm" as="span" tone="subdued">
              {questionCount} {questionCount === 1 ? "question" : "questions"}
            </Text>
          </BlockStack>
        </IndexTable.Cell>
        <IndexTable.Cell>
          <Text as="span" tone="subdued">
            {date}
          </Text>
        </IndexTable.Cell>
        <IndexTable.Cell>
          <Text as="span">{sessions}</Text>
        </IndexTable.Cell>
        <IndexTable.Cell>
          <Text as="span">{completions}</Text>
        </IndexTable.Cell>
        <IndexTable.Cell>
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
        </IndexTable.Cell>
        <IndexTable.Cell>
          <Badge
            tone={
              status === "active"
                ? "success"
                : status === "draft"
                ? "info"
                : "default"
            }
          >
            {status.charAt(0).toUpperCase() + status.slice(1)}
          </Badge>
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
              <Icon source={QuestionCircleIcon} tone="info" />
            </Box>
            <Text as="h3" variant="headingSm" tone="subdued">
              Total Quizzes
            </Text>
          </InlineStack>
          <Text as="p" variant="heading2xl">
            {metrics.totalQuizzes}
          </Text>
          <Text as="p" variant="bodySm" tone="subdued">
            {metrics.activeQuizzes} active
          </Text>
        </BlockStack>
      </Card>

      <Card>
        <BlockStack gap="200" inlineAlign="start">
          <InlineStack gap="200" blockAlign="center">
            <Box paddingInlineEnd="200">
              <Icon source={PlayIcon} tone="warning" />
            </Box>
            <Text as="h3" variant="headingSm" tone="subdued">
              Total Sessions
            </Text>
          </InlineStack>
          <Text as="p" variant="heading2xl">
            {metrics.totalSessions}
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
    </InlineGrid>
  );

  return (
    <Page fullWidth>
      <BlockStack gap="500">
        {/* Trial callout */}
        {planid == null && (
          <CalloutCard
            title="You're on the free plan"
            illustration="https://cdn.shopify.com/s/assets/admin/checkout/settings-customizecart-705f57c725ac05be5a34ec20c05b94298cb8afd10aac7bd9c7ad02030f48cfa0.svg"
            primaryAction={{
              content: "Upgrade to Pro",
              onAction: handleUpgradePlan,
            }}
          >
            <BlockStack gap="300">
              <Text as="p" variant="bodyMd">
                {`${totalCount} of ${totalSet} free ${
                  totalSet === 1 ? "quiz has" : "quizzes have"
                } been created.`}
              </Text>
              <ProgressBar
                progress={percentage}
                size="small"
                tone={percentage >= 80 ? "critical" : "primary"}
              />
            </BlockStack>
          </CalloutCard>
        )}

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
                    { title: "Sessions" },
                    { title: "Completions" },
                    { title: "Completion rate" },
                    { title: "Status" },
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
              You've reached the limit of your free plan. Upgrade to Pro to
              create unlimited quizzes and unlock all features.
            </Text>
            <BlockStack gap="200">
              <Text variant="headingMd" as="h3">
                Pro Plan includes:
              </Text>
              <ul>
                <li>Unlimited quizzes</li>
                <li>Advanced analytics and reporting</li>
                <li>Priority support</li>
                <li>Custom quiz styling</li>
              </ul>
            </BlockStack>
            <Text variant="bodyMd" as="p" fontWeight="semibold">
              Price: $14.99 USD per month
            </Text>
          </BlockStack>
        </Modal.Section>
      </Modal>
    </Page>
  );
}
