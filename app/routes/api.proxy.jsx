import { json } from "@remix-run/node";

import { getDiscount, getDiscountByCode, getDiscounts, getSingleDiscount, getStatusofCode, updateRevealedStatus } from "../discount_server";
import { authenticate } from "../shopify.server";
import { addExtraCouponBatch } from "../helper/helper";

export const loader = async ({ request }) => {
  try {
    const { session, admin } = await authenticate.public.appProxy(request);
    const url = new URL(request.url);
    let discounts = [];
    let chkDiscount = [];

    if (url.searchParams.get("discountSetID")) {
      const discountSetID = url.searchParams.get("discountSetID");
      chkDiscount = await getDiscountByCode(discountSetID);
    const totalCount = chkDiscount.quantity;
    let codeRevelead = 0;
    if(chkDiscount.discount_coupons_codes){
      chkDiscount.discount_coupons_codes.forEach((discount) => {
        // console.log("discount: ", discount)
        if(discount.revealed == 1){
          codeRevelead = codeRevelead + 1;
        }
      });
    }
    const usedPercentage = (codeRevelead / totalCount * 100);
    // console.log('code revelead: ', codeRevelead, usedPercentage);
      if(usedPercentage >= 80 && chkDiscount.isActive){
        let params = {
          id: chkDiscount.id,
          price_rule_id: chkDiscount.coupon_id,
          quantity: chkDiscount.quantity,
          newQty: 100,
          shop:chkDiscount.shop,
          code_length:chkDiscount.code_length,
          prefix_code: chkDiscount.prefix_code
        }
        await addExtraCouponBatch(session, admin, params);
      }

    discounts = await getDiscount(session.shop, discountSetID);
      return json(discounts);
    }
    else if (url.searchParams.get("updateRevealedStatusCode")){
      const discountCodeID = url.searchParams.get("updateRevealedStatusCode");
      const status = url.searchParams.get("status");
      discounts = await updateRevealedStatus(session.shop, discountCodeID, parseInt(status)); // Assign the value
      return json(discounts);
    }
    else if (url.searchParams.get("chkDiscountSetID")){
      const discountCodeID = url.searchParams.get("chkDiscountSetID");
      const code = url.searchParams.get("code");
      discounts = await getStatusofCode(discountCodeID, code, code); // Assign the value
      return (discounts);
    }

    // Return the value of discounts
  } catch (error) {
    console.error('[API Proxy] Error:', error);
    return json({ error: error.message, stack: error.stack }, { status: 500 });
  }
};

export const action = () => {
  return true;
}
