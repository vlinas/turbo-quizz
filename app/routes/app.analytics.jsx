import { json } from "@remix-run/node";
import { useLoaderData, useNavigate, useSearchParams } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  BlockStack,
  InlineStack,
  Text,
  Select,
  Box,
  DataTable,
  Badge,
  EmptyState,
} from "@shopify/polaris";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

// Currency symbol mapping
const currencySymbols = {
  USD: "$", EUR: "€", GBP: "£", CAD: "C$", AUD: "A$", JPY: "¥",
  CNY: "¥", INR: "₹", BRL: "R$", MXN: "$", KRW: "₩", SEK: "kr",
  NOK: "kr", DKK: "kr", CHF: "CHF", PLN: "zł", CZK: "Kč", HUF: "Ft",
  ILS: "₪", SGD: "S$", HKD: "HK$", NZD: "NZ$", THB: "฿", ZAR: "R",
};

const getCurrencySymbol = (currencyCode) => {
  return currencySymbols[currencyCode] || currencyCode + " ";
};

export const loader = async ({ request }) => {
  const { session, admin } = await authenticate.admin(request);
  const url = new URL(request.url);

  // Parse query params
  const daysParam = url.searchParams.get("days") || "90";
  const quizIdParam = url.searchParams.get("quiz");
  const days = parseInt(daysParam, 10);
  const selectedQuizId = quizIdParam ? parseInt(quizIdParam, 10) : null;

  // Get shop currency
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

  // Date threshold
  const dateThreshold = new Date();
  dateThreshold.setDate(dateThreshold.getDate() - days);
  dateThreshold.setHours(0, 0, 0, 0);

  // Get all quizzes for the dropdown
  const quizzes = await prisma.quiz.findMany({
    where: {
      shop: session.shop,
      deleted_at: null,
    },
    select: {
      quiz_id: true,
      title: true,
    },
    orderBy: { created_at: "desc" },
  });

  // Build where clause for quiz filtering
  const quizFilter = selectedQuizId ? { quiz_id: selectedQuizId } : {};

  // 1. Get funnel data: Impressions, Completions, Orders
  const impressions = await prisma.quizSession.count({
    where: {
      shop: session.shop,
      started_at: { gte: dateThreshold },
      ...quizFilter,
    },
  });

  const completions = await prisma.quizSession.count({
    where: {
      shop: session.shop,
      started_at: { gte: dateThreshold },
      is_completed: true,
      ...quizFilter,
    },
  });

  const orderData = await prisma.quizOrderAttribution.aggregate({
    where: {
      shop: session.shop,
      order_created_at: { gte: dateThreshold },
      ...quizFilter,
    },
    _count: { order_id: true },
    _sum: { total_price: true },
  });

  const orders = orderData._count.order_id || 0;
  const totalRevenue = parseFloat(orderData._sum.total_price || 0);

  // 2. Get daily revenue data for the chart
  const dailyRevenueRaw = await prisma.quizOrderAttribution.groupBy({
    by: ["order_created_at"],
    where: {
      shop: session.shop,
      order_created_at: { gte: dateThreshold },
      ...quizFilter,
    },
    _sum: { total_price: true },
    orderBy: { order_created_at: "asc" },
  });

  // Fill in missing days with 0 revenue
  const dailyRevenue = [];
  const dateMap = new Map();

  for (const item of dailyRevenueRaw) {
    const dateStr = item.order_created_at.toISOString().split("T")[0];
    dateMap.set(dateStr, parseFloat(item._sum.total_price || 0));
  }

  // Generate all dates in range
  const currentDate = new Date(dateThreshold);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  while (currentDate <= today) {
    const dateStr = currentDate.toISOString().split("T")[0];
    dailyRevenue.push({
      date: dateStr,
      displayDate: new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      revenue: dateMap.get(dateStr) || 0,
    });
    currentDate.setDate(currentDate.getDate() + 1);
  }

  // 3. Get answer performance data
  // First get all answers with their selections count
  const answerSelections = await prisma.answerSelection.groupBy({
    by: ["answer_id"],
    where: {
      shop: session.shop,
      selected_at: { gte: dateThreshold },
      ...quizFilter,
    },
    _count: { id: true },
  });

  // Get answer revenue data
  const answerRevenueData = await prisma.answerOrderAttribution.groupBy({
    by: ["answer_id", "answer_text", "question_text"],
    where: {
      shop: session.shop,
      order_date: { gte: dateThreshold },
      ...quizFilter,
    },
    _sum: { order_total: true },
    _count: { order_id: true },
  });

  // Create a map of answer_id to selections
  const selectionsMap = new Map();
  for (const item of answerSelections) {
    selectionsMap.set(item.answer_id, item._count.id);
  }

  // Build answer performance data
  const answerPerformance = answerRevenueData.map((item) => {
    const clicks = selectionsMap.get(item.answer_id) || 0;
    const orderCount = item._count.order_id || 0;
    const revenue = parseFloat(item._sum.order_total || 0);
    const aov = orderCount > 0 ? revenue / orderCount : 0;
    const conversionRate = clicks > 0 ? (orderCount / clicks) * 100 : 0;
    const revenuePerVisitor = clicks > 0 ? revenue / clicks : 0;

    return {
      answerId: item.answer_id,
      answerText: item.answer_text,
      questionText: item.question_text,
      clicks,
      orders: orderCount,
      revenue,
      aov,
      conversionRate,
      revenuePerVisitor,
    };
  });

  // Sort by revenue descending
  answerPerformance.sort((a, b) => b.revenue - a.revenue);

  return json({
    funnel: { impressions, completions, orders, totalRevenue },
    dailyRevenue,
    answerPerformance,
    quizzes,
    selectedQuizId,
    days,
    shopCurrency,
  });
};

// CSS-based donut chart component
function DonutChart({ impressions, completions, orders }) {
  const total = impressions || 1; // Prevent division by zero

  // Calculate percentages (each is a portion of the total)
  const completionPercent = (completions / total) * 100;
  const orderPercent = (orders / total) * 100;

  // Colors matching the Kaching popup style
  const colors = {
    impressions: "#6B9DFC", // Light blue
    completions: "#818CF8", // Purple
    orders: "#22D3EE",      // Cyan
  };

  return (
    <div style={{ display: "flex", alignItems: "center", gap: "2rem" }}>
      <div style={{ position: "relative", width: "140px", height: "140px" }}>
        <svg viewBox="0 0 36 36" style={{ transform: "rotate(-90deg)" }}>
          {/* Background circle */}
          <circle
            cx="18"
            cy="18"
            r="15.5"
            fill="none"
            stroke="#E5E7EB"
            strokeWidth="3"
          />
          {/* Impressions (full circle as base) */}
          <circle
            cx="18"
            cy="18"
            r="15.5"
            fill="none"
            stroke={colors.impressions}
            strokeWidth="3"
            strokeDasharray={`${100} ${100}`}
            strokeDashoffset="0"
          />
          {/* Completions */}
          <circle
            cx="18"
            cy="18"
            r="15.5"
            fill="none"
            stroke={colors.completions}
            strokeWidth="3"
            strokeDasharray={`${completionPercent} ${100 - completionPercent}`}
            strokeDashoffset="0"
          />
          {/* Orders */}
          <circle
            cx="18"
            cy="18"
            r="15.5"
            fill="none"
            stroke={colors.orders}
            strokeWidth="3"
            strokeDasharray={`${orderPercent} ${100 - orderPercent}`}
            strokeDashoffset="0"
          />
        </svg>
        <div
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            textAlign: "center",
          }}
        >
          <Text variant="heading2xl" as="p" fontWeight="bold">
            {impressions.toLocaleString()}
          </Text>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <div style={{ width: "12px", height: "12px", backgroundColor: colors.impressions, borderRadius: "2px" }} />
          <Text variant="bodySm">Impressions</Text>
          <Text variant="bodySm" tone="subdued">({impressions.toLocaleString()})</Text>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <div style={{ width: "12px", height: "12px", backgroundColor: colors.completions, borderRadius: "2px" }} />
          <Text variant="bodySm">Completions</Text>
          <Text variant="bodySm" tone="subdued">({completions.toLocaleString()})</Text>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <div style={{ width: "12px", height: "12px", backgroundColor: colors.orders, borderRadius: "2px" }} />
          <Text variant="bodySm">Orders</Text>
          <Text variant="bodySm" tone="subdued">({orders.toLocaleString()})</Text>
        </div>
      </div>
    </div>
  );
}

export default function Analytics() {
  const {
    funnel,
    dailyRevenue,
    answerPerformance,
    quizzes,
    selectedQuizId,
    days,
    shopCurrency,
  } = useLoaderData();

  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const currencySymbol = getCurrencySymbol(shopCurrency);

  const handleQuizChange = (value) => {
    const params = new URLSearchParams(searchParams);
    if (value === "all") {
      params.delete("quiz");
    } else {
      params.set("quiz", value);
    }
    navigate(`/app/analytics?${params.toString()}`);
  };

  const handleDaysChange = (value) => {
    const params = new URLSearchParams(searchParams);
    params.set("days", value);
    navigate(`/app/analytics?${params.toString()}`);
  };

  // Build quiz options
  const quizOptions = [
    { label: "All quizzes", value: "all" },
    ...quizzes.map((q) => ({ label: q.title, value: String(q.quiz_id) })),
  ];

  // Build date range options
  const dateOptions = [
    { label: "Last 7 days", value: "7" },
    { label: "Last 30 days", value: "30" },
    { label: "Last 90 days", value: "90" },
    { label: "Last 365 days", value: "365" },
  ];

  // Build table rows for answer performance
  const tableRows = answerPerformance.map((answer) => [
    <div key={answer.answerId} style={{ maxWidth: "200px" }}>
      <Text variant="bodySm" fontWeight="semibold" truncate>
        {answer.answerText}
      </Text>
      <Text variant="bodySm" tone="subdued" truncate>
        {answer.questionText}
      </Text>
    </div>,
    answer.clicks.toLocaleString(),
    `${answer.conversionRate.toFixed(1)}%`,
    `${currencySymbol}${answer.aov.toFixed(2)}`,
    `${currencySymbol}${answer.revenuePerVisitor.toFixed(2)}`,
    <Badge key={`rev-${answer.answerId}`} tone="success">
      {currencySymbol}{answer.revenue.toFixed(2)}
    </Badge>,
  ]);

  // Custom tooltip for the chart
  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      return (
        <div
          style={{
            backgroundColor: "white",
            padding: "8px 12px",
            border: "1px solid #E5E7EB",
            borderRadius: "6px",
            boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
          }}
        >
          <Text variant="bodySm" fontWeight="semibold">{label}</Text>
          <Text variant="bodySm" tone="success">
            {currencySymbol}{payload[0].value.toFixed(2)}
          </Text>
        </div>
      );
    }
    return null;
  };

  return (
    <Page
      title="Analytics"
      backAction={{ content: "Home", url: "/app" }}
    >
      <Layout>
        {/* Filters */}
        <Layout.Section>
          <InlineStack align="space-between">
            <Select
              label=""
              labelHidden
              options={quizOptions}
              value={selectedQuizId ? String(selectedQuizId) : "all"}
              onChange={handleQuizChange}
            />
            <Select
              label=""
              labelHidden
              options={dateOptions}
              value={String(days)}
              onChange={handleDaysChange}
            />
          </InlineStack>
        </Layout.Section>

        {/* Charts Row */}
        <Layout.Section>
          <InlineStack gap="400" wrap={false}>
            {/* Conversion Funnel */}
            <Box width="50%">
              <Card>
                <BlockStack gap="400">
                  <BlockStack gap="100">
                    <Text variant="headingMd" as="h2">Quiz Conversion</Text>
                    <Text variant="bodySm" tone="subdued">
                      See how customers are interacting with quizzes
                    </Text>
                  </BlockStack>
                  <Box paddingBlockStart="400" paddingBlockEnd="200">
                    <DonutChart
                      impressions={funnel.impressions}
                      completions={funnel.completions}
                      orders={funnel.orders}
                    />
                  </Box>
                </BlockStack>
              </Card>
            </Box>

            {/* Daily Revenue Chart */}
            <Box width="50%">
              <Card>
                <BlockStack gap="400">
                  <BlockStack gap="100">
                    <Text variant="headingMd" as="h2">Daily Added Revenue</Text>
                    <Text variant="bodySm" tone="subdued">
                      See how much additional revenue you're making with this app every day
                    </Text>
                  </BlockStack>
                  <Box paddingBlockStart="200">
                    {dailyRevenue.length > 0 ? (
                      <div style={{ width: "100%", height: "200px" }}>
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart data={dailyRevenue}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                            <XAxis
                              dataKey="displayDate"
                              tick={{ fontSize: 11 }}
                              tickLine={false}
                              interval="preserveStartEnd"
                            />
                            <YAxis
                              tick={{ fontSize: 11 }}
                              tickLine={false}
                              tickFormatter={(value) => `${currencySymbol}${value}`}
                            />
                            <Tooltip content={<CustomTooltip />} />
                            <Line
                              type="monotone"
                              dataKey="revenue"
                              stroke="#6B9DFC"
                              strokeWidth={2}
                              dot={false}
                              activeDot={{ r: 4 }}
                            />
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    ) : (
                      <Box padding="400">
                        <Text tone="subdued" alignment="center">
                          No revenue data for this period
                        </Text>
                      </Box>
                    )}
                  </Box>
                  <InlineStack align="end">
                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                      <div style={{ width: "20px", height: "2px", backgroundColor: "#6B9DFC" }} />
                      <Text variant="bodySm" tone="subdued">Revenue</Text>
                    </div>
                  </InlineStack>
                </BlockStack>
              </Card>
            </Box>
          </InlineStack>
        </Layout.Section>

        {/* Summary Stats */}
        <Layout.Section>
          <Card>
            <InlineStack align="space-around" gap="400">
              <BlockStack gap="100" inlineAlign="center">
                <Text variant="heading2xl" as="p">{currencySymbol}{funnel.totalRevenue.toFixed(2)}</Text>
                <Text variant="bodySm" tone="subdued">Total Revenue</Text>
              </BlockStack>
              <BlockStack gap="100" inlineAlign="center">
                <Text variant="heading2xl" as="p">{funnel.orders}</Text>
                <Text variant="bodySm" tone="subdued">Orders</Text>
              </BlockStack>
              <BlockStack gap="100" inlineAlign="center">
                <Text variant="heading2xl" as="p">
                  {funnel.completions > 0
                    ? ((funnel.orders / funnel.completions) * 100).toFixed(1)
                    : "0.0"}%
                </Text>
                <Text variant="bodySm" tone="subdued">Conversion Rate</Text>
              </BlockStack>
              <BlockStack gap="100" inlineAlign="center">
                <Text variant="heading2xl" as="p">
                  {currencySymbol}{funnel.orders > 0
                    ? (funnel.totalRevenue / funnel.orders).toFixed(2)
                    : "0.00"}
                </Text>
                <Text variant="bodySm" tone="subdued">Avg. Order Value</Text>
              </BlockStack>
            </InlineStack>
          </Card>
        </Layout.Section>

        {/* Answer Performance Table */}
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text variant="headingMd" as="h2">Answer Performance</Text>
              {answerPerformance.length > 0 ? (
                <DataTable
                  columnContentTypes={["text", "numeric", "numeric", "numeric", "numeric", "text"]}
                  headings={[
                    "Answer",
                    "Clicks",
                    "Conv %",
                    "AOV",
                    "Rev/Visitor",
                    "Revenue",
                  ]}
                  rows={tableRows}
                />
              ) : (
                <EmptyState
                  heading="No answer data yet"
                  image=""
                >
                  <p>
                    Answer performance data will appear here once customers start
                    taking your quizzes and making purchases.
                  </p>
                </EmptyState>
              )}
            </BlockStack>
          </Card>
        </Layout.Section>

        {/* Bottom spacing */}
        <Layout.Section>
          <Box paddingBlockEnd="800" />
        </Layout.Section>
      </Layout>
    </Page>
  );
}
