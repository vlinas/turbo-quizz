import { json } from "@remix-run/node";
import { useLoaderData, useNavigate } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  Text,
  BlockStack,
  InlineStack,
  DataTable,
  EmptyState,
  Box,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

export const loader = async ({ request, params }) => {
  const { session } = await authenticate.admin(request);
  const { id } = params;

  const quizId = parseInt(id, 10);
  if (isNaN(quizId)) {
    throw new Response("Invalid quiz ID", { status: 400 });
  }

  const quiz = await prisma.quiz.findFirst({
    where: { shop: session.shop, quiz_id: quizId, deleted_at: null },
    include: {
      questions: {
        include: { answers: true },
        orderBy: { order: "asc" },
      },
    },
  });

  if (!quiz) {
    throw new Response("Quiz not found", { status: 404 });
  }

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  thirtyDaysAgo.setHours(0, 0, 0, 0);

  const quizSessions = await prisma.quizSession.findMany({
    where: { quiz_id: quizId, shop: session.shop, started_at: { gte: thirtyDaysAgo } },
    include: {
      answer_selections: { include: { answer: { include: { question: true } } } },
      order_attributions: true,
    },
  });

  const totalSessions = quizSessions.length;
  const completedSessions = quizSessions.filter((s) => s.is_completed).length;

  const questionStats = quiz.questions.map((question) => {
    const selections = quizSessions.flatMap((session) =>
      session.answer_selections.filter((sel) => sel.question_id === question.question_id)
    );
    const totalSelections = selections.length;

    const answerStats = question.answers.map((answer) => {
      const answerSelections = selections.filter((sel) => sel.answer_id === answer.answer_id);
      const count = answerSelections.length;
      const percentage = totalSelections > 0 ? ((count / totalSelections) * 100).toFixed(1) : 0;

      const sessionsWithThisAnswer = quizSessions.filter((session) =>
        session.answer_selections.some((sel) => sel.answer_id === answer.answer_id)
      );

      const totalRevenue = sessionsWithThisAnswer.reduce((sum, session) => {
        const revenue = session.order_attributions.reduce(
          (orderSum, order) => orderSum + parseFloat(order.total_price), 0
        );
        return sum + revenue;
      }, 0);

      const orderCount = sessionsWithThisAnswer.reduce(
        (sum, session) => sum + session.order_attributions.length, 0
      );
      const aov = orderCount > 0 ? totalRevenue / orderCount : 0;

      return {
        answer_text: answer.answer_text,
        count,
        percentage,
        totalRevenue: totalRevenue.toFixed(2),
        orderCount,
        aov: aov.toFixed(2),
      };
    });

    return {
      question_text: question.question_text,
      totalSelections,
      answers: answerStats,
    };
  });

  const totalRevenue = quizSessions.reduce((sum, session) => {
    const revenue = session.order_attributions.reduce(
      (orderSum, order) => orderSum + parseFloat(order.total_price), 0
    );
    return sum + revenue;
  }, 0);

  const totalOrders = quizSessions.reduce(
    (sum, session) => sum + session.order_attributions.length, 0
  );

  const overallAOV = totalOrders > 0 ? totalRevenue / totalOrders : 0;
  const conversionRate = completedSessions > 0 ? (totalOrders / completedSessions) * 100 : 0;

  return json({
    quiz,
    totals: { starts: totalSessions, completions: completedSessions },
    questionStats,
    totalRevenue: totalRevenue.toFixed(2),
    totalOrders,
    overallAOV: overallAOV.toFixed(2),
    conversionRate: conversionRate.toFixed(1),
  });
};

export default function QuizAnalytics() {
  const { quiz, totals, questionStats, totalRevenue, totalOrders, overallAOV, conversionRate } = useLoaderData();
  const navigate = useNavigate();

  return (
    <Page
      backAction={{ content: "Back", onAction: () => navigate(`/app/quiz/${quiz.quiz_id}`) }}
      title={`Analytics: ${quiz.title}`}
      subtitle="Last 30 days"
    >
      <Layout>
        <Layout.Section>
          <InlineStack gap="400" wrap>
            <Card>
              <BlockStack gap="200">
                <Text as="p" variant="bodyMd" tone="subdued">Starts</Text>
                <Text as="p" variant="heading2xl">{totals.starts.toLocaleString()}</Text>
              </BlockStack>
            </Card>
            <Card>
              <BlockStack gap="200">
                <Text as="p" variant="bodyMd" tone="subdued">Completions</Text>
                <Text as="p" variant="heading2xl">{totals.completions.toLocaleString()}</Text>
                <Text as="p" variant="bodySm" tone="subdued">
                  {totals.starts > 0 ? `${((totals.completions / totals.starts) * 100).toFixed(1)}% rate` : ""}
                </Text>
              </BlockStack>
            </Card>
            <Card>
              <BlockStack gap="200">
                <Text as="p" variant="bodyMd" tone="subdued">Revenue</Text>
                <Text as="p" variant="heading2xl">${totalRevenue}</Text>
                <Text as="p" variant="bodySm" tone="subdued">{totalOrders} orders • ${overallAOV} AOV</Text>
              </BlockStack>
            </Card>
            <Card>
              <BlockStack gap="200">
                <Text as="p" variant="bodyMd" tone="subdued">Conversion</Text>
                <Text as="p" variant="heading2xl">{conversionRate}%</Text>
              </BlockStack>
            </Card>
          </InlineStack>
        </Layout.Section>

        {questionStats.map((questionStat, index) => (
          <Layout.Section key={index}>
            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">Q{index + 1}: {questionStat.question_text}</Text>
                {questionStat.totalSelections === 0 ? (
                  <Text as="p" tone="subdued">No answers recorded yet</Text>
                ) : (
                  <DataTable
                    columnContentTypes={["text", "numeric", "numeric", "numeric"]}
                    headings={["Answer", "Count (%)", "Revenue (Orders)", "AOV"]}
                    rows={questionStat.answers.map((answer) => [
                      answer.answer_text,
                      `${answer.count} (${answer.percentage}%)`,
                      answer.orderCount > 0 ? `$${answer.totalRevenue} (${answer.orderCount})` : "$0",
                      answer.orderCount > 0 ? `$${answer.aov}` : "-",
                    ])}
                  />
                )}
              </BlockStack>
            </Card>
          </Layout.Section>
        ))}

        {totals.starts === 0 && (
          <Layout.Section>
            <Card>
              <EmptyState
                heading="No analytics data yet"
                image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
              >
                <Text as="p">Analytics will appear once customers take your quiz.</Text>
              </EmptyState>
            </Card>
          </Layout.Section>
        )}
      </Layout>
    </Page>
  );
}
