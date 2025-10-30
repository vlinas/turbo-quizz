import { json } from "@remix-run/node";
import { useLoaderData, useNavigate } from "@remix-run/react";
import { useMemo } from "react";
import {
  Page,
  Layout,
  Card,
  BlockStack,
  Text,
  InlineStack,
  Box,
  Icon,
  Badge,
  InlineGrid,
  DataTable,
  EmptyState,
} from "@shopify/polaris";
import {
  PlayIcon,
  CheckCircleIcon,
  ChartVerticalIcon,
  ClockIcon,
} from "@shopify/polaris-icons";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

export const loader = async ({ request, params }) => {
  const { session } = await authenticate.admin(request);
  const { id } = params;

  // Fetch quiz
  const quiz = await prisma.quiz.findFirst({
    where: {
      quiz_id: id,
      shop: session.shop,
      deleted_at: null,
    },
    include: {
      questions: {
        include: {
          answers: {
            include: {
              _count: {
                select: {
                  answer_selections: true,
                },
              },
            },
          },
        },
        orderBy: {
          order: "asc",
        },
      },
    },
  });

  if (!quiz) {
    throw new Response("Quiz not found", { status: 404 });
  }

  // Get sessions data
  const sessions = await prisma.quizSession.findMany({
    where: { quiz_id: id },
    select: {
      session_id: true,
      is_completed: true,
      started_at: true,
      completed_at: true,
    },
    orderBy: {
      started_at: "desc",
    },
    take: 100,
  });

  // Get daily analytics (last 30 days)
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  thirtyDaysAgo.setHours(0, 0, 0, 0);

  const dailyAnalytics = await prisma.quizAnalyticsSummary.findMany({
    where: {
      quiz_id: id,
      date: {
        gte: thirtyDaysAgo,
      },
    },
    orderBy: {
      date: "asc",
    },
  });

  return json({ quiz, sessions, dailyAnalytics });
};

export default function QuizAnalytics() {
  const { quiz, sessions, dailyAnalytics } = useLoaderData();
  const navigate = useNavigate();

  // Calculate metrics
  const metrics = useMemo(() => {
    const totalSessions = sessions.length;
    const completedSessions = sessions.filter((s) => s.is_completed).length;
    const completionRate = totalSessions > 0
      ? Math.round((completedSessions / totalSessions) * 100)
      : 0;

    // Calculate average time to complete
    const completedSessionsWithTime = sessions.filter(
      (s) => s.is_completed && s.completed_at
    );
    const avgTimeToComplete = completedSessionsWithTime.length > 0
      ? completedSessionsWithTime.reduce((sum, s) => {
          const duration = new Date(s.completed_at) - new Date(s.started_at);
          return sum + duration;
        }, 0) / completedSessionsWithTime.length
      : 0;

    const avgSeconds = Math.round(avgTimeToComplete / 1000);

    return {
      totalSessions,
      completedSessions,
      completionRate,
      avgSeconds,
    };
  }, [sessions]);

  // Prepare answer statistics
  const answerStats = useMemo(() => {
    const stats = [];
    quiz.questions.forEach((question, qIndex) => {
      question.answers.forEach((answer, aIndex) => {
        const selections = answer._count.answer_selections;
        const percentage = metrics.totalSessions > 0
          ? Math.round((selections / metrics.totalSessions) * 100)
          : 0;

        stats.push({
          questionNumber: qIndex + 1,
          questionText: question.question_text,
          answerText: answer.answer_text,
          selections,
          percentage,
        });
      });
    });
    return stats;
  }, [quiz.questions, metrics.totalSessions]);

  // Prepare daily chart data
  const chartData = useMemo(() => {
    return dailyAnalytics.map((day) => {
      const date = new Date(day.date);
      const completionRate = day.starts > 0
        ? Math.round((day.completions / day.starts) * 100)
        : 0;

      return {
        date: date.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
        starts: day.starts,
        completions: day.completions,
        completionRate,
      };
    });
  }, [dailyAnalytics]);

  // Table rows for answer statistics
  const tableRows = answerStats.map((stat) => [
    `Q${stat.questionNumber}`,
    stat.questionText,
    stat.answerText,
    stat.selections.toString(),
    `${stat.percentage}%`,
  ]);

  return (
    <Page
      title="Quiz Analytics"
      backAction={{ content: quiz.title, onAction: () => navigate(`/app/quiz/${quiz.quiz_id}`) }}
    >
      <Layout>
        <Layout.Section>
          {/* Metrics Cards */}
          <InlineGrid columns={{ xs: 1, sm: 2, md: 4 }} gap="400">
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
                    Completed
                  </Text>
                </InlineStack>
                <Text as="p" variant="heading2xl">
                  {metrics.completedSessions}
                </Text>
                <Text as="p" variant="bodySm" tone="subdued">
                  Finished quizzes
                </Text>
              </BlockStack>
            </Card>

            <Card>
              <BlockStack gap="200" inlineAlign="start">
                <InlineStack gap="200" blockAlign="center">
                  <Box paddingInlineEnd="200">
                    <Icon source={ChartVerticalIcon} tone="info" />
                  </Box>
                  <Text as="h3" variant="headingSm" tone="subdued">
                    Completion Rate
                  </Text>
                </InlineStack>
                <Text as="p" variant="heading2xl">
                  {metrics.completionRate}%
                </Text>
                <Text as="p" variant="bodySm" tone="subdued">
                  Sessions completed
                </Text>
              </BlockStack>
            </Card>

            <Card>
              <BlockStack gap="200" inlineAlign="start">
                <InlineStack gap="200" blockAlign="center">
                  <Box paddingInlineEnd="200">
                    <Icon source={ClockIcon} tone="magic" />
                  </Box>
                  <Text as="h3" variant="headingSm" tone="subdued">
                    Avg Time
                  </Text>
                </InlineStack>
                <Text as="p" variant="heading2xl">
                  {metrics.avgSeconds}s
                </Text>
                <Text as="p" variant="bodySm" tone="subdued">
                  To complete quiz
                </Text>
              </BlockStack>
            </Card>
          </InlineGrid>

          {/* Daily Performance */}
          {chartData.length > 0 ? (
            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">
                  Daily Performance (Last 30 Days)
                </Text>
                <DataTable
                  columnContentTypes={["text", "numeric", "numeric", "numeric"]}
                  headings={["Date", "Starts", "Completions", "Rate"]}
                  rows={chartData.map((day) => [
                    day.date,
                    day.starts,
                    day.completions,
                    `${day.completionRate}%`,
                  ])}
                  truncate
                />
              </BlockStack>
            </Card>
          ) : (
            <Card>
              <EmptyState
                heading="No performance data yet"
                image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
              >
                <p>Performance data will appear here once customers start taking your quiz.</p>
              </EmptyState>
            </Card>
          )}

          {/* Answer Statistics */}
          <Card>
            <BlockStack gap="400">
              <Box>
                <InlineStack align="space-between" blockAlign="center">
                  <Text as="h2" variant="headingMd">
                    Answer Selection Statistics
                  </Text>
                  <Badge tone="info">{quiz.questions.length} questions</Badge>
                </InlineStack>
              </Box>

              {tableRows.length > 0 ? (
                <DataTable
                  columnContentTypes={["text", "text", "text", "numeric", "numeric"]}
                  headings={["Q#", "Question", "Answer", "Selections", "Rate"]}
                  rows={tableRows}
                  truncate
                />
              ) : (
                <Box padding="400">
                  <BlockStack gap="200" inlineAlign="center">
                    <Text as="p" tone="subdued" alignment="center">
                      No answer data yet. Add questions to your quiz to see statistics.
                    </Text>
                  </BlockStack>
                </Box>
              )}
            </BlockStack>
          </Card>
        </Layout.Section>

        <Layout.Section variant="oneThird">
          <Card>
            <BlockStack gap="400">
              <Text as="h3" variant="headingSm">
                Quiz Information
              </Text>
              <BlockStack gap="300">
                <Box>
                  <Text as="p" variant="bodySm" tone="subdued">
                    Status
                  </Text>
                  <Badge tone={quiz.status === "active" ? "success" : "info"}>
                    {quiz.status.charAt(0).toUpperCase() + quiz.status.slice(1)}
                  </Badge>
                </Box>
                <Box>
                  <Text as="p" variant="bodySm" tone="subdued">
                    Total Questions
                  </Text>
                  <Text as="p" variant="bodyMd">
                    {quiz.questions.length}
                  </Text>
                </Box>
                <Box>
                  <Text as="p" variant="bodySm" tone="subdued">
                    Created
                  </Text>
                  <Text as="p" variant="bodyMd">
                    {new Date(quiz.created_at).toLocaleDateString()}
                  </Text>
                </Box>
              </BlockStack>
            </BlockStack>
          </Card>

          <Card>
            <BlockStack gap="300">
              <Text as="h3" variant="headingSm">
                Insights
              </Text>
              <BlockStack gap="200">
                {metrics.completionRate < 50 && metrics.totalSessions > 10 && (
                  <Box padding="300" background="bg-fill-warning-secondary">
                    <Text as="p" variant="bodySm">
                      ⚠️ Your completion rate is below 50%. Consider reducing the number of questions or making them more engaging.
                    </Text>
                  </Box>
                )}
                {metrics.totalSessions === 0 && (
                  <Box padding="300" background="bg-fill-info-secondary">
                    <Text as="p" variant="bodySm">
                      💡 No sessions yet. Make sure your quiz is active and added to your storefront.
                    </Text>
                  </Box>
                )}
                {metrics.completionRate >= 70 && metrics.totalSessions > 5 && (
                  <Box padding="300" background="bg-fill-success-secondary">
                    <Text as="p" variant="bodySm">
                      ✨ Great job! Your quiz has a high completion rate. Keep it up!
                    </Text>
                  </Box>
                )}
              </BlockStack>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
