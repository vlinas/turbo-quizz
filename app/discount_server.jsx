import { authenticate } from "./shopify.server";
import db from "./db.server";
import { addExtraCouponBatch } from "./helper/helper";

export async function getDiscount(shop, id) {
  let discounts;
  let discountSetting;

  if (id !== null && id !== '') {
    discounts = await db.discount_coupons_codes.findFirst({
      where: { shop: shop, used: 0, revealed: 0, discount_coupon_id: id},
    });

    if (discounts) {
      await db.discount_coupons_codes.update({
        where: { id: discounts.id },
        data: { revealed: 1 }
      });
    }

    discountSetting = await db.discount_coupons.findFirst({
      where: { shop: shop, coupon_id: id, isActive:true },
    });
  } else {
    discounts = await db.discount_coupons_codes.findFirst({
      where: { shop: shop, revealed: 0 },
    });

    if (discounts) {
      await db.discount_coupons_codes.update({
        where: { id: discounts.id },
        data: { revealed: 1 }
      });
    }

    discountSetting = await db.discount_coupons.findFirst({
      where: { shop: shop, coupon_id: discounts.discount_coupon_id, isActive:true },
    });
  }

  if (!discounts) {
    return { error: 'No available discount codes found', discountCode: null };
  }

  if (!discountSetting) {
    return { error: 'Discount not found or inactive', discountCode: null };
  }
  return {
    discountCode: discounts.code,
    button_style_type: discountSetting?.button_style_type || 'sticker',
    standard_btn_bg_color: discountSetting?.standard_btn_bg_color,
    standard_btn_border_color: discountSetting?.standard_btn_border_color,
    standard_btn_text: discountSetting?.standard_btn_text,
    standard_btn_text_color: discountSetting?.standard_btn_text_color,
    success_btn_bg_color: discountSetting?.success_btn_bg_color,
    success_btn_border_color: discountSetting?.success_btn_border_color,
    success_btn_text: discountSetting?.success_btn_text,
    success_btn_text_color: discountSetting?.success_btn_text_color
  };
}

export async function updateRevealedStatus(shop, code, status = 1) {
  let discounts;

  if (code === null && code == '') {
    return ["code is missing for update in revealed status"];
  } else {
    discounts = await db.discount_coupons_codes.update({
      where: { code: code },
      data: {
        revealed: status
      }
    });
  }

  if (!discounts) return [];

  return {
    discountCode: discounts,
  };
}
export async function getStatusofCode(discountId, code) {
  let discounts;
  let codeStatus;
  if (discountId === null && discountId == '') {
    return ["discountId is missing in Check Code for Expiry"];
  }
  else if (code === null && code == '') {
    return ["code is missing in Check Code for Expiry"];
  }
  else
  {
    discounts = await db.discount_coupons.findFirst({
      where: {coupon_id: discountId, isActive: true}
    })
    if(!discounts){
      return {codeStatus: false};
    }
    codeStatus = await db.discount_coupons_codes.findFirst({
      where: { discount_coupon_id: discountId, code: code, used: 0 },
    });
  }

  // console.log('discount status: ', discounts, 'code status: ', codeStatus)
  if (!codeStatus) return {codeStatus: false};

  return {codeStatus: true};
}

export async function getDiscounts(shop) {
  try {
    const discounts = await db.discount_coupons.findMany({
      where: {
        shop: shop,
        deleted_at: null,
      },
      include: {
        discount_coupons_codes: true, // All posts where authorId == 20
      },
    });
    if (discounts.length === 0) return [];
    // BigInt.prototype.toJSON = function () {
    //   const int = Number.parseInt(this.toString());
    //   return int ?? this.toString();
    // };
    return discounts;
  } catch (error) {
    console.log("Error: ", error);
  }
}

export async function getSingleDiscount(id){
  const discount = await db.discount_coupons.findFirst({
    where: {
      id: parseInt(id)
    }
  });
  if(!discount) return [];
  return discount;
}

export async function getDiscountByCode(code){
  const discount = await db.discount_coupons.findFirst({
    where: {
      coupon_id:code
    },
    include: {
      discount_coupons_codes: true, // All posts where authorId == 20
    },
  });
  if(!discount) return [];
  return discount;
}

export async function getCoupons(discountId){
  try {
  const coupons = await db.discount_coupons_codes.findMany({
    where: {
      discount_coupon_id: discountId,
    }
  });
  if (coupons.length === 0) return [];
    // BigInt.prototype.toJSON = function () {
    //   const int = Number.parseInt(this.toString());
    //   return int ?? this.toString();
    // };
    return coupons;
  } catch (error) {
    console.log("Error: ", error);
  }
}

export async function getOders(shop){
  try{
    const orders = await db.orders.findMany({
      where: {
        shop: shop
      }
    });
    if(orders.length === 0) return [];
    return orders;
  }
  catch(error){
    console.error(error);
  }
}

export async function updateUsedCode(code, revenue){
  try{
    const updated = await db.discount_coupons_codes.update({
      where: {
        code: code,
      },
      data: {
        used: {
          increment: 1,
        },
        revenue: revenue,
      }
    })
    return updated.discount_coupon_id;
  }
  catch(error){
    console.error(error)
  }
}



export async function deleteDiscount(couponId){
  try{
    const data = await db.discount_coupons.update({
      where: {
        coupon_id: couponId,
      },
      data: {
        deleted_at: new Date()
      },
    })
    // console.log('Deleted Discount: ', data);
    let response = {
      success: false
    }
    if(data){
      response = {
        success: true,
        action:'Delete Discount',
        data: data
      }
    }
    return response;
  }
  catch(error){
    console.error(error)
    let response = {
      success: false
    };
    return response;
  }
}
export async function deactivateDiscount(couponId){
  try{
    const data = await db.discount_coupons.update({
      where: {
        coupon_id: couponId,
      },
      data: {
        isActive: false
      },
    })
    // console.log('Deactivated Discount: ', data);
    let response = {
      success: false
    }
    if(data){
      response = {
        success: true,
        action:'Deactive Discount',
        data: data
      }
    }
    return response;
  }
  catch(error){
    console.error(error)
    let response = {
      success: false
    };
    return response;
  }
}
export async function activateDiscount(couponId){
  try{
    const data = await db.discount_coupons.update({
      where: {
        coupon_id: couponId,
      },
      data: {
        isActive: true
      },
    })
    // console.log('Deactivated Discount: ', data);
    let response = {
      success: false
    }
    if(data){
      response = {
        success: true,
        action:'Activate Discount',
        data: data
      }
    }
    return response;
  }
  catch(error){
    console.error(error)
    let response = {
      success: false
    };
    return response;
  }
}

export async function updateDiscount(id, params){
  try{
    const res = await db.discount_coupons.update({
      where: {
        coupon_id: id,
      },
      data: {
        ...params
      },
    })
    let response = {
      success: false
    };
    if(res){
      response = {
        success: true,
        action:'Update Discount',
        data: res
      }
    }
    else{
      response = {
        success: false,
      }
    }
    return response;
  }
  catch(error){
    console.error(error)
    let response = {
      success: false
    };
    return response;
  }
}

export async function updateRevenue(couponId, revenue){
  try{
    await db.discount_coupons.update({
      where: {
        coupon_id: couponId,
      },
      data: {
        revenue: {
          increment: revenue,
        },
        used: {
          increment: 1,
        },
      },

    })
  }
  catch(error){
    console.error(error)
  }
}
