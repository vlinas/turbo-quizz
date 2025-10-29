import { authenticate } from "../shopify.server";
import db from "../db.server";
import { updateRevenue, updateUsedCode } from "../discount_server";

export const action = async ({ request }) => {
  const { topic, shop, session, admin, payload } = await authenticate.webhook(
    request
  );

  if (!admin) {
    // The admin context isn't returned if the webhook fired after a shop was uninstalled.
    throw new Response();
  }

  switch (topic) {
    case "APP_UNINSTALLED":
      if (session) {
        await db.session.deleteMany({ where: { shop } });
      }

      break;
    case "ORDERS_CREATE":
      console.log("Payload Data:", payload);
      let codes = {};
      codes = payload.discount_codes.map(item => item.code);
      console.log('Codes: ', codes);
      console.log('Codes: ', session);
      // payload.discount_codes(discount => {
      //   codes += discount.code;
      // });
      const params = {
        order_id: payload.id.toString(),
        shop: session.shop ? session.shop : 'missing',
        order_value: payload.current_total_price.toString(),
        order_tax: payload.tax_lines,
        currency: payload.currency,
        discount: payload.current_total_discounts,
        discount_codes: (codes || null),
        discount_application: payload.discount_applications,
        line_items: payload.line_items,
      };

      try {
        await db.orders.create({
          data: params,
        });

        codes.forEach(async (code) => {
          const discount_id = await updateUsedCode(code, payload.current_total_price);
          await updateRevenue(discount_id, payload.current_total_price)
        });
        // codes.map(code => updateUsedCode(code));

      } catch (error) {
        console.log(error);
      }


      break;
    // console.log(order_id, total_price, currency);

    case "CUSTOMERS_DATA_REQUEST":
    case "CUSTOMERS_REDACT":
    case "SHOP_REDACT":
    default:
      throw new Response("Unhandled webhook topic", { status: 404 });
  }

  throw new Response();
};
