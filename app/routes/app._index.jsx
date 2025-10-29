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
  Thumbnail,
  Icon,
  TextField,
  ChoiceList,
  Filters,
  useSetIndexFiltersMode,
  Tooltip,
  SkeletonBodyText,
  SkeletonDisplayText,
  Box,
} from "@shopify/polaris";
import {
  CashDollarIcon,
  DiscountIcon,
  EyeCheckMarkIcon,
  ChartVerticalIcon,
  SearchIcon,
} from "@shopify/polaris-icons";

import barImage from "../../public/clickx-bar.svg";
import emptystateimage from "../../public/clickx-main.svg";
import { getDiscounts } from "../discount_server";
import { authenticate, PRO_PLAN } from "../shopify.server";
import { getCurrentDateTimeEST } from "../helper/helper";

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
  const result = await admin.graphql(
    `#graphql
    query Shop {
      shop {
        currencyCode
      }
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
  const { currencyCode } = resultJson.data.shop;

  let limit = 1;
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

  let data = await getDiscounts(session.shop);
  let response = {
    data: data,
    limit: limit,
    plan: activeSubscriptions.length > 0 ? activeSubscriptions : [],
    planid: planid,
    currencyCode: currencyCode,
  };
  return response;
};

export default function Index() {
  const submit = useSubmit();
  const navigate = useNavigate();
  const { data, limit, planid, currencyCode } = useLoaderData();
  const discounts = data || [];

  // State
  const [modalActive, setModalActive] = useState(false);
  const [queryValue, setQueryValue] = useState("");
  const [statusFilter, setStatusFilter] = useState([]);
  const [isLoading] = useState(false);

  const { mode, setMode } = useSetIndexFiltersMode();

  const totalCount = discounts.length;
  const totalSet = limit;
  const percentage = totalSet > 0 ? (totalCount / totalSet) * 100 : 0;

  // Helper functions
  const formatCurrency = (amount, code) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: code,
      currencyDisplay: "symbol",
    }).format(amount);
  };

  const estDateTimeISOString = getCurrentDateTimeEST();
  const currentDate = new Date(estDateTimeISOString).toISOString();

  // Calculate metrics
  const metrics = useMemo(() => {
    const totalRevenue = discounts.reduce(
      (sum, d) => sum + parseFloat(d.revenue || 0),
      0
    );
    const totalCodesRevealed = discounts.reduce((sum, d) => {
      return (
        sum +
        d.discount_coupons_codes.reduce(
          (codeSum, code) => codeSum + (code.revealed || 0),
          0
        )
      );
    }, 0);
    const totalCodesAvailable = discounts.reduce(
      (sum, d) => sum + (d.quantity || 0),
      0
    );
    const activeDiscounts = discounts.filter((d) => {
      let startDate = new Date(getCurrentDateTimeEST(d.starts_at));
      if (d.starts_time) {
        startDate = new Date(
          startDate.toISOString().slice(0, 10) + "T" + d.starts_time + ":00.000Z"
        );
      }
      let expiryDate = new Date(getCurrentDateTimeEST(d.expires));
      if (d.expires_time) {
        expiryDate = new Date(
          expiryDate.toISOString().slice(0, 10) + "T" + d.expires_time + ":00.000Z"
        );
      }
      const isActive =
        expiryDate.toISOString() !== "1970-01-01T00:00:00.000Z"
          ? currentDate >= startDate.toISOString() &&
            currentDate <= expiryDate.toISOString()
          : currentDate >= startDate.toISOString();
      return d.isActive && isActive;
    }).length;

    return {
      totalRevenue,
      totalCodesRevealed,
      totalCodesAvailable,
      activeDiscounts,
      conversionRate:
        totalCodesAvailable > 0
          ? ((totalCodesRevealed / totalCodesAvailable) * 100).toFixed(1)
          : 0,
    };
  }, [discounts, currentDate]);

  // Process discounts for table
  const processedDiscounts = useMemo(() => {
    return discounts.map((discount) => {
      let startDate = new Date(getCurrentDateTimeEST(discount.starts_at));
      if (discount.starts_time) {
        startDate = new Date(
          startDate.toISOString().slice(0, 10) +
            "T" +
            discount.starts_time +
            ":00.000Z"
        );
      }

      let expiryDate = new Date(getCurrentDateTimeEST(discount.expires));
      if (discount.expires_time) {
        expiryDate = new Date(
          expiryDate.toISOString().slice(0, 10) +
            "T" +
            discount.expires_time +
            ":00.000Z"
        );
      }

      const isActive =
        expiryDate.toISOString() !== "1970-01-01T00:00:00.000Z"
          ? currentDate >= startDate.toISOString() &&
            currentDate <= expiryDate.toISOString()
          : currentDate >= startDate.toISOString();
      const isScheduled = currentDate < startDate.toISOString();

      const usedCodesSum = discount.discount_coupons_codes.reduce(
        (sum, code) => sum + (code.revealed || 0),
        0
      );

      const options = {
        timeZone: "America/New_York",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "numeric",
      };
      const formattedDate = new Intl.DateTimeFormat("en-US", options).format(
        new Date(discount.starts_at)
      );

      let minreq = "";
      if (discount.min_requirement_info === "Minimum Purchase Of") {
        minreq = discount.min_requirement_info + " $" + discount.minimum_req;
      } else if (discount.min_requirement_info == "Minimum Quantity Of") {
        minreq =
          discount.min_requirement_info +
          " " +
          discount.minimum_quantity_req +
          " Items";
      } else {
        minreq = discount.min_requirement_info;
      }

      const status = discount.isActive
        ? isActive
          ? "Active"
          : isScheduled
          ? "Scheduled"
          : "Expired"
        : "Inactive";

      return {
        id: discount.id,
        title: discount.title,
        description: `${
          discount.discount_type == "percentage"
            ? `${Math.abs(discount.discount_value)}% off`
            : `${formatCurrency(
                Math.abs(discount.discount_value),
                currencyCode
              )} off`
        } ${minreq} ${
          discount.applied_to != "All" ? "Selected Collection/Products" : ""
        }`,
        date: formattedDate,
        codesUsed: usedCodesSum,
        codesTotal: discount.quantity,
        revenue: discount.revenue || 0,
        status: status,
        couponId: discount.coupon_id,
      };
    });
  }, [discounts, currentDate, currencyCode]);

  // Filtering
  const filteredDiscounts = useMemo(() => {
    let filtered = [...processedDiscounts];

    // Text search
    if (queryValue) {
      filtered = filtered.filter((discount) =>
        discount.title.toLowerCase().includes(queryValue.toLowerCase())
      );
    }

    // Status filter
    if (statusFilter.length > 0) {
      filtered = filtered.filter((discount) =>
        statusFilter.includes(discount.status)
      );
    }

    return filtered;
  }, [processedDiscounts, queryValue, statusFilter]);

  // IndexTable setup
  const resourceName = {
    singular: "discount set",
    plural: "discount sets",
  };

  const { selectedResources, allResourcesSelected, handleSelectionChange } =
    useIndexResourceState(filteredDiscounts);

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
            { label: "Active", value: "Active" },
            { label: "Scheduled", value: "Scheduled" },
            { label: "Expired", value: "Expired" },
            { label: "Inactive", value: "Inactive" },
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
  const rowMarkup = filteredDiscounts.map(
    (
      {
        id,
        title,
        description,
        date,
        codesUsed,
        codesTotal,
        revenue,
        status,
        couponId,
      },
      index
    ) => (
      <IndexTable.Row
        id={id}
        key={id}
        selected={selectedResources.includes(id)}
        position={index}
        onClick={() => navigate(`/app/updatediscount/${id}`)}
      >
        <IndexTable.Cell>
          <BlockStack gap="100">
            <Text variant="bodyMd" fontWeight="semibold" as="span">
              {title}
            </Text>
            <Text variant="bodySm" as="span" tone="subdued">
              {description}
            </Text>
          </BlockStack>
        </IndexTable.Cell>
        <IndexTable.Cell>
          <Text as="span" tone="subdued">
            {date}
          </Text>
        </IndexTable.Cell>
        <IndexTable.Cell>
          <Text as="span">
            {codesUsed} / {codesTotal}
          </Text>
        </IndexTable.Cell>
        <IndexTable.Cell>
          <Text as="span" fontWeight="semibold">
            {formatCurrency(revenue, currencyCode)}
          </Text>
        </IndexTable.Cell>
        <IndexTable.Cell>
          <Badge
            tone={
              status === "Active"
                ? "success"
                : status === "Scheduled"
                ? "info"
                : status === "Expired"
                ? "critical"
                : "default"
            }
          >
            {status}
          </Badge>
        </IndexTable.Cell>
      </IndexTable.Row>
    )
  );

  // Empty state
  const emptyStateMarkup = (
    <EmptyState
      heading="Welcome to ClickX!"
      action={{
        content: "Create your first discount set",
        onAction: () => navigate("/app/creatediscount"),
      }}
      image={emptystateimage}
    >
      <p>
        Start by creating your first discount code set to offer exclusive deals
        to your customers.
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
              <Icon source={CashDollarIcon} tone="success" />
            </Box>
            <Text as="h3" variant="headingSm" tone="subdued">
              Total Revenues
            </Text>
          </InlineStack>
          <Text as="p" variant="heading2xl">
            {formatCurrency(metrics.totalRevenue, currencyCode)}
          </Text>
          <Text as="p" variant="bodySm" tone="subdued">
            From all discount sets
          </Text>
        </BlockStack>
      </Card>

      <Card>
        <BlockStack gap="200" inlineAlign="start">
          <InlineStack gap="200" blockAlign="center">
            <Box paddingInlineEnd="200">
              <Icon source={DiscountIcon} tone="info" />
            </Box>
            <Text as="h3" variant="headingSm" tone="subdued">
              Active Discounts
            </Text>
          </InlineStack>
          <Text as="p" variant="heading2xl">
            {metrics.activeDiscounts}
          </Text>
          <Text as="p" variant="bodySm" tone="subdued">
            Currently running
          </Text>
        </BlockStack>
      </Card>

      <Card>
        <BlockStack gap="200" inlineAlign="start">
          <InlineStack gap="200" blockAlign="center">
            <Box paddingInlineEnd="200">
              <Icon source={EyeCheckMarkIcon} tone="warning" />
            </Box>
            <Text as="h3" variant="headingSm" tone="subdued">
              Codes Revealed
            </Text>
          </InlineStack>
          <Text as="p" variant="heading2xl">
            {metrics.totalCodesRevealed}
          </Text>
          <Text as="p" variant="bodySm" tone="subdued">
            Out of {metrics.totalCodesAvailable} total codes
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
              Conversion Rate
            </Text>
          </InlineStack>
          <Text as="p" variant="heading2xl">
            {metrics.conversionRate}%
          </Text>
          <Text as="p" variant="bodySm" tone="subdued">
            Codes revealed vs available
          </Text>
        </BlockStack>
      </Card>
    </InlineGrid>
  );

  // Loading skeleton
  const loadingMarkup = (
    <BlockStack gap="400">
      <InlineGrid columns={{ xs: 1, sm: 2, md: 2, lg: 4 }} gap="400">
        {[...Array(4)].map((_, i) => (
          <Card key={i}>
            <BlockStack gap="200">
              <SkeletonDisplayText size="small" />
              <SkeletonDisplayText size="large" />
              <SkeletonBodyText lines={1} />
            </BlockStack>
          </Card>
        ))}
      </InlineGrid>
      <Card>
        <SkeletonBodyText lines={10} />
      </Card>
    </BlockStack>
  );

  return (
    <Page fullWidth>
      <BlockStack gap="500">
        {/* Trial callout */}
        {planid == null && (
          <CalloutCard
            title="You're on the trial plan"
            illustration={barImage}
            primaryAction={{
              content: "Upgrade to Pro",
              onAction: handleUpgradePlan,
            }}
          >
            <BlockStack gap="300">
              <Text as="p" variant="bodyMd">
                {`${totalCount} of ${totalSet} trial discount ${
                  totalSet === 1 ? "set has" : "sets have"
                } been used.`}
              </Text>
              <ProgressBar
                progress={percentage}
                size="small"
                tone={percentage >= 80 ? "critical" : "primary"}
              />
            </BlockStack>
          </CalloutCard>
        )}

        {isLoading ? (
          loadingMarkup
        ) : totalCount === 0 ? (
          <Card>{emptyStateMarkup}</Card>
        ) : (
          <>
            {/* Metrics */}
            {metricsMarkup}

            {/* Discount table */}
            <Card padding="0">
              <BlockStack gap="0">
                <Box padding="400" paddingBlockEnd="200">
                  <InlineStack align="space-between" blockAlign="center">
                    <Text variant="headingLg" as="h2">
                      Discount code sets
                    </Text>
                    <Button
                      variant="primary"
                      onClick={
                        totalSet == -1
                          ? () => navigate("/app/creatediscount")
                          : totalCount < totalSet
                          ? () => navigate("/app/creatediscount")
                          : handleUpgradePlan
                      }
                    >
                      Create discount set
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
                  queryPlaceholder="Search discount sets..."
                />

                <IndexTable
                  resourceName={resourceName}
                  itemCount={filteredDiscounts.length}
                  selectedItemsCount={
                    allResourcesSelected ? "All" : selectedResources.length
                  }
                  onSelectionChange={handleSelectionChange}
                  headings={[
                    { title: "Discount set" },
                    { title: "Date created" },
                    { title: "Codes activated" },
                    { title: "Revenue" },
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
              You've reached the limit of your trial plan. Upgrade to Pro to
              create unlimited discount code sets and unlock all features.
            </Text>
            <BlockStack gap="200">
              <Text variant="headingMd" as="h3">
                Pro Plan includes:
              </Text>
              <ul>
                <li>Unlimited discount code sets</li>
                <li>Advanced analytics and reporting</li>
                <li>Priority support</li>
                <li>Custom button styling</li>
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
