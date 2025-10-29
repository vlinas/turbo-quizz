import { Card, DataTable, Layout, Page, Pagination } from "@shopify/polaris";
import { useEffect, useState } from "react";
import { useLoaderData } from "@remix-run/react";
import { getDiscounts, getOders } from "../discount_server";

export const action = async ({ request }) => {};

export const loader = async ({ request }) => {
  console.log("loader called...");
  const discounts = await getDiscounts();
  const orders = await getOders();
  
  //console.log('Data: ', orders[0].discount_codes[0].code);
  // await updateUsedCode(orders[0].discount_codes[0].code)

  return ([discounts, orders]);
};

export default function Report() {
  const data = useLoaderData();
  const discountData = data[0];
  const [tabelData, setTableData] = useState([]);

  useEffect(() => {
    console.log('Discount Data:', discountData);

    const mappingTableData = discountData.map((discount) => (
      [
        discount.title,
        discount.coupon_id,
        discount.prefix_code,
        discount.code_length,
        discount.quantity,
        discount.discount_type,
        discount.discount_value,
        discount.minimum_req,
        discount.exipres,
      ]
    ));

    setTableData(mappingTableData);
    console.log("Mapped Data: ", mappingTableData);
  }, [discountData]);
  return (
    <Page>
      <ui-title-bar title="Discount Coupons Details" />
      <Layout>
        <Layout.Section>
          <Card>
            <div className="bundle-table">
              <DataTable
                columnContentTypes={[
                  "text",
                  "text",
                  "text",
                  "text",
                  "text",
                  "text",
                  "text",
                  "text",
                  "text",
                ]}
                headings={[
                  "Discount Name",
                  "Coupon ID",
                  "Prefix Code",
                  "Code Length",
                  "Quantity",
                  "Discount Type",
                  "Discount Value",
                  "Minimum Req",
                  "Exipre On",
                ]}
                rows={tabelData}
                footerContent={
                  <div className="analytics-table-pagination">
                    <Pagination
                      label="Showing page 1 of 1"
                      hasPrevious
                      onPrevious={() => {
                        console.log("Previous");
                      }}
                      hasNext
                      onNext={() => {
                        console.log("Next");
                      }}
                    />
                  </div>
                }
                hasZebraStripingOnData
              />
            </div>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
